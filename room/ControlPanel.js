'use client';
import React from 'react';
import style from './RoomPage.module.css';

export default function ControlPanel({
  role,
  isMicMuted,
  isVideoOff,
  isRecording,
  isSharingScreen,
  toggleOwnMic,
  toggleOwnVideo,
  shareScreen,
  stopScreenShare,
  leaveRoom,
  startRecordingWithCanvas,
  stopCanvasRecording,
  switchRecordingSource,
}) {
  return (
    <div className={style.controlPanel}>
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

          {!isRecording ? (
            <button onClick={startRecordingWithCanvas} className={style.button}>
              Start Smart Recording
            </button>
          ) : (
            <>
              <button onClick={stopCanvasRecording} className={style.button}>
                Stop Recording
              </button>
              <button onClick={switchRecordingSource} className={style.button}>
                Switch Source (Camera / Screen)
              </button>
            </>
          )}
        </>
      )}

      <button onClick={leaveRoom} className={style.leaveButton}>
        Leave Room
      </button>
    </div>
  );
}
