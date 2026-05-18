import { io } from "socket.io-client";

const socket = io({
  path: "/socket.io",
  transports: ["websocket", "polling"],
  autoConnect: false,
});

export function connectSocket(token) {
  if (!token) {
    return;
  }

  socket.auth = { token };
  if (!socket.connected) {
    socket.connect();
  }
}

export function disconnectSocket() {
  if (socket.connected) {
    socket.disconnect();
  }
}

export default socket;
