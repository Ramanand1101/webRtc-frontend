// 'use client';

// import { useEffect, useRef, useState } from 'react';
// import { useSearchParams } from 'next/navigation';
// import socket from '@/utils/socket';

// export default function RoomPage() {
//   const searchParams = useSearchParams();
//   const name = searchParams.get('name') || '';
//   const roomId = searchParams.get('roomId') || '';
//   const role = searchParams.get('role') || 'participant';

//   const localVideoRef = useRef(null);
//   const remoteVideoRef = useRef(null);
//   const peerConnectionRef = useRef(null);
//   const targetSocketRef = useRef(null);

//   const [participants, setParticipants] = useState([]);
//   const [chatEnabled, setChatEnabled] = useState(false);
//   const [chatMessages, setChatMessages] = useState([]);
//   const [message, setMessage] = useState('');
//   const [chatTarget, setChatTarget] = useState('all');
//   const [isSharingScreen, setIsSharingScreen] = useState(false);

//   useEffect(() => {
//     if (!roomId || !name || !role) return;

//     const ICE_SERVERS = {
//       iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
//     };

//     let localStream;

//     const createPeerConnection = () => {
//       peerConnectionRef.current = new RTCPeerConnection(ICE_SERVERS);

//       peerConnectionRef.current.ontrack = (event) => {
//         if (remoteVideoRef.current) {
//           remoteVideoRef.current.srcObject = event.streams[0];
//         }
//       };

//       peerConnectionRef.current.onicecandidate = (event) => {
//         if (event.candidate && targetSocketRef.current) {
//           socket.emit('send-ice-candidate', {
//             to: targetSocketRef.current,
//             candidate: event.candidate,
//           });
//         }
//       };
//     };

//     const start = async () => {
//       try {
//         localStream = await navigator.mediaDevices.getUserMedia({
//           video: role === 'host',
//           audio: true,
//         });

//         if (localVideoRef.current) {
//           localVideoRef.current.srcObject = localStream;
//         }

//         socket.emit('join-room', { roomId, userId: name, role });

//         socket.on('host-info', ({ socketId }) => {
//           if (role === 'participant') {
//             targetSocketRef.current = socketId;
//           }
//         });

//         socket.on('user-connected', async ({ socketId, name: newName }) => {
//           if (role !== 'host') return;

//           targetSocketRef.current = socketId;
//           createPeerConnection();

//           localStream.getTracks().forEach((track) =>
//             peerConnectionRef.current.addTrack(track, localStream)
//           );

//           const offer = await peerConnectionRef.current.createOffer();
//           await peerConnectionRef.current.setLocalDescription(offer);

//           socket.emit('send-offer', {
//             to: socketId,
//             offer: peerConnectionRef.current.localDescription,
//           });

//           setParticipants((prev) => [
//             ...prev,
//             { socketId, name: newName, muted: false },
//           ]);
//         });

//         socket.on('receive-offer', async ({ offer, from }) => {
//           if (role !== 'participant') return;

//           targetSocketRef.current = from;
//           createPeerConnection();

//           await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));

//           const answer = await peerConnectionRef.current.createAnswer();
//           await peerConnectionRef.current.setLocalDescription(answer);

//           socket.emit('send-answer', {
//             to: from,
//             answer: peerConnectionRef.current.localDescription,
//           });
//         });

//         socket.on('receive-answer', async ({ answer }) => {
//           await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
//         });

//         socket.on('receive-ice-candidate', ({ candidate }) => {
//           if (peerConnectionRef.current) {
//             peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
//           }
//         });

//         if (role === 'participant') {
//           socket.on('muted', () => {
//             localStream.getAudioTracks().forEach((t) => (t.enabled = false));
//           });
//           socket.on('unmuted', () => {
//             localStream.getAudioTracks().forEach((t) => (t.enabled = true));
//           });
//         }

//         if (role === 'host') {
//           socket.on('participant-left', ({ socketId }) => {
//             setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
//           });
//         }

//         socket.on('chat-permission-updated', ({ enabled }) => {
//           setChatEnabled(enabled);
//         });

//         socket.on('receive-chat', (chat) => {
//           setChatMessages((prev) => [...prev, chat]);
//         });
//       } catch (err) {
//         console.error('Error accessing media devices:', err);
//         alert('Camera or microphone access denied.');
//       }
//     };

//     start();

//     return () => {
//       socket.disconnect();
//       socket.off('host-info');
//       socket.off('user-connected');
//       socket.off('receive-offer');
//       socket.off('receive-answer');
//       socket.off('receive-ice-candidate');
//       socket.off('muted');
//       socket.off('unmuted');
//       socket.off('participant-left');
//       socket.off('chat-permission-updated');
//       socket.off('receive-chat');
//     };
//   }, [roomId, name, role]);

//   const handleToggleMute = (participant) => {
//     socket.emit('mute-toggle', {
//       roomId,
//       userId: participant.name,
//       isMuted: !participant.muted,
//     });

