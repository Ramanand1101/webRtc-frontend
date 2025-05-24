"use client";

import { useState, useRef, useEffect } from "react";
import {
  Room,
  RoomEvent,
  createLocalTracks,
  LocalVideoTrack,
} from "livekit-client";
import axios from "axios";
import { useSearchParams } from "next/navigation";
import styles from "./room.module.css";

export default function RoomPage() {
  const searchParams = useSearchParams();
  const identity = searchParams.get("name") || "";
  const roomName = searchParams.get("room") || "";
  const isPublisher = searchParams.get("role") !== "audience";

  const [joined, setJoined] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [participants, setParticipants] = useState([]);

  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef({});
  const roomRef = useRef(null);
  const currentVideoTrackRef = useRef(null);

  useEffect(() => {
    if (identity && roomName) handleJoin();
  }, []);

  const handleJoin = async () => {
    try {
      const response = await axios.post(
        process.env.NEXT_PUBLIC_TOKEN_ENDPOINT,
        {
          identity,
          roomName,
          isPublisher,
        }
      );

      const token = response.data.token;
      console.log(token,"dsfsf")
      const room = new Room();
      roomRef.current = room;

      await room.connect(
  process.env.NEXT_PUBLIC_LIVEKIT_WS_URL, // From .env: wss://webrtc-j6vp82v9.livekit.cloud
  response.data.token
);


      if (isPublisher) {
        const localTracks = await createLocalTracks({ audio: true, video: true });
        for (const track of localTracks) {
          console.log("Publishing:", track.kind);
          await room.localParticipant.publishTrack(track);
        }

        const videoTrack = localTracks.find((t) => t.kind === "video");
        if (videoTrack) {
          currentVideoTrackRef.current = videoTrack;
          setTimeout(() => {
            if (localVideoRef.current) {
              videoTrack.attach(localVideoRef.current);
            }
          }, 300);
        }
      }

      setJoined(true);

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        setParticipants((prev) => [...prev, participant.identity]);
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        setParticipants((prev) => prev.filter((id) => id !== participant.identity));
      });

   const attachRemoteTrack = (track, participant) => {
  if (track.kind === "video") {
    let videoEl = remoteVideosRef.current[participant.identity];
    if (!videoEl) {
      const container = document.getElementById("remote-container");
      if (!container) return;
      videoEl = document.createElement("video");
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videoEl.width = 300;
      videoEl.style.borderRadius = "10px";
      videoEl.style.boxShadow = "0 0 10px rgba(0,0,0,0.3)";
      container.appendChild(videoEl);
      remoteVideosRef.current[participant.identity] = videoEl;
    }
    track.attach(videoEl);
  }

  if (track.kind === "audio") {
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    audioEl.controls = false;
    track.attach(audioEl);
    document.body.appendChild(audioEl); // or just attach without appending
  }
};


      room.on(RoomEvent.TrackSubscribed, attachRemoteTrack);
      room.on(RoomEvent.TrackPublicationSubscribed, attachRemoteTrack);

      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          if (publication.isSubscribed && publication.track) {
            attachRemoteTrack(publication.track, participant);
          }
        }
      }
    } catch (err) {
      console.error("❌ Error joining room:", err);
      alert("Failed to join room.");
    }
  };

  const handleToggleCamera = async () => {
    const room = roomRef.current;
    if (!room || !room.localParticipant) return;

    const existingTrack = currentVideoTrackRef.current;

    if (cameraEnabled) {
      if (existingTrack) {
        await room.localParticipant.unpublishTrack(existingTrack);
        existingTrack.stop();
        existingTrack.detach();
        currentVideoTrackRef.current = null;
      }
      setCameraEnabled(false);
    } else {
      const [videoTrack] = await createLocalTracks({ video: true });
      await room.localParticipant.publishTrack(videoTrack);
      currentVideoTrackRef.current = videoTrack;
      videoTrack.attach(localVideoRef.current);
      setCameraEnabled(true);
    }
  };

  const handleShareScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = stream.getVideoTracks()[0];

      const room = roomRef.current;
      if (!room || !room.localParticipant) return;

      const existingTrack = currentVideoTrackRef.current;
      if (existingTrack) {
        await room.localParticipant.unpublishTrack(existingTrack);
        existingTrack.stop();
        existingTrack.detach();
      }

      const livekitScreenTrack = new LocalVideoTrack(screenTrack);
      await room.localParticipant.publishTrack(livekitScreenTrack);
      livekitScreenTrack.attach(localVideoRef.current);
      currentVideoTrackRef.current = livekitScreenTrack;
      setCameraEnabled(false);
    } catch (err) {
      console.error("❌ Screen sharing error:", err);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>🎥 LiveKit Video Room</h1>

      <h2>You’re in the room: <strong>{roomName}</strong></h2>

      {isPublisher && (
        <>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            width="400"
            className={styles.video}
          />
          <div style={{ marginTop: 10 }}>
            <button onClick={handleToggleCamera} className={styles.button}>
              {cameraEnabled ? "Stop Camera" : "Start Camera"}
            </button>
            <button
              onClick={handleShareScreen}
              className={`${styles.button} ${styles.shareButton}`}
            >
              Share Screen
            </button>
          </div>
        </>
      )}

      <div className={styles.participantList}>
        <h3>Participants:</h3>
        <ul>
          <li><strong>You:</strong> {identity}</li>
          {participants.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>

      <div id="remote-container" className={styles.remoteContainer}></div>
    </div>
  );
}
