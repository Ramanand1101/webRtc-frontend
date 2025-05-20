'use client';

import { useRef, useState, useEffect } from 'react';
import { Camera, Monitor, StopCircle,Videotape} from 'lucide-react';
import styles from './RecordingControls.module.css';

export default function RecordingControls({
  role,
  localVideoRef,
  streamRef,
  peersRef,
  remoteStreams,
  socket,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [currentSource, setCurrentSource] = useState('camera');
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);

  const videoElementRef = useRef(null);
  const canvasRef = useRef(null);
  const drawingIntervalRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const audioDestinationRef = useRef(null);
  const recordingTimerRef = useRef(null);

  // Format seconds to MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Recording timer effect
  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(recordingTimerRef.current);
      setRecordingTime(0);
    }

    return () => clearInterval(recordingTimerRef.current);
  }, [isRecording]);

  const uploadRecording = async (blob, filename) => {
    const formData = new FormData();
    formData.append('video', blob, filename);

    try {
      const res = await fetch('http://localhost:5000/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        console.log('✅ Uploaded to backend:', data.fileUrl);
        alert('Recording uploaded & saved:\n' + data.fileUrl);
      } else {
        console.error('❌ Upload failed:', data.message);
      }
    } catch (err) {
      console.error('❌ Error uploading recording:', err);
    }
  };

  const startRecordingWithCanvas = async () => {
    if (role !== 'host') return;

    const canvas = canvasRef.current;
    if (!canvas) {
      console.error('Canvas ref not set');
      return;
    }
    const ctx = canvas.getContext('2d');

    // Get host mic and video (camera by default)
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const camTrack = camStream.getVideoTracks()[0];

    // Setup video element for canvas drawing
    videoElementRef.current = document.createElement('video');
    videoElementRef.current.muted = true;
    videoElementRef.current.srcObject = new MediaStream([camTrack]);
    await videoElementRef.current.play();

    // Draw video on canvas 30fps
    drawingIntervalRef.current = setInterval(() => {
      if (videoElementRef.current?.videoWidth > 0) {
        ctx.drawImage(videoElementRef.current, 0, 0, canvas.width, canvas.height);
      }
    }, 1000 / 30);

    // Create canvas stream
    const canvasStream = canvas.captureStream(30);

    // Setup audio mixing
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();

    audioContextRef.current = audioContext;
    audioDestinationRef.current = destination;

    // Add host mic audio
    const hostSource = audioContext.createMediaStreamSource(micStream);
    hostSource.connect(destination);

    // Add all remote participant audios
    Object.values(remoteStreams).forEach(remoteStream => {
      const remoteAudioTrack = remoteStream.getAudioTracks()[0];
      if (remoteAudioTrack) {
        const remoteStreamForContext = new MediaStream([remoteAudioTrack]);
        const remoteSource = audioContext.createMediaStreamSource(remoteStreamForContext);
        remoteSource.connect(destination);
      }
    });

    // Add mixed audio tracks to canvas stream
    destination.stream.getAudioTracks().forEach(track => {
      canvasStream.addTrack(track);
    });

    // Start MediaRecorder on canvas stream
    const recorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm' });
    recordedChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      clearInterval(drawingIntervalRef.current);

      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const fileName = `merged-recording-${Date.now()}.webm`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      await uploadRecording(blob, fileName);
    };

    recorder.start();
    setMediaRecorder(recorder);
    setIsRecording(true);
    setCurrentSource('camera');
    console.log('🎥 Canvas recording started with mixed audio');
  };

  const stopCanvasRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      clearInterval(drawingIntervalRef.current);
      console.log('🛑 Canvas-based recording stopped');
    }
  };

  const switchRecordingSource = async () => {
    if (!videoElementRef.current) return;

    const newSource = currentSource === 'screen' ? 'camera' : 'screen';

    try {
      let newStream;
      if (newSource === 'camera') {
        newStream = await navigator.mediaDevices.getUserMedia({ video: true });
      } else {
        newStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      }

      const newTrack = newStream.getVideoTracks()[0];

      // Update video element for canvas drawing
      videoElementRef.current.srcObject = new MediaStream([newTrack]);
      videoElementRef.current.onloadedmetadata = async () => {
        try {
          await videoElementRef.current.play();
        } catch (err) {
          console.error('🔁 Play failed after source switch:', err);
        }
      };

      // Update streamRef and local preview (combine audio and new video track)
      const currentAudioTracks = streamRef.current?.getAudioTracks() || [];
      const newCombinedStream = new MediaStream([...currentAudioTracks, newTrack]);

      streamRef.current = newCombinedStream;
      if (localVideoRef.current) localVideoRef.current.srcObject = newCombinedStream;

      // Replace video track in all peer connections
      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(newTrack);
      });

      // Emit socket events for screen sharing start/stop
      if (newSource === 'screen') {
        socket.emit('screen-share-started');
      } else {
        socket.emit('screen-share-stopped');
      }

      setCurrentSource(newSource);
      console.log(`🔁 Switched to ${newSource} — shared to peers & canvas`);

    } catch (err) {
      console.error('❌ Error switching source and sharing:', err);
    }
  };

  return (
    <div className={styles.iconControlsContainer}>
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        style={{ display: 'none' }}
      />
      
      {/* Icon-based controls */}
      <div className={styles.iconControls}>
        {!isRecording ? (
          <button 
            className={`${styles.iconButton} ${role !== 'host' ? styles.disabled : ''}`}
            onClick={startRecordingWithCanvas}
            disabled={role !== 'host'}
            title={role !== 'host' ? 'Only host can record' : 'Start recording'}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <Videotape size={22} />
            {showTooltip && <span className={styles.tooltip}>Start Recording</span>}
          </button>
        ) : (
          <>
            <button 
              className={`${styles.iconButton} ${styles.recording}`}
              onClick={stopCanvasRecording}
              title="Stop recording"
            >
              <StopCircle size={22} />
              <span className={styles.recordingTime}>{formatTime(recordingTime)}</span>
            </button>
            
            <button 
              className={styles.iconButton}
              onClick={switchRecordingSource}
              title={`Switch to ${currentSource === 'camera' ? 'screen' : 'camera'}`}
            >
              {currentSource === 'camera' ? <Monitor size={22} /> : <Camera size={22} />}
            </button>
          </>
        )}
      </div>
    </div>
  );
}