#!/usr/bin/env node
/**
 * FairSplit — Mettre les artefacts d'un échec à l'abri, AVANT toute relance
 *
 * ─────────────────────────────────────────────────────────────────────
 * POURQUOI CET OUTIL EXISTE
 *
 * Playwright écrit ses captures et ses `error-context.md` dans `test-results/`,
 * un dossier par cas. **Une relance du même cas l'écrase.** Le réflexe naturel
 * après un échec — le rejouer pour voir s'il se reproduit — détruit donc
 * exactement ce qui aurait permis de le comprendre.
 *
 * Ce dépôt l'a payé TROIS fois en deux jours, sur trois défaillances de
 * démarrage différentes (`cout-annuel:60`, `firebase-integration:175`,
 * `depense-perso:101`). À chaque fois la leçon a été écrite au journal, et à
 * chaque fois elle a été refaite : **une leçon qu'on réapprend trois fois n'est
 * pas apprise.** Ce qui manquait n'était pas la connaissance, c'était un geste
 * qui coûte moins cher que l'oubli.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS
 *
 * Il copie — il ne déplace pas. `test-results/` reste où il est : un outil de
 * sauvegarde qui casse la commande suivante ne serait pas employé.
 *
 * La destination est horodatée et ignorée par git : ces artefacts sont des
 * pièces de travail. Ceux qui méritent d'être gardés partent dans
 * `docs/artefacts/`, à la main et avec leur note d'origine.
 *
 * Usage :
 *   node tools/garder-artefacts.mjs            # avant de rejouer
 *   npm run artefacts
 */

import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const SOURCE = resolve(process.cwd(), 'test-results');
const RACINE = resolve(process.cwd(), 'artefacts-locaux');

/** Un horodatage triable, sans caractère interdit sur Windows */
function horodatage() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    + `_${p(d.getHours())}h${p(d.getMinutes())}m${p(d.getSeconds())}`;
}

async function principal() {
  if (!existsSync(SOURCE)) {
    console.log('Rien à garder : test-results/ n\'existe pas.');
    console.log('(C\'est le cas normal quand la dernière passe est verte.)');
    return;
  }

  const entrees = await readdir(SOURCE);
  if (entrees.length === 0) {
    console.log('Rien à garder : test-results/ est vide.');
    return;
  }

  const destination = join(RACINE, horodatage());
  await mkdir(destination, { recursive: true });
  await cp(SOURCE, destination, { recursive: true });

  // Compter ce qui a été mis à l'abri : un message qui annonce « copié » sans
  // dire combien laisserait croire à une sauvegarde sur un dossier vide.
  let fichiers = 0;
  const parcourir = async (dossier) => {
    for (const nom of await readdir(dossier)) {
      const chemin = join(dossier, nom);
      if ((await stat(chemin)).isDirectory()) await parcourir(chemin);
      else fichiers++;
    }
  };
  await parcourir(destination);

  console.log(`${entrees.length} dossier(s), ${fichiers} fichier(s) mis à l'abri :`);
  console.log(`  ${destination}`);
  console.log('');
  console.log('test-results/ est intact — la relance peut partir.');
}

principal().catch((erreur) => {
  console.error('Échec de la mise à l\'abri :', erreur?.message || erreur);
  process.exitCode = 1;
});
