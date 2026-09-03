// ===== MODULE : LE VERSEMENT QUI SE FAIT TOUT SEUL =====
//
// Décider de mettre 150 € de côté chaque mois, c'est décider une fois. Le
// versement à deux a supprimé le calcul de tête et la double saisie, mais il
// restait un geste à refaire douze fois par an — et un geste qu'on oublie ne se
// signale nulle part : la cagnotte prend du retard, et le rattrapage se
// découvre à l'échéance.
//
// Ce module reprend les enveloppes qui portent un versement mensuel, à
// l'ouverture d'un mois neuf. Mêmes garanties que la reconduction des charges
// fixes : une seule fois par mois, jamais vers le passé. La décision, elle, est
// une affaire de données pures et vit dans `utils/versement-mensuel.js`.
//
// ## Ce qui est écrit, et sous quelle forme
//
// Des versements ordinaires — mêmes champs, mêmes règles, même corbeille. Rien
// ne les distingue à la lecture sinon leur clé, `auto-2026-09-vous`, qui les
// rend idempotents et tient lieu d'empreinte. Un versement automatique se
// retire donc comme un autre, et son retrait tient.
//
// ## Le partage est celui du mois visé
//
// Un versement « à deux » se partage avec l'assiette du mois qu'il alimente.
// Au premier du mois, `periods/{mois}/salaries` n'existe pas encore et le repli
// se fait sur les revenus globaux — exactement ce que `backfillPeriodSalaries`
// figera ensuite pour ce mois. Les deux chemins donnent donc le même chiffre.

import { getState } from '../state.js';
import { toast } from '../components/toast.js';
import { formatCurrency } from '../utils/format.js';
import { log, warn, error as logError } from '../utils/debug.js';
import { getCurrentPeriod, formatPeriod } from '../utils/date.js';
import { resolveSalaries } from '../utils/salaries.js';
import { resolveShareMode, resolvePercents } from '../utils/calculations.js';
import { partagerLeVersement, versementsAEcrire } from '../utils/versement-partage.js';
import { planVersementMensuel, cleVersementAuto } from '../utils/versement-mensuel.js';

/** Le nœud des versements, tel que `envelopes.js` le nomme */
const CHEMIN_VERSEMENTS = 'versements';

/**
 * Alimente les cagnottes qui portent un versement mensuel
 *
 * Appelée à chaque ouverture de mois, juste après la reconduction des charges.
 * Elle ne lit qu'une fois le nœud des versements, et n'écrit que ce qui manque.
 *
 * Son échec n'empêche jamais le mois de s'ouvrir : un pot non alimenté se
 * rattrape au geste suivant, là où un bilan qui refuse de s'afficher ne se
 * rattrape pas du tout.
 *
 * @param {Object} [options]
 * @param {Object} [options.historique] - Le nœud `periods` lu dans la MÊME
 *   séquence. Omis, la fonction lit elle-même.
 * @param {Object} [options.salairesGlobaux] - Le nœud `salaries` déjà lu
 * @returns {Promise<number>} Nombre de versements écrits
 */
