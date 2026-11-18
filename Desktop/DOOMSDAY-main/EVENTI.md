# DOOMSDAY – Eventi Socket.IO (client ↔ server)

Questo file è il "contratto" tra client e server: dice quali messaggi si possono mandare e quali arrivano.
Il server gira su `server/server.js`. Il client si collega con Socket.IO (`io("URL_DEL_SERVER")`).

La pagina `/` del server risponde con `{ status, game, version, players }`: il menu del gioco confronta `version` con `CONFIG.NETWORK.SERVER_VERSION` e, se il server online è più vecchio, scrive "versione vecchia: ripubblica il server". Il server usa gli stessi file del client in `client/js/shared/` (mappa e armi) e `client/js/collision.js`: quando cambiano, va ripubblicato.

## Flusso di una partita

1. Il client si collega e manda `playerJoin` (nickname).
2. Il server risponde con `currentPlayers` e `currentItems`, e a tutti manda `lobbyUpdate`.
3. Quando ci sono almeno 2 giocatori, uno qualsiasi preme PLAY/START e il client manda `startGame`.
4. Il server manda `gameStarted` a tutti: la partita inizia (posizioni, vita e munizioni resettate).
5. Durante la partita: `playerMovement`, `playerShoot`, `collectItem` dal client; tanti eventi di aggiornamento dal server.
6. Quando resta un solo sopravvissuto il server manda `gameOver` con vincitore e classifica.
7. Dopo 8 secondi il server manda `backToLobby` e si può rigiocare (senza rifare `playerJoin`).

**Regole:** niente bot, niente timer. Si muore solo colpiti dagli altri giocatori. Chi muore resta eliminato fino alla fine della partita. Il server decide vita, scudo, munizioni e punteggi: il client non può modificarli, può solo mostrarli.

**Limiti:** minimo 2 giocatori, massimo 8. Non si può entrare a partita in corso.

---

## Client → Server (il client manda)

| Evento | Dati | Quando |
|---|---|---|
| `playerJoin` | `{ name, skin, x, y, z, rotation }` | Appena connesso, dopo aver scelto il nickname (max 16 caratteri) e il personaggio (`skin` = id da `CONFIG.SKINS`, es. `"soldier"`) |
| `startGame` | nessuno | Dalla lobby, quando si preme START (servono almeno 2 giocatori) |
| `changeSkin` | `skin` (stringa, es. `"ninja"`) | Dalla lobby, quando si preme SELEZIONA su un altro personaggio: vale per la prossima partita. Con un server vecchio (senza `version` o prima della 5) che non conosce `changeSkin`, il client esce e rientra subito in lobby con `playerJoin` e il nuovo personaggio |
| `playerMovement` | `{ x, y, z, rotation }` | Quando il giocatore si muove (numeri validi; le coordinate sono limitate a ±50) |
| `playerShoot` | `{ x, y, z, ox, oy, oz, targetId }` | Quando il giocatore spara. `x, y, z` = punto d'impatto, `ox, oy, oz` = da dove parte il colpo, `targetId` = id del giocatore colpito (`null` = colpo a vuoto o su un muro). Il server toglie vita solo se il colpo è credibile: punto sul corpo del bersaglio, bersaglio a portata dell'arma e **nessun muro in mezzo** (così i ripari proteggono davvero). I client vecchi senza `targetId` usano ancora la regola dei 2 m |
| `collectItem` | `itemId` (stringa, es. `"item_3"`) | Quando preme E vicino a un oggetto (distanza massima 2) |

---

## Server → Client (il client ascolta)

### Lobby e connessione

| Evento | Dati | Significato |
|---|---|---|
| `currentPlayers` | oggetto `{ idGiocatore: giocatore, ... }` | Elenco giocatori, solo a chi è appena entrato |
| `currentItems` | oggetto `{ idOggetto: oggetto, ... }` | Oggetti sulla mappa, solo a chi è appena entrato |
| `newPlayer` | `giocatore` | Un nuovo giocatore è entrato (agli altri) |
| `lobbyUpdate` | `{ state, playerCount, minPlayers, maxPlayers, names, players }` | Stato della lobby: `state` è `"lobby"`, `"playing"` o `"ended"`; `names` = lista nickname; `players` = `[{ name, skin }]`, così la lobby mostra il personaggio di ognuno |
| `matchInProgress` | nessuno | Hai provato a entrare ma la partita è già iniziata |
| `lobbyFull` | `{ maxPlayers }` | Stanza piena (8 giocatori) |
| `notEnoughPlayers` | `{ minPlayers }` | Hai premuto START ma siete troppo pochi |
| `disconnectPlayer` | `idGiocatore` | Un giocatore è uscito: togli il suo modello |

