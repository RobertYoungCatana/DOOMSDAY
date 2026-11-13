//Developer: Alex Venturini
//Progetto: DOOMSDAY (versione PvP senza bot)

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Pagina di stato: utile per "svegliare" Render e per l'indicatore server del menu
app.get('/', (req, res) => {
    res.json({ status: 'online', game: 'DOOMSDAY', players: Object.keys(players).length });
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ================= CONFIGURAZIONE =================
const MIN_PLAYERS = 2;               // giocatori minimi per far partire la partita
const MAX_PLAYERS = 8;               // giocatori massimi nella stanza
const MAP_LIMIT = 50;                // le posizioni oltre +/- questo valore vengono bloccate
const FIRST_DEATH_ENDS_MATCH = false; // true = la partita finisce alla PRIMA morte
                                      // false = finisce quando resta un solo sopravvissuto
const HIT_RADIUS = 2;                // distanza massima (dal punto dello sparo) per colpire un giocatore
const MAX_ITEMS = 5;
const ITEM_RESPAWN_MS = 15000;
const LOBBY_RETURN_MS = 8000;        // dopo il game over, torna alla lobby dopo 8 secondi

// ================= STATO =================
const players = {};
const items = {};
let gameState = 'lobby'; // 'lobby' | 'playing' | 'ended'

const ITEM_TYPES = ['medkit', 'ammo', 'shotgun', 'armor'];

function randomPos() {
    return { x: Math.random() * 30 - 15, z: Math.random() * 30 - 15 };
}

function alivePlayers() {
    return Object.values(players).filter(p => !p.isDead);
}

// ================= OGGETTI =================
function spawnItem(id) {
    const itemId = id || `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const pos = randomPos();
    items[itemId] = {
        id: itemId,
        type: ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)],
        x: pos.x,
        y: 0,
        z: pos.z
    };
    return items[itemId];
}

function resetItems() {
    Object.keys(items).forEach(k => delete items[k]);
    for (let i = 1; i <= MAX_ITEMS; i++) spawnItem(`item_${i}`);
}

// Respawn automatico degli oggetti (solo durante la partita)
setInterval(() => {
    if (gameState === 'playing' && Object.keys(items).length < MAX_ITEMS) {
        const item = spawnItem();
        console.log(`📦 Nuovo oggetto comparso: ${item.type}`);
        io.emit('itemSpawned', item);
    }
}, ITEM_RESPAWN_MS);

// ================= GESTIONE PARTITA =================
function broadcastLobby() {
    io.emit('lobbyUpdate', {
        state: gameState,
        playerCount: Object.keys(players).length,
        minPlayers: MIN_PLAYERS,
        maxPlayers: MAX_PLAYERS,
        names: Object.values(players).map(p => p.name)
    });
}

function startMatch() {
    gameState = 'playing';
    resetItems();

    Object.values(players).forEach((p) => {
        const pos = randomPos();
        p.x = pos.x;
        p.y = 0;
        p.z = pos.z;
        p.hp = 100;
        p.shield = 0;
        p.weapon = 'pistol';
        p.ammo = 30;
        p.kills = 0;
        p.isDead = false;
    });

    console.log(`🚀 PARTITA INIZIATA con ${Object.keys(players).length} giocatori`);
    io.emit('gameStarted', { players, items });
}

function endMatch(winner) {
    if (gameState !== 'playing') return;
    gameState = 'ended';

    const scoreboard = Object.values(players)
        .map(p => ({ id: p.id, name: p.name, kills: p.kills }))
        .sort((a, b) => b.kills - a.kills);

    console.log(`🏁 PARTITA FINITA! Vincitore: ${winner ? winner.name : 'nessuno'}`);
    io.emit('gameOver', {
        winnerId: winner ? winner.id : null,
        winnerName: winner ? winner.name : null,
        scoreboard
    });

    // Dopo qualche secondo si torna alla lobby per una nuova partita
    setTimeout(() => {
        gameState = 'lobby';
        Object.values(players).forEach(p => { p.isDead = false; p.hp = 100; });
        io.emit('backToLobby');
        broadcastLobby();
    }, LOBBY_RETURN_MS);
}

// Controlla se la partita deve finire (sopravvissuti <= 1)
function checkEndOfMatch(lastKiller) {
    if (gameState !== 'playing') return;
    const alive = alivePlayers();

    if (FIRST_DEATH_ENDS_MATCH && lastKiller) {
        endMatch(lastKiller);
    } else if (alive.length <= 1) {
        endMatch(alive[0] || lastKiller || null);
    }
}

// Applica danno (prima lo scudo, poi la vita). Ritorna true se il giocatore muore.
function damagePlayer(victim, amount, killer) {
    let remaining = amount;
    if (victim.shield > 0) {
        const absorbed = Math.min(victim.shield, remaining);
        victim.shield -= absorbed;
        remaining -= absorbed;
    }
    victim.hp -= remaining;

    io.to(victim.id).emit('playerDamaged', { newHp: Math.max(0, victim.hp), newShield: victim.shield });

    if (victim.hp <= 0) {
        victim.hp = 0;
        victim.isDead = true;
        if (killer) killer.kills += 1;

        console.log(`💀 ${victim.name} è stato eliminato${killer ? ' da ' + killer.name : ''}!`);

        io.emit('playerEliminated', { id: victim.id, killerId: killer ? killer.id : null });
        io.emit('killFeed', {
            killerName: killer ? killer.name : null,
            killerId: killer ? killer.id : null,
            kills: killer ? killer.kills : 0,
            victimName: victim.name
        });

        checkEndOfMatch(killer);
        return true;
    }
    return false;
}

// ================= SOCKET =================
io.on('connection', (socket) => {
    console.log(`> Giocatore connesso: ${socket.id}`);

    socket.on('playerJoin', (playerData) => {
        // Non si può entrare a partita in corso
        if (gameState !== 'lobby') {
            socket.emit('matchInProgress');
            return;
        }

        // Stanza piena
        if (Object.keys(players).length >= MAX_PLAYERS) {
            socket.emit('lobbyFull', { maxPlayers: MAX_PLAYERS });
            return;
        }

        players[socket.id] = {
            id: socket.id,
            name: String((playerData && playerData.name) || "Sopravvissuto").trim().slice(0, 16) || "Sopravvissuto",
            x: (playerData && playerData.x) || 0,
            y: (playerData && playerData.y) || 0,
            z: (playerData && playerData.z) || 0,
            rotation: (playerData && playerData.rotation) || 0,
            hp: 100,
            shield: 0,
            weapon: 'pistol',
            ammo: 30,
            kills: 0,
            isDead: false
        };

        socket.emit('currentPlayers', players);
        socket.emit('currentItems', items);
        socket.broadcast.emit('newPlayer', players[socket.id]);
        broadcastLobby();
    });

    // Un giocatore qualsiasi dalla lobby avvia la partita
    socket.on('startGame', () => {
        if (!players[socket.id]) return;
        if (gameState !== 'lobby') return;

        if (Object.keys(players).length < MIN_PLAYERS) {
            socket.emit('notEnoughPlayers', { minPlayers: MIN_PLAYERS });
            return;
        }
        startMatch();
    });

    socket.on('playerMovement', (movementData) => {
        const player = players[socket.id];
        if (!player || player.isDead) return;

        // Scarta dati non validi e blocca la posizione dentro i limiti della mappa
        if (!movementData) return;
        const { x, y, z, rotation } = movementData;
        if (![x, y, z, rotation].every(Number.isFinite)) return;

        player.x = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, x));
        player.y = y;
        player.z = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, z));
        player.rotation = rotation;

        socket.broadcast.emit('playerMoved', player);
    });

    // Sparo: shootData.x / shootData.z = punto d'impatto calcolato dal client
    socket.on('playerShoot', (shootData) => {
        const shooter = players[socket.id];
        if (gameState !== 'playing' || !shooter || shooter.isDead) return;

        if (shooter.ammo <= 0) {
            socket.emit('outOfAmmo');
            return;
        }

        shooter.ammo -= 1;
        socket.emit('ammoUpdated', { ammo: shooter.ammo });

        const bulletDamage = (shooter.weapon === 'shotgun') ? 50 : 25;

        Object.values(players).forEach((target) => {
            if (target.id === shooter.id || target.isDead) return;

            const dist = Math.hypot(target.x - shootData.x, target.z - shootData.z);
            if (dist < HIT_RADIUS) {
                console.log(`🎯 ${shooter.name} ha colpito ${target.name} (${shooter.weapon})`);
                damagePlayer(target, bulletDamage, shooter);
            }
        });
    });

    // Raccolta oggetti
    socket.on('collectItem', (itemId) => {
        const player = players[socket.id];
        const item = items[itemId];

        if (gameState !== 'playing' || !player || !item || player.isDead) return;

        const dist = Math.hypot(player.x - item.x, player.z - item.z);
        if (dist >= 2) return;

        console.log(`🎁 ${player.name} ha raccolto ${item.type}!`);

        if (item.type === 'medkit') {
            player.hp = Math.min(100, player.hp + 50);
            socket.emit('playerHealed', { newHp: player.hp });
        } else if (item.type === 'ammo') {
            player.ammo += 30;
            socket.emit('ammoUpdated', { ammo: player.ammo });
        } else if (item.type === 'shotgun') {
            player.weapon = 'shotgun';
            player.ammo += 15;
            socket.emit('weaponChanged', { weapon: 'shotgun', ammo: player.ammo });
        } else if (item.type === 'armor') {
            player.shield = 100;
            socket.emit('shieldUpdated', { newShield: player.shield });
        }

        delete items[itemId];
        io.emit('itemCollected', itemId);
    });

    socket.on('disconnect', () => {
        console.log(`X Giocatore disconnesso: ${socket.id}`);
        const wasPlaying = gameState === 'playing';
        delete players[socket.id];
        io.emit('disconnectPlayer', socket.id);

        if (wasPlaying) {
            checkEndOfMatch(null);
        } else {
            broadcastLobby();
        }
    });
});

const PORT = process.env.PORT || 3000;
// '0.0.0.0' = raggiungibile dagli altri PC della LAN
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server DOOMSDAY in ascolto sulla porta ${PORT} (PvP, nessun bot)`);
});