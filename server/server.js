//Developer: Alex Venturini
//Progetto: DOOMSDAY (versione PvP senza bot)

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Mappa condivisa con il client: punti di partenza e posizioni degli oggetti
const MAP = require('../client/js/shared/map.js');
// Armi condivise con il client: danni e munizioni date dalle armi raccolte
const WEAPONS = require('../client/js/shared/weapons.js');
// Collisioni condivise con il client: servono per controllare che tra chi spara e il bersaglio
// non ci sia un muro (cosi' ripararsi dietro un riparo funziona davvero)
const collision = require('../client/js/collision.js');
// Dove compare il loot: punti casuali raggiungibili a piedi (solo server, vedi loot.js)
const { buildLoot } = require('./loot.js');

// Versione del server: il menu del gioco la legge e avvisa se il server online e' rimasto indietro
// (personaggi, armi e mappa nuovi si vedono solo con il server aggiornato)
const SERVER_VERSION = 6;

// Siti autorizzati a usare il server (CORS), separati da virgola. Vuoto = tutti.
// Esempio su Render: ALLOWED_ORIGINS=https://nomeutente.github.io
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
const corsOrigin = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : '*';

const app = express();
app.disable('x-powered-by');                 // non dice a tutti che e' Express
app.use(cors({ origin: corsOrigin }));
// Header di sicurezza su tutte le risposte HTTP
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

// Pagina di stato: utile per "svegliare" Render e per l'indicatore server del menu
app.get('/', (req, res) => {
    res.json({ status: 'online', game: 'DOOMSDAY', version: SERVER_VERSION, players: Object.keys(players).length });
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: corsOrigin,
        methods: ["GET", "POST"]
    }
});

// ================= CONFIGURAZIONE =================
const MIN_PLAYERS = 2;               // giocatori minimi per far partire la partita
const MAX_PLAYERS = 12;               // giocatori massimi nella stanza
const MAP_LIMIT = 50;                // le posizioni oltre +/- questo valore vengono bloccate
const FIRST_DEATH_ENDS_MATCH = false; // true = la partita finisce alla PRIMA morte
                                      // false = finisce quando resta un solo sopravvissuto
const HIT_RADIUS = 2;                // client vecchi: distanza massima (dal punto dello sparo) per colpire un giocatore
const HIT_TOLERANCE = 1.5;           // client nuovi: quanto il punto colpito puo' stare lontano dal bersaglio (ritardo di rete)
const HEAD_HEIGHT = 1.4;             // altezza minima dai piedi del bersaglio perche' il colpo sia alla testa
const CROUCH_HEAD_HEIGHT = 0.97;     // ...se il bersaglio e' accovacciato (testa piu' in basso)
const BASE_ITEMS = 7;                // oggetti sulla mappa con 2 giocatori (prima erano 5)...
const MAX_ITEMS = 12;                // ...+1 per ogni giocatore in piu', fino a questo massimo
const ITEM_RESPAWN_MS = 10000;       // ogni 10 secondi ne ricompare uno (prima 15)
const LOBBY_RETURN_MS = 8000;        // dopo il game over, torna alla lobby dopo 8 secondi
// Anti-trucchi: il server controlla cadenza di fuoco e velocita' (i client possono essere modificati)
const SHOT_BURST = 4;                // colpi "di scorta" per il ritardo di rete
const SHOT_RATE_TOLERANCE = 0.85;    // si accetta fino al 15% piu' veloce della cadenza dell'arma
const MAX_MOVE_SPEED = 13;           // m/s in orizzontale (corsa 9 + margine)
const MOVE_SLACK = 1.5;              // metri di tolleranza per il ritardo di rete

// ================= STATO =================
const players = {};
const items = {};
let gameState = 'lobby'; // 'lobby' | 'playing' | 'ended'

// Oggetti che compaiono sulla mappa: cure, munizioni, giubbotto e tutte le armi tranne la pistola
const ITEM_TYPES = ['medkit', 'ammo', 'armor'].concat(Object.keys(WEAPONS).filter(w => w !== 'pistol'));

