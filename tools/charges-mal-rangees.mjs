#!/usr/bin/env node
/**
 * FairSplit — Trouver les charges rangées hors du mois de leur date
 *
 * Le défaut qui motive cet outil : le formulaire pré-remplissait la date du
 * JOUR et l'écriture visait le mois AFFICHÉ, sans que rien ne compare les deux.
 * Consulter juillet le 1er septembre et saisir une dépense la rangeait sous
 * `periods/2026-07` en la datant du 1er septembre. Le total de juillet gonflait
 * d'une dépense de septembre, et le solde entre les deux personnes du foyer
 * était faux d'autant.
 *
 * Le comportement est corrigé, mais rien ne dit combien d'entrées ont été mal
 * rangées avant. Cet outil les compte. Il LIT et n'écrit rien : déplacer une
 * charge demande deux écritures que rien ne rend atomiques, et c'est une
 * décision qui se prend en connaissance de cause, pas en lot.
 *
 * Il travaille sur une sauvegarde plutôt que sur la base : pas de credentials à
 * manipuler, rien à brancher sur la production, et le fichier se relit autant
 * de fois qu'on veut. Une sauvegarde s'exporte depuis l'application, ou se
 * récupère dans les artefacts de `.github/workflows/sauvegarde.yml`.
 *
 * Usage : node tools/charges-mal-rangees.mjs <sauvegarde.json>
 *
 * Hors de `public/`, donc jamais publié.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Les collections datées d'une période, et leur libellé */
export const COLLECTIONS = {
  variableCharges: 'charge variable',
  fixedCharges: 'charge fixe',
  reimbursements: 'remboursement'
};

const PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Le nœud `periods`, où qu'il soit dans le fichier
 *
 * Une sauvegarde de l'application porte son enveloppe (`{ version, exportedAt,
 * data }`) ; un vidage brut de la CLI Firebase, non. Accepter les deux évite
 * d'imposer un passage par `enveloppe-sauvegarde.mjs` pour une simple lecture.
 *
 * @param {Object} fichier - Contenu JSON analysé
 * @returns {Object|null}
 */
export function noeudDesPeriodes(fichier) {
  if (!fichier || typeof fichier !== 'object') return null;
  for (const candidat of [fichier.periods, fichier.data?.periods, fichier.household?.periods]) {
    if (candidat && typeof candidat === 'object') return candidat;
  }
  return null;
}

/**
 * Les entrées dont la date n'appartient pas à leur mois
 *
 * Une entrée sans date lisible n'est PAS signalée : elle ne prouve pas un
 * mauvais rangement, seulement une donnée ancienne ou incomplète. Les signaler
 * noierait les vraies dans du bruit, et c'est le bruit qui fait abandonner un
 * relevé.
 *
 * Les entrées supprimées non plus : elles ne comptent dans aucun total.
 *
 * @param {Object} periodes - Nœud `periods`
 * @returns {Array<{periode: string, collection: string, cle: string, date: string, mois: string, description: string, montant: number}>}
 */
export function chargesMalRangees(periodes) {
  const trouvees = [];
  if (!periodes || typeof periodes !== 'object') return trouvees;

  for (const [periode, contenu] of Object.entries(periodes)) {
    if (!PERIODE.test(periode) || !contenu || typeof contenu !== 'object') continue;

    for (const collection of Object.keys(COLLECTIONS)) {
      const entrees = contenu[collection];
      if (!entrees || typeof entrees !== 'object') continue;

      for (const [cle, entree] of Object.entries(entrees)) {
        if (!entree || typeof entree !== 'object' || entree.deleted === true) continue;
        if (typeof entree.date !== 'string' || !DATE.test(entree.date)) continue;

        const mois = entree.date.slice(0, 7);
        if (mois === periode) continue;

        trouvees.push({
          periode,
          collection,
          cle,
          date: entree.date,
          mois,
          description: typeof entree.description === 'string' ? entree.description : '(sans libellé)',
          montant: Number(entree.amount) || 0
        });
      }
    }
  }

  return trouvees.sort((a, b) => a.periode.localeCompare(b.periode) || a.date.localeCompare(b.date));
}

/**
 * Ce que chaque mois gagne ou perd si les entrées rejoignaient leur date
 *
 * Le nombre d'entrées ne dit pas grand-chose ; l'écart en euros, si. C'est lui
 * qui mesure de combien un solde est faux.
 *
 * @param {Array} trouvees - Sortie de `chargesMalRangees`
 * @returns {Map<string, number>} mois → écart en euros
 */
export function ecartParMois(trouvees) {
  const ecarts = new Map();
  const ajouter = (mois, montant) => ecarts.set(mois, (ecarts.get(mois) || 0) + montant);

  for (const t of trouvees) {
    ajouter(t.periode, -t.montant);
    ajouter(t.mois, t.montant);
  }

  return new Map([...ecarts].filter(([, v]) => v !== 0).sort());
}

/* c8 ignore start — affichage */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chemin = process.argv[2];
  if (!chemin) {
    console.error('Usage : node tools/charges-mal-rangees.mjs <sauvegarde.json>');
    process.exit(2);
  }

  let fichier;
  try {
    fichier = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (erreur) {
    console.error(`Sauvegarde illisible : ${erreur.message}`);
    process.exit(2);
  }

  const periodes = noeudDesPeriodes(fichier);
  if (!periodes) {
    console.error("Aucun nœud `periods` dans ce fichier — est-ce bien une sauvegarde FairSplit ?");
    process.exit(2);
  }

  const trouvees = chargesMalRangees(periodes);
  const moisLus = Object.keys(periodes).filter(p => PERIODE.test(p)).length;

  if (trouvees.length === 0) {
    console.log(`${moisLus} mois relus — aucune entrée rangée hors du mois de sa date.`);
    process.exit(0);
  }

  console.log(`${moisLus} mois relus — ${trouvees.length} entrée(s) rangée(s) hors du mois de leur date :\n`);
  for (const t of trouvees) {
    const montant = t.montant.toFixed(2).replace('.', ',');
    console.log(
      `  ${t.periode} → ${t.mois}  ${montant.padStart(9)} €  `
      + `${COLLECTIONS[t.collection]} « ${t.description} » du ${t.date}`
    );
  }

  console.log('\nCe que chaque mois gagnerait ou perdrait si elles rejoignaient leur date :');
  for (const [mois, ecart] of ecartParMois(trouvees)) {
    const signe = ecart > 0 ? '+' : '';
    console.log(`  ${mois}  ${signe}${ecart.toFixed(2).replace('.', ',')} €`);
  }

  console.log('\nRien n\'a été modifié. Corriger une entrée se fait dans l\'application :');
  console.log('la supprimer depuis le mois où elle est, puis la ressaisir à sa date.');
  process.exit(0);
}
/* c8 ignore stop */
