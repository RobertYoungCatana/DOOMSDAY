//Developer: Alex Venturini
//Progetto: DOOMSDAY

const express = require('express');
const http = http = require('http'); // correggiamo la sintassi pulita
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

const players = {};
const bots = {};

// Generiamo 3 bot di prova all'avvio del server
function initBots() {
    for (let i = 1; i <= 3; i++) {
        const botId = `bot_${i}`;
        bots[botId] = {
            id: botId,
            name: `Mutante_${i}`,
            x: Math.random() * 20 - 10,
            y: 0,
            z: Math.random() * 20 - 10,
            direction: Math.random() * Math.PI * 2
        };
    }
}
initBots();

// Loop di aggiornamento dell'IA dei bot (gira 10 volte al secondo: ogni 100ms)
setInterval(() => {
    Object.keys(bots).forEach((botId) => {
        let bot = bots[botId];
        
        // Semplice movimento casuale / pattugliamento
        bot.x += Math.cos(bot.direction) * 0.1;
        bot.z += Math.sin(bot.direction) * 0.1;

        // Cambia direzione ogni tanto casualmente
        if (Math.random() < 0.05) {
            bot.direction = Math.random() * Math.PI * 2;
        }
    });

    // Invia la posizione aggiornata di tutti i bot ai client
    io.emit('updateBots', bots);
}, 100);

io.on('connection', (socket) => {
    console.log(`> Giocatore connesso: ${socket.id}`);

    socket.on('playerJoin', (playerData) => {
        players[socket.id] = {
            id: socket.id,
            name: playerData.name || "Sopravvissuto",
            x: playerData.x || 0,
            y: playerData.y || 0,
            z: playerData.z || 0,
            rotation: playerData.rotation || 0
        };

        // Invia al nuovo giocatore la situazione attuale di giocatori e bot
        socket.emit('currentPlayers', players);
        socket.emit('currentBots', bots);

        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].z = movementData.z;
            players[socket.id].rotation = movementData.rotation;

            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('disconnect', () => {
        console.log(`X Giocatore disconnesso: ${socket.id}`);
        delete players[socket.id];
        io.emit('disconnectPlayer', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server DOOMSDAY in ascolto sulla porta ${PORT} (con IA Bot attiva!)`);
});