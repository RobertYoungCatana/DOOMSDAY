// DOOMSDAY - Armi (dati condivisi tra client e server, come shared/map.js)
// Il SERVER usa: damage (danni per colpo) e pickupAmmo (munizioni date raccogliendo l'arma).
// Il CLIENT usa tutto il resto per sparo, mira e grafica.
// Per aggiungere un'arma: una riga qui + il modello in js/models.js (il suono in audio.js e' facoltativo).
//
//   name        nome mostrato nell'HUD e sopra gli oggetti
//   damage      danni per colpo (alla testa x2, lo decide il server)
//   fireRate    secondi tra un colpo e l'altro (piu' basso = spara piu' veloce)
//   auto        true = tenendo premuto spara a raffica
//   pickupAmmo  munizioni aggiunte quando la si raccoglie
//   spread      dispersione dei colpi senza mirare (radianti)
//   adsSpread   dispersione mirando (tasto destro / grilletto sinistro)
//   adsFov      campo visivo mirando: piu' basso = piu' zoom (normale: 75)
//   range       distanza massima del colpo in metri
//   pellets     tracce disegnate per ogni colpo (solo grafica)
//
// Danni al secondo (DPS = damage / fireRate): pistola 50, mitraglietta 133,
// fucile d'assalto 120, fucile a pompa 59 (ma bastano 2 colpi).
(function () {
  const WEAPONS = {
    pistol:  { name: 'Pistola',          damage: 15, fireRate: 0.30,  auto: false, pickupAmmo: 0,  spread: 0.012, adsSpread: 0.004, adsFov: 60, range: 70, pellets: 1 },
    smg:     { name: 'Mitraglietta',     damage: 10, fireRate: 0.075, auto: true,  pickupAmmo: 60, spread: 0.045, adsSpread: 0.020, adsFov: 62, range: 40, pellets: 1 },
    rifle:   { name: "Fucile d'assalto", damage: 18, fireRate: 0.15,  auto: true,  pickupAmmo: 45, spread: 0.028, adsSpread: 0.006, adsFov: 50, range: 90, pellets: 1 },
    shotgun: { name: 'Fucile a pompa',   damage: 50, fireRate: 0.85,  auto: false, pickupAmmo: 15, spread: 0.050, adsSpread: 0.032, adsFov: 65, range: 28, pellets: 7 },
  };

  if (typeof window !== 'undefined') window.WEAPONS = WEAPONS;
  if (typeof module !== 'undefined' && module.exports) module.exports = WEAPONS;
})();
