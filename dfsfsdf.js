const toggleOwnVideo = async () => {
  const videoTracks = streamRef.current?.getVideoTracks();
  if (!videoTracks || videoTracks.length === 0) return;

  if (!isVideoOff) {
    // Stop video completely (turns off flashlight)
    videoTracks.forEach((track) => track.stop());
    localVideoRef.current.srcObject = null;
    setIsVideoOff(true);
  } else {
    // Restart video
    const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const newTrack = newStream.getVideoTracks()[0];

    // Replace track in peer connections
    peersRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) sender.replaceTrack(newTrack);
    });

    streamRef.current.addTrack(newTrack);

    // Update local preview
    const updatedStream = new MediaStream([
      ...streamRef.current.getAudioTracks(),
      newTrack,
    ]);
    localVideoRef.current.srcObject = updatedStream;

    setIsVideoOff(false);
  }
};