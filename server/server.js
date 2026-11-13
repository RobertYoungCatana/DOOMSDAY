//Developer:Alex Venturini

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Lista di tutti i giocatori attivi nella stanza
const players = {};

io.on('connection', (socket) => {
    console.log(`> Giocatore connesso: ${socket.id}`);

    // 1. Quando un giocatore entra nella partita
    socket.on('playerJoin', (playerData) => {
        players[socket.id] = {
            id: socket.id,
            name: playerData.name || "Sopravvissuto",
            x: playerData.x || 0,
            y: playerData.y || 0,
            z: playerData.z || 0,
            rotation: playerData.rotation || 0
        };

        // Invia al nuovo giocatore la lista di tutti gli altri giocatori già presenti
        socket.emit('currentPlayers', players);

        // Avvisa tutti gli altri che si è unito un nuovo giocatore
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    // 2. Quando un giocatore si muove o ruota la visuale
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].z = movementData.z;
            players[socket.id].rotation = movementData.rotation;

            // Invia la nuova posizione a tutti gli altri client
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // 3. Gestione della disconnessione
    socket.on('disconnect', () => {
        console.log(`X Giocatore disconnesso: ${socket.id}`);
        delete players[socket.id];
        // Avvisa tutti i client che questo giocatore è uscito
        io.emit('disconnectPlayer', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server DOOMSDAY in ascolto sulla porta ${PORT}`);
});