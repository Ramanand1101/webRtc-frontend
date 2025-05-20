'use client';

import { useEffect, useRef } from 'react';
import style from './RoomPage.module.css';

export default function ChatBox({
  chatMessages,
  participants,
  chatEnabled,
  message,
  setMessage,
  chatTarget,
  setChatTarget,
  sendMessage
}) {
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  if (!chatEnabled) return null;

  return (
    <div className={style.chatBox}>
      <div className={style.chatMessages}>
        {chatMessages.map((msg, i) => (
          <div key={i}>
            <strong>{msg.from}:</strong> {msg.message}
          </div>
        ))}
        <div ref={messagesEndRef} />
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
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Type a message"
          className={style.chatInput}
        />
        <button onClick={sendMessage} className={style.sendButton}>
          Send
        </button>
      </div>
    </div>
  );
}
