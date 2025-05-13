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
  const streamRef = useRef(null);
  const peersRef = useRef(new Map());

  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatEnabled, setChatEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [chatTarget, setChatTarget] = useState('all');

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
        setRemoteStreams((prev) => ({ ...prev, [peerId]: event.streams[0] }));
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
        setParticipants((prev) => [...prev, { socketId, name }]);
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
        setChatMessages((prev) => [...prev, chat]);
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
        'chat-permission-updated',
        'user-disconnected',
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

  return (
    <div className={style.container}>
      <h2 className={style.heading}>Room: {roomId}</h2>
      <div className={style.videoGrid}>
        <div className={style.videoBlock}>
          <h3>You</h3>
          <video ref={localVideoRef} autoPlay muted playsInline className={style.video} />
        </div>

        {Object.entries(remoteStreams).map(([id, stream]) => (
          <div key={id} className={style.videoBlock}>
            <h3>Remote</h3>
            <video
              autoPlay
              playsInline
              className={style.video}
              ref={(video) => {
                if (video && stream) video.srcObject = stream;
              }}
            />
          </div>
        ))}
      </div>

      {chatEnabled && (
        <div className={style.chatBox}>
          <h4>Chat</h4>
          <div className={style.chatMessages}>
            {chatMessages.map((msg, i) => (
              <div key={i}>
                <strong>{msg.from}:</strong> {msg.message}
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
              placeholder="Type a message"
              className={style.chatInput}
            />
            <button onClick={sendMessage} className={style.sendButton}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}