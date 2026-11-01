/**
 * FairSplit — Pourquoi ma part vaut ce qu'elle vaut
 *
 * Le dépliant du bilan répondait à « qui a payé quoi ». Il ne répondait pas à
 * la question qu'on se pose devant le chiffre : **pourquoi ma part vaut
 * 1 089,34 €.** Ce module la décompose — une ligne par règle appliquée.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PAR RÈGLE, ET NON PAR CATÉGORIE — TRANCHÉ SUR UN JEU D'ESSAI SÉPARATEUR
 *
 * La maquette montrait deux « Courses » au prorata et un « Festival » en 50/50.
 * Sur ce jeu, les deux lectures produisent EXACTEMENT les mêmes lignes : elle ne
 * pouvait trancher ni pour l'une ni pour l'autre. Le jeu qui sépare porte deux
 * croisements — une catégorie à plusieurs règles, une règle sur plusieurs
 * catégories — et il vit dans `tests/utils/decomposition.test.js`.
 *
 * Ce qu'il a dit : une ligne « Loisirs » qui mélange 50/50 et 70/30 **ne peut
 * porter aucune règle**. Aucun pourcentage ne s'y attache. La lecture par
 * catégorie n'est donc pas moins bonne, elle est **structurellement incapable**
 * de répondre à la question du dépliant — et pour la rendre capable il faudrait
 * la scinder par règle, c'est-à-dire produire celle-ci avec plus de lignes.
 *
 * Trois raisons de plus, mesurées le 2026-09-09 :
 *
 *   1. **bornée par construction** — au plus trois modes, plus les dérogations
 *      distinctes. La lecture par catégorie n'a pas de plafond ;
 *   2. **« Budgets par catégorie » rend déjà `catégorie → montant`**, dans le
 *      MÊME panneau, quelques centaines de pixels plus bas. Deux ventilations
 *      par catégorie sur un écran, avec des nombres différents — 184,04 €
 *      dépensés et 129,91 € de ma part sous « Alimentation » — c'est
 *      `normalizePair`, visible d'un coup d'œil ;
 *   3. **à 320 px au doigt**, les libellés par règle tiennent sur une ligne
 *      (30 px) là où ceux par catégorie s'enroulent (49 px) : 120 px contre 207
 *      pour la même information.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE MODULE NE CALCULE AUCUNE PART
 *
 * Il appelle `calculateChargeShares`, la fabrique, et se contente d'additionner
 * ce qu'elle rend. C'est la grandeur la plus exposée du dépôt : le solde, les
 * virements, le versement à deux et ce dépliant en dépendent tous. Une seconde
 * formule ici afficherait un chiffre voisin du vrai, et c'est le vrai qu'on
 * mettrait en doute.
 *
 * Le POURCENTAGE des libellés suit le même principe, un cran plus bas : il est
 * lu sur `mien / plein` de la ligne elle-même, jamais recalculé depuis les
 * revenus. Il ne peut donc pas diverger des deux montants qu'il accompagne.
 *
 * @module utils/decomposition
 */

import { calculateChargeShares } from './calculations.js';
import { libelleDeLaRepartition } from './repartition.js';

/**
 * L'identité de la règle réellement appliquée à une charge
 *
 * ── POURQUOI LA RÈGLE APPLIQUÉE, ET NON « PORTE UN `splitOverride` » ──
 *
 * Le prédicat hérité — « la charge porte un `splitOverride` » — gouverne la
 * PASTILLE, sur quatre surfaces, et il ne bouge pas. Ici on range par règle, et
 * une charge marquée `{ mode: 'prorata' }` dans un mois au prorata applique
 * exactement la règle du mois : lui donner sa ligne produirait deux lignes au
 * libellé identique, ce qui n'explique rien de plus.
 *
 * `libelleDeLaRepartition` dit déjà la même chose de son côté — elle rend la
 * chaîne vide pour ce mode, « il ne s'écarte de rien puisque c'est le partage
 * par défaut du foyer ». Les deux fabriques restent d'accord.
 *
 * La forme est admise par les règles de base (`database.rules.json:278`) mais
 * aucun formulaire ne l'écrit : rare, pas impossible.
 *
 * @param {Object} charge
 * @param {Object} ctx
 * @returns {string} Une clé stable, comparable d'une charge à l'autre
 */
function cleDeLaRegle(charge, ctx) {
  const mode = charge.splitOverride?.mode || ctx.shareMode;

  if (mode !== 'custom') return mode;

  // En « custom », deux charges ne partagent une ligne que si elles partagent
  // aussi leurs pourcentages : 70/30 et 100/0 sont deux règles, pas une.
  const source = (charge.splitOverride && charge.splitOverride.vous !== undefined)
    ? charge.splitOverride
    : ctx.customPercents;
  return `custom:${Number(source?.vous)}/${Number(source?.conjointe)}`;
}

/**
 * Le pourcentage d'une ligne, écrit pour être lu
 *
 * Une décimale, virgule française, et une espace fine INSÉCABLE (U+202F) avant
 * le signe.
 *
 * ── CE CHOIX EST UN RENVERSEMENT, ET IL EST DIT — 2026-09-11 ──
 *
 * Ce commentaire prescrivait une espace ORDINAIRE : l'insécable « a fait
 * rougir la CI deux fois sur des contrôles qui lisaient un montant en clair »,
 * et rien n'obligeait à en hériter le piège. La raison était juste ; elle ne
 * connaissait pas son coût. Mesuré sur la capture du grand-livre de « Moi » à
 * 320 px : le « % » tombait SEUL à la ligne sous « Au prorata de 70,6 ».
 *
 * Le piège qu'elle évitait est tenu autrement : les tests écrivent le caractère
 * en ÉCHAPPEMENT (`\u202F`), jamais en clair — la règle que `CLAUDE.md` pose
 * déjà pour `formatCurrency`.
 *
 * @param {number} part
 * @param {number} total
 * @returns {string}
 */
