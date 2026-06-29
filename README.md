# planning-poker

A real-time Planning Poker web app built with Node.js, Express, Socket.IO, and vanilla HTML/CSS/JavaScript.

## Features

- Create or join rooms with short room codes
- Real-time voting and live player presence
- Host-controlled story updates, reveal, and new round actions
- Spectator mode and live results with averages and consensus stats

## Run locally

1. Install dependencies:
   npm install
2. Start the server:
   npm start
3. Open the app in your browser:
   http://localhost:3000

## Development

- Start with auto-reload:
  npm run dev

## Project structure

- server.js — Express + Socket.IO server entry point
- roomManager.js — in-memory room state and stats logic
- public/ — static frontend files served by Express
