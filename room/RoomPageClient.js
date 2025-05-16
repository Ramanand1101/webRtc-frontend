'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import style from './RoomPage.module.css';
import socket from '../utils/socket';

function VideoBox({ stream, name, isCameraOff }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (isCameraOff) {
      videoEl.srcObject = null;
    } else if (stream && videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }
  }, [stream, isCameraOff]);

  return (
    <div className={style.videoBlock}>
      <h3>{name}</h3>
      {!isCameraOff ? (
        <video ref={videoRef} autoPlay playsInline className={style.video} />
      ) : (
        <div className={style.videoPlaceholder}>
          <Image src="/switch-off.png" alt="Camera Off" width={64} height={64} className={style.avatar} />
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
  const [isSharingScreen, setIsSharingScreen] = useState(false);
 const [hasLeft, setHasLeft] = useState(false);

  useEffect(() => {
    socket.on('user-camera-toggle', ({ userId, isCameraOff }) => {
      setParticipants((prev) =>
        prev.map((p) => (p.name === userId ? { ...p, isCameraOff } : p))
      );
    });

    socket.on('camera-toggle-rejected', ({ reason }) => {
      alert(reason);
    });

    socket.on('screen-share-request', ({ from }) => {
      if (role === 'host') {
        const grant = confirm(`${from} wants to share their screen. Allow?`);
        socket.emit('screen-share-response', { to: from, granted: grant });
      }
    });

    socket.on('screen-share-response', async ({ granted }) => {
      if (granted) {
        await actuallyShareScreen();
      } else {
        alert('❌ Host denied screen sharing.');
      }
    });

    return () => {
      socket.off('user-camera-toggle');
      socket.off('camera-toggle-rejected');
      socket.off('screen-share-request');
      socket.off('screen-share-response');
    };
  }, [role]);

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
          if (prev[peerId] !== stream) {
            return { ...prev, [peerId]: stream };
          }
          return prev;
        });
      };

      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          if (track.readyState === 'live') {
            pc.addTrack(track, stream);
          }
        });
      }

      return pc;
    };

    const start = async () => {
      const constraints = role === 'host' ? { video: true, audio: true } : { video: true, audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      streamRef.current = stream;
      if (localVideoRef.current && !localVideoRef.current.srcObject) {
        localVideoRef.current.srcObject = stream;
      }

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

 socket.on('user-connected', async ({ socketId, name }) => {
  setParticipants((prev) => {
    if (prev.find((p) => p.socketId === socketId)) return prev;
    return [...prev, { socketId, name }];
  });

  if (role === 'host' && streamRef.current) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('send-ice-candidate', { to: socketId, candidate: event.candidate });
      }
    };

    // Add host's live tracks
    streamRef.current.getTracks().forEach((track) => {
      if (track.readyState === 'live') {
        pc.addTrack(track, streamRef.current);
      }
    });

    // Save peer connection
    peersRef.current.set(socketId, pc);

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('send-offer', { to: socketId, offer });
  }
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
        if (pc && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
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
      ].forEach((event) => socket.off(event));

      streamRef.current?.getTracks().forEach((t) => t.stop());
      peersRef.current.forEach((pc) => pc.close());
      
    };
  }, [roomId, name, role]);

  const toggleOwnMic = () => {
    const audioTracks = streamRef.current?.getAudioTracks();
    if (audioTracks?.length) {
      const newMuted = !isMicMuted;
      audioTracks.forEach((t) => (t.enabled = !newMuted));
      setIsMicMuted(newMuted);
    }
  };

  const toggleOwnVideo = async () => {
    const videoTracks = streamRef.current?.getVideoTracks();
    if (!videoTracks?.length) return;

    const newState = !isVideoOff;

    if (!newState) {
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
    } else {
      videoTracks.forEach((track) => track.stop());
      localVideoRef.current.srcObject = new MediaStream();
    }

    setIsVideoOff(newState);
    socket.emit('camera-toggle', { roomId, userId: name, isCameraOff: newState });
  };
const stopScreenShare = async () => {
  try {
    // 1. Stop the screen track
    const screenTrack = localVideoRef.current?.srcObject?.getVideoTracks()[0];
    if (screenTrack?.kind === 'video') {
      screenTrack.stop(); // This triggers onended
    }

    // 2. Restart camera
    const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const newVideoTrack = cameraStream.getVideoTracks()[0];
    const audioTrack = streamRef.current.getAudioTracks()[0];

    const newCombinedStream = new MediaStream([audioTrack, newVideoTrack]);

    // 3. Update local video and peer tracks
    localVideoRef.current.srcObject = newCombinedStream;
    streamRef.current = newCombinedStream;

    peersRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) sender.replaceTrack(newVideoTrack);
    });

    // ✅ Notify others screen sharing has stopped
    socket.emit('screen-share-stopped');

    // 4. Update state
    setIsSharingScreen(false);
    setParticipants((prev) =>
      prev.map((p) =>
        p.socketId === socket.id ? { ...p, isSharingScreen: false } : p
      )
    );
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
  const actuallyShareScreen = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      setIsSharingScreen(true); // ← Added here

      screenTrack.onended = () => {
        const videoTrack = streamRef.current.getVideoTracks()[0];
        const audioTrack = streamRef.current.getAudioTracks()[0];
        
        localVideoRef.current.srcObject = new MediaStream([audioTrack, videoTrack]);

        peersRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender && videoTrack) sender.replaceTrack(videoTrack);
        });
        setIsSharingScreen(false);

        socket.emit('screen-share-stopped');
        
      };

      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      });

      localVideoRef.current.srcObject = screenStream;
      socket.emit('screen-share-started');
    } catch (err) {
      console.error('❌ Failed to share screen:', err);
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
        return (
          <VideoBox
            key={id}
            stream={stream}
            name={participant?.name || 'Remote'}
            isCameraOff={participant?.isCameraOff}
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
  </div>
  );
}