//     setParticipants((prev) =>
//       prev.map((p) =>
//         p.socketId === participant.socketId
//           ? { ...p, muted: !p.muted }
//           : p
//       )
//     );
//   };

//   const sendMessage = () => {
//     if (!message.trim()) return;
//     socket.emit('send-chat', {
//       roomId,
//       message,
//       to: chatTarget === 'all' ? null : chatTarget,
//     });
//     setMessage('');
//   };

//   const toggleChat = () => {
//     socket.emit('toggle-chat', { roomId, enabled: !chatEnabled });
//   };

//   const handleShareScreen = async () => {
//     try {
//       const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
//       const screenTrack = screenStream.getVideoTracks()[0];

//       const sender = peerConnectionRef.current.getSenders().find(s => s.track.kind === 'video');
//       if (sender) sender.replaceTrack(screenTrack);

//       socket.emit('screen-share-started');

//       screenTrack.onended = async () => {
//         const originalStream = await navigator.mediaDevices.getUserMedia({ video: true });
//         const originalTrack = originalStream.getVideoTracks()[0];
//         if (sender) sender.replaceTrack(originalTrack);
//         if (localVideoRef.current) {
//           localVideoRef.current.srcObject = originalStream;
//         }
//         setIsSharingScreen(false);
//         socket.emit('screen-share-stopped');
//       };

//       if (localVideoRef.current) {
//         localVideoRef.current.srcObject = screenStream;
//       }

//       setIsSharingScreen(true);
//     } catch (error) {
//       console.error('Failed to share screen:', error);
//     }
//   };

//   return (
//     <div className="flex flex-wrap gap-4 p-8">
//       <div className="flex flex-col items-center gap-4 flex-1 min-w-[300px]">
//         <h2 className="text-xl font-bold">Room: {roomId}</h2>
//         <div className="flex gap-4">
//           <div>
//             <p className="text-center text-sm mb-1">You ({role})</p>
//             <video
//               ref={localVideoRef}
//               autoPlay
//               muted
//               playsInline
//               className="w-80 h-60 border rounded bg-black"
//             />
//           </div>
//           <div>
//             <p className="text-center text-sm mb-1">Remote</p>
//             <video
//               ref={remoteVideoRef}
//               autoPlay
//               playsInline
//               className="w-80 h-60 border rounded bg-black"
//             />
//           </div>
//         </div>

//         {chatEnabled && (
//           <div className="mt-4 w-full max-w-md border rounded p-4 bg-white shadow">
//             <h3 className="text-lg font-semibold mb-2">Chat</h3>
//             <div className="h-40 overflow-auto border p-2 mb-2 bg-gray-100 text-sm rounded">
//               {chatMessages.length === 0 ? (
//                 <p className="text-gray-400 italic">No messages yet</p>
//               ) : (
//                 chatMessages.map((msg, idx) => (
//                   <div key={idx}>
//                     <strong>{msg.from}:</strong> {msg.message}
//                   </div>
//                 ))
//               )}
//             </div>
//             <div className="flex items-center gap-2">
//               <select
//                 value={chatTarget}
//                 onChange={(e) => setChatTarget(e.target.value)}
//                 className="border p-1 text-sm rounded"
//               >
//                 <option value="all">All</option>
//                 {participants.map((p) => (
//                   <option key={p.socketId} value={p.socketId}>
//                     {p.name}
//                   </option>
//                 ))}
//               </select>
//               <input
//                 value={message}
//                 onChange={(e) => setMessage(e.target.value)}
//                 className="border flex-1 text-sm p-1 rounded"
//                 placeholder="Type message..."
//               />
//               <button
//                 onClick={sendMessage}
//                 className="bg-blue-600 text-white px-3 py-1 text-sm rounded"
//                 disabled={role !== 'host' && !chatEnabled}
//               >
//                 Send
//               </button>
//             </div>
//           </div>
//         )}

//         {role === 'host' && (
//           <>
//             <button
//               onClick={toggleChat}
//               className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm rounded"
//             >
//               {chatEnabled ? 'Disable Chat' : 'Enable Chat'}
//             </button>
//             <button
//               onClick={handleShareScreen}
//               className="mt-2 px-4 py-2 bg-green-600 text-white text-sm rounded"
//             >
//               {isSharingScreen ? 'Sharing Screen...' : 'Share Screen'}
//             </button>
//           </>
//         )}
//       </div>