### Durante la partita

| Evento | Dati | Significato |
|---|---|---|
| `gameStarted` | `{ players, items }` | La partita è iniziata: usa le posizioni e gli oggetti ricevuti |
| `playerMoved` | `giocatore` | Un altro giocatore si è mosso: aggiorna il suo modello |
| `ammoUpdated` | `{ ammo, shot }` | Le tue munizioni sono cambiate (solo a te). `shot: true` = risposta a un tuo colpo, `shot: false` = munizioni raccolte |
| `outOfAmmo` | nessuno | Hai provato a sparare senza munizioni (solo a te) |
| `playerDamaged` | `{ newHp, newShield }` | Sei stato colpito (solo a te) |
| `playerHealed` | `{ newHp }` | Hai raccolto un medikit (solo a te) |
| `shieldUpdated` | `{ newShield }` | Hai raccolto il giubbotto (solo a te) |
| `weaponChanged` | `{ weapon, ammo }` | Hai raccolto un'arma: `weapon` è `"smg"`, `"rifle"` o `"shotgun"` (solo a te) |
| `playerWeapon` | `{ id, weapon }` | Un altro giocatore ha raccolto un'arma: cambia quella che ha in mano il suo personaggio |
| `itemSpawned` | `oggetto` | È comparso un nuovo oggetto sulla mappa |
| `itemCollected` | `idOggetto` | Qualcuno ha raccolto un oggetto: toglilo dalla mappa |
| `playerEliminated` | `{ id, killerId }` | Un giocatore è morto. Se `id` è il tuo, mostra "sei stato eliminato" e aspetta la fine; per gli altri togli il modello |
| `killFeed` | `{ killerName, killerId, kills, victimName }` | Messaggio "X ha eliminato Y" e punteggio aggiornato di chi ha ucciso |

### Fine partita

| Evento | Dati | Significato |
|---|---|---|
| `gameOver` | `{ winnerId, winnerName, scoreboard }` | Partita finita. `scoreboard` = lista `[{ id, name, kills }]` già ordinata dal migliore |
| `backToLobby` | nessuno | Si torna alla lobby per una nuova partita |

---

## Oggetti dati

**giocatore**
```
{ id, name, skin, x, y, z, rotation, hp, shield, weapon, ammo, kills, isDead }
```
- `skin`: id del personaggio scelto nel menu (o `null`: il client usa il primo di `CONFIG.SKINS`).
- `hp`: da 0 a 100. `shield`: da 0 a 100 (assorbe i danni prima della vita).
- `weapon`: l'arma in mano. I numeri sono in `client/js/shared/weapons.js`, file letto sia dal client sia dal server:

  | Arma | `weapon` | Danno (testa x2) | Colpi al secondo | Munizioni quando la raccogli |
  |---|---|---|---|---|
  | Pistola | `"pistol"` | 15 | 3,3 | (arma di partenza) |
  | Mitraglietta | `"smg"` | 10 | 13 (a raffica) | +60 |
  | Fucile d'assalto | `"rifle"` | 18 | 6,7 (a raffica) | +45 |
  | Fucile a pompa | `"shotgun"` | 50 | 1,2 | +15 |
- Partenza: 100 di vita, 0 di scudo, pistola, 30 munizioni.

**oggetto**
```
{ id, type, x, y, z }
```
- `type`: `"medkit"` (+50 vita), `"ammo"` (+30 munizioni), `"armor"` (scudo a 100), oppure un'arma: `"smg"`, `"rifle"`, `"shotgun"` (l'arma + le sue munizioni, vedi tabella sopra).

---

## Eventi eliminati (non esistono più)

`currentBots`, `updateBots`, `botDamaged`, `waveUpdated`: i bot sono stati rimossi, vanno tolti dal client.
