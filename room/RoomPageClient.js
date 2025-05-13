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
        // Add a public TURN server as backup
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ],
    };

    // Function to create a peer connection for a specific user
    const createPeerConnection = (socketId, participantName = 'Remote User') => {
      console.log(`Creating peer connection for ${participantName} (${socketId})`);
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
          nameHeading.textContent = participantName;
          nameHeading.id = `name-${socketId}`;
          
          videoBlock.appendChild(nameHeading);
          videoBlock.appendChild(videoElement);
          remoteVideosContainer.appendChild(videoBlock);
        }
      }

      // Handle incoming tracks from the remote peer
      peerConnection.ontrack = (event) => {
        console.log('Received track from', socketId, event.track.kind, event.streams[0]);
        const videoElement = remoteVideosRef.current[socketId];
        if (videoElement && event.streams[0]) {
          videoElement.srcObject = event.streams[0];
          console.log(`Set srcObject for ${socketId}`, event.streams[0].getTracks());
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Sending ICE candidate to', socketId);
          socket.emit('ice-candidate', {
            targetSocketId: socketId,
            candidate: event.candidate,
          });
        }
      };

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log(`Peer connection state for ${socketId}:`, peerConnection.connectionState);
      };

      // Handle ICE connection state changes
      peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE connection state for ${socketId}:`, peerConnection.iceConnectionState);
      };

      // Add local tracks to the peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          console.log(`Adding ${track.kind} track to peer connection for ${socketId}`);
          const sender = peerConnection.addTrack(track, localStreamRef.current);
          console.log('Added track sender:', sender);
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
            width: { ideal: 640 },
            height: { ideal: 480 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 44100
          }
        };
        
        // Try to get user media with better error handling
        let localStream;
        try {
          localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        } catch (firstError) {
          console.warn('Failed to get video and audio, trying audio only:', firstError);
          
          // If video fails, try audio only
          if (firstError.name === 'NotReadableError' || firstError.name === 'NotFoundError') {
            try {
              localStream = await navigator.mediaDevices.getUserMedia({ 
                video: false, 
                audio: mediaConstraints.audio 
              });
              console.log('Got audio-only stream');
              alert('Camera access failed. Using audio only.');
            } catch (audioError) {
              console.error('Failed to get even audio:', audioError);
              alert('Failed to access camera and microphone. Please check if they are in use by another application.');
              return;
            }
          } else {
            throw firstError;
          }
        }
        
        localStreamRef.current = localStream;

        // Display local video
        if (localVideoRef.current && localStream.getVideoTracks().length > 0) {
          localVideoRef.current.srcObject = localStream;
        }

        // Log audio tracks to verify they exist
        console.log('Local audio tracks:', localStream.getAudioTracks());
        console.log('Local video tracks:', localStream.getVideoTracks());

        // Join the room
        console.log('Joining room:', roomId, 'as', name, 'with role', role);
        socket.emit('join-room', { roomId, userId: name, role });

        // Handle host info (for participants)
        socket.on('host-info', ({ socketId }) => {
          console.log('Received host info:', socketId);
          
          // If we're a participant, initiate connection to host
          if (role === 'participant' && socketId) {
            setTimeout(async () => {
              console.log('Creating connection to host:', socketId);
              const peerConnection = createPeerConnection(socketId, 'Host');
              
              try {
                const offer = await peerConnection.createOffer({
                  offerToReceiveAudio: true,
                  offerToReceiveVideo: true
                });
                await peerConnection.setLocalDescription(offer);
                
                console.log('Sending offer to host:', socketId);
                socket.emit('offer', {
                  targetSocketId: socketId,
                  offer: offer
                });
              } catch (error) {
                console.error('Error creating offer to host:', error);
              }
            }, 1000); // Small delay to ensure everything is set up
          }
        });

        // Handle new user connections
        socket.on('user-connected', async (data) => {
          // Handle both object and string data formats
          const userData = typeof data === 'object' ? data : { socketId: data, name: data };
          const { socketId, name: userName } = userData;
          
          if (!socketId || socketId === socket.id) return; // Don't connect to ourselves
          
          console.log(`New user connected: ${userName} (${socketId})`);
          
          // Update participants list
          setParticipants((prev) => {
            if (prev.some(p => p.socketId === socketId)) {
              return prev;
            }
            return [...prev, { socketId, name: userName }];
          });
          
          // Update the name in the DOM if the element already exists
          const nameElement = document.getElementById(`name-${socketId}`);
          if (nameElement) {
            nameElement.textContent = userName;
          }
          
          // For participant-to-participant connections
          if (role === 'participant') {
            // Create connection to other participants
            setTimeout(async () => {
              console.log('Creating connection to participant:', socketId);
              const peerConnection = createPeerConnection(socketId, userName);
              
              try {
                const offer = await peerConnection.createOffer({
                  offerToReceiveAudio: true,
                  offerToReceiveVideo: true
                });
                await peerConnection.setLocalDescription(offer);
                
                console.log('Sending offer to participant:', socketId);
                socket.emit('offer', {
                  targetSocketId: socketId,
                  offer: offer
                });
              } catch (error) {
                console.error('Error creating offer to participant:', error);
              }
            }, 1500); // Delay to ensure everything is set up
          } else if (role === 'host') {
            // Host waits for offers from participants
            console.log('As host, waiting for offer from participant:', socketId);
          }
        });

        // Handle participant list updates (for host)
        socket.on('participant-list', (participantList) => {
          console.log('Updated participant list:', participantList);
          setParticipants(participantList.map(p => ({ socketId: p.socketId, name: p.name })));
        });

        // Handle incoming offers
        socket.on('offer', async ({ senderSocketId, offer }) => {
          console.log(`Received offer from: ${senderSocketId}`);
          
          // Find the sender's name from participants
          const senderName = participants.find(p => p.socketId === senderSocketId)?.name || 'Participant';
          const peerConnection = createPeerConnection(senderSocketId, senderName);
          
          try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            await peerConnection.setLocalDescription(answer);
            
            console.log('Sending answer to', senderSocketId);
            socket.emit('answer', {
              targetSocketId: senderSocketId,
              answer: answer
            });
          } catch (error) {
            console.error('Error handling offer:', error);
          }
        });

        // Handle incoming answers
        socket.on('answer', async ({ senderSocketId, answer }) => {
          console.log(`Received answer from: ${senderSocketId}`);
          
          const peerConnection = peerConnectionsRef.current[senderSocketId];
          if (peerConnection) {
            try {
              await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (error) {
              console.error('Error setting remote description:', error);
            }
          }
        });

        // Handle incoming ICE candidates
        socket.on('ice-candidate', async ({ senderSocketId, candidate }) => {
          console.log('Received ICE candidate from', senderSocketId);
          const peerConnection = peerConnectionsRef.current[senderSocketId];
          if (peerConnection && candidate) {
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

        // Handle disconnect
        socket.on('user-disconnected', (socketId) => {
          console.log(`User disconnected: ${socketId}`);
          setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
          removePeerConnection(socketId);
        });

        socket.on('host-disconnected', () => {
          console.log('Host disconnected');
          alert('The host has left the room. The meeting has ended.');
          window.location.href = '/';
        });

        // Handle mute/unmute events
        socket.on('muted', () => {
          console.log('You have been muted by the host');
          setIsMicOn(false);
          if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
              track.enabled = false;
            });
          }
        });

        socket.on('unmuted', () => {
          console.log('You have been unmuted by the host');
          setIsMicOn(true);
          if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
              track.enabled = true;
            });
          }
        });

      } catch (err) {
        console.error('Media access error:', err);
        alert('Failed to access camera/microphone. Please check permissions and make sure you are using HTTPS.');
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
      
      // Remove all socket listeners
      socket.off('host-info');
      socket.off('user-connected');
      socket.off('participant-list');
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('receive-chat');
      socket.off('chat-permission-updated');
      socket.off('user-disconnected');
      socket.off('host-disconnected');
      socket.off('muted');
      socket.off('unmuted');
      
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
    if (role === 'host') {
      socket.emit('toggle-chat', { roomId, enabled: !chatEnabled });
    }
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

  // Mute/unmute other participants (for host only)
  const muteParticipant = (targetSocketId) => {
    if (role === 'host') {
      socket.emit('mute-user', { roomId, targetSocketId });
    }
  };

  const unmuteParticipant = (targetSocketId) => {
    if (role === 'host') {
      socket.emit('unmute-user', { roomId, targetSocketId });
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
              {role === 'host' && (
                <div className={style.participantControls}>
                  <button 
                    onClick={() => muteParticipant(p.socketId)}
                    className={style.miniButton}
                  >
                    Mute
                  </button>
                  <button 
                    onClick={() => unmuteParticipant(p.socketId)}
                    className={style.miniButton}
                  >
                    Unmute
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}