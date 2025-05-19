'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import style from './RoomPage.module.css';
import ChatBox from './ChatBox';


import socket from '../utils/socket';

function VideoBox({ stream, name }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={style.videoBlock}>
      <h3>{name}</h3>
      {stream ? (
        <video ref={videoRef} autoPlay playsInline className={style.video} />
      ) : (
        <div className={style.videoPlaceholder}>Camera Off</div>
      )}
    </div>
  );
}

export default function RoomPage() {
  const searchParams = useSearchParams();
  const name = searchParams.get('name') || '';
  const roomId = searchParams.get('roomId') || '';
  const role = searchParams.get('role') || 'participant';

  const localVideoRef = useRef(null);
  const streamRef = useRef(null);
  const peersRef = useRef(new Map());
  const videoElementRef = useRef(null); // dynamically switch this source
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState([]);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const recordedChunksRef = useRef([]);
  const [isRecording, setIsRecording] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatEnabled, setChatEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [chatTarget, setChatTarget] = useState('all');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [hasLeft, setHasLeft] = useState(false);
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioDestinationRef = useRef(null);

  const drawingIntervalRef = useRef(null);
  const [currentSource, setCurrentSource] = useState('screen'); // or 'camera'

  useEffect(() => {
    if (!roomId || !name || !role) return;

    const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

    const createPeer = (peerId) => {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('send-ice-candidate', { to: peerId, candidate: event.candidate });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        console.log('📡 Received track from:', peerId, stream);
        setRemoteStreams((prev) => ({ ...prev, [peerId]: stream }));
        const remoteAudioTrack = stream.getAudioTracks()[0];
        if (
          isRecording &&
          remoteAudioTrack &&
          audioContextRef.current &&
          audioDestinationRef.current
        ) {
          const remoteStreamForContext = new MediaStream([remoteAudioTrack]);
          const remoteSource = audioContextRef.current.createMediaStreamSource(remoteStreamForContext);
          remoteSource.connect(audioDestinationRef.current);
          console.log('🎧 New participant audio added to mixer (ontrack)');
        }
      };
      const existingSenders = pc.getSenders().map((s) => s.track?.id);

      const tracks = streamRef.current?.getTracks() || [];
      console.log("📢 Participant is sending tracks:", tracks);

      tracks.forEach((track) => {
        console.log("🎤 Track kind:", track.kind, "| enabled:", track.enabled);

        // ✅ Make sure audio is enabled before sending
        if (track.kind === 'audio' && !track.enabled) {
          track.enabled = true;
          console.log('✅ Enabling audio track before sending');
        }

        // ✅ Add only if not already sent
        if (!existingSenders.includes(track.id)) {
          pc.addTrack(track, streamRef.current);
          console.log('✅ Track added to peer connection:', track.kind);
        }
      });

      return pc;
    };

    const start = async () => {

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      streamRef.current = stream;
      localVideoRef.current.srcObject = stream;


      turnOffParticipantVideo();
      socket.emit('join-room', { roomId, userId: name, role });
      console.log('📡 join-room emitted:', { roomId, userId: name, role });
      setParticipants([{ socketId: socket.id, name }]);

      socket.on('all-users', async (users) => {
        for (const { socketId } of users) {
          const pc = createPeer(socketId);
          peersRef.current.set(socketId, pc);

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socket.emit('send-offer', { to: socketId, offer });
        }
      });


      socket.on('user-connected', ({ socketId, name }) => {
        setParticipants((prev) => {
          if (prev.find((p) => p.socketId === socketId)) return prev;
          return [...prev, { socketId, name }];
        });
      });

      socket.on('receive-offer', async ({ offer, from }) => {
        const pc = createPeer(from);
        peersRef.current.set(from, pc);

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('send-answer', { to: from, answer });
      });

      socket.on('receive-answer', async ({ answer, from }) => {
        const pc = peersRef.current.get(from);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
      });

      socket.on('receive-ice-candidate', ({ candidate, from }) => {
        const pc = peersRef.current.get(from);
        if (pc) pc.addIceCandidate(new RTCIceCandidate(candidate));
      });

      socket.on('receive-chat', (chat) => {
        console.log('📩 New chat received:', chat);
        setChatMessages((prev) => [...prev, chat]);
      });
      socket.on('chat-history', (messages) => {
        console.log('📜 Chat history received:', messages);
        setChatMessages((prev) => [...messages, ...prev]);
      });
      socket.on('chat-permission-updated', ({ enabled }) => {
        setChatEnabled(enabled);
      });

      socket.on('user-disconnected', (socketId) => {
        const pc = peersRef.current.get(socketId);
        if (pc) pc.close();
        peersRef.current.delete(socketId);
        setRemoteStreams((prev) => {
          const updated = { ...prev };
          delete updated[socketId];
          return updated;
        });
        setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
      });

      socket.on('screen-share-started', () => {
        const { userId, roomId } = socket.data || {};
        console.log(`📺 ${userId} started screen sharing in room ${roomId}`);
      });

      socket.on('screen-share-stopped', () => {
        const { userId, roomId } = socket.data || {};
        console.log(`🛑 ${userId} stopped screen sharing in room ${roomId}`);
      });
    };
    start();
    return () => {
      socket.disconnect();
      [
        'all-users',
        'user-connected',
        'receive-offer',
        'receive-answer',
        'receive-ice-candidate',
        'receive-chat',
        'chat-history', // <== ✅ add this here
        'chat-permission-updated',
        'user-disconnected',
        'screen-share-started',
        'screen-share-stopped',
      ].forEach((event) => socket.off(event));

      streamRef.current?.getTracks().forEach((t) => t.stop());
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
    };
  }, [roomId, name, role]);

  const sendMessage = () => {
    if (!message.trim()) return;
    socket.emit('send-chat', {
      roomId,
      message,
      to: chatTarget === 'all' ? null : chatTarget,
    });
    setMessage('');
  };

  const toggleOwnMic = () => {
    const audioTracks = streamRef.current?.getAudioTracks();
    if (audioTracks && audioTracks.length > 0) {
      const newMutedState = !isMicMuted;
      audioTracks.forEach((track) => (track.enabled = !newMutedState));
      setIsMicMuted(newMutedState);
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

      // ✅ For recording (canvas)
      videoElementRef.current.srcObject = new MediaStream([newTrack]);
      videoElementRef.current.onloadedmetadata = async () => {
        try {
          await videoElementRef.current.play();
        } catch (err) {
          console.error('🔁 Play failed after source switch:', err);
        }
      };

      // ✅ For WebRTC (broadcast to others)
      const currentAudioTracks = streamRef.current?.getAudioTracks() || [];
      const newCombinedStream = new MediaStream([...currentAudioTracks, newTrack]);

      streamRef.current = newCombinedStream;
      localVideoRef.current.srcObject = newCombinedStream;

      // ✅ Update peer video tracks
      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(newTrack);
      });

      // ✅ Emit socket event if screen sharing
      if (newSource === 'screen') {
        socket.emit('screen-share-started');
        setIsSharingScreen(true);
      } else {
        socket.emit('screen-share-stopped');
        setIsSharingScreen(false);
      }

      setCurrentSource(newSource);
      console.log(`🔁 Switched to ${newSource} — shared to peers & canvas`);

    } catch (err) {
      console.error('❌ Error switching source and sharing:', err);
    }
  };

  const turnOffParticipantVideo = () => {
    if (role === 'participant') {
      const videoTrack = streamRef.current?.getVideoTracks?.()[0];
      if (videoTrack && videoTrack.enabled) {
        videoTrack.enabled = false;
        setIsVideoOff(true);
        console.log('📷 Participant camera turned off via function');
      }
    }
  };

  const toggleOwnVideo = async () => {
    const videoTracks = streamRef.current?.getVideoTracks();
    if (!videoTracks || videoTracks.length === 0) return;

    if (!isVideoOff) {
      // Stop video completely (turns off flashlight)
      videoTracks.forEach((track) => track.stop());
      localVideoRef.current.srcObject = null;
      setIsVideoOff(true);
    } else {
      // Restart video
      const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const newTrack = newStream.getVideoTracks()[0];

      // Replace track in peer connections
      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(newTrack);
      });

      streamRef.current.addTrack(newTrack);

      // Update local preview
      const updatedStream = new MediaStream([
        ...streamRef.current.getAudioTracks(),
        newTrack,
      ]);
      localVideoRef.current.srcObject = updatedStream;

      setIsVideoOff(false);
    }
  };

  const stopScreenShare = async () => {
    try {
      // 1. Stop the screen track (from canvas video element)

      const screenTrack = videoElementRef.current?.srcObject?.getVideoTracks?.()[0];
      if (screenTrack && screenTrack.readyState === 'live') {
        screenTrack.stop(); // triggers onended

      }
      // 2. Get new camera stream
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const camTrack = camStream.getVideoTracks()[0];

      // 3. Update streamRef and broadcast
      const currentAudioTracks = streamRef.current?.getAudioTracks() || [];
      const newCombinedStream = new MediaStream([...currentAudioTracks, camTrack]);
      streamRef.current = newCombinedStream;

      // 4. Replace video track in all peer connections
      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(camTrack);
      });

      // 5. Update local preview
      localVideoRef.current.srcObject = newCombinedStream;

      // 6. Update canvas recording source (videoElementRef)
      if (videoElementRef.current) {
        videoElementRef.current.srcObject = new MediaStream([camTrack]);
        videoElementRef.current.onloadedmetadata = async () => {
          try {
            await videoElementRef.current.play();
          } catch (err) {
            console.error('⚠️ Failed to resume camera video in canvas:', err);
          }
        };
      }

      // 7. Emit event and update UI state
      socket.emit('screen-share-stopped');
      setIsSharingScreen(false);
      setCurrentSource('camera');
      setParticipants((prev) =>
        prev.map((p) =>
          p.socketId === socket.id ? { ...p, isSharingScreen: false } : p
        )
      );

      console.log('✅ Screen share stopped and camera restored');

    } catch (err) {
      console.error('❌ Error while stopping screen share and restoring camera:', err);
    }
  };

  const shareScreen = async () => {
    if (role !== 'host') {
      socket.emit('request-screen-share', { roomId, userId: name });
    } else {
      await actuallyShareScreen();
    }
  };
  const actuallyShareScreen = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      screenTrack.onended = () => {
        console.log('✅ Browser-native stop sharing clicked');
        stopScreenShare();
      };

      // Update streamRef with screenStream
      const audioTracks = streamRef.current?.getAudioTracks() || [];
      const combined = new MediaStream([...audioTracks, screenTrack]);
      streamRef.current = combined;

      // Replace track in all peers
      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      });

      // Update local video view
      localVideoRef.current.srcObject = combined;

      setIsSharingScreen(true);
      socket.emit('screen-share-started');
    } catch (err) {
      console.error('❌ Failed to share screen:', err);
    }
  };

  const leaveRoom = () => {
    setHasLeft(true);

    streamRef.current?.getTracks().forEach((track) => track.stop());
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();

    socket.emit('leave-room', { roomId, userId: name });
    socket.disconnect();

    // Optional: redirect or show exit screen
    window.location.href = '/'; // Change to desired route
  };
  const uploadRecording = async (blob, filename) => {
    const formData = new FormData();
    formData.append('video', blob, filename);

    try {
      const res = await fetch('http://localhost:5000/upload', {
        //const res = await fetch('https://webrtc-backend-goxe.onrender.com/upload', {
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
    const ctx = canvas.getContext('2d');

    // 1. Get host mic and video (camera by default)
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const camTrack = camStream.getVideoTracks()[0];

    // 2. Setup video element for canvas drawing
    videoElementRef.current = document.createElement('video');
    videoElementRef.current.muted = true;
    videoElementRef.current.srcObject = new MediaStream([camTrack]);
    await videoElementRef.current.play();

    // 3. Draw video on canvas
    drawingIntervalRef.current = setInterval(() => {
      if (videoElementRef.current?.videoWidth > 0) {
        ctx.drawImage(videoElementRef.current, 0, 0, canvas.width, canvas.height);
      }
    }, 1000 / 30);

    // 4. Create canvas stream
    const canvasStream = canvas.captureStream(30);

    // 5. MIX AUDIO using Web Audio API
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();

    // Save references for dynamic updates
    audioContextRef.current = audioContext;
    audioDestinationRef.current = destination;

    // Add host mic
    const hostSource = audioContext.createMediaStreamSource(micStream);
    hostSource.connect(destination);

    // Add current participants' audio
    Object.values(remoteStreams).forEach(remoteStream => {
      const remoteAudioTrack = remoteStream.getAudioTracks()[0];
      if (remoteAudioTrack) {
        const remoteStreamForContext = new MediaStream([remoteAudioTrack]);
        const remoteSource = audioContext.createMediaStreamSource(remoteStreamForContext);
        remoteSource.connect(destination);
      }
    });

    // Add all audio tracks to canvas stream
    destination.stream.getAudioTracks().forEach(track => {
      canvasStream.addTrack(track);
    });

    // 6. Start recording
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

  return (
    <div className={style.container}>
      <h2 className={style.heading}>Room: {roomId}</h2>
      <div className={style.videoGrid}>
        <div className={style.videoBlock}>
          <h3>You</h3>
          <video ref={localVideoRef} autoPlay muted playsInline className={style.video} />
          <button onClick={toggleOwnMic} className={style.button}>
            {isMicMuted ? 'Unmute Mic' : 'Mute Mic'}
          </button>
          {role === 'host' && (
            <>
              {!isSharingScreen ? (
                <button onClick={shareScreen} className={style.button}>Share Screen</button>
              ) : (
                <button onClick={stopScreenShare} className={style.button}>Stop Sharing</button>
              )}
              <button onClick={toggleOwnVideo} className={style.button}>
                {isVideoOff ? 'Turn On Camera' : 'Turn Off Camera'}
              </button>
            </>
          )}
          <button onClick={leaveRoom} className={style.leaveButton}>Leave Room</button>
        </div>
        {Object.entries(remoteStreams).map(([id, stream]) => {
          const participant = participants.find((p) => p.socketId === id);
          console.log("userside", stream)
          return (
            <VideoBox
              key={id}
              stream={stream}
              name={participant?.name || 'Remote'}
              isCameraOff={participant?.isCameraOff ?? false}
            />
          );
        })}
      </div>
      {role === 'host' && (
        <div className={style.participantList}>
          <h3>Participants ({participants.length})</h3>
          <ul>
            {participants.map((p) => (
              <li key={p.socketId}>
                {p.name} {p.socketId === socket.id ? '(You)' : ''} {p.isCameraOff ? '📷 Off' : '📷 On'}
              </li>
            ))}
          </ul>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={1280}
        height={720}
        style={{ display: 'none' }}
      />
      {role === 'host' && (
        <>
          {!isRecording ? (
            <button onClick={startRecordingWithCanvas} className={style.button}>
              Start Smart Recording
            </button>
          ) : (
            <>
              <button onClick={stopCanvasRecording} className={style.button}>Stop Recording</button>
              <button onClick={switchRecordingSource} className={style.button}>
                Switch Source (Camera / Screen)
              </button>
            </>
          )}
        </>
      )}
      <ChatBox
        chatMessages={chatMessages}
        setChatMessages={setChatMessages}
        participants={participants}
        chatEnabled={chatEnabled}
        message={message}
        setMessage={setMessage}
        chatTarget={chatTarget}
        setChatTarget={setChatTarget}
        sendMessage={sendMessage}
      />
    </div>
  );
}