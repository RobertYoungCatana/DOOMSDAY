//Developer: Alex Venturini
//Progetto: DOOMSDAY

const express = require('express');
const http = require('http'); // correggiamo la sintassi pulita
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
const items = {}; // Per medikit, munizioni e armi sparse nella mappa


function initItems() {
    for (let i = 1; i <= 5; i++) {
        const itemId = `item_${i}`;
        // Tipi casuali: medikit, munizioni, o fucile avanzato
        const types = ['medkit', 'ammo', 'shotgun', 'armor'];
        const chosenType = types[Math.floor(Math.random() * types.length)];
        
        items[itemId] = {
            id: itemId,
            type: chosenType, // 'medkit', 'ammo', 'shotgun'
            x: Math.random() * 30 - 15,
            y: 0,
            z: Math.random() * 30 - 15
        };
    }
}
initItems();




// Respawn automatico degli oggetti ogni 15 secondi se ce ne sono meno di 5
setInterval(() => {
    if (Object.keys(items).length < 5) {
        const itemId = `item_${Date.now()}`;
        const types = ['medkit', 'ammo', 'shotgun', 'armor'];
        const chosenType = types[Math.floor(Math.random() * types.length)];

        items[itemId] = {
            id: itemId,
            type: chosenType,
            x: Math.random() * 30 - 15,
            y: 0,
            z: Math.random() * 30 - 15
        };

        console.log(`📦 Nuovo oggetto comparso: ${chosenType}`);
        io.emit('itemSpawned', items[itemId]);
    }
}, 15000);




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
            direction: Math.random() * Math.PI * 2,
            hp: 100
        };
    }
}
initBots();



let wave = 1;
let botSpeed = 0.1;

// Ogni 30 secondi avanza l'ondata: i mutanti diventano più veloci e ne arriva uno nuovo
setInterval(() => {
    wave++;
    botSpeed += 0.03;

    const newBotId = `bot_${Date.now()}`;
    bots[newBotId] = {
        id: newBotId,
        name: `Mutante_Ondata${wave}`,
        x: Math.random() * 20 - 10,
        y: 0,
        z: Math.random() * 20 - 10,
        direction: Math.random() * Math.PI * 2,
        hp: 100
    };

    console.log(`⚠️ ONDATA ${wave}! Velocità bot: ${botSpeed.toFixed(2)} - Mutanti attivi: ${Object.keys(bots).length}`);
    io.emit('waveUpdated', { wave: wave, botCount: Object.keys(bots).length });
}, 30000);



