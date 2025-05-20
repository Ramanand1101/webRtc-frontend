'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import style from './RoomPage.module.css';
import {
  Mic, MicOff, VideoOff, Video, ScreenShare,
  StopCircle, PhoneOff, MessageSquare, Users,
  X, Maximize2, Minimize2
} from 'lucide-react';
import socket from '../utils/socket';

// Import your existing components
import ChatBox from './ChatBox';
import RecordingControls from './RecordingControls';

function VideoBox({ stream, name, isCameraOff }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={style.videoBlock}>
      {stream && !isCameraOff ? (
        <video ref={videoRef} autoPlay playsInline className={style.video} />
      ) : (
        <div className={style.videoPlaceholder}>
          <VideoOff size={32} />
        </div>
      )}
      <div className={style.participantName}>{name}</div>
    </div>
  );
}

export default function RoomPage() {
  const searchParams = useSearchParams();
  const name = searchParams.get('name') || '';
  const roomId = searchParams.get('roomId') || '';
  const role = searchParams.get('role') || 'participant';

  // State for responsive UI
  const [isMobile, setIsMobile] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);

  // State from your existing component
  const localVideoRef = useRef(null);
  const streamRef = useRef(null);
  const peersRef = useRef(new Map());
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [message, setMessage] = useState('');
  const [chatTarget, setChatTarget] = useState('all');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const audioContextRef = useRef(null);
  const audioDestinationRef = useRef(null);
  const [screenSharerId, setScreenSharerId] = useState(null);

  // Detect screen size for responsive layout
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      // ✅ Do NOT auto-open panels
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Re-use your existing WebRTC and socket code here
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

      tracks.forEach((track) => {
        // Add only if not already sent
        if (!existingSenders.includes(track.id)) {
          pc.addTrack(track, streamRef.current);
        }
      });

      return pc;
    };

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });

        streamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Turn off participant video by default
        if (role === 'participant') {
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.enabled = false;
            setIsVideoOff(true);
          }
        }

        socket.emit('join-room', { roomId, userId: name, role });
        setParticipants([{ socketId: socket.id, name, role }]);

        socket.on('all-users', async (users) => {
          for (const { socketId, name, role } of users) {
            const pc = createPeer(socketId);
            peersRef.current.set(socketId, pc);

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            socket.emit('send-offer', { to: socketId, offer });

            // ✅ Add participant to the list with name and role
            setParticipants((prev) => {
              if (prev.find((p) => p.socketId === socketId)) return prev;
              return [...prev, { socketId, name, role }];
            });
          }
        });


        socket.on('user-connected', ({ socketId, name, role }) => {
          setParticipants((prev) => {
            if (prev.find((p) => p.socketId === socketId)) return prev;
            return [...prev, { socketId, name, role }]; // ✅ Add role here
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
          setScreenSharerId(socketId);
          socket.emit('screen-share-started', { socketId: socket.id });
          console.log(`📺 ${userId} started screen sharing in room ${roomId}`);
        });

        socket.on('screen-share-stopped', () => {
          const { userId, roomId } = socket.data || {};

          setScreenSharerId(null);
          socket.emit('screen-share-stopped');
          console.log(`🛑 ${userId} stopped screen sharing in room ${roomId}`);
        });
      } catch (err) {
        console.error("Error starting stream:", err);
      }
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
        'chat-history',
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

  // Your chat logic
  const sendMessage = () => {
    if (!message.trim()) return;


    // 👇 Emit to server for others
    socket.emit('send-chat', {
      roomId,
      message: message.trim(),
      to: chatTarget === 'all' ? null : chatTarget,
    });

    setMessage('');
  };
  // Your control functions
  const toggleMic = () => {
    const audioTracks = streamRef.current?.getAudioTracks();
    if (audioTracks && audioTracks.length > 0) {
      const newMutedState = !isMicMuted;
      audioTracks.forEach((track) => (track.enabled = !newMutedState));
      setIsMicMuted(newMutedState);
    }
  };

  const toggleVideo = async () => {
    const videoTracks = streamRef.current?.getVideoTracks();
    if (!videoTracks || videoTracks.length === 0) return;

    if (!isVideoOff) {
      videoTracks.forEach((track) => {
        track.enabled = false;
      });
      setIsVideoOff(true);
    } else {
      videoTracks.forEach((track) => {
        track.enabled = true;
      });
      setIsVideoOff(false);
    }
  };

  const shareScreen = async () => {
    if (role !== 'host') {
      socket.emit('request-screen-share');
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      screenTrack.onended = () => {
        stopScreenShare();
      };

      const audioTracks = streamRef.current?.getAudioTracks() || [];
      const combined = new MediaStream([...audioTracks, screenTrack]);
      streamRef.current = combined;

      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = combined;
      }

      setIsSharingScreen(true);
      socket.emit('screen-share-started');
    } catch (err) {
      console.error('Failed to share screen:', err);
    }
  };

  const stopScreenShare = async () => {
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const camTrack = camStream.getVideoTracks()[0];

      const currentAudioTracks = streamRef.current?.getAudioTracks() || [];
      const newCombinedStream = new MediaStream([...currentAudioTracks, camTrack]);
      streamRef.current = newCombinedStream;

      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(camTrack);
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newCombinedStream;
      }

      socket.emit('screen-share-stopped');
      setIsSharingScreen(false);
    } catch (err) {
      console.error('Error stopping screen share:', err);
    }
  };

  const leaveRoom = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();

    socket.emit('leave-room', { roomId, userId: name });
    socket.disconnect();

    window.location.href = '/';
  };

  // Close side panels when clicking on video area (mobile)
  const handleVideoAreaClick = () => {
    if (isMobile) {
      setIsChatOpen(false);
      setIsParticipantsOpen(false);
    }
  };

  return (
    <div className={style.container}>
      <div className={style.roomHeader}>
        <h2>Room: {roomId}</h2>

        {/* Mobile tab buttons */}
        <div className={style.tabButtons}>
          <button
            className={`${style.tabButton} ${isParticipantsOpen ? style.active : ''}`}
            onClick={() => {
              setIsParticipantsOpen(!isParticipantsOpen);
              setIsChatOpen(false);
            }}
          >
            <Users size={20} />
          </button>
          <button
            className={`${style.tabButton} ${isChatOpen ? style.active : ''}`}
            onClick={() => {
              setIsChatOpen(!isChatOpen);
              setIsParticipantsOpen(false);
            }}
          >
            <MessageSquare size={20} />
          </button>
        </div>
      </div>

      <div className={style.mainContent}>
        <div className={style.videoSection} onClick={handleVideoAreaClick}>
          <div className={style.videoGrid}>
            {/* Local video */}
            {role === 'host' && (
              <div className={style.videoBlock}>
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={style.video}
                />
                <div className={style.participantName}>
                  {name} (You){isMicMuted ? ' 🔇' : ''}
                </div>
              </div>
            )}

            {/* Remote videos */}

            {/* Remote videos */}
            {role === 'participant' && (() => {
              const host = participants.find((p) => p.role === 'host');
              if (host && remoteStreams[host.socketId]) {
                return (
                  <VideoBox
                    key={host.socketId}
                    stream={remoteStreams[host.socketId]}
                    name={host.name}
                    isCameraOff={host.isCameraOff ?? false}
                  />
                );
              }
              return null;
            })()}

            {role === 'host' &&
              Object.entries(remoteStreams).map(([id, stream]) => {
                const participant = participants.find((p) => p.socketId === id);
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

          {/* Main controls */}
          <div className={style.controlsContainer}>
            <button
              className={`${style.iconButton} ${isMicMuted ? style.active : ''}`}
              onClick={toggleMic}
            >
              {isMicMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            {role === 'host' && (
              <>
                <button
                  className={`${style.iconButton} ${isVideoOff ? style.active : ''}`}
                  onClick={toggleVideo}
                >
                  {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
                </button>

                <button
                  className={`${style.iconButton} ${isSharingScreen ? style.active : ''}`}
                  onClick={isSharingScreen ? stopScreenShare : shareScreen}
                >
                  {isSharingScreen ? <StopCircle size={20} /> : <ScreenShare size={20} />}
                </button>
                <button
                  className={`${style.iconButton} ${isParticipantsOpen ? style.active : ''}`}
                  onClick={() => {
                    setIsParticipantsOpen(!isParticipantsOpen);
                    setIsChatOpen(false);
                  }}
                >
                  <Users size={20} />
                </button>
              </>
            )}


            {/* ✅ New button to toggle chat */}
            <button
              className={`${style.iconButton} ${isChatOpen ? style.active : ''}`}
              onClick={() => {
                setIsChatOpen(!isChatOpen);
                setIsParticipantsOpen(false);
              }}
            >
              <MessageSquare size={20} />
            </button>
            <button className={`${style.iconButton} ${style.leaveButton}`} onClick={leaveRoom}>
              <PhoneOff size={20} />
            </button>

            {/* Recording controls for host */}
            {role === 'host' && (
              <div className={style.recordingControlsContainer}>
                <RecordingControls
                  role={role}
                  localVideoRef={localVideoRef}
                  streamRef={streamRef}
                  peersRef={peersRef}
                  remoteStreams={remoteStreams}
                  socket={socket}
                />
              </div>
            )}
          </div>
        </div>

        {/* Participants panel */}
        {role === 'host' && (
          <div className={`${style.sidePanel} ${isParticipantsOpen ? style.open : ''}`}>
            <div className={style.panelHeader}>
              <h3>Participants ({participants.length})</h3>
              {isMobile && (
                <button className={style.iconButton} onClick={() => setIsParticipantsOpen(false)}>
                  <X size={20} />
                </button>
              )}
            </div>
            <div className={style.panelBody}>
              <div className={style.participantsList}>
                {participants.map((p) => (
                  <div key={p.socketId} className={style.participantItem}>
                    <div className={style.participantAvatar}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className={style.participantInfo}>
                      <div className={style.participantName}>
                        {p.name} {p.socketId === socket.id ? '(You)' : ''}
                      </div>
                      <div className={style.participantStatus}>
                        {p.isCameraOff ? 'Camera Off' : 'Camera On'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Chat panel */}
        {isChatOpen && (
          <div className={`${style.sidePanel} ${style.open}`}>
            <div className={style.panelHeader}>
              <h3 className={style.panelTitle}>Chat</h3>
              {isMobile && (
                <button
                  className={`${style.iconButton} ${style.closeButton}`}
                  onClick={() => setIsChatOpen(false)}
                >
                  <X size={20} />
                </button>
              )}
            </div>

            {/* Enhanced ChatBox stays here */}
            <ChatBox
              chatMessages={chatMessages}
              participants={participants}
              chatEnabled={chatEnabled}
              message={message}
              setMessage={setMessage}
              chatTarget={chatTarget}
              setChatTarget={setChatTarget}
              sendMessage={sendMessage}
            />
          </div>
        )}


      </div>
    </div>
  );
}