// DOOMSDAY - network.js
// Multiplayer networking via Socket.IO.
// Dipendenze: Socket.IO (globale), CONFIG (config.js), Player (player.js), Render (render.js)

let socket = null;
let otherPlayers = {};

function initNetworking() {
  if (typeof io === 'undefined') {
    console.warn('Socket.IO client not available, skipping networking');
    return;
  }

  socket = io();

  // Set player ID for multiplayer identification
  if (typeof Player !== 'undefined') {
    Player.get().id = socket.id;
  }

  socket.on('init', (data) => {
    console.log('Inizializzazione rete:', data);
    otherPlayers = data.players || {};
  });

  socket.on('new-player', (data) => {
    console.log('Nuovo giocatore:', data.id);
    otherPlayers[data.id] = {
      nickname: data.nickname,
      x: 0,
      y: 0,
      z: 0,
      rotY: 0
    };
  });

  socket.on('player-moved', (data) => {
    if (otherPlayers[data.id]) {
      otherPlayers[data.id].x = data.x;
      otherPlayers[data.id].y = data.y;
      otherPlayers[data.id].z = data.z;
      otherPlayers[data.id].rotY = data.rotY;
    }
  });

  socket.on('player-disconnected', (data) => {
    console.log('Giocatore disconnesso:', data.id);
    delete otherPlayers[data.id];
  });

  // Send our position periodically
  setInterval(() => {
    if (socket && typeof currentMenuState !== 'undefined' && currentMenuState === 'PLAYING') {
      const p = typeof Player !== 'undefined' ? Player.get() : null;
      if (p) {
        socket.emit('player-move', {
          x: p.x,
          y: p.y,
          z: p.z,
          rotY: Render.yawPivot() ? Render.yawPivot().rotation.y : 0
        });
      }
    }
  }, 50); // 20 updates per second
}

function getOtherPlayers() {
  return otherPlayers;
}

function getSocket() {
  return socket;
}

const Network = {
  init: initNetworking,
  getOtherPlayers,
  getSocket,
};

if (typeof window !== 'undefined') {
  window.Network = Network;
  window.initNetworking = initNetworking;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Network;
}