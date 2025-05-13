// utils/socket.js
import { io } from "socket.io-client";

let socket;

const getSocket = () => {
  if (!socket) {
    // Connect to your Socket.IO server
    //"https://webrtc-backend-goxe.onrender.com"
    socket = io("https://webrtc-backend-goxe.onrender.com/" , {
      reconnectionDelayMax: 10000,
      transports: ["websocket"],
    });
    
    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
    });
    
    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
    });
  }
  
  return socket;
};

// Create the socket connection only on the client side
const socketInstance = typeof window !== "undefined" ? getSocket() : null;

export default socketInstance;