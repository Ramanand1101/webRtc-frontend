import { io } from "socket.io-client";

let socket;

const getSocket = () => {
  if (!socket) {
    //socket = io("http://localhost:5000", {
    //socket = io("https://webrtc-backend-goxe.onrender.com/", {
 
     socket = io("http://198.211.111.194:5000", {
      autoConnect: false,
      reconnectionDelayMax: 10000,
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      console.log("✅ Socket connected:", socket.id);
    });

    socket.on("connect_error", (err) => {
      console.error("❌ Socket connection error:", err);
    });
  }

  if (!socket.connected) {
    socket.connect();
  }

  return socket;
};

const socketInstance = typeof window !== "undefined" ? getSocket() : null;

export default socketInstance;
