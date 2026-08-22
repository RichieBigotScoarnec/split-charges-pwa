#!/usr/bin/env node
/**
 * Enveloppe un vidage brut de la base dans le format de sauvegarde FairSplit
 *
 * La sauvegarde automatique (.github/workflows/sauvegarde.yml) récupère le
 * sous-arbre `household` avec la CLI Firebase, qui rend les données nues. Or
 * `restoreBackup` refuse un fichier qui ne porte pas son enveloppe : sans cette
 * étape, la sauvegarde ne serait restaurable qu'en ligne de commande — c'est-à-
 * dire pas depuis un téléphone, précisément la situation où l'on en a besoin.
 *
 * Le format est lu dans `public/js/modules/backup.js` plutôt que recopié : deux
 * définitions finiraient par diverger, et le jour où on s'en apercevrait serait
 * celui d'une restauration. Il est lu à la source et non importé — le paquet
 * n'est pas en `type: module`, Node lit donc ces fichiers comme du CommonJS.
 * C'est le procédé déjà employé par `coherence-formulaires.test.js`.
 *
 * Usage : node tools/enveloppe-sauvegarde.mjs <vidage.json> <sortie.json>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_BACKUP = readFileSync(resolve(RACINE, 'public/js/modules/backup.js'), 'utf8');

/**
 * Extrait une constante de `backup.js`
 * @param {string} nom
 * @param {RegExp} forme - Capture la valeur
 * @returns {string}
 */
function constante(nom, forme) {
  const trouve = SOURCE_BACKUP.match(forme);
  if (!trouve) {
    throw new Error(`${nom} introuvable dans backup.js : le format a changé de forme.`);
  }
  return trouve[1];
}

/** Marqueur du format, tel que `validateBackup` l'exige */
export const FORMAT = constante('FORMAT', /export const FORMAT = '([^']+)'/);

/** Version du format, telle que `validateBackup` l'accepte */
export const FORMAT_VERSION = Number(constante('FORMAT_VERSION', /export const FORMAT_VERSION = (\d+)/));

/**
 * Construit l'enveloppe de sauvegarde
 *
 * @param {*} donnees - Sous-arbre `household` tel que rendu par la CLI Firebase
 * @param {string} horodatage - Date de l'export, au format ISO
 * @returns {{format: string, version: number, exportedAt: string, data: Object}}
 */
export function envelopper(donnees, horodatage) {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: horodatage,
    // `null` quand la base est vide : l'enveloppe reste valide, et c'est le
    // contrôle de vraisemblance du workflow qui refuse de l'archiver.
    data: donnees || {}
  };
}

/**
 * Vérifie qu'un vidage a l'air d'être celui d'un foyer en service
 *
 * Une sauvegarde vide s'archive aussi bien qu'une autre et écrase la place
 * d'une bonne : mieux vaut échouer bruyamment que conserver du vide. C'est la
 * panne qu'on ne découvre qu'en restaurant.
 *
 * @param {*} donnees - Sous-arbre `household`
 * @returns {string|null} Motif du refus, null si le vidage est plausible
 */
export function motifDeRefus(donnees) {
  if (!donnees || typeof donnees !== 'object' || Array.isArray(donnees)) {
    return 'la base est vide ou illisible';
  }

  const periodes = Object.keys(donnees.periods || {});
  if (periodes.length === 0) {
    return 'aucune période : le foyer n\'aurait jamais rien saisi';
  }

  return null;
}

// ===== EXÉCUTION =====
// `import.meta.main` n'existe pas partout : on compare les chemins.
const appeleDirectement = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());

if (appeleDirectement) {
  const [, , entree, sortie] = process.argv;

  if (!entree || !sortie) {
    console.error('Usage : node tools/enveloppe-sauvegarde.mjs <vidage.json> <sortie.json>');
    process.exit(2);
  }

  const donnees = JSON.parse(readFileSync(entree, 'utf8'));

  const refus = motifDeRefus(donnees);
  if (refus) {
    console.error(`Sauvegarde refusée : ${refus}.`);
    console.error('Rien n\'est archivé — une sauvegarde vide vaut moins que pas de sauvegarde.');
    process.exit(1);
  }

  const enveloppe = envelopper(donnees, new Date().toISOString());
  writeFileSync(sortie, JSON.stringify(enveloppe));

  const periodes = Object.keys(enveloppe.data.periods || {}).length;
  console.log(`Enveloppe écrite : ${periodes} période(s), format ${FORMAT} v${FORMAT_VERSION}.`);
}
