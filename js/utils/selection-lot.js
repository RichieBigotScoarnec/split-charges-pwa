/**
 * FairSplit — Agir sur plusieurs charges à la fois
 *
 * Chaque ligne portait son crayon et sa corbeille, un par un. Ranger six
 * courses saisies au fil de la semaine dans la bonne catégorie demandait six
 * ouvertures de formulaire, et vider un mois d'essai demandait autant de
 * confirmations qu'il contenait de lignes.
 *
 * Ce module ne touche ni au DOM ni à la base : il tient les quatre décisions
 * qu'un lot demande, et rien d'autre.
 *
 * ## Pourquoi une sélection doit être purgée, et pas seulement vidée
 *
 * Une sélection est une liste d'identifiants ; les charges, elles, se
 * rechargent — changement de mois, suppression faite sur l'autre téléphone,
 * rejeu de la file hors ligne. Un identifiant retenu peut donc ne plus désigner
 * personne au moment où le geste part.
 *
 * Sans purge, le compte affiché — « 6 sélectionnées » — décrirait un lot que
 * l'écran ne montre plus, et le geste porterait sur des lignes invisibles.
 * C'est le genre d'écart qui ne lève aucune erreur : Firebase écrit sans
 * broncher sous une clé qui existe encore en base, et le total annoncé n'est
 * démenti par rien.
 */

/**
 * Ajoute ou retire un identifiant de la sélection
 *
 * Rend un tableau NEUF plutôt que de modifier celui reçu : l'état est lu par
 * copie ailleurs, et une mutation en place s'y perdrait sans bruit.
 *
 * @param {string[]} choisies - Identifiants retenus
 * @param {string} id - Identifiant basculé
 * @returns {string[]}
 */
export function basculerDansLaSelection(choisies, id) {
  const liste = Array.isArray(choisies) ? choisies.filter(v => typeof v === 'string') : [];
  if (typeof id !== 'string' || id === '') return liste;

  return liste.includes(id)
    ? liste.filter(v => v !== id)
    : [...liste, id];
}

/**
 * Ne garde de la sélection que ce qui existe encore et se voit
 *
 * Une charge supprimée entre-temps n'est plus sélectionnable : elle a quitté la
 * liste, et la garder retenue ferait porter le geste sur une ligne invisible.
 *
 * @param {string[]} choisies - Identifiants retenus
 * @param {Array<Object>} charges - Les charges telles qu'affichées
 * @returns {string[]} Dans l'ordre de la sélection, jamais dans celui des charges
 */
export function selectionPurgee(choisies, charges) {
  const liste = Array.isArray(choisies) ? choisies : [];
  const vivantes = new Set(
    (Array.isArray(charges) ? charges : [])
      .filter(charge => charge && !charge.deleted && typeof charge.id === 'string')
      .map(charge => charge.id)
  );

  return liste.filter(id => vivantes.has(id));
}

/**
 * Ce que la sélection représente : combien de lignes, et combien d'argent
 *
 * Le total est donné parce qu'une suppression de lot se juge sur lui. « 6
 * charges » ne dit pas si l'on s'apprête à effacer 40 € ou 1 400 €.
 *
 * @param {string[]} choisies - Identifiants retenus
 * @param {Array<Object>} charges - Les charges telles qu'affichées
 * @returns {{nombre: number, total: number}}
 */
export function resumeDeLaSelection(choisies, charges) {
  const retenues = new Set(selectionPurgee(choisies, charges));
  const liste = (Array.isArray(charges) ? charges : []).filter(c => c && retenues.has(c.id));

  const total = liste.reduce((somme, charge) => {
    const montant = Number(charge.amount);
    return somme + (Number.isFinite(montant) ? montant : 0);
  }, 0);

  return { nombre: liste.length, total: Math.round(total * 100) / 100 };
}

/**
 * Ce qu'un lot a réellement fait, y compris quand il n'a pas tout fait
 *
 * Un lot n'échoue pas en bloc : chaque écriture part pour elle-même, et une
 * seule peut être refusée — règle Firebase, charge disparue entre-temps,
 * réseau. Annoncer « 6 charges modifiées » alors que 5 le sont serait le pire
 * des deux mondes : le geste paraît fait, et le chiffre qu'on ira vérifier
 * ailleurs ne collera pas.
 *
 * L'inverse — un bandeau rouge quand une ligne sur six a résisté — ferait
 * croire que rien n'est passé. Les deux nombres, donc, et seulement quand le
 * second n'est pas nul.
 *
 * @param {Object} params
 * @param {number} params.faites - Écritures acceptées
 * @param {number} params.refusees - Écritures refusées
 * @param {string} params.geste - Participe passé au féminin PLURIEL, seul ou
 *        suivi d'un complément : « supprimées », « rangées dans « Courses » »
 * @returns {{texte: string, complet: boolean}}
 */
export function compteRenduDuLot({ faites, refusees, geste } = {}) {
  const ok = Number.isFinite(faites) && faites > 0 ? Math.trunc(faites) : 0;
  const ko = Number.isFinite(refusees) && refusees > 0 ? Math.trunc(refusees) : 0;
  const verbe = typeof geste === 'string' && geste.trim() ? geste.trim() : 'traitées';

  if (ok === 0 && ko === 0) return { texte: 'Rien à faire', complet: true };

  const faitesDites = `${ok} charge${ok > 1 ? 's' : ''} ${accorde(verbe, ok)}`;
  const refuseesDites = `${ko} refus${ko > 1 ? 'ées' : 'ée'}`;

  if (ko === 0) return { texte: faitesDites, complet: true };

  if (ok === 0) {
    return {
      texte: `Aucune charge ${accorde(verbe, 2)} — ${refuseesDites}`,
      complet: false
    };
  }

  return { texte: `${faitesDites}, ${refuseesDites}`, complet: false };
}

/**
 * Accorde en nombre le participe qui ouvre le geste
 *
 * Le geste est donné au pluriel — c'est le cas ordinaire d'un lot — et il peut
 * porter un complément : « rangées dans « Courses » ». Seul le participe
 * s'accorde, donc seul le premier mot est touché. « 1 charge supprimées » est
 * la faute qu'on évite, et elle se lit d'autant plus qu'elle paraît au moment
 * où l'on vérifie ce qui vient d'être fait.
 *
 * @param {string} geste - Au féminin pluriel
 * @param {number} nombre
 * @returns {string}
 */
function accorde(geste, nombre) {
  if (nombre > 1) return geste;

  const separation = geste.indexOf(' ');
  const participe = separation === -1 ? geste : geste.slice(0, separation);
  const reste = separation === -1 ? '' : geste.slice(separation);

  return (participe.endsWith('s') ? participe.slice(0, -1) : participe) + reste;
}
