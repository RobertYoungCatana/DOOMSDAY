# DOOMSDAY
DOOMSDAY è uno sparatutto arcade in prima persona (FPS) multiplayer ambientato in un mondo post-apocalittico, interamente eseguibile via browser senza download. Progettato e sviluppato da due studenti dell'indirizzo Informatico con l'aiuto dell'intelligenza artificiale, il gioco punta su partite frenetiche Free-For-All e grafica low-poly.

## Pubblicazione

- **Server (Render)**: ripubblica la cartella del progetto come sempre (`npm start`). Facoltativo: la variabile d'ambiente `ALLOWED_ORIGINS=https://<utente>.github.io` fa usare il server solo dal sito del gioco.
- **Client (GitHub Pages)**: non pubblicare la cartella `client/` così com'è. Il workflow `.github/workflows/deploy-pages.yml` crea la build di produzione (`dist/`: un solo file JS minificato e offuscato, niente source map) e pubblica solo quella. Una volta sola: *Settings → Pages → Source = GitHub Actions*.
- **Build in locale**: `npm run build:client` (risultato in `dist/`). Per cercare errori: `npm run build:client:debug` (solo minificata, senza protezioni).
- Il codice che gira nel browser si può sempre scaricare: l'offuscamento lo rende difficile da leggere e modificare, ma vita, scudo, danni, munizioni, loot, cadenza di fuoco e velocità li decide il server. Se il repository è pubblico, i sorgenti restano leggibili su GitHub: per nasconderli rendilo privato (GitHub Pages da repository privato richiede GitHub Pro, gratuito con lo Student Developer Pack).
