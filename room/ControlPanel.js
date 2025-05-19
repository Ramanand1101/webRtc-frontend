'use client';

import React from 'react';
import style from './RoomPage.module.css';

export default function ControlPanel({
  role,
  localVideoRef,
  peersRef,
  streamRef,
  socket,
  isMicMuted,
  setIsMicMuted,
  isSharingScreen,
  setIsSharingScreen,
  isVideoOff,
  setIsVideoOff,
  stopScreenShare,
  leaveRoomCallback,
}) {
  const toggleOwnMic = () => {
    const audioTracks = streamRef.current?.getAudioTracks();
    if (audioTracks && audioTracks.length > 0) {
      const newMutedState = !isMicMuted;
      audioTracks.forEach((track) => (track.enabled = !newMutedState));
      setIsMicMuted(newMutedState);
    }
  };

  const shareScreen = async () => {
    if (role !== 'host') {
      socket.emit('request-screen-share');
    } else {
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

        localVideoRef.current.srcObject = combined;

        setIsSharingScreen(true);
        socket.emit('screen-share-started');
      } catch (err) {
        console.error('Failed to share screen:', err);
      }
    }
  };

  const toggleOwnVideo = async () => {
    const videoTracks = streamRef.current?.getVideoTracks();
    if (!videoTracks || videoTracks.length === 0) return;

    if (!isVideoOff) {
      videoTracks.forEach((track) => track.stop());
      localVideoRef.current.srcObject = null;
      setIsVideoOff(true);
    } else {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const newTrack = newStream.getVideoTracks()[0];

      peersRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(newTrack);
      });

      streamRef.current.addTrack(newTrack);

      const updatedStream = new MediaStream([
        ...streamRef.current.getAudioTracks(),
        newTrack,
      ]);
      localVideoRef.current.srcObject = updatedStream;

      setIsVideoOff(false);
    }
  };

  const leaveRoom = () => {
    if (leaveRoomCallback) {
      leaveRoomCallback();
    } else {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();

      socket.emit('leave-room');
      socket.disconnect();

      window.location.href = '/';
    }
  };

  return (
    <div className={style.controlPanel}>
      <button onClick={toggleOwnMic} className={style.button}>
        {isMicMuted ? 'Unmute Mic' : 'Mute Mic'}
      </button>

      {role === 'host' && (
        <>
          {!isSharingScreen ? (
            <button onClick={shareScreen} className={style.button}>
              Share Screen
            </button>
          ) : (
            <button onClick={stopScreenShare} className={style.button}>
              Stop Sharing
            </button>
          )}

          <button onClick={toggleOwnVideo} className={style.button}>
            {isVideoOff ? 'Turn On Camera' : 'Turn Off Camera'}
          </button>
        </>
      )}

      <button onClick={leaveRoom} className={style.leaveButton}>
        Leave Room
      </button>
    </div>
  );
}
