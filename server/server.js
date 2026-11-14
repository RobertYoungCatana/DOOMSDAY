// DOOMSDAY - server.js
// Server Express con Socket.IO per il multiplayer.
// Serve i file statici del client e gestisce le connessioni WSS.

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const PORT = process.env.PORT || 8000;

// Serve i file statici dalla cartella client/
app.use(express.static(path.join(__dirname, '..', 'client')));

// Pagina principale: manda index.html per ogni richiesta
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Crea server HTTP e inizializza Socket.IO
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: `http://localhost:${PORT}`,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Gestione connessioni Socket.IO
let players = {};

io.on('connection', (socket) => {
  console.log('Giocatore connesso:', socket.id);

  // Assegna un nickname al nuovo giocatore
  socket.nickname = `Player_${socket.id.substring(0, 8)}`;

  // Invia lo stato iniziale al nuovo giocatore
  socket.emit('init', {
    nickname: socket.nickname,
    players: players
  });

  // Broadcast del nuovo giocatore agli altri
  socket.broadcast.emit('new-player', {
    id: socket.id,
    nickname: socket.nickname
  });

  // Aggiornamento posizione giocatore
  socket.on('player-move', (data) => {
    players[socket.id] = {
      x: data.x,
      y: data.y,
      z: data.z,
      rotY: data.rotY
    };
    // Broadcast la posizione a tutti gli altri giocatori (escluso il mittente)
    socket.broadcast.emit('player-moved', {
      id: socket.id,
      x: data.x,
      y: data.y,
      z: data.z,
      rotY: data.rotY
    });
  });

  // Disconnessione
  socket.on('disconnect', () => {
    console.log('Giocatore disconnesso:', socket.id);
    delete players[socket.id];
    io.emit('player-disconnected', { id: socket.id });
  });
});

// Gestione errori
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Porta ${PORT} già in uso. Prova un'altra porta con PORT=XXXX node server.js`);
  } else {
    console.error('Errore server:', err);
  }
});

// Avvia il server
server.listen(PORT, () => {
  console.log(`DOOMSDAY server in ascolto su http://localhost:${PORT}`);
  console.log(`Apri il browser e vai su: http://localhost:${PORT}`);
  console.log('Multiplayer attivo: connessioni WSS via Socket.IO');
});