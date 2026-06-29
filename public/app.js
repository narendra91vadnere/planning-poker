const formMessage = document.getElementById("formMessage");
const createForm = document.getElementById("createForm");
const joinForm = document.getElementById("joinForm");
const playerNameInput = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCode");

const socket = io();
const params = new URLSearchParams(window.location.search);
const initialRoom = params.get("room");

if (initialRoom) {
  roomCodeInput.value = initialRoom.toUpperCase();
}

const storedName = sessionStorage.getItem("playerName");
const storedRoomId = sessionStorage.getItem("roomId");

if (storedName) {
  playerNameInput.value = storedName;
}

if (storedRoomId && !initialRoom) {
  roomCodeInput.value = storedRoomId.toUpperCase();
}

function setMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.style.color = isError ? "#ef4444" : "#22c55e";
}

createForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const playerName = playerNameInput.value.trim();
  if (!playerName) {
    setMessage("Please enter your name.", true);
    return;
  }

  sessionStorage.setItem("playerName", playerName);
  socket.emit("create_room", { playerName });
});

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const playerName = playerNameInput.value.trim();
  const roomId = roomCodeInput.value.trim().toUpperCase();

  if (!playerName) {
    setMessage("Please enter your name.", true);
    return;
  }

  if (!roomId) {
    setMessage("Please enter a room code.", true);
    return;
  }

  sessionStorage.setItem("playerName", playerName);
  sessionStorage.setItem("roomId", roomId);
  socket.emit("join_room", { roomId, playerName });
});

socket.on("room_created", ({ roomId }) => {
  sessionStorage.setItem("roomId", roomId);
  window.location.href = `./room.html?id=${roomId}`;
});

socket.on("room_joined", ({ roomId }) => {
  sessionStorage.setItem("roomId", roomId);
  window.location.href = `./room.html?id=${roomId}`;
});

socket.on("error", ({ message }) => {
  setMessage(message, true);
});

