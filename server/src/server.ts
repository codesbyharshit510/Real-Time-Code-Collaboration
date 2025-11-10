import express, { Response, Request } from "express";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import { SocketEvent, SocketId } from "./types/socket";
import { USER_CONNECTION_STATUS, User } from "./types/user";
import { Server } from "socket.io";
import path from "path";

dotenv.config();

const app = express();

// ========================== ✅ Dynamic CORS Configuration ==========================
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:5173",
  "http://localhost:5173",
];

console.log("✅ Allowed Origins:", allowedOrigins);

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);

// ========================== ✅ Socket.IO Setup ==========================
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
});

// ========================== User State Management ==========================
let userSocketMap: User[] = [];

function getUsersInRoom(roomId: string): User[] {
  return userSocketMap.filter((user) => user.roomId === roomId);
}

function getRoomId(socketId: SocketId): string | null {
  return userSocketMap.find((user) => user.socketId === socketId)?.roomId || null;
}

function getUserBySocketId(socketId: SocketId): User | null {
  return userSocketMap.find((user) => user.socketId === socketId) || null;
}

// ========================== Socket.IO Logic ==========================
io.on("connection", (socket) => {
  console.log("🟢 New connection:", socket.id);

  socket.on(SocketEvent.JOIN_REQUEST, ({ roomId, username }) => {
    const isUsernameExist = getUsersInRoom(roomId).some(
      (u) => u.username === username
    );
    if (isUsernameExist) {
      io.to(socket.id).emit(SocketEvent.USERNAME_EXISTS);
      return;
    }

    const user: User = {
      username,
      roomId,
      status: USER_CONNECTION_STATUS.ONLINE,
      cursorPosition: 0,
      typing: false,
      socketId: socket.id,
      currentFile: null,
    };

    userSocketMap.push(user);
    socket.join(roomId);
    socket.broadcast.to(roomId).emit(SocketEvent.USER_JOINED, { user });

    const users = getUsersInRoom(roomId);
    io.to(socket.id).emit(SocketEvent.JOIN_ACCEPTED, { user, users });
  });

  socket.on("disconnecting", () => {
    const user = getUserBySocketId(socket.id);
    if (!user) return;
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.USER_DISCONNECTED, { user });
    userSocketMap = userSocketMap.filter((u) => u.socketId !== socket.id);
    socket.leave(roomId);
  });

  // ✅ Broadcast all room-based events automatically
  socket.onAny((event, data) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(event, data);
  });
});

// ========================== Routes ==========================
app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    message: "🚀 Real-Time Code Collaboration Backend is running successfully!",
    frontend: process.env.FRONTEND_URL || "not configured",
  });
});

// Health check route for Render monitoring
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "ok", message: "Backend is healthy ✅" });
});

// ========================== Server Start ==========================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 CORS allowed for: ${allowedOrigins.join(", ")}`);
});
