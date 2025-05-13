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
  // Track video mute state
  const [isVideoOn, setIsVideoOn] = useState(true);

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
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    // Function to create a peer connection for a specific user
    const createPeerConnection = (socketId, participantName) => {
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
          
          const nameHeading = document.createElement('h3');
          nameHeading.textContent = participantName || 'Remote User';
          
          videoBlock.appendChild(nameHeading);
          videoBlock.appendChild(videoElement);
          remoteVideosContainer.appendChild(videoBlock);
        }
      }

      // Handle incoming tracks from the remote peer
      peerConnection.ontrack = (event) => {
        console.log('Received track from', socketId, event.track.kind);
        const videoElement = remoteVideosRef.current[socketId];
        if (videoElement && event.streams[0]) {
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

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log(`Peer connection state for ${socketId}:`, peerConnection.connectionState);
      };

      // Add local tracks to the peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          console.log('Adding local track to peer connection:', track.kind);
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
        // Get local media stream with explicit audio constraints
        const mediaConstraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        };
        
        const localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        localStreamRef.current = localStream;

        // Display local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }

        // Log audio tracks to verify they exist
        console.log('Local audio tracks:', localStream.getAudioTracks());
        console.log('Local video tracks:', localStream.getVideoTracks());

        // Join the room
        socket.emit('join-room', { roomId, userId: name, role });

        // Handle existing users in the room
        socket.on('all-users', async (users) => {
          console.log('All users in room:', users);
          setParticipants(users);
          
          // Create peer connections for each existing user
          for (const user of users) {
            const { socketId, name: userName } = user;
            console.log(`Creating connection for ${userName} (${socketId})`);
            
            // Create a peer connection for this user
            const peerConnection = createPeerConnection(socketId, userName);
            
            try {
              // Create and send an offer
              const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
              });
              await peerConnection.setLocalDescription(offer);
              
              socket.emit('send-offer', {
                to: socketId,
                offer: peerConnection.localDescription,
              });
            } catch (error) {
              console.error('Error creating offer:', error);
            }
          }
        });

        // Handle new user connections
        socket.on('user-connected', ({ socketId, name: newName }) => {
          console.log(`New user connected: ${newName} (${socketId})`);
          setParticipants((prev) => [...prev, { socketId, name: newName }]);
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
          
          // Get the sender's name from participants
          const senderName = participants.find(p => p.socketId === from)?.name || 'Remote User';
          const peerConnection = createPeerConnection(from, senderName);
          
          try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            await peerConnection.setLocalDescription(answer);
            
            socket.emit('send-answer', {
              to: from,
              answer: peerConnection.localDescription,
            });
          } catch (error) {
            console.error('Error handling offer:', error);
          }
        });

        // Handle incoming answers
        socket.on('receive-answer', async ({ answer, from }) => {
          console.log(`Received answer from: ${from}`);
          
          const peerConnection = peerConnectionsRef.current[from];
          if (peerConnection) {
            try {
              await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (error) {
              console.error('Error setting remote description:', error);
            }
          }
        });

        // Handle incoming ICE candidates
        socket.on('receive-ice-candidate', async ({ candidate, from }) => {
          const peerConnection = peerConnectionsRef.current[from];
          if (peerConnection) {
            try {
              await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
              console.error('Error adding ICE candidate:', error);
            }
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
        alert('Failed to access camera/microphone. Please check permissions.');
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
      
      // Leave the room before disconnecting
      socket.emit('leave-room', { roomId });
      
      // Disconnect socket and remove all listeners
      socket.off('all-users');
      socket.off('user-connected');
      socket.off('user-disconnected');
      socket.off('receive-offer');
      socket.off('receive-answer');
      socket.off('receive-ice-candidate');
      socket.off('receive-chat');
      socket.off('chat-permission-updated');
      socket.disconnect();
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

    // Toggle each audio track
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

    setIsVideoOn(!isVideoOn);
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
      if (isSharingScreen) {
        // Stop screen sharing and revert to camera
        const cameraStream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } 
        });
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
      } else {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
          video: true,
          audio: false 
        });
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
          const cameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
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
      }
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
            className={`${style.button} ${isVideoOn ? style.activeButton : style.blueButton}`}
          >
            {isVideoOn ? 'Turn Off Video' : 'Turn On Video'}
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