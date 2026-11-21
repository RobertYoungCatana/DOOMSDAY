// DOOMSDAY - build di produzione del client (cartella dist/, da pubblicare su GitHub Pages)
//
// Cosa fa:
//   1. legge client/index.html e prende i nostri script NELL'ORDINE in cui sono caricati;
//   2. li unisce in UN solo file chiuso in una funzione: le variabili non sono piu' globali
//      (dalla console del browser non si leggono ne' si cambiano player, keys, currentMenuState...);
//   3. minifica (esbuild: nomi corti, niente commenti) e offusca (javascript-obfuscator:
//      testi cifrati, codice che si rompe se viene "riformattato", blocco degli strumenti per sviluppatori);
//   4. aggiunge una protezione leggera: niente tasto destro, F12, Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+S;
//   5. minifica il CSS, copia le immagini, scrive un index.html pulito (senza commenti).
//   Nessuna source map: il codice originale non viene mai pubblicato.
//
// Uso (dalla cartella principale del progetto):
//   npm install --prefix tools        (solo la prima volta)
//   node tools/build.js               build di produzione in dist/
//   node tools/build.js --no-obfuscate --no-guard   build solo minificata (per cercare errori)
//
// ATTENZIONE: tutto cio' che gira nel browser puo' essere scaricato. Offuscare rende il codice
// molto difficile da leggere e da modificare, ma non impossibile. Le regole importanti (vita, scudo,
// danni, munizioni, loot, cadenza di fuoco, velocita') le decide il SERVER: quelle non si truccano.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const CLIENT = path.join(ROOT, 'client');
const DIST = path.join(ROOT, 'dist');
const args = process.argv.slice(2);
const OBFUSCATE = !args.includes('--no-obfuscate');
const GUARD = !args.includes('--no-guard');

function log(msg) { console.log('[build] ' + msg); }
function hash(text) { return crypto.createHash('sha256').update(text).digest('hex').slice(0, 10); }

// --- 1. index.html: script locali in ordine, script esterni (Three.js da CDN) e script in linea ---
const html = fs.readFileSync(path.join(CLIENT, 'index.html'), 'utf8');
const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const localScripts = [];
const externalScripts = [];
const inlineScripts = [];
scriptTags.forEach((m) => {
  const src = (/\bsrc="([^"]+)"/i.exec(m[1]) || [])[1];
  if (!src) { if (m[2].trim()) inlineScripts.push(m[2].trim()); return; }
  if (/^https?:\/\//i.test(src)) externalScripts.push(src);
  else localScripts.push(src.split('?')[0]);
});
if (!localScripts.length) throw new Error('Nessuno script locale trovato in client/index.html');
log(localScripts.length + ' script locali, ' + externalScripts.length + ' esterni, ' + inlineScripts.length + ' in linea');

// --- 2. Un solo file, tutto dentro una funzione ---
// Le dichiarazioni in cima ai file (let, const, function) diventano variabili della funzione:
// i file continuano a vedersi tra loro, ma dall'esterno non si vedono piu'.
const parts = localScripts.map((src) => {
  const code = fs.readFileSync(path.join(CLIENT, src), 'utf8');
  return '\n// ---- ' + src + ' ----\n' + code + '\n;';
});

// Protezione leggera contro gli strumenti per sviluppatori (solo deterrente: il menu del browser resta)
const guard = `
(function () {
  function stop(e) { e.preventDefault(); e.stopPropagation(); return false; }
  document.addEventListener('keydown', function (e) {
    var k = String(e.key || '').toLowerCase();
    var mod = e.ctrlKey || e.metaKey;
    if (e.key === 'F12' || (mod && e.shiftKey && (k === 'i' || k === 'j' || k === 'c' || k === 'k')) ||
        (mod && e.altKey && (k === 'i' || k === 'j' || k === 'c' || k === 'u')) || (mod && (k === 'u' || k === 's'))) return stop(e);
  }, true);
  document.addEventListener('contextmenu', stop, true);
  document.addEventListener('dragstart', function (e) { if (e.target && e.target.tagName === 'IMG') stop(e); }, true);
  document.addEventListener('selectstart', function (e) {
    var t = e.target; if (!(t && t.closest && t.closest('input, textarea'))) stop(e);
  }, true);
})();
`;

const bundle = '(function () {\n' + (GUARD ? guard : '') + parts.join('\n') + '\n})();\n';

(async () => {
  // --- 3. Minificazione ---
  const min = await esbuild.transform(bundle, {
    loader: 'js',
    minify: true,
    target: 'es2019',
    legalComments: 'none',
    charset: 'utf8',
    sourcemap: false,
  });
  let js = min.code;
  log('JS unito: ' + (bundle.length / 1024).toFixed(0) + ' KB -> minificato ' + (js.length / 1024).toFixed(0) + ' KB');

  // --- 3b. Offuscamento ---
  if (OBFUSCATE) {
    const JavaScriptObfuscator = require('javascript-obfuscator');
    js = JavaScriptObfuscator.obfuscate(js, {
      target: 'browser',
      compact: true,
      sourceMap: false,
      simplify: true,
      identifierNamesGenerator: 'hexadecimal',
      renameGlobals: false,              // le variabili sono gia' locali (tutto e' dentro una funzione)
      stringArray: true,                 // i testi finiscono in una tabella cifrata
      stringArrayEncoding: ['base64'],
      stringArrayThreshold: 0.75,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 1,
      splitStrings: false,               // spezzare le stringhe rallenterebbe il gioco
      controlFlowFlattening: false,      // idem: il gioco gira 60 volte al secondo
      deadCodeInjection: false,
      numbersToExpressions: false,
      transformObjectKeys: false,
      unicodeEscapeSequence: false,
      selfDefending: true,               // se il codice viene riformattato per leggerlo, smette di funzionare
      debugProtection: GUARD,            // con gli strumenti per sviluppatori aperti il debugger si blocca
      debugProtectionInterval: GUARD ? 4000 : 0,
      disableConsoleOutput: GUARD,       // niente messaggi in console
    }).getObfuscatedCode();
    log('offuscato: ' + (js.length / 1024).toFixed(0) + ' KB');
  }

  // --- 4. CSS minificato (i link alle immagini restano relativi: assets/...) ---
  const cssHref = (/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/i.exec(html) || [])[1];
  if (!cssHref) throw new Error('Foglio di stile non trovato in client/index.html');
  const cssSrc = fs.readFileSync(path.join(CLIENT, cssHref.split('?')[0]), 'utf8');
  const css = (await esbuild.transform(cssSrc, { loader: 'css', minify: true, legalComments: 'none', sourcemap: false })).code;

  // --- 5. Cartella dist/ pulita ---
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, 'js'), { recursive: true });
  const jsName = 'js/g.' + hash(js) + '.js';
  const cssName = 's.' + hash(css) + '.css';
  fs.writeFileSync(path.join(DIST, jsName), js);
  fs.writeFileSync(path.join(DIST, cssName), css);
  fs.cpSync(path.join(CLIENT, 'assets'), path.join(DIST, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');                       // GitHub Pages: niente Jekyll
  fs.writeFileSync(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /js/\n');

  const icon = (/<link[^>]+rel="icon"[^>]*>/i.exec(html) || [''])[0];
  const title = (/<title>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || 'DOOMSDAY';
  const inline = inlineScripts.map((s) => '<script>' + s.replace(/\s+/g, ' ') + '</script>').join('');
  const external = externalScripts.map((s) => '<script src="' + s + '" crossorigin="anonymous" referrerpolicy="no-referrer"></script>').join('');
  const page = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<meta name="referrer" content="no-referrer">' +
    '<title>' + title.trim() + '</title>' + icon +
    '<link rel="stylesheet" href="' + cssName + '"></head><body><div id="app"></div>' +
    inline + external + '<script src="' + jsName + '"></script></body></html>\n';
  fs.writeFileSync(path.join(DIST, 'index.html'), page);

  log('fatto: dist/index.html, dist/' + jsName + ', dist/' + cssName + ', dist/assets/' +
    (OBFUSCATE ? '' : '  (NON offuscato)') + (GUARD ? '' : '  (senza protezione)'));
})().catch((e) => { console.error(e); process.exit(1); });
