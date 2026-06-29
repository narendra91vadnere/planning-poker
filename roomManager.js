const { nanoid } = require("nanoid");

const rooms = {};

function getUniqueName(existingPlayers, suggestedName) {
  const baseName = suggestedName.trim() || "Player";
  const names = new Set(Object.values(existingPlayers).map((player) => player.name.toLowerCase()));

  if (!names.has(baseName.toLowerCase())) {
    return baseName;
  }

  let index = 2;
  let candidate = `${baseName} #${index}`;
  while (names.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${baseName} #${index}`;
  }

  return candidate;
}

function createRoom(hostSocketId, playerName) {
  const roomId = nanoid(5).toUpperCase();
  rooms[roomId] = {
    id: roomId,
    story: "PROJ-142: Implement OAuth login",
    hostId: hostSocketId,
    revealed: false,
    players: {
      [hostSocketId]: {
        id: hostSocketId,
        name: playerName,
        vote: null,
        hasVoted: false,
        isSpectator: false,
      },
    },
  };

  return roomId;
}

function joinRoom(roomId, socketId, playerName) {
  const room = rooms[roomId];
  if (!room) {
    return null;
  }

  const existingPlayer = room.players[socketId];
  if (existingPlayer) {
    existingPlayer.name = playerName;
    existingPlayer.vote = existingPlayer.vote || null;
    existingPlayer.hasVoted = Boolean(existingPlayer.hasVoted);
    existingPlayer.isSpectator = Boolean(existingPlayer.isSpectator);
    return room;
  }

  const trimmedName = (playerName || "").trim();
  const normalizedName = trimmedName.toLowerCase();
  const sameNamePlayerId = Object.keys(room.players).find((playerId) => {
    const player = room.players[playerId];
    return player && player.name.trim().toLowerCase() === normalizedName;
  });

  if (sameNamePlayerId && Object.keys(room.players).length === 1) {
    const currentPlayer = room.players[sameNamePlayerId];
    delete room.players[sameNamePlayerId];
    room.players[socketId] = {
      ...currentPlayer,
      id: socketId,
      name: currentPlayer.name,
      vote: currentPlayer.vote || null,
      hasVoted: Boolean(currentPlayer.hasVoted),
      isSpectator: Boolean(currentPlayer.isSpectator),
    };
    room.hostId = socketId;
    return room;
  }

  room.players[socketId] = {
    id: socketId,
    name: getUniqueName(room.players, trimmedName || "Player"),
    vote: null,
    hasVoted: false,
    isSpectator: false,
  };

  return room;
}

function leaveRoom(roomId, socketId) {
  const room = rooms[roomId];
  if (!room) {
    return null;
  }

  delete room.players[socketId];

  if (Object.keys(room.players).length === 0) {
    delete rooms[roomId];
    return { room: null, newHostId: null };
  }

  if (room.hostId === socketId) {
    const nextPlayer = Object.values(room.players)[0];
    if (nextPlayer) {
      room.hostId = nextPlayer.id;
    }
  }

  return { room, newHostId: room.hostId };
}

function submitVote(roomId, socketId, vote) {
  const room = rooms[roomId];
  if (!room) {
    return null;
  }

  const player = room.players[socketId];
  if (!player || player.isSpectator) {
    return room;
  }

  player.vote = vote;
  player.hasVoted = vote !== null && vote !== undefined;
  return room;
}

function revealVotes(roomId) {
  const room = rooms[roomId];
  if (!room) {
    return null;
  }

  room.revealed = true;
  const votes = {};
  Object.values(room.players).forEach((player) => {
    if (!player.isSpectator && player.hasVoted) {
      votes[player.id] = player.vote;
    }
  });

  return { votes, stats: computeStats(votes) };
}

function resetRound(roomId) {
  const room = rooms[roomId];
  if (!room) {
    return null;
  }

  room.revealed = false;
  Object.values(room.players).forEach((player) => {
    player.vote = null;
    player.hasVoted = false;
  });

  return room;
}

function updateStory(roomId, story) {
  const room = rooms[roomId];
  if (!room) {
    return null;
  }

  room.story = story;
  return room;
}

function toggleSpectator(roomId, socketId) {
  const room = rooms[roomId];
  if (!room) {
    return null;
  }

  const player = room.players[socketId];
  if (!player) {
    return room;
  }

  player.isSpectator = !player.isSpectator;
  player.vote = null;
  player.hasVoted = false;
  return room;
}

function getRoom(roomId) {
  return rooms[roomId] || null;
}

function getRoomSafeState(roomId, requestingSocketId) {
  const room = rooms[roomId];
  if (!room) {
    return null;
  }

  const safePlayers = {};
  Object.entries(room.players).forEach(([playerId, player]) => {
    const safePlayer = { ...player };
    if (!room.revealed && playerId !== requestingSocketId) {
      safePlayer.vote = null;
    }
    safePlayers[playerId] = safePlayer;
  });

  return {
    id: room.id,
    story: room.story,
    hostId: room.hostId,
    revealed: room.revealed,
    players: safePlayers,
    requestingSocketId,
  };
}

function computeStats(votes) {
  const numericVotes = Object.values(votes).filter((vote) => {
    if (typeof vote === "number") {
      return Number.isFinite(vote);
    }

    return typeof vote === "string" && /^\d+(\.\d+)?$/.test(vote);
  }).map((vote) => Number(vote));

  if (numericVotes.length === 0) {
    return { avg: null, median: null, min: null, max: null };
  }

  const sorted = [...numericVotes].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const avg = Number((sum / sorted.length).toFixed(1));
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1))
    : sorted[mid];

  return {
    avg,
    median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

module.exports = {
  createRoom,
  joinRoom,
  leaveRoom,
  submitVote,
  revealVotes,
  resetRound,
  updateStory,
  toggleSpectator,
  getRoom,
  getRoomSafeState,
  computeStats,
};
