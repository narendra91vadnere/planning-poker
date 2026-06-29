const path = require("path");
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const roomManager = require("./roomManager");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const socketToRoom = new Map();

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/rooms/:roomId", (req, res) => {
  const room = roomManager.getRoom(req.params.roomId);
  res.json({ exists: Boolean(room) });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

function broadcastRoomState(roomId, requestingSocketId = null) {
  const room = roomManager.getRoom(roomId);
  if (!room) {
    return;
  }

  const safeState = roomManager.getRoomSafeState(roomId, requestingSocketId);
  io.to(roomId).emit("room_state", safeState);
}

io.on("connection", (socket) => {
  socket.on("create_room", ({ playerName }) => {
    const name = (playerName || "").trim();
    if (!name) {
      socket.emit("error", { message: "Player name is required." });
      return;
    }

    const roomId = roomManager.createRoom(socket.id, name);
    socket.emit("room_created", { roomId });
  });

  socket.on("join_room", ({ roomId, playerName }) => {
    const name = (playerName || "").trim();
    if (!roomId || !name) {
      socket.emit("error", { message: "Room ID and player name are required." });
      return;
    }

    const room = roomManager.getRoom(roomId);
    if (!room) {
      socket.emit("error", { message: "Room not found." });
      return;
    }

    const existingPlayer = room.players[socket.id];
    const wasAlreadyInRoom = Boolean(existingPlayer);
    const joinedRoom = roomManager.joinRoom(roomId, socket.id, name);
    if (!joinedRoom) {
      socket.emit("error", { message: "Room not found." });
      return;
    }

    socket.join(roomId);
    socketToRoom.set(socket.id, roomId);

    const roomState = roomManager.getRoomSafeState(roomId, socket.id);
    socket.emit("room_state", roomState);
    socket.emit("room_joined", { roomId });

    const joinedPlayer = joinedRoom.players[socket.id];
    if (!wasAlreadyInRoom) {
      socket.to(roomId).emit("player_joined", { player: joinedPlayer });
      io.to(roomId).emit("toast", { message: `${joinedPlayer.name} joined the room.` });
    }
    broadcastRoomState(roomId, socket.id);
  });

  socket.on("submit_vote", ({ roomId, vote }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) {
      socket.emit("error", { message: "Room not found." });
      return;
    }

    const player = room.players[socket.id];
    if (!player) {
      socket.emit("error", { message: "You are not in this room." });
      return;
    }

    if (player.isSpectator) {
      socket.emit("error", { message: "Spectators cannot vote." });
      return;
    }

    roomManager.submitVote(roomId, socket.id, vote);
    io.to(roomId).emit("vote_submitted", { playerId: socket.id, hasVoted: true });
    broadcastRoomState(roomId, socket.id);
  });

  socket.on("reveal_votes", ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) {
      socket.emit("error", { message: "Room not found." });
      return;
    }

    if (room.hostId !== socket.id) {
      socket.emit("error", { message: "Only the host can reveal votes." });
      return;
    }

    const result = roomManager.revealVotes(roomId);
    if (!result) {
      socket.emit("error", { message: "Unable to reveal votes." });
      return;
    }

    io.to(roomId).emit("votes_revealed", { votes: result.votes, stats: result.stats });
    io.to(roomId).emit("toast", { message: "Votes revealed." });
    broadcastRoomState(roomId, socket.id);
  });

  socket.on("new_round", ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) {
      socket.emit("error", { message: "Room not found." });
      return;
    }

    if (room.hostId !== socket.id) {
      socket.emit("error", { message: "Only the host can start a new round." });
      return;
    }

    roomManager.resetRound(roomId);
    io.to(roomId).emit("round_reset", {});
    io.to(roomId).emit("toast", { message: "New round started." });
    broadcastRoomState(roomId, socket.id);
  });

  socket.on("update_story", ({ roomId, story }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) {
      socket.emit("error", { message: "Room not found." });
      return;
    }

    if (room.hostId !== socket.id) {
      socket.emit("error", { message: "Only the host can update the story." });
      return;
    }

    roomManager.updateStory(roomId, story);
    io.to(roomId).emit("story_updated", { story });
    io.to(roomId).emit("toast", { message: "Story updated." });
    broadcastRoomState(roomId, socket.id);
  });

  socket.on("toggle_spectator", ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) {
      socket.emit("error", { message: "Room not found." });
      return;
    }

    const player = room.players[socket.id];
    if (!player) {
      socket.emit("error", { message: "You are not in this room." });
      return;
    }

    roomManager.toggleSpectator(roomId, socket.id);
    const updatedPlayer = roomManager.getRoom(roomId).players[socket.id];
    io.to(roomId).emit("toast", { message: updatedPlayer.isSpectator ? `${updatedPlayer.name} joined as spectator.` : `${updatedPlayer.name} joined as voter.` });
    broadcastRoomState(roomId, socket.id);
  });

  socket.on("disconnect", () => {
    const roomId = socketToRoom.get(socket.id);
    socketToRoom.delete(socket.id);

    if (!roomId) {
      return;
    }

    const result = roomManager.leaveRoom(roomId, socket.id);
    if (!result) {
      return;
    }

    if (result.room) {
      io.to(roomId).emit("player_left", { playerId: socket.id, newHostId: result.newHostId });
      io.to(roomId).emit("toast", { message: "A player left the room." });
      broadcastRoomState(roomId, socket.id);
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, "0.0.0.0", () => {
  console.log(`Planning Poker server listening on http://0.0.0.0:${port}`);
  console.log(`Open http://localhost:${port} or http://<your-ip>:${port}`);
});
