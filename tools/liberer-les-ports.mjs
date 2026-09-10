#!/usr/bin/env node
/**
 * Libère les ports des émulateurs avant de lancer une suite
 *
 * ─────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE — QUATRE OCCURRENCES, UNE LEÇON NON APPRISE
 *
 * `firebase emulators:exec` annonce « Stopping Database Emulator » sans
 * toujours l'obtenir : le processus `java` garde le port, et la passe suivante
 * échoue sur `port taken`. Le gotcha est écrit dans CLAUDE.md depuis
 * longtemps, avec les trois commandes qui le résolvent à la main.
 *
 * **Il a été écrit, puis subi quatre fois de plus dans la même semaine.** À
 * chaque fois la suite entière n'a pas tourné, et à chaque fois le premier
 * réflexe a été de lire le résumé plutôt que le code de sortie — la règle 3,
 * dans son déguisement le plus banal.
 *
 * C'est le même constat que pour les artefacts perdus trois fois : **une leçon
 * qu'on réapprend n'est pas apprise.** Ce qui manquait n'était pas la
 * connaissance, c'était un geste qui coûte moins cher que l'oubli. D'où
 * `npm run ports`, et son branchement automatique devant les suites qui
 * démarrent un émulateur.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LES PORTS SONT LUS, JAMAIS ÉCRITS ICI
 *
 * `firebase.json` en est la source. Les recopier ferait deux endroits à tenir
 * d'accord — et le jour où l'un bouge, ce script libèrerait sereinement des
 * ports que personne n'utilise, en laissant occupés ceux qui comptent.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IL DIT CE QU'IL TUE, ET IL NE TUE QUE `java`
 *
 * Un émulateur lancé exprès par `npm run emulators` occupe les mêmes ports
 * qu'un jar résiduel : aucun script ne peut distinguer les deux intentions.
 * Ce qu'il peut faire, c'est **ne jamais le faire en silence** — le nom du
 * processus, son PID et son heure de démarrage sont affichés. Une heure de
 * démarrage récente se remarque, et c'est le signal que CLAUDE.md prescrit
 * déjà de lire à la main.
 *
 * Et il ne touche qu'à `java` : le port peut être occupé par tout autre chose,
 * et tuer à l'aveugle un processus qu'on n'a pas identifié serait pire que
 * l'échec qu'on cherche à éviter.
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Les ports que `firebase.json` déclare pour ses émulateurs */
function portsDeclares() {
  const config = JSON.parse(readFileSync(join(RACINE, 'firebase.json'), 'utf8'));
  const emulateurs = config.emulators || {};

  return Object.entries(emulateurs)
    .filter(([, e]) => e && Number.isFinite(Number(e.port)))
    .map(([nom, e]) => ({ nom, port: Number(e.port) }));
}

/**
 * L'heure de démarrage, en clair
 *
 * PowerShell sérialise ses `DateTime` en `/Date(1788964331190)/`. Le laisser
 * tel quel viderait l'affichage de son seul intérêt : **une heure de démarrage
 * récente est le signal qu'on vient de tuer un émulateur que quelqu'un avait
 * lancé exprès.** Un horodatage qu'on ne lit pas ne prévient personne.
 *
 * @param {string|number|null} brut
 * @returns {string|null}
 */
function heureLisible(brut) {
  if (brut === null || brut === undefined) return null;

  const millisecondes = typeof brut === 'string'
    ? Number(brut.match(/\/Date\((\d+)/)?.[1] ?? Date.parse(brut))
    : Number(brut);

  if (!Number.isFinite(millisecondes)) return String(brut);

  const date = new Date(millisecondes);
  const minutes = Math.round((Date.now() - millisecondes) / 60000);
  const age = minutes < 1 ? 'il y a moins d\'une minute'
    : minutes < 60 ? `il y a ${minutes} min`
      : `il y a ${Math.round(minutes / 60)} h`;

  return `${date.toLocaleTimeString('fr-FR')}, ${age}`;
}

/** Qui écoute sur ce port, sous Windows */
function occupantWindows(port) {
  let sortie;
  try {
    sortie = execSync(`netstat -ano -p TCP | findstr LISTENING | findstr :${port}`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    // `findstr` rend 1 quand il ne trouve rien : le port est libre.
    return null;
  }

  // La dernière colonne est le PID. Plusieurs lignes possibles (IPv4 et IPv6)
  // pour un même processus : le premier suffit.
  const ligne = sortie.split('\n').find((l) => l.trim());
  if (!ligne) return null;

  const pid = Number(ligne.trim().split(/\s+/).pop());
  if (!Number.isFinite(pid) || pid === 0) return null;

  try {
    const info = execSync(
      `powershell.exe -NoProfile -Command "Get-Process -Id ${pid} | `
      + 'Select-Object -Property Name,StartTime | ConvertTo-Json -Compress"',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const { Name, StartTime } = JSON.parse(info);
    return { pid, nom: Name, depuis: heureLisible(StartTime) };
  } catch {
    return { pid, nom: 'inconnu', depuis: null };
  }
}

/** Qui écoute sur ce port, ailleurs */
function occupantPosix(port) {
  try {
    const pid = Number(execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0]);
    if (!Number.isFinite(pid)) return null;
    const nom = execSync(`ps -p ${pid} -o comm=`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return { pid, nom, depuis: null };
  } catch {
    return null;
  }
}

const surWindows = process.platform === 'win32';
const occupant = surWindows ? occupantWindows : occupantPosix;

function tuer(pid) {
  if (surWindows) {
    execSync(`powershell.exe -NoProfile -Command "Stop-Process -Id ${pid} -Force"`,
      { stdio: 'ignore' });
  } else {
    process.kill(pid, 'SIGKILL');
  }
}

const ports = portsDeclares();
if (ports.length === 0) {
  console.log('Aucun émulateur déclaré dans firebase.json — rien à libérer.');
  process.exit(0);
}

let libere = 0;
let laisse = 0;

for (const { nom, port } of ports) {
  const qui = occupant(port);
  if (!qui) continue;

  const quand = qui.depuis ? ` démarré à ${qui.depuis}` : '';
  const description = `${qui.nom} (PID ${qui.pid})${quand}`;

  // `java` est le jar des émulateurs Database et Firestore. Tout le reste est
  // quelque chose qu'on n'a pas identifié, et qu'on ne tue pas.
  if (!/^java/i.test(qui.nom)) {
    console.log(`⚠️  ${nom} — port ${port} occupé par ${description}`);
    console.log('    Ce n\'est pas un jar d\'émulateur : rien n\'est tué. '
      + 'La suite échouera sur « port taken », et c\'est le bon comportement.');
    laisse++;
    continue;
  }

  try {
    tuer(qui.pid);
    console.log(`🧹 ${nom} — port ${port} libéré : ${description}`);
    libere++;
  } catch (erreur) {
    console.log(`⚠️  ${nom} — port ${port} : ${description} n'a pas pu être arrêté`);
    console.log(`    ${erreur.message}`);
    laisse++;
  }
}

if (libere === 0 && laisse === 0) {
  console.log(`Ports libres (${ports.map((p) => p.port).join(', ')}) — rien à faire.`);
}

// Jamais un code d'échec : ce script prépare le terrain, il ne juge rien. Si
// un port reste pris, c'est la commande suivante qui doit le dire — et elle le
// dit mieux, avec le nom de l'émulateur qui n'a pas pu démarrer.
process.exit(0);