// Punti casuali per il loot, calcolati una volta all'avvio dalla mappa
const LOOT = buildLoot(MAP);
console.log('Loot: ' + LOOT.groundCount + ' punti a terra raggiungibili + ' + LOOT.specialCount + ' punti speciali');

// Quanti oggetti tenere sulla mappa: qualcuno in piu' se ci sono piu' giocatori
function maxItems() {
    const n = Object.keys(players).length;
    return Math.min(MAX_ITEMS, BASE_ITEMS + Math.max(0, n - 2));
}

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function alivePlayers() {
    return Object.values(players).filter(p => !p.isDead);
}

// ================= OGGETTI =================
// Posizione e tipo sono casuali: un punto qualsiasi della mappa raggiungibile a piedi
// (ogni tanto sui tetti e sulle piattaforme), lontano dagli altri oggetti.
function spawnItem(id) {
    const itemId = id || `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const slot = LOOT.randomSpot(Object.values(items));
    items[itemId] = {
        id: itemId,
        type: ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)],
        x: slot.x,
        y: slot.y,
        z: slot.z
    };
    return items[itemId];
}

function resetItems() {
    Object.keys(items).forEach(k => delete items[k]);
    const n = maxItems();
    for (let i = 1; i <= n; i++) spawnItem(`item_${i}`);
}

// Respawn automatico degli oggetti (solo durante la partita)
setInterval(() => {
    if (gameState === 'playing' && Object.keys(items).length < maxItems()) {
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
        names: Object.values(players).map(p => p.name),
        // nome + personaggio scelto: la lobby mostra con chi gioca ognuno
        players: Object.values(players).map(p => ({ name: p.name, skin: p.skin }))
    });
}

function startMatch() {
    gameState = 'playing';
    resetItems();

    const spawns = shuffle(MAP.spawnPoints);   // 8 punti, quanti i giocatori massimi
    Object.values(players).forEach((p, i) => {
        const s = spawns[i % spawns.length];
        p.x = s.x;
        p.y = s.y;
        p.z = s.z;
        p.rotation = s.rot;
        p.hp = 100;
        p.shield = 0;
        p.weapon = 'pistol';
        p.ammo = 30;
        p.kills = 0;
        p.isDead = false;
        p.crouch = false;
        p.lastMoveAt = 0;          // la prima posizione dopo lo spawn si accetta sempre
        p.shotTokens = SHOT_BURST;
        p.shotAt = Date.now();
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
        scoreboard,
        returnIn: LOBBY_RETURN_MS / 1000      // secondi prima di tornare alla lobby (per il conto alla rovescia)
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
function damagePlayer(victim, amount, killer, headshot) {
    let remaining = amount;
    const shieldBefore = victim.shield || 0;
    let absorbed = 0;
    if (victim.shield > 0) {
        absorbed = Math.min(victim.shield, remaining);
        victim.shield -= absorbed;
        remaining -= absorbed;
    }
    victim.hp -= remaining;

    // Conferma del colpo SOLO a chi ha sparato (serve per mostrare il danno).
    // shield = il bersaglio aveva ancora scudo: il numero del danno si mostra BLU (stile Fortnite).
    if (killer) {
        io.to(killer.id).emit('hitConfirmed', {
            targetId: victim.id,
            damage: amount,
            shieldDamage: absorbed,
            healthDamage: remaining,
            shield: shieldBefore > 0,
            shieldBroken: shieldBefore > 0 && victim.shield <= 0,
            x: victim.x,
            y: victim.y,
            z: victim.z,
            crouch: !!victim.crouch,
            killed: victim.hp <= 0,
            headshot: !!headshot
        });
    }

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

// ================= COLPI =================
// Da dove parte il colpo: l'origine mandata dal client, se e' vicina a dove il server sa che sta
// il giocatore; altrimenti gli occhi del giocatore secondo il server.
function shotOrigin(shooter, s) {
    if ([s.ox, s.oy, s.oz].every(Number.isFinite) && Math.hypot(s.ox - shooter.x, s.oz - shooter.z) < 3) {
        return { x: s.ox, y: s.oy, z: s.oz };
    }
    return { x: shooter.x, y: shooter.y + 1.75, z: shooter.z };
}

// Il client dice CHI ha colpito: il server controlla che sia credibile.
// Punto colpito sul corpo del bersaglio, bersaglio a portata dell'arma, nessun muro in mezzo.
function hitIsPlausible(shooter, target, s, weapon) {
    if (![s.x, s.y, s.z].every(Number.isFinite)) return false;
    if (Math.hypot(s.x - target.x, s.z - target.z) > HIT_TOLERANCE) return false;
    if (s.y < target.y - 0.5 || s.y > target.y + (target.crouch ? 1.9 : 2.3)) return false;

    const o = shotOrigin(shooter, s);
    const dist = Math.hypot(s.x - o.x, s.y - o.y, s.z - o.z);
    if (dist < 0.01) return true;
    if (dist > (weapon.range || 100) + 3) return false;

    const dir = { x: (s.x - o.x) / dist, y: (s.y - o.y) / dist, z: (s.z - o.z) / dist };
    const wall = collision.raycast(o, dir, dist, MAP);
    return !(wall && wall.distance < dist - 0.4);
}

// Cadenza di fuoco controllata dal server: un client modificato non puo' sparare piu' veloce dell'arma.
// "Secchiello" di colpi: si riempie col tempo alla velocita' dell'arma, ogni colpo ne toglie uno.
function allowShot(p, weapon) {
    const now = Date.now();
    const rate = Math.max(0.05, weapon.fireRate || 0.3) * SHOT_RATE_TOLERANCE;
    if (!Number.isFinite(p.shotTokens)) { p.shotTokens = SHOT_BURST; p.shotAt = now; }
    p.shotTokens = Math.min(SHOT_BURST, p.shotTokens + (now - (p.shotAt || now)) / 1000 / rate);
    p.shotAt = now;
    if (p.shotTokens < 1) return false;
    p.shotTokens -= 1;
    return true;
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
            // Skin scelta nel menu: solo lettere minuscole, numeri, - e _ (il client controlla che esista)
            skin: /^[a-z0-9_-]{1,24}$/.test(String(playerData && playerData.skin)) ? String(playerData.skin) : null,
            x: (playerData && playerData.x) || 0,
            y: (playerData && playerData.y) || 0,
            z: (playerData && playerData.z) || 0,
            rotation: (playerData && playerData.rotation) || 0,
            hp: 100,
            shield: 0,
            weapon: 'pistol',
            ammo: 30,
            kills: 0,
            isDead: false,
            crouch: false
        };

        socket.emit('currentPlayers', players);
        socket.emit('currentItems', items);
        socket.broadcast.emit('newPlayer', players[socket.id]);
        broadcastLobby();
    });

    // Cambio personaggio dalla lobby (pulsante SELEZIONA): vale per la prossima partita
    socket.on('changeSkin', (skin) => {
        const player = players[socket.id];
        if (!player || gameState !== 'lobby') return;
        if (!/^[a-z0-9_-]{1,24}$/.test(String(skin))) return;
        player.skin = String(skin);
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

        // Anti-teletrasporto: in partita non ci si sposta piu' veloce di MAX_MOVE_SPEED
        // (la prima posizione dopo lo spawn si accetta sempre: il client corregge gli spawn nei container)
        const now = Date.now();
        if (gameState === 'playing' && player.lastMoveAt) {
            const dt = Math.min(2, (now - player.lastMoveAt) / 1000);
            if (Math.hypot(x - player.x, z - player.z) > MAX_MOVE_SPEED * dt + MOVE_SLACK) return;
        }
        player.lastMoveAt = now;

        player.x = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, x));
        player.y = y;
        player.z = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, z));
        player.rotation = rotation;
        player.crouch = movementData.crouch === true;   // accovacciato: gli altri non vedono il nickname

        socket.broadcast.emit('playerMoved', player);
    });

    // Sparo: shootData.x / shootData.z = punto d'impatto calcolato dal client
    socket.on('playerShoot', (shootData) => {
        const shooter = players[socket.id];
        if (gameState !== 'playing' || !shooter || shooter.isDead || !shootData) return;

        if (shooter.ammo <= 0) {
            socket.emit('outOfAmmo');
            return;
        }
        

        // Troppo veloce per l'arma in mano: colpo ignorato (il client riceve comunque la risposta)
        if (!allowShot(shooter, WEAPONS[shooter.weapon] || WEAPONS.pistol)) {
            socket.emit('ammoUpdated', { ammo: shooter.ammo, shot: true });
            return;
        }

        shooter.ammo -= 1;
        socket.emit('ammoUpdated', { ammo: shooter.ammo, shot: true });

                // Avvisa tutti gli altri che questo giocatore ha sparato (per suono e tracce visive)
        socket.broadcast.emit('playerShot', {
            id: shooter.id,
            weapon: shooter.weapon,
            ox: shootData.ox,
            oy: shootData.oy,
            oz: shootData.oz,
            x: shootData.x,
            y: shootData.y,
            z: shootData.z
        });




        const weapon = WEAPONS[shooter.weapon] || WEAPONS.pistol;
        const baseDamage = weapon.damage;

        // Client nuovi: mandano sempre targetId (null = colpo a vuoto o su un muro)
        if ('targetId' in shootData) {
            const target = shootData.targetId ? players[shootData.targetId] : null;
            if (!target || target.id === shooter.id || target.isDead) return;
            if (!hitIsPlausible(shooter, target, shootData, weapon)) return;
            const headshot = shootData.y - target.y >= (target.crouch ? CROUCH_HEAD_HEIGHT : HEAD_HEIGHT);
            console.log(`🎯 ${shooter.name} ha colpito ${target.name} (${shooter.weapon}${headshot ? ', HEADSHOT' : ''})`);
            damagePlayer(target, headshot ? baseDamage * 2 : baseDamage, shooter, headshot);
            return;
        }

        // Client vecchi (senza targetId): regola di prima, chi sta entro 2 m dal punto d'impatto
        Object.values(players).forEach((target) => {
            if (target.id === shooter.id || target.isDead) return;

            const dist = Math.hypot(target.x - shootData.x, target.z - shootData.z);
            if (dist >= HIT_RADIUS) return;

            const relativeHeight = Number.isFinite(shootData.y) ? shootData.y - target.y : 0;
            const headshot = relativeHeight >= HEAD_HEIGHT;
            const bulletDamage = headshot ? baseDamage * 2 : baseDamage;

            console.log(`🎯 ${shooter.name} ha colpito ${target.name} (${shooter.weapon}${headshot ? ', HEADSHOT' : ''})`);
            damagePlayer(target, bulletDamage, shooter, headshot);
        });
    });

    // Raccolta oggetti
    socket.on('collectItem', (itemId) => {
        const player = players[socket.id];
        const item = items[itemId];

        if (gameState !== 'playing' || !player || !item || player.isDead) return;

        const dist = Math.hypot(player.x - item.x, player.z - item.z);
        if (dist >= 2 || Math.abs(player.y - item.y) > 2) return;

        console.log(`🎁 ${player.name} ha raccolto ${item.type}!`);

        if (item.type === 'medkit') {
            player.hp = Math.min(100, player.hp + 50);
            socket.emit('playerHealed', { newHp: player.hp });
        } else if (item.type === 'ammo') {
            player.ammo += 30;
            socket.emit('ammoUpdated', { ammo: player.ammo, shot: false });
        } else if (WEAPONS[item.type]) {
            // Arma raccolta: sostituisce quella in mano e aggiunge le sue munizioni
            player.weapon = item.type;
            player.ammo += WEAPONS[item.type].pickupAmmo;
            socket.emit('weaponChanged', { weapon: item.type, ammo: player.ammo });
            // Gli altri vedono subito la nuova arma in mano al personaggio
            socket.broadcast.emit('playerWeapon', { id: player.id, weapon: item.type });
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