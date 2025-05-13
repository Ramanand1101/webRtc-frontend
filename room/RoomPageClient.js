'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import style from './RoomPage.module.css';
import socket from '../utils/socket';

export default function RoomPage() {
  const searchParams = useSearchParams();
  const name = searchParams.get('name') || '';
  const roomId = searchParams.get('roomId') || '';
  const role = searchParams.get('role') || 'participant';

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  
  // Object to store all peer connections
  const peerConnectionsRef = useRef({});
  // Object to store all remote video elements
  const remoteVideosRef = useRef({});

  const [participants, setParticipants] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [message, setMessage] = useState('');
  const [chatTarget, setChatTarget] = useState('all');
  const [isRecording, setIsRecording] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);

  useEffect(() => {
    if (!roomId || !name) return;

    const ICE_SERVERS = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    };

    // Function to create a peer connection for a specific user
    const createPeerConnection = (socketId) => {
      const peerConnection = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionsRef.current[socketId] = peerConnection;

      // Create a video element for this peer if it doesn't exist
      if (!remoteVideosRef.current[socketId]) {
        const videoElement = document.createElement('video');
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.className = style.video;
        videoElement.id = `remote-video-${socketId}`;
        
        remoteVideosRef.current[socketId] = videoElement;
        
        // Add the video element to the DOM
        const remoteVideosContainer = document.getElementById('remote-videos-container');
        if (remoteVideosContainer) {
          const videoBlock = document.createElement('div');
          videoBlock.className = style.videoBlock;
          videoBlock.id = `video-block-${socketId}`;
          
          const participantName = participants.find(p => p.socketId === socketId)?.name || 'Remote User';
          const nameHeading = document.createElement('h3');
          nameHeading.textContent = participantName;
          
          videoBlock.appendChild(nameHeading);
          videoBlock.appendChild(videoElement);
          remoteVideosContainer.appendChild(videoBlock);
        }
      }

      // Handle incoming tracks from the remote peer
      peerConnection.ontrack = (event) => {
        const videoElement = remoteVideosRef.current[socketId];
        if (videoElement) {
          videoElement.srcObject = event.streams[0];
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('send-ice-candidate', {
            to: socketId,
            candidate: event.candidate,
          });
        }
      };

      // Add local tracks to the peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          peerConnection.addTrack(track, localStreamRef.current);
        });
      }

      return peerConnection;
    };

    // Function to clean up a peer connection
    const removePeerConnection = (socketId) => {
      if (peerConnectionsRef.current[socketId]) {
        peerConnectionsRef.current[socketId].close();
        delete peerConnectionsRef.current[socketId];
      }
      
      // Remove the video element from the DOM
      const videoBlock = document.getElementById(`video-block-${socketId}`);
      if (videoBlock) {
        videoBlock.remove();
      }
      
      if (remoteVideosRef.current[socketId]) {
        delete remoteVideosRef.current[socketId];
      }
    };

    const start = async () => {
      try {
        // Get local media stream
        const mediaConstraints = {
          video: true,
          audio: true,
        };
        
        const localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        localStreamRef.current = localStream;

        // Display local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }

        // Join the room
        socket.emit('join-room', { roomId, userId: name, role });

        // Handle existing users in the room
        socket.on('all-users', (users) => {
          console.log('All users in room:', users);
          setParticipants(users);
          
          // Create peer connections for each existing user
          users.forEach(async (user) => {
            const { socketId } = user;
            
            // Create a peer connection for this user
            const peerConnection = createPeerConnection(socketId);
            
            // Create and send an offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            socket.emit('send-offer', {
              to: socketId,
              offer: peerConnection.localDescription,
            });
          });
        });

        // Handle new user connections
        socket.on('user-connected', async ({ socketId, name: newName }) => {
          console.log(`New user connected: ${newName} (${socketId})`);
          
          setParticipants((prev) => [...prev, { socketId, name: newName }]);
          
          // No need to create a peer connection here, we'll wait for the offer
        });

        // Handle user disconnections
        socket.on('user-disconnected', (socketId) => {
          console.log(`User disconnected: ${socketId}`);
          setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
          removePeerConnection(socketId);
        });

        // Handle incoming offers
        socket.on('receive-offer', async ({ offer, from }) => {
          console.log(`Received offer from: ${from}`);
          
          const peerConnection = createPeerConnection(from);
          
          await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          
          socket.emit('send-answer', {
            to: from,
            answer: peerConnection.localDescription,
          });
        });

        // Handle incoming answers
        socket.on('receive-answer', async ({ answer, from }) => {
          console.log(`Received answer from: ${from}`);
          
          const peerConnection = peerConnectionsRef.current[from];
          if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
          }
        });

        // Handle incoming ICE candidates
        socket.on('receive-ice-candidate', async ({ candidate, from }) => {
          const peerConnection = peerConnectionsRef.current[from];
          if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          }
        });

        // Handle chat messages
        socket.on('receive-chat', (chat) => {
          setChatMessages((prev) => [...prev, chat]);
        });

        // Handle chat permission updates
        socket.on('chat-permission-updated', ({ enabled }) => {
          setChatEnabled(enabled);
        });
      } catch (err) {
        console.error('Media access error:', err);
      }
    };

    start();

    return () => {
      // Clean up all peer connections on unmount
      Object.keys(peerConnectionsRef.current).forEach((socketId) => {
        removePeerConnection(socketId);
      });
      
      // Stop local stream tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      
      // Disconnect socket
      socket.disconnect();
      socket.off('all-users');
      socket.off('user-connected');
      socket.off('user-disconnected');
      socket.off('receive-offer');
      socket.off('receive-answer');
      socket.off('receive-ice-candidate');
      socket.off('receive-chat');
      socket.off('chat-permission-updated');
    };
  }, [roomId, name, role]);

  const toggleMic = () => {
    const stream = localStreamRef.current;
    if (!stream) {
      console.warn('No stream available to toggle mic.');
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn('No audio tracks found in the stream.');
      return;
    }

    // Toggle each audio track (usually there's only one)
    audioTracks.forEach((track) => {
      track.enabled = !track.enabled;
      console.log(`Mic toggled: ${track.label} -> ${track.enabled ? 'enabled' : 'disabled'}`);
    });

    // Update state based on the first track
    setIsMicOn(audioTracks[0].enabled);
  };

  const toggleVideo = () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return;

    videoTracks.forEach(track => {
      track.enabled = !track.enabled;
    });
  };

  const sendMessage = () => {
    if (!message.trim()) return;
    socket.emit('send-chat', {
      roomId,
      message,
      to: chatTarget === 'all' ? null : chatTarget,
    });
    setMessage('');
  };

  const toggleChat = () => {
    socket.emit('toggle-chat', { roomId, enabled: !chatEnabled });
  };

  const startRecording = () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;
    const chunks = [];

    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const formData = new FormData();
      formData.append('video', blob, 'recorded.webm');

      try {
        const res = await fetch('https://webrtc-backend-goxe.onrender.com/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();

        if (data.fileUrl) {
          const link = document.createElement('a');
          link.href = data.fileUrl;
          link.download = 'recorded.webm';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          alert('Recording uploaded and downloaded!');
        } else {
          alert('Upload succeeded but no file URL received.');
        }
      } catch (err) {
        console.error('Upload failed', err);
        alert('Recording upload failed.');
      }
    };

    mediaRecorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const shareScreen = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const videoTrack = screenStream.getVideoTracks()[0];
      
      // Replace the video track in all peer connections
      Object.values(peerConnectionsRef.current).forEach((pc) => {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(videoTrack);
        }
      });
      
      // Update local video display
      if (localVideoRef.current) {
        // Create a new stream that combines screen sharing video with original audio
        const newStream = new MediaStream();
        newStream.addTrack(videoTrack);
        
        // Add audio tracks from the original stream
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(track => {
            newStream.addTrack(track);
          });
        }
        
        localVideoRef.current.srcObject = newStream;
      }
      
      setIsSharingScreen(true);
      
      // Handle track ending (user stops screen share)
      videoTrack.onended = async () => {
        // Get a new camera stream
        const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const cameraVideoTrack = cameraStream.getVideoTracks()[0];
        
        // Replace the track in all peer connections
        Object.values(peerConnectionsRef.current).forEach((pc) => {
          const senders = pc.getSenders();
          const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(cameraVideoTrack);
          }
        });
        
        // Update local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = cameraStream;
        }
        
        // Update the reference to the current stream
        localStreamRef.current = cameraStream;
        
        setIsSharingScreen(false);
      };
      
    } catch (error) {
      console.error('Screen share error:', error);
    }
  };

  return (
    <div className={style.container}>
      <h2 className={style.heading}>Room: {roomId}</h2>

      <div className={style.videoGrid}>
        <div className={style.videoBlock}>
          <h3>You ({name})</h3>
          <video ref={localVideoRef} autoPlay muted playsInline className={style.video} />
        </div>

        {/* Container for remote videos */}
        <div id="remote-videos-container" className={style.remoteVideosContainer}>
          {/* Remote videos will be dynamically added here */}
        </div>
      </div>

      <div className={style.controlPanel}>
        <div className={style.buttonGroup}>
          <button
            onClick={toggleMic}
            className={`${style.button} ${isMicOn ? style.activeButton : style.inactiveButton}`}
          >
            {isMicOn ? 'Mute Mic' : 'Unmute Mic'}
          </button>

          <button
            onClick={toggleVideo}
            className={`${style.button} ${style.blueButton}`}
          >
            Toggle Video
          </button>

          <button
            onClick={shareScreen}
            className={`${style.button} ${isSharingScreen ? style.activeButton : style.greenButton}`}
          >
            {isSharingScreen ? 'Stop Sharing' : 'Share Screen'}
          </button>

          {role === 'host' && (
            <>
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`${style.button} ${isRecording ? style.activeRedButton : style.redButton}`}
              >
                {isRecording ? 'Stop Recording' : 'Start Recording'}
              </button>

              <button
                onClick={toggleChat}
                className={`${style.button} ${chatEnabled ? style.activeButton : style.indigoButton}`}
              >
                {chatEnabled ? 'Disable Chat' : 'Enable Chat'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className={style.bottomSection}>
        {chatEnabled && (
          <div className={style.chatBox}>
            <h4>Chat</h4>
            <div className={style.chatMessages}>
              {chatMessages.map((msg, i) => (
                <div key={i} className={style.chatMessage}>
                  <strong>{msg.from}:</strong> {msg.message}
                  {msg.to !== 'all' && <span className={style.privateTag}> (private)</span>}
                </div>
              ))}
            </div>
            <div className={style.chatInputArea}>
              <select
                value={chatTarget}
                onChange={(e) => setChatTarget(e.target.value)}
                className={style.chatTargetSelect}
              >
                <option value="all">All</option>
                {participants.map((p) => (
                  <option key={p.socketId} value={p.socketId}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message"
                className={style.chatInput}
              />
              <button onClick={sendMessage} className={style.sendButton}>
                Send
              </button>
            </div>
          </div>
        )}

        <div className={style.participantList}>
          <h4>Participants ({participants.length + 1})</h4>
          <div className={style.participant}>
            <strong>{name} (You)</strong> {role === 'host' ? ' - Host' : ''}
          </div>
          {participants.map((p) => (
            <div key={p.socketId} className={style.participant}>
              {p.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}