'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import style from './RoomPage.module.css';
import socket from '../utils/socket';
  import Image from 'next/image';

function VideoBox({ stream, name }) {
  const videoRef = useRef(null);
  const [isVideoActive, setIsVideoActive] = useState(true);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleInactive = () => {
      setIsVideoActive(false);
    };

    const handleActive = () => {
      setIsVideoActive(true);
      if (video && stream) video.srcObject = stream;
    };

    stream?.getTracks().forEach((track) => {
      track.onended = handleInactive;
      track.onmute = handleInactive;
      track.onunmute = handleActive;
    });

    return () => {
      stream?.getTracks().forEach((track) => {
        track.onended = null;
        track.onmute = null;
        track.onunmute = null;
      });
    };
  }, [stream]);

  return (
    <div className={style.videoBlock}>
      <h3>{name}</h3>
      {isVideoActive ? (
        <video ref={videoRef} autoPlay playsInline className={style.video} />
      ) : (
        <div className={style.videoPlaceholder}>
          <Image src="/switch-off.png" alt="Avatar" width={64} height={64} className={style.avatar} />
          <p>Camera Off</p>
          </div>
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

  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState([]);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

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
        setRemoteStreams((prev) => {
          return { ...prev, [peerId]: stream };
        });
      };

      streamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, streamRef.current);
      });

      return pc;
    };

    const start = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideoRef.current.srcObject = stream;
      streamRef.current = stream;

      socket.emit('join-room', { roomId, userId: name, role });
      setParticipants([{ socketId: socket.id, name }]);

      socket.on('all-users', async (users) => {
        setParticipants((prev) => {
          const newUsers = users.filter((u) => !prev.find((p) => p.socketId === u.socketId));
          return [...prev, ...newUsers];
        });

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
        'user-disconnected',
        'screen-share-started',
        'screen-share-stopped',
      ].forEach((event) => socket.off(event));

      streamRef.current?.getTracks().forEach((t) => t.stop());
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
    };
  }, [roomId, name, role]);

  const toggleOwnMic = () => {
    const audioTracks = streamRef.current?.getAudioTracks();
    if (audioTracks && audioTracks.length > 0) {
      const newMutedState = !isMicMuted;
      audioTracks.forEach((track) => (track.enabled = !newMutedState));
      setIsMicMuted(newMutedState);
    }
  };

  const toggleOwnVideo = async () => {
    const videoTracks = streamRef.current?.getVideoTracks();
    if (!videoTracks || videoTracks.length === 0) return;

    if (!isVideoOff) {
      videoTracks.forEach((track) => track.stop());
      if (localVideoRef.current) localVideoRef.current.srcObject = new MediaStream();
      setIsVideoOff(true);
    } else {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const newTrack = newStream.getVideoTracks()[0];

      streamRef.current.addTrack(newTrack);
      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(newTrack);
      });

      localVideoRef.current.srcObject = new MediaStream([
        ...streamRef.current.getAudioTracks(),
        newTrack,
      ]);
      setIsVideoOff(false);
       window.location.reload();

      // Force re-offer to all peers to refresh video
    }
  };

  const shareScreen = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      screenTrack.onended = () => {
        socket.emit('screen-share-stopped');
      };

      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
      }

      socket.emit('screen-share-started');
    } catch (err) {
      console.error('Failed to share screen:', err);
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
          <button onClick={shareScreen} className={style.button}>
            Share Screen
          </button>
          <button onClick={toggleOwnVideo} className={style.button}>
            {isVideoOff ? 'Turn On Camera' : 'Turn Off Camera'}
          </button>
        </div>

        {Object.entries(remoteStreams).map(([id, stream]) => (
          <VideoBox
            key={id}
            stream={stream}
            name={participants.find((p) => p.socketId === id)?.name || 'Remote'}
          />
        ))}
      </div>
    </div>
  );
}