export async function appliquerLesVersementsMensuels({ historique, salairesGlobaux } = {}) {
  const cible = getState('currentPeriod');
  if (!cible) return 0;

  // Rien à faire avant même de lire quoi que ce soit : le cas ordinaire est un
  // foyer sans versement mensuel, et il ne doit rien coûter.
  const candidates = (getState('envelopes') || [])
    .filter(enveloppe => enveloppe && enveloppe.versementMensuel);
  if (candidates.length === 0) return 0;

  try {
    const { dbGet, dbUpdate } = await import('../db.js');

    const [tousLesVersements, periods, globaux] = await Promise.all([
      dbGet(CHEMIN_VERSEMENTS),
      historique === undefined ? dbGet('periods') : Promise.resolve(historique),
      salairesGlobaux === undefined ? dbGet('salaries') : Promise.resolve(salairesGlobaux)
    ]);

    const moisVise = (periods && typeof periods === 'object' ? periods[cible] : null) || {};
    const { salaries } = resolveSalaries(moisVise.salaries, globaux);
    const shareMode = resolveShareMode(moisVise.shareMode, getState('shareMode') || 'prorata');
    const customPercents = resolvePercents(
      moisVise.customPercents,
      getState('customPercents') || { vous: 50, conjointe: 50 }
    );

    const lots = [];

    for (const enveloppe of candidates) {
      // Les clés BRUTES du nœud, et non des versements normalisés : une entrée
      // abîmée disparaîtrait de la forme normalisée et ferait réalimenter un
      // mois qui l'est déjà.
      const noeud = tousLesVersements && typeof tousLesVersements === 'object'
        ? tousLesVersements[enveloppe.id]
        : null;
      const clesExistantes = noeud && typeof noeud === 'object' ? Object.keys(noeud) : [];

      const plan = planVersementMensuel({
        enveloppe, cible, moisCourant: getCurrentPeriod(), clesExistantes
      });
      if (!plan) continue;

      const parts = partsDuPlan(plan, { shareMode, salaries, customPercents });
      if (parts.length === 0) continue;

      const lignes = {};
      for (const part of parts) {
        lignes[cleVersementAuto(cible, part.auteur)] = {
          montant: part.montant,
          auteur: part.auteur,
          date: plan.date,
          timestamp: Date.now(),
          deleted: false
        };
      }

      lots.push({ enveloppe, lignes });
    }

    if (lots.length === 0) return 0;

    // Une écriture par ENVELOPPE, et deux niveaux de granularité qui ne se
    // confondent pas :
    //
    //   - entre enveloppes, une par une : un pot refusé ne doit pas emporter
    //     les autres ;
    //   - à l'intérieur d'une enveloppe, en un seul lot : les deux parts d'un
    //     versement « à deux » ne sont pas deux décisions, c'est une décision
    //     écrite en deux lignes parce qu'il faut attribuer chaque part à
    //     quelqu'un. Les écrire séparément laissait exactement une clé en
    //     place quand la seconde était refusée — et la garde d'idempotence,
    //     qui tient le mois pour alimenté dès qu'UNE des deux clés est là,
    //     tenait alors la moitié manquante pour un mois complet. La cagnotte
    //     perdait une part, définitivement, en silence.
    //
    // Le moteur rejette un lot multi-chemins dès qu'un enfant est invalide :
    // le mois reste donc intact, et l'ouverture suivante le reprend entier.
    // La clé étant déterministe, cette reprise réécrit la même chose au même
    // endroit — il n'y a rien à défaire.
    let ecrites = 0;
    for (const lot of lots) {
      try {
        await dbUpdate(`${CHEMIN_VERSEMENTS}/${lot.enveloppe.id}`, lot.lignes);
        ecrites += Object.keys(lot.lignes).length;
      } catch (erreur) {
        warn(`[Versement mensuel] ${lot.enveloppe.label} non alimentée :`, erreur?.message || erreur);
      }
    }

    if (ecrites > 0) annoncer(lots, cible);
    return ecrites;
  } catch (erreur) {
    // Non bloquant, comme la reconduction : le mois s'ouvre, le pot se rattrape.
    logError('❌ Versements mensuels impossibles :', erreur);
    return 0;
  }
}

/**
 * Les lignes qu'un plan produit : une, ou deux si le foyer verse à deux
 *
 * Le partage passe par la même fabrique que le versement manuel, qui passe
 * elle-même par celle des charges. Trois chemins, une seule arithmétique.
 *
 * @param {Object} plan - Rendu par `planVersementMensuel`
 * @param {Object} contexte - { shareMode, salaries, customPercents }
 * @returns {Array<{auteur: string, montant: number}>}
 */
function partsDuPlan(plan, { shareMode, salaries, customPercents }) {
  if (plan.auteur !== 'deux') {
    return [{ auteur: plan.auteur, montant: plan.montant }];
  }

  return versementsAEcrire(
    partagerLeVersement({ montant: plan.montant, shareMode, salaries, customPercents })
  );
}

/**
 * Dit ce qui vient d'être mis de côté
 *
 * De l'argent qui bouge sans qu'on l'ait demandé ce matin-là doit se voir. La
 * reconduction des charges annonce de la même façon, et pour la même raison :
 * un mois qui se remplit tout seul, en silence, se lit comme une anomalie.
 *
 * @param {Array<{enveloppe: Object, lignes: Object}>} lots - Un par enveloppe
 * @param {string} cible - Le mois alimenté
 * @returns {void}
 */
function annoncer(lots, cible) {
  const lignes = lots.flatMap(lot => Object.values(lot.lignes));
  const total = lignes.reduce((somme, ligne) => somme + ligne.montant, 0);
  const noms = lots.map(lot => `${lot.enveloppe.icon} ${lot.enveloppe.label}`);

  const quoi = noms.length === 1
    ? noms[0]
    : `${noms.length} cagnottes`;

  toast.info(`${formatCurrency(Math.round(total * 100) / 100)} mis de côté sur ${quoi} pour ${formatPeriod(cible)}`);
  log(`💰 Versement mensuel : ${lignes.length} ligne(s) sur ${noms.length} enveloppe(s)`);
}