// Loop di aggiornamento dell'IA dei bot (gira 10 volte al secondo: ogni 100ms)
setInterval(() => {
    Object.keys(bots).forEach((botId) => {
        let bot = bots[botId];
        
        // Semplice movimento casuale / pattugliamento
        bot.x += Math.cos(bot.direction) * botSpeed;
        bot.z += Math.sin(bot.direction) * botSpeed;

        // Cambia direzione ogni tanto casualmente
        if (Math.random() < 0.05) {
            bot.direction = Math.random() * Math.PI * 2;
        }
    });

    // Controllo se i bot attaccano i giocatori vicini e gestione morte definitiva
    Object.keys(bots).forEach((botId) => {
        let bot = bots[botId];
        
        Object.keys(players).forEach((playerId) => {
            let player = players[playerId];
            
            // Controlla il danno solo se il giocatore esiste ed è vivo
            if (player && !player.isDead) {
                let distToPlayer = Math.hypot(bot.x - player.x, bot.z - player.z);

                // Se il bot si avvicina a meno di 2 unità dal giocatore, lo ferisce
             // Se il bot si avvicina a meno di 2 unità dal giocatore, lo ferisce
                if (distToPlayer < 2) {
                    if (player.shield > 0) {
                        player.shield -= 1; // Consuma prima il giubbotto antiproiettile
                    } else {
                        player.hp -= 1;     // Poi toglie vita
                    }

                    // Avvisa il client colpito aggiornando sia vita che scudo
                    io.to(playerId).emit('playerDamaged', { newHp: player.hp, newShield: player.shield });

                    // Se gli HP arrivano a 0, morte definitiva
                    if (player.hp <= 0) {
                        player.isDead = true;
                        console.log(`💀 Il giocatore ${player.name} (${playerId}) è MORTO DEFINITIVAMENTE!`);

                        io.emit('playerEliminated', { id: playerId });
                        delete players[playerId];
                    }
                }
            }
        });
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
            rotation: playerData.rotation || 0,
            hp: 100,
            shield: 0,         // <-- Scudo iniziale a 0 (max 100)
            weapon: 'pistol',  // <-- Arma iniziale
            ammo: 30,           // <-- Munizioni iniziali
            kills: 0
        };

        // Invia al nuovo giocatore la situazione attuale di giocatori, bot e oggetti
        socket.emit('currentPlayers', players);
        socket.emit('currentBots', bots);
        socket.emit('currentItems', items); // <-- Invia gli oggetti sulla mappa

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


   // Gestione dello sparo, consumo munizioni e danni per arma
    socket.on('playerShoot', (shootData) => {
        let player = players[socket.id];
        if (!player || player.isDead) return;

        // Controllo munizioni
        if (player.ammo <= 0) {
            io.to(socket.id).emit('outOfAmmo');
            return;
        }

        player.ammo -= 1;
        io.to(socket.id).emit('ammoUpdated', { ammo: player.ammo });

        // Danno in base all'arma
        let bulletDamage = (player.weapon === 'shotgun') ? 50 : 25;

        Object.keys(bots).forEach((botId) => {
            let bot = bots[botId];
            let dist = Math.hypot(bot.x - shootData.x, bot.z - shootData.z);
            
            if (dist < 3) {
                bot.hp -= bulletDamage;
                console.log(`🎯 Colpo a segno sul ${bot.id} (${player.weapon})! Vita bot: ${bot.hp}`);

                if (bot.hp <= 0) {
                    player.kills += 1;
                    console.log(`💀 ${bot.id} eliminato da ${player.name}! Uccisioni totali: ${player.kills}`);
                    
                    // Invia notifica killfeed e punteggio aggiornato a tutti i client
                    io.emit('killFeed', {

                        killerName: player.name,
                        killerId: socket.id,
                        kills: player.kills,
                        victimName: bot.name
                    
                    });

                    // Rigenera il bot
                    bot.hp = 100;
                    bot.x = Math.random() * 20 - 10;
                    bot.z = Math.random() * 20 - 10;
                }

                io.emit('botDamaged', { botId: bot.id, newHp: bot.hp });
            }
        });
    });



   // Raccolta oggetti (medikit, munizioni, fucile, giubbotto antiproiettile)
    socket.on('collectItem', (itemId) => {
        let player = players[socket.id];
        let item = items[itemId];

        if (player && item && !player.isDead) {
            let dist = Math.hypot(player.x - item.x, player.z - item.z);
            
            if (dist < 2) {
                console.log(`🎁 ${player.name} ha raccolto ${item.type}!`);

                if (item.type === 'medkit') {
                    player.hp = Math.min(100, player.hp + 50);
                    io.to(socket.id).emit('playerHealed', { newHp: player.hp });
                } else if (item.type === 'ammo') {
                    player.ammo += 30;
                    io.to(socket.id).emit('ammoUpdated', { ammo: player.ammo });
                } else if (item.type === 'shotgun') {
                    player.weapon = 'shotgun';
                    player.ammo += 15; // Dà anche qualche munizione bonus
                    io.to(socket.id).emit('weaponChanged', { weapon: 'shotgun', ammo: player.ammo });
                } else if (item.type === 'armor') {
                    player.shield = 100; // Ricarica completa dello scudo
                    io.to(socket.id).emit('shieldUpdated', { newShield: player.shield });
                }

                delete items[itemId];
                io.emit('itemCollected', itemId);
            }
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