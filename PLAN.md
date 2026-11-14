# DOOMSDAY – Piano di sviluppo

## Obiettivo
Realizzare un FPS 3D multiplayer post-apocalittico, giocabile direttamente dal browser, per l'open day del **21 novembre 2026** (10 giorni).

## Principio guida
**Funzionante prima che bello.** Se il tempo finisce, il gioco deve comunque essere giocabile (anche solo con bot).

## Architettura semplificata
- **Client (HTML/CSS/JS + Three.js)**: grafica, movimento, input, HUD, menu, rete.
- **Server (Node.js + Socket.IO)**: stato ufficiale della partita, sincronizzazione, bot, punteggi.

**Modalità offline**: il client può funzionare da solo con bot (nessun server richiesto).
**Modalità online**: il server sincronizza tutti i client.

## Protocollo Socket.IO (accordato)

Client → Server:
- `join` { nickname }
- `input` { move:{x,z}, look:{x,y}, jump, shoot, reload, weaponIndex }
- `pickup` { objectId }
- `respawn` {}

Server → Client:
- `welcome` { yourId, config }
- `state` { timeLeft, players:[...], bots:[...], pickups:[...] }
- `gameOver` { winner, scores }
- `playerKilled` { victimId, killerId }

## Scaletta giornaliera

### Giorno 1 (oggi) – Ambiente 3D + movimento FPS
- [x] Struttura progetto
- [x] Piano
- [ ] `render.js` – scena, camera, renderer, luci
- [ ] `arena.js` – mappa low-poly (terreno, muri, container, macerie)
- [ ] `player.js` – movimento FPS (WASD, salto, gravità, collisioni, corsa)
- [ ] `input.js` – tastiera + mouse
- [ ] `main.js` – loop di gioco
- [ ] **Verifica**: si muove in 3D, si vede l'arena, collisioni con i bordi.

### Giorno 2 – Combat + respawn + punteggio
- [ ] `combat.js` – sparo, danni, vite, eliminazioni, respawn, punteggio
- [ ] `hud.js` – vita, munizioni, punteggio, timer
- [ ] **Verifica**: si spara, si muore, si respawn, appare il punteggio.

### Giorno 3 – Bot
- [ ] `ai.js` – stati IDLE/SEARCH/CHASE/ATTACK/RESPAWN
- [ ] `entities.js` – mesh dei bot
- [ ] **Verifica**: i bot si muovono, ti cercano, ti sparo.

### Giorno 4 – Multiplayer (client)
- [ ] `network.js` – connessione Socket.IO, invio input, ricezione stato
- [ ] `entities.js` – mesh degli altri giocatori (interpolazione)
- [ ] `menu.js` – menu con nickname e pulsante PLAY
- [ ] **Verifica**: 2 giocatori si vedono e si muovono.

### Giorno 5 – Server + sincronizzazione
- [ ] `server/server.js` – Express + Socket.IO
- [ ] `server/game.js` – stato, input, bot, punteggi, timer
- [ ] **Verifica**: server online, 2 client sincronizzati.

### Giorno 6 – Armi raccoglibili + controller
- [ ] `pickup.js` – pistola, fucile automatico, fucile a pompa, munizioni, kit medico
- [ ] `input.js` – Gamepad API (controller)
- [ ] **Verifica**: si raccolgono armi, si cambia arma, controller funziona.

### Giorno 7 – Polishing + test
- [ ] Ottimizzazioni, suoni, effetti, HUD completo
- [ ] Test su Chrome/Edge
- [ ] Hosting (GitHub Pages + Render)

### Giorno 8-10 – Riserva + perfezionamenti
- [ ] Fix bug, miglioramenti estetici, documentazione

## Divisione del lavoro
- **Sviluppatore A (Frontend)**: Three.js, arena, movimento, input, controller, armi, pickup, HUD, menu.
- **Sviluppatore B (Backend)**: Node.js, Socket.IO, server, lobby, sincronizzazione, bot, punteggi, timer, hosting.

Lavorare separatamente e integrare ogni giorno.

## Vincoli
- Giocabile su Chrome/Edge aggiornati, senza installazioni, con WebGL.
- Accessibile via URL HTTPS.
- Funziona su computer non potenti (low-poly, niente texture pesanti).
- Supporta almeno 2 giocatori.
- Gestione disconnessioni.

## Requisiti minimi per l'open day
1. Gioco 3D con movimento FPS.
2. Arena visibile.
3. Multiplayer (o almeno bot).
4. Spara, muori, respawn, punteggio.
5. Menu con nickname e PLAY.