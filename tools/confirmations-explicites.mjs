/**
 * FairSplit — Toute confirmation nomme son action
 *
 * `showConfirmModal` peint un bouton unique, partagé par tous les appels. Tant
 * que son libellé et sa couleur vivaient en dur dans le balisage, chaque
 * confirmation affichait « Supprimer » en rouge : mesuré le 2026-09-18,
 * **6 des 11 appels** ne supprimaient rien — créer une cagnotte, se
 * déconnecter, reconduire des charges, déplacer une charge entre poches,
 * restaurer une sauvegarde.
 *
 * Le remède est un paramètre, et un paramètre s'oublie. Ce relevé existe pour
 * que l'oubli soit VU : il nomme tout appel qui ne passe pas ses options.
 *
 * Il ne juge PAS le libellé — « Créer » pour une suppression lui conviendrait.
 * Ce qu'il tient est plus étroit et se vérifie sans arbitrer : un appel qui ne
 * dit rien retombe sur un défaut NEUTRE, donc sur un bouton qui n'avertit pas.
 * C'est la seule chose qu'un contrôle statique peut savoir.
 *
 * S'emploie à la main comme `adherences.mjs` :
 *
 *   node tools/confirmations-explicites.mjs
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fichiersJs, RACINE } from './adherences.mjs';

/** Le nom qu'on suit */
const APPEL = 'showConfirmModal(';

/**
 * Les arguments d'un appel portent-ils une virgule de PREMIER NIVEAU ?
 *
 * Écrit à la main plutôt qu'en expression régulière, et c'est la seule forme
 * qui tienne : les messages de ce dépôt sont des gabarits qui portent des
 * parenthèses, des apostrophes françaises et des `${…}` imbriqués. Un
 * `\(([^)]*)\)` s'arrêterait à la première parenthèse d'un montant formaté.
 *
 * Le scanner saute les chaînes, les gabarits et les commentaires, et suit la
 * profondeur des parenthèses, crochets et accolades. Une virgule vue à
 * profondeur 1 sépare deux arguments.
 *
 * @param {string} source - Le fichier entier
 * @param {number} ouvrante - Index de la parenthèse ouvrante de l'appel
 * @returns {boolean} Vrai si l'appel porte au moins deux arguments
 */
export function porteDesOptions(source, ouvrante) {
  let profondeur = 0;
  let i = ouvrante;
  let derniereVirgule = -1;

  while (i < source.length) {
    const c = source[i];

    // Commentaires
    if (c === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      if (i === -1) return false;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i + 2);
      if (i === -1) return false;
      i += 2;
      continue;
    }

    // Chaînes et gabarits : on les traverse sans rien y compter.
    if (c === '\'' || c === '"' || c === '`') {
      i = finDeLaChaine(source, i);
      if (i === -1) return false;
      continue;
    }

    if (c === '(' || c === '[' || c === '{') profondeur += 1;
    else if (c === ')' || c === ']' || c === '}') {
      profondeur -= 1;
      // Fin de l'appel : un second argument existe si une virgule de premier
      // niveau a été vue ET qu'il reste quelque chose derrière elle.
      if (profondeur === 0) {
        return derniereVirgule !== -1 && aDuContenu(source, derniereVirgule + 1, i);
      }
    } else if (c === ',' && profondeur === 1) {
      derniereVirgule = i;
    }

    i += 1;
  }

  return false;
}

/**
 * Reste-t-il autre chose que du blanc et des commentaires entre deux index ?
 *
 * ⚠️ SANS CELLE-CI, UNE VIRGULE FINALE SUFFISAIT À SATISFAIRE LA GARDE.
 * Trouvé le 2026-09-18 en éprouvant le contrôle par mutation : retirer les
 * options d'un appel laisse la virgule de la ligne d'avant, et la garde
 * répondait « ok » sur un appel à UN seul argument. Le mutant n'a pas fait
 * tomber le contrôle — et c'est le contrôle qu'il fallait interroger, pas la
 * mutation.
 *
 * @param {string} source
 * @param {number} debut
 * @param {number} fin
 * @returns {boolean}
 */
function aDuContenu(source, debut, fin) {
  let i = debut;
  while (i < fin) {
    const c = source[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === '/' && source[i + 1] === '/') {
      const saut = source.indexOf('\n', i);
      i = saut === -1 || saut > fin ? fin : saut + 1;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const ferme = source.indexOf('*/', i + 2);
      i = ferme === -1 || ferme > fin ? fin : ferme + 2;
      continue;
    }
    return true;
  }
  return false;
}

/**
 * Index du caractère qui SUIT la chaîne ouverte en `debut`
 *
 * Les gabarits portent des `${…}` qui portent eux-mêmes des chaînes : on
 * redescend dedans plutôt que de chercher le prochain accent grave, faute de
 * quoi un `${formatCurrency(x)}` refermerait la chaîne au mauvais endroit.
 *
 * @param {string} source
 * @param {number} debut - Index du guillemet ouvrant
 * @returns {number} Index après le guillemet fermant, ou -1
 */
function finDeLaChaine(source, debut) {
  const guillemet = source[debut];
  let i = debut + 1;

  while (i < source.length) {
    const c = source[i];
    if (c === '\\') { i += 2; continue; }
    if (c === guillemet) return i + 1;
    if (guillemet === '`' && c === '$' && source[i + 1] === '{') {
      let profondeur = 1;
      i += 2;
      while (i < source.length && profondeur > 0) {
        const d = source[i];
        if (d === '\'' || d === '"' || d === '`') { i = finDeLaChaine(source, i); continue; }
        if (d === '{') profondeur += 1;
        else if (d === '}') profondeur -= 1;
        i += 1;
      }
      continue;
    }
    i += 1;
  }

  return -1;
}

/**
 * Tous les appels à `showConfirmModal`, et s'ils nomment leur action
 *
 * @param {string} [racine] - Dossier balayé
 * @returns {Array<{fichier: string, ligne: number, options: boolean}>}
 */
export function relevesDesConfirmations(racine = RACINE) {
  const releves = [];

  for (const fichier of fichiersJs(racine)) {
    // La modale elle-même DÉCLARE la fonction : elle ne s'appelle pas.
    if (fichier.endsWith('components/modal.js')) continue;

    const source = readFileSync(fichier, 'utf8');
    let depuis = 0;

    for (;;) {
      const trouve = source.indexOf(APPEL, depuis);
      if (trouve === -1) break;
      depuis = trouve + APPEL.length;

      const ouvrante = trouve + APPEL.length - 1;
      releves.push({
        fichier,
        ligne: source.slice(0, trouve).split('\n').length,
        options: porteDesOptions(source, ouvrante)
      });
    }
  }

  return releves;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const releves = relevesDesConfirmations();
  const muets = releves.filter(r => !r.options);

  for (const r of releves) {
    console.log(`${r.options ? '  ok  ' : ' MUET '} ${r.fichier}:${r.ligne}`);
  }
  console.log(`\n${releves.length} appel(s), ${muets.length} sans options`);
  process.exitCode = muets.length === 0 ? 0 : 1;
}
