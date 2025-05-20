'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import style from './RoomPage.module.css';
import ChatBox from './ChatBox';

import ControlPanel from './ControlPanel';
import socket from '../utils/socket';
import RecordingControls from './RecordingControls';

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

     const stream = await navigator.mediaDevices.getUserMedia({
  video: role === 'host',
  audio: true,
});

streamRef.current = stream;

// ✅ Only set srcObject if localVideoRef exists (i.e., user is host)
if (role === 'host' && localVideoRef.current) {
  localVideoRef.current.srcObject = stream;
}


      turnOffParticipantVideo();
      
      socket.emit('join-room', { roomId, userId: name, role });
      console.log('📡 join-room emitted:', { roomId, userId: name, role });
      setParticipants([{ socketId: socket.id, name, role }]);

      socket.on('all-users', async (users) => {
        console.log('👥 All users:', users);
          setParticipants(users); // users must be [{ socketId, name, role }]
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

function AudioBox({ stream }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline />;
}
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
  const leaveRoomCallback = () => {
    setHasLeft(true);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();

    socket.emit('leave-room', { roomId, userId: name });
    socket.disconnect();

    window.location.href = '/';
  };
  return (
    <div className={style.container}>
      <h2 className={style.heading}>Room: {roomId}</h2>
      <div className={style.videoGrid}>
  {role === 'host' && (
    <div className={style.videoBlock}>
      <h3>You</h3>
      <video
        ref={localVideoRef}
        autoPlay
        muted
        playsInline
        className={style.video}
      />
      <ControlPanel
        role={role}
        localVideoRef={localVideoRef}
        peersRef={peersRef}
        streamRef={streamRef}
        socket={socket}
        videoElementRef={videoElementRef}
        isMicMuted={isMicMuted}
        setIsMicMuted={setIsMicMuted}
        isSharingScreen={isSharingScreen}
        setIsSharingScreen={setIsSharingScreen}
        isVideoOff={isVideoOff}
        setIsVideoOff={setIsVideoOff}
        stopScreenShare={stopScreenShare}
        leaveRoomCallback={leaveRoomCallback}
      />
    </div>
  )}

  {/* Show host's video to everyone */}
  {Object.entries(remoteStreams).map(([id, stream]) => {
    const participant = participants.find((p) => p.socketId === id);
   {
      return (
        <VideoBox
          key={id}
          stream={stream}
          name={participant?.name || 'Host'}
          isCameraOff={false}
        />
      );
    }
     return <AudioBox key={id} stream={stream} />;
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
        <RecordingControls
          role={role}
          localVideoRef={localVideoRef}
          streamRef={streamRef}
          peersRef={peersRef}
          remoteStreams={remoteStreams}
          socket={socket}
        />
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