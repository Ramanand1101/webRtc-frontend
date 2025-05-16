'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './JoinPage.module.css';

export default function JoinPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [role, setRole] = useState('participant');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (!roomId.trim()) newErrors.roomId = 'Room ID is required';
    if (name.trim().length < 2) newErrors.name = 'Name must be at least 2 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleJoin = async () => {
    if (!validateForm()) return;
    
    setIsLoading(true);
    // Simulate loading delay
    setTimeout(() => {
      router.push(`/room?name=${encodeURIComponent(name.trim())}&roomId=${encodeURIComponent(roomId.trim())}&role=${role}`);
    }, 500);
  };

  const handleInputChange = (field, value) => {
    if (field === 'name') setName(value);
    if (field === 'roomId') setRoomId(value);
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors({ ...errors, [field]: null });
    }
  };

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.background}>
        <div className={styles.bgShape1}></div>
        <div className={styles.bgShape2}></div>
        <div className={styles.bgShape3}></div>
      </div>
      
      <div className={styles.container}>
        <div className={styles.formCard}>
          <div className={styles.iconWrapper}>
            <svg className={styles.icon} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 4V20M15 20L9 14M15 20L21 14M9 4V10M3 10H9M9 10L3 4" 
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          
          <h1 className={styles.heading}>Join Meeting Room</h1>
          <p className={styles.subheading}>Enter your details to join the meeting</p>
          
          <form className={styles.form} onSubmit={(e) => { e.preventDefault(); handleJoin(); }}>
            <div className={styles.inputGroup}>
              <label htmlFor="name" className={styles.label}>Your Name</label>
              <div className={styles.inputWrapper}>
                <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none">
                  <path d="M20 21V19C20 17.8954 19.1046 17 18 17H6C4.89543 17 4 17.8954 4 19V21M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z" 
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <input
                  id="name"
                  type="text"
                  placeholder="Enter your name"
                  className={`${styles.input} ${errors.name ? styles.inputError : ''}`}
                  value={name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  maxLength={50}
                />
              </div>
              {errors.name && <span className={styles.errorMessage}>{errors.name}</span>}
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="roomId" className={styles.label}>Room ID</label>
              <div className={styles.inputWrapper}>
                <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none">
                  <path d="M10 20V14H14V20M12 11H12.01M17 21H7C5.89543 21 5 20.1046 5 19V11L12 5L19 11V19C19 20.1046 18.1046 21 17 21Z" 
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <input
                  id="roomId"
                  type="text"
                  placeholder="Enter room ID"
                  className={`${styles.input} ${errors.roomId ? styles.inputError : ''}`}
                  value={roomId}
                  onChange={(e) => handleInputChange('roomId', e.target.value)}
                  maxLength={20}
                />
              </div>
              {errors.roomId && <span className={styles.errorMessage}>{errors.roomId}</span>}
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="role" className={styles.label}>Select Role</label>
              <div className={styles.selectWrapper}>
                <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none">
                  <path d="M21 8V16C21 18.7614 18.7614 21 16 21H8C5.23858 21 3 18.7614 3 16V8C3 5.23858 5.23858 3 8 3H16C18.7614 3 21 5.23858 21 8Z" 
                    stroke="currentColor" strokeWidth="2"/>
                  <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <select
                  id="role"
                  className={styles.select}
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="host">Meeting Host</option>
                  <option value="participant">Participant</option>
                </select>
                <svg className={styles.selectIcon} viewBox="0 0 24 24" fill="none">
                  <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            <button 
              type="submit" 
              className={`${styles.button} ${isLoading ? styles.buttonLoading : ''}`}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className={styles.spinner}></span>
                  Joining...
                </>
              ) : (
                <>
                  Join Room
                  <svg className={styles.buttonIcon} viewBox="0 0 24 24" fill="none">
                    <path d="M5 12H19M19 12L12 5M19 12L12 19" 
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </>
              )}
            </button>
          </form>

          <div className={styles.footer}>
            <p className={styles.footerText}>Dont have a room ID? 
              <a href="#" className={styles.link}> Create a new room</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}