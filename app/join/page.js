'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './JoinPage.module.css';

export default function JoinPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [role, setRole] = useState('participant');

  const handleJoin = () => {
    if (!name || !roomId) return alert('Please fill in all fields.');
    router.push(`/room?name=${name}&roomId=${roomId}&role=${role}`);
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Join a Room</h2>
      <input
        type="text"
        placeholder="Your Name"
        className={styles.input}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        type="text"
        placeholder="Room ID"
        className={styles.input}
        onChange={(e) => setRoomId(e.target.value)}
      />
      <select
        className={styles.select}
        onChange={(e) => setRole(e.target.value)}
        value={role}
      >
        <option value="host">Host</option>
        <option value="participant">Participant</option>
      </select>
      <button onClick={handleJoin} className={styles.button}>
        Join
      </button>
    </div>
  );
}