function pourcentEcrit(part, total) {
  if (!(total > 0)) return '';
  // Une espace fine INSÉCABLE avant le signe, comme `formatCurrency` en pose
  // devant l'euro. Avec une espace ordinaire, le « % » tombait seul à la ligne
  // dans le grand-livre de « Moi » à 320 px — vu sur la capture, 2026-09-11.
  return `${((part / total) * 100).toFixed(1).replace('.', ',')}\u202F%`;
}

/**
 * Ce que la ligne dit de sa règle, quand aucune pastille ne le dit
 *
 * ── LIBELLÉ ET PASTILLE SONT EXCLUSIFS, ET C'EST LA FORME HÉRITÉE ──
 *
 * Une dérogation se lit par sa pastille — `[50/50]`, décidée le 2026-09-05 pour
 * quatre surfaces, avec le montant plein hors de la ligne. Un libellé en plus
 * ferait dire deux fois la même chose sur la ligne la plus étroite de l'écran.
 *
 * Le libellé sert donc là où la pastille se tait : la ligne de base, et le cas
 * rare d'une dérogation `{ mode: 'prorata' }` dans un mois qui ne l'est pas.
 *
 * @param {string} mode - Le mode réellement appliqué
 * @param {number} mien
 * @param {number} plein
 * @returns {string}
 */
function libelleDeLaRegle(mode, mien, plein) {
  if (mode === '50-50') return 'À parts égales';
  if (mode === 'custom') return `Selon vos parts, ${pourcentEcrit(mien, plein)}`;
  return `Au prorata de ${pourcentEcrit(mien, plein)}`;
}

/**
 * Décompose une liste de charges par règle appliquée
 *
 * ── L'ORDRE ──
 *
 * La règle du mois d'abord : c'est le point de départ de l'explication, et
 * celle qui porte le plus souvent l'essentiel. Les dérogations la corrigent
 * ensuite, **la plus lourde en premier** — on lit d'abord ce qui déplace le
 * plus le chiffre qu'on cherche à comprendre.
 *
 * ── CE QU'IL REND ──
 *
 * `mien` est ma part, `plein` le montant total des charges de la ligne. Les
 * deux sont nécessaires : le pourcentage se lit sur leur rapport, et le
 * `plein` reste hors du libellé — il vit dans les listes, avec la même
 * pastille.
 *
 * @param {Array<Object>} charges - Charges du mois, déjà filtrées par périmètre
 * @param {{shareMode: string, salaries: Object, totalSalaries: number, customPercents: Object,
 *          personne?: 'vous'|'conjointe'}} ctx - `personne` : de QUI la part est
 *          décomposée ; `vous` par défaut, le comportement d'avant
 * @returns {Array<{cle: string, libelle: string, pastille: string, mien: number,
 *                  plein: number, nombre: number, derogatoire: boolean}>}
 */
export function decomposerParRegle(charges, ctx) {
  const liste = Array.isArray(charges) ? charges : [];

  // La clé du mois, obtenue en demandant la règle d'une charge SANS dérogation.
  // Elle passe par la même fabrique que les autres : une seconde expression de
  // « la règle du mois » finirait par ne plus dire la même chose.
  const cleDuMois = cleDeLaRegle({}, ctx);

  const groupes = new Map();
  for (const charge of liste) {
    const cle = cleDeLaRegle(charge, ctx);
    const { yourShare, partnerShare } = calculateChargeShares(
      charge, ctx.shareMode, ctx.salaries, ctx.totalSalaries, ctx.customPercents);
    // LA PART DE QUI TIENT LE TÉLÉPHONE — 2026-09-11. Elle était toujours celle
    // de `vous` : sur le téléphone de la conjointe, « Pourquoi votre part » et
    // le grand-livre de « Moi » décomposaient la part de l'autre, et leurs
    // lignes ne sommaient pas au chiffre qu'elles prétendaient expliquer.
    const mienne = ctx.personne === 'conjointe' ? partnerShare : yourShare;

    const groupe = groupes.get(cle) || {
      cle,
      mien: 0,
      plein: 0,
      nombre: 0,
      derogatoire: cle !== cleDuMois,
      // La pastille vient de la fabrique unique — celle des deux listes et du
      // récap des virements. Prise sur la PREMIÈRE charge du groupe : elles
      // partagent la même règle, donc la même pastille, par construction de
      // la clé.
      pastille: cle === cleDuMois ? '' : libelleDeLaRepartition(charge.splitOverride),
      mode: charge.splitOverride?.mode || ctx.shareMode
    };

    groupe.mien += mienne;
    groupe.plein += Number(charge.amount) || 0;
    groupe.nombre += 1;
    groupes.set(cle, groupe);
  }

  const lignes = [...groupes.values()].map((g) => ({
    cle: g.cle,
    // Exclusifs : la pastille parle, ou le libellé parle. Jamais les deux.
    libelle: g.pastille ? '' : libelleDeLaRegle(g.mode, g.mien, g.plein),
    pastille: g.pastille,
    mien: g.mien,
    plein: g.plein,
    nombre: g.nombre,
    derogatoire: g.derogatoire
  }));

  return lignes.sort((a, b) => {
    if (a.derogatoire !== b.derogatoire) return a.derogatoire ? 1 : -1;
    return b.mien - a.mien;
  });
}
