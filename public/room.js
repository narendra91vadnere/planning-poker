const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("id");
const storedName = sessionStorage.getItem("playerName");
const storedRoomId = sessionStorage.getItem("roomId");

if (!roomId) {
  window.location.replace("./index.html");
}

if (!storedName) {
  window.location.replace(`./index.html?room=${encodeURIComponent(roomId)}`);
}

const socket = io();
const state = {
  room: null,
  myPlayerId: null,
  isHost: false,
  listenersAttached: false,
};

const elements = {
  roomBadge: document.getElementById("roomBadge"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
  storyContent: document.getElementById("storyContent"),
  storyEditor: document.getElementById("storyEditor"),
  storyInput: document.getElementById("storyInput"),
  updateStoryBtn: document.getElementById("updateStoryBtn"),
  cardDeck: document.getElementById("cardDeck"),
  revealBtn: document.getElementById("revealBtn"),
  spectatorToggleBtn: document.getElementById("spectatorToggleBtn"),
  resultsContent: document.getElementById("resultsContent"),
  roundActions: document.getElementById("roundActions"),
  playerCount: document.getElementById("playerCount"),
  playerList: document.getElementById("playerList"),
  toastContainer: document.getElementById("toastContainer"),
};

const fibonacciCards = ["0", "1", "2", "3", "5", "8", "13", "21", "34", "55", "89", "?", "☕", "∞"];

function attachListenersOnce() {
  if (state.listenersAttached) {
    return;
  }

  elements.updateStoryBtn.addEventListener("click", () => {
    const story = elements.storyInput.value.trim();
    if (state.isHost && story) {
      socket.emit("update_story", { roomId, story });
    }
  });

  elements.revealBtn.addEventListener("click", () => {
    if (state.isHost) {
      socket.emit("reveal_votes", { roomId });
    }
  });

  elements.spectatorToggleBtn.addEventListener("click", () => {
    socket.emit("toggle_spectator", { roomId });
  });

  elements.copyLinkBtn.addEventListener("click", async () => {
    const url = `${window.location.origin}/room.html?id=${roomId}`;
    await navigator.clipboard.writeText(url);
    showToast("Copied room link!");
  });

  state.listenersAttached = true;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<div>${message}</div><button class="toast-close" aria-label="Close">×</button>`;
  const closeBtn = toast.querySelector(".toast-close");
  closeBtn.addEventListener("click", () => toast.remove());
  elements.toastContainer.appendChild(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 3000);
}

function setInitialState() {
  sessionStorage.setItem("roomId", roomId);
  sessionStorage.setItem("playerName", storedName);
  attachListenersOnce();
  socket.emit("join_room", { roomId, playerName: storedName });
}

function renderRoom() {
  if (!state.room) {
    return;
  }

  state.isHost = state.room.hostId === state.myPlayerId;
  elements.roomBadge.textContent = `Room: ${roomId}`;
  elements.storyContent.textContent = state.room.story;
  elements.storyInput.value = state.room.story;
  elements.storyEditor.classList.toggle("hidden", !state.isHost);
  elements.storyContent.classList.toggle("hidden", state.isHost);
  elements.revealBtn.classList.toggle("hidden", !state.isHost);
  elements.revealBtn.disabled = !state.isHost || !hasVoters() || state.room.revealed;
  elements.spectatorToggleBtn.textContent = state.room.players[state.myPlayerId]?.isSpectator ? "Join as Voter" : "Join as Spectator";

  elements.cardDeck.innerHTML = "";
  fibonacciCards.forEach((cardValue) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card";
    if (state.room.players[state.myPlayerId]?.vote === cardValue) {
      button.classList.add("selected");
    }
    if (state.room.revealed) {
      button.classList.add("revealed");
    }

    button.innerHTML = `
      <div class="card-inner">
        <div class="card-face card-front">${cardValue}</div>
        <div class="card-face card-back">?</div>
      </div>
    `;

    button.addEventListener("click", () => {
      if (state.room.players[state.myPlayerId]?.isSpectator) {
        return;
      }

      const player = state.room.players[state.myPlayerId];
      const selected = player?.vote === cardValue;
      const nextVote = selected ? null : cardValue;
      socket.emit("submit_vote", { roomId, vote: nextVote });
    });

    elements.cardDeck.appendChild(button);
  });

  const spectatorHidden = state.room.players[state.myPlayerId]?.isSpectator;
  elements.cardDeck.style.display = spectatorHidden ? "none" : "flex";

  renderPlayerList();
  renderResults();
  renderRoundActions();
}

function hasVoters() {
  return Object.values(state.room.players).some((player) => !player.isSpectator && player.hasVoted);
}

function renderPlayerList() {
  const players = Object.values(state.room.players);
  elements.playerCount.textContent = `Players (${players.length})`;
  elements.playerList.innerHTML = "";

  players.forEach((player) => {
    const row = document.createElement("div");
    row.className = `player-row ${player.id === state.myPlayerId ? "you" : ""}`;
    const status = player.isSpectator
      ? "<span class='badge spectator'>👁 Spectator</span>"
      : player.hasVoted
      ? "<span class='badge voted'>🟢 Voted ✓</span>"
      : "<span class='badge waiting'>🟡 Waiting</span>";

    row.innerHTML = `
      <div class="player-name">
        <strong>${player.name}</strong>
        ${player.id === state.myPlayerId ? "<span class='badge'>You</span>" : ""}
      </div>
      ${status}
    `;
    elements.playerList.appendChild(row);
  });
}

function renderResults() {
  if (!state.room.revealed) {
    elements.resultsContent.innerHTML = "";
    return;
  }

  const players = Object.values(state.room.players).filter((player) => !player.isSpectator);
  const numericVotes = players.filter((player) => player.hasVoted && /^\d+(\.\d+)?$/.test(String(player.vote))).map((player) => Number(player.vote));
  const average = numericVotes.length ? (numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length).toFixed(1) : null;
  const sorted = [...numericVotes].sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 === 0 ? ((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2).toFixed(1) : sorted[Math.floor(sorted.length / 2)].toFixed(1)) : null;
  const min = sorted[0] ?? null;
  const max = sorted[sorted.length - 1] ?? null;

  const rows = players.map((player) => {
    const voteValue = player.vote;
    const numeric = /^\d+(\.\d+)?$/.test(String(voteValue)) ? Number(voteValue) : null;
    const isOutlier = numeric !== null && average !== null && numeric >= average * 2;
    return `
      <div class="result-row ${isOutlier ? "outlier" : ""}">
        <span>${player.name}</span>
        <strong>${voteValue ?? "—"}</strong>
      </div>
    `;
  });

  const consensus = players.length && players.every((player) => player.vote === players[0].vote && player.vote !== null);
  const consensusBanner = consensus ? `<div class="consensus-banner">🎉 Team consensus! Everyone picked ${players[0].vote}</div>` : "";
  const stats = average !== null ? `<div class="stats-row">Average: ${average} · Median: ${median} · Min: ${min} · Max: ${max}</div>` : "";

  elements.resultsContent.innerHTML = `
    <div class="results-grid">
      ${rows.join("")}
      ${stats}
      ${consensusBanner}
    </div>
  `;
}

function renderRoundActions() {
  elements.roundActions.innerHTML = "";
  if (!state.isHost) {
    return;
  }

  if (state.room.revealed) {
    const newRoundBtn = document.createElement("button");
    newRoundBtn.className = "primary-btn";
    newRoundBtn.textContent = "New Round";
    newRoundBtn.addEventListener("click", () => socket.emit("new_round", { roomId }));
    elements.roundActions.appendChild(newRoundBtn);
  }
}

socket.on("connect", () => {
  state.myPlayerId = socket.id;
  setInitialState();
});

socket.on("disconnect", () => {
  showToast("Reconnecting…");
});

socket.on("room_state", (room) => {
  state.room = room;
  renderRoom();
});

socket.on("player_joined", ({ player }) => {
  showToast(`${player.name} joined the room.`);
});

socket.on("player_left", ({ playerId, newHostId }) => {
  if (playerId === state.myPlayerId) {
    window.location.href = "./index.html";
  }
  showToast("A player left the room.");
});

socket.on("vote_submitted", ({ playerId, hasVoted }) => {
  if (state.room) {
    const player = state.room.players[playerId];
    if (player) {
      player.hasVoted = hasVoted;
    }
    renderRoom();
  }
});

socket.on("votes_revealed", ({ votes, stats }) => {
  showToast("Votes revealed.");
  renderRoom();
});

socket.on("round_reset", () => {
  showToast("New round started.");
  renderRoom();
});

socket.on("story_updated", ({ story }) => {
  showToast("Story updated.");
  if (state.room) {
    state.room.story = story;
    renderRoom();
  }
});

socket.on("toast", ({ message }) => {
  showToast(message);
});

socket.on("error", ({ message }) => {
  showToast(message);
});