//       {role === 'host' && (
//         <div className="w-64 border rounded p-4 bg-white shadow-sm">
//           <h3 className="font-bold mb-2 text-center">Participants</h3>
//           {participants.length === 0 ? (
//             <p className="text-sm text-gray-500 text-center">No participants yet</p>
//           ) : (
//             participants.map((p) => (
//               <div key={p.socketId} className="flex justify-between items-center py-1 text-sm">
//                 <span>{p.name}</span>
//                 <button
//                   className="bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded text-xs"
//                   onClick={() => handleToggleMute(p)}
//                 >
//                   {p.muted ? 'Unmute' : 'Mute'}
//                 </button>
//               </div>
//             ))
//           )}
//         </div>
//       )}
//     </div>
//   );
// }


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
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const targetSocketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const currentStreamRef = useRef(null);

  const [participants, setParticipants] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatEnabled, setChatEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [chatTarget, setChatTarget] = useState('all');
  const [isRecording, setIsRecording] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);

  useEffect(() => {
    if (!roomId || !name || !role) return;

    const ICE_SERVERS = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    };

    let localStream;

    const createPeerConnection = () => {
      peerConnectionRef.current = new RTCPeerConnection(ICE_SERVERS);

      peerConnectionRef.current.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate && targetSocketRef.current) {
          socket.emit('send-ice-candidate', {
            to: targetSocketRef.current,
            candidate: event.candidate,
          });
        }
      };
    };

    const start = async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: role === 'host',
          audio: true,
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }

        currentStreamRef.current = localStream;

        socket.emit('join-room', { roomId, userId: name, role });

        socket.on('host-info', ({ socketId }) => {
          if (role === 'participant') targetSocketRef.current = socketId;
        });

        socket.on('user-connected', async ({ socketId, name: newName }) => {
          if (role !== 'host') return;
          targetSocketRef.current = socketId;
          createPeerConnection();

          localStream.getTracks().forEach((track) =>
            peerConnectionRef.current.addTrack(track, localStream)
          );

          const offer = await peerConnectionRef.current.createOffer();
          await peerConnectionRef.current.setLocalDescription(offer);

          socket.emit('send-offer', {
            to: socketId,
            offer: peerConnectionRef.current.localDescription,
          });

          setParticipants((prev) => [...prev, { socketId, name: newName }]);
        });

        socket.on('participant-left', ({ socketId }) => {
          setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
        });

        socket.on('receive-offer', async ({ offer, from }) => {
          if (role !== 'participant') return;
          targetSocketRef.current = from;
          createPeerConnection();

          const localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          currentStreamRef.current = localStream;

          localStream.getTracks().forEach((track) =>
            peerConnectionRef.current.addTrack(track, localStream)
          );

          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
          }

          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);

          socket.emit('send-answer', {
            to: from,
            answer: peerConnectionRef.current.localDescription,
          });
        });

        socket.on('receive-answer', async ({ answer }) => {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        });

        socket.on('receive-ice-candidate', ({ candidate }) => {
          if (peerConnectionRef.current) {
            peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          }
        });

        socket.on('receive-chat', (chat) => {
          setChatMessages((prev) => [...prev, chat]);
        });

        socket.on('chat-permission-updated', ({ enabled }) => {
          setChatEnabled(enabled);
        });
      } catch (err) {
        console.error('Media access error:', err);
      }
    };

    start();

    return () => {
      socket.disconnect();
      socket.off('host-info');
      socket.off('user-connected');
      socket.off('participant-left');
      socket.off('receive-offer');
      socket.off('receive-answer');
      socket.off('receive-ice-candidate');
      socket.off('receive-chat');
      socket.off('chat-permission-updated');
    };
  }, [roomId, name, role]);

  const toggleMic = () => {
  const stream = currentStreamRef.current;
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
    const stream = currentStreamRef.current;
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
      const track = screenStream.getVideoTracks()[0];
      const sender = peerConnectionRef.current
        .getSenders()
        .find((s) => s.track.kind === 'video');

      if (sender) sender.replaceTrack(track);
      if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;

      currentStreamRef.current = screenStream;
      setIsSharingScreen(true);

      track.onended = async () => {
        const originalStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const originalTrack = originalStream.getVideoTracks()[0];
        if (sender) sender.replaceTrack(originalTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = originalStream;

        currentStreamRef.current = originalStream;
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
          <h3>You</h3>
          <video ref={localVideoRef} autoPlay muted playsInline className={style.video} />
        </div>

        <div className={style.videoBlock}>
          <h3>Remote</h3>
          <video ref={remoteVideoRef} autoPlay playsInline className={style.video} />
        </div>
      </div>

      {role === 'host' && (
        <div className={style.buttonGroup}>
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`${style.button} ${style.redButton}`}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>

          <button
            onClick={toggleChat}
            className={`${style.button} ${style.indigoButton}`}
          >
            {chatEnabled ? 'Disable Chat' : 'Enable Chat'}
          </button>

          <button
            onClick={shareScreen}
            className={`${style.button} ${style.greenButton}`}
          >
            {isSharingScreen ? 'Sharing...' : 'Share Screen'}
          </button>

          <button
            onClick={toggleMic}
            className={`${style.button} ${style.yellowButton}`}
          >
            {isMicOn ? 'Mute Mic' : 'Unmute Mic'}
          </button>
        </div>
      )}

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

      {role === 'host' && (
        <div className={style.participantList}>
          <h4>Participants</h4>
          {participants.length === 0 ? (
            <p>No participants yet</p>
          ) : (
            participants.map((p) => <div key={p.socketId}>{p.name}</div>)
          )}
        </div>
      )}
    </div>
  );
}
