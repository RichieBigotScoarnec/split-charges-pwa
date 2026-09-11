/**
 * FairSplit — Ce que la tête du bilan dit, selon la portée
 *
 * ─────────────────────────────────────────────────────────────────────
 * LA PROPRIÉTÉ : CHAQUE PORTÉE PORTE SA TÊTE — une fabrique, un gabarit
 *
 * Trois portées, trois têtes, et ce ne sont pas trois variantes d'un même
 * chiffre : chacune répond à SA question. La forme tentante était de rédiger
 * chaque tête dans sa branche de rendu — trois gabarits, trois façons de poser
 * un libellé, et le jour où l'un change, les deux autres gardent l'ancien.
 * C'est la règle 2 appliquée à un libellé. Ici, `teteDuBilan` décide ce que
 * chaque tête dit, et `gabaritDeTete` la dessine : le bilan et l'espace privé
 * lisent les mêmes deux fonctions.
 *
 * Ce que chaque portée met en tête — les planches 1 à 6, puis 12 à 16 :
 *
 *   À deux — la CRÉANCE : « Tu dois 66,94 € à Cindy » ;
 *   Moi    — « Il te reste 2 888,43 € à vivre » : un plafond, que le
 *            grand-livre qui suit rend vérifiable ligne par ligne ;
 *
 * Les deux premières portent l'encre de leur SENS (`SENS_DU_HEROS`) — et plus
 * l'ambre des planches, ni l'encre neutre de « Moi » : décision du foyer, le
 * 2026-09-11, parce que « Tu dois » et « Cindy te doit » ne sont pas la même
 * nouvelle et se ressemblaient.
 *   Privé  — AUCUN chiffre en tête : une phrase qui dit la règle.
 *
 * ─────────────────────────────────────────────────────────────────────
 * POURQUOI PRIVÉ N'A PAS DE HÉROS CHIFFRÉ — et l'argument est mécanique
 *
 * La portée vit en mémoire vive, précisément pour qu'un rechargement ne
 * rouvre pas cet écran (`utils/portee.js`, `porteeApresChangementDeMois`).
 * Un grand chiffre en tête du privé défait cette protection : le premier
 * regard par-dessus l'épaule le lirait avant tout le reste.
 *
 * ─────────────────────────────────────────────────────────────────────
 * « TU », ET QUI EST « TU »
 *
 * Les phrases sont dites à la personne qui tient le téléphone. `moi` est
 * l'emplacement du compte connecté — `emplacementCourant`, posé par `auth.js`.
 * Le sens du solde vient de `describeBalance`, par l'emplacement du débiteur,
 * et jamais d'un signe relu ici.
 *
 * Aucun DOM, aucune base : ce module répond, le rendu affiche.
 */

import { PORTEES, porteeRetenue } from './portee.js';
import { escapeHtml, formatCurrency } from './format.js';

/** Le libellé de chaque tête, relevé sur les planches 4, 12 et 13 */
const LIBELLES = Object.freeze({
  [PORTEES.DEUX]: 'Solde du mois',
  [PORTEES.SOLO]: 'Moi ce mois',
  [PORTEES.PRIVE]: 'Mon espace privé'
});

/**
 * Le verbe du reste, selon l'état du mois
 *
 * « Il te reste » ne se dit que d'un mois en cours : sur août, c'est ce qui
 * t'est resté ; sur le mois d'avance que propose le sélecteur, ce qui te
 * restera. Même raison, et même fabrique d'état, que le libellé du total
 * commun — « Dépensé à deux » n'est vrai que d'un mois commencé.
 */
const VERBE_DU_RESTE = Object.freeze({
  revolu: 'Il t\'est resté',
  'a-venir': 'Il te restera'
});

/**
 * La phrase qui ouvre le privé, selon ce que l'autre peut réellement lire
 *
 * « Cindy voit un total. Jamais ce que tu as acheté. » est la phrase de la
 * planche 13 — et elle n'est vraie que d'UN des trois réglages. Écrite pour
 * les trois, elle mentirait deux fois sur trois, sur l'écran où un mensonge
 * coûte le plus.
 */
const REGLE_DU_PRIVE = Object.freeze({
  rien: (autre) => `${autre} ne voit rien de cet espace — pas même un total.`,
  total: (autre) => `${autre} voit un total. Jamais ce que tu as acheté.`,
  detail: (autre) => `${autre} voit tout : chaque dépense, de chaque mois.`
});

/**
 * LE SENS DU HÉROS — deux encres, et une ASYMÉTRIE ASSUMÉE à zéro
 *
 * Décision du foyer, 2026-09-11. Deux sens, jamais trois :
 *
 *   À deux — dette > 0 → DÉFAVORABLE ; sinon → FAVORABLE.
 *   Moi    — reste > 0 → FAVORABLE ; sinon → DÉFAVORABLE.
 *
 * Pas de palier intermédiaire. Un troisième demanderait un montant arbitraire,
 * et surtout « Il te reste » est un PLAFOND — les dépenses privées n'y sont
 * pas : alerter à un seuil serait alerter sur un chiffre qu'on sait faux. Deux
 * couleurs disent un fait ; trois diraient un jugement que l'application n'a
 * pas les moyens de porter.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ⚠️ NE PAS « HARMONISER » LES DEUX ZÉROS. Ils ne disent pas la même chose, et
 * l'incohérence apparente est la décision.
 *
 *   À deux, 0,00 € → FAVORABLE. Le mois est soldé, personne ne doit rien :
 *     c'est l'état SAIN de l'application, pas une absence d'information. Le
 *     héros ne dit pas qui gagne ; il dit où l'on en est. Un neutre ferait
 *     passer un bon état pour une absence.
 *
 *   Moi, 0,00 € → DÉFAVORABLE. Il ne reste rien À VIVRE : ce n'est pas un
 *     équilibre. Et le chiffre est un plafond — zéro en plafond, c'est zéro au
 *     mieux, déjà négatif au pire. L'annoncer en vert serait annoncer en vert
 *     un chiffre qu'on sait optimiste.
 *
 * `tete-du-bilan.test.js`, « LES DEUX ZÉROS NE SONT PAS SYMÉTRIQUES », tombe si
 * on les aligne. S'il tombe, relire ce bloc avant de corriger le test.
 */
const SENS_DU_HEROS = Object.freeze({
  deux: (jeDois) => (jeDois ? 'defavorable' : 'favorable'),
  moi: (reste) => (reste > 0 ? 'favorable' : 'defavorable')
});

/**
 * Le libellé qui ouvre la tête, pour une portée
 *
 * Une portée inconnue retombe sur « À deux » par `porteeRetenue` — jamais sur
 * « Privé », pour la raison écrite dans `utils/portee.js`.
 *
 * @param {*} portee
 * @returns {string}
 */
export function libelleDeTete(portee) {
  return LIBELLES[porteeRetenue(portee)];
}

/**
 * Ce que la tête du bilan affiche
 *
 * @param {Object} p
 * @param {*} p.portee - La portée courante
 * @param {Object} [p.solde] - Sortie de `describeBalance` (À deux)
 * @param {number} [p.montant] - Le solde du mois, signé (À deux)
 * @param {'vous'|'conjointe'} [p.moi] - L'emplacement du compte connecté (À deux)
 * @param {Object} [p.moisPersonnel] - Sortie de `computeMoisPersonnel` (Moi)
 * @param {'revolu'|'en-cours'|'a-venir'|null} [p.etat] - Sortie de `etatDuMois` (Moi)
 * @param {string} [p.moisNomme] - Le mois en toutes lettres (Moi)
 * @param {'rien'|'total'|'detail'} [p.posture] - Sortie de `posturePartage` (Privé)
 * @param {string} [p.autre] - Le prénom de l'autre personne du foyer
 * @returns {{portee: string, libelle: string, ton: string, sens: string|null,
 *   avant: string, montant: number|null, apres: string, note: string}}
 *   `ton` règle la typographie — `creance`, `equilibre`, `epuise`, `neutre` ou
 *   `aucun-chiffre` ; `sens` règle l'encre — `favorable`, `defavorable`, ou
 *   `null` pour une tête sans chiffre. Les textes sont BRUTS, à échapper par
 *   l'appelant — `gabaritDeTete` le fait.
 */
export function teteDuBilan({
  portee, solde, montant, moi, moisPersonnel, etat, moisNomme, posture, autre
}) {
  const retenue = porteeRetenue(portee);
  const base = { portee: retenue, libelle: LIBELLES[retenue] };

  if (retenue === PORTEES.PRIVE) {
    // Sans posture connue — la lecture n'a pas abouti —, la phrase se limite à
    // ce qui est vrai des trois réglages.
    const regle = REGLE_DU_PRIVE[posture];
    return {
      ...base,
      ton: 'aucun-chiffre',
      // Aucun chiffre, donc aucun sens à peindre.
      sens: null,
      avant: regle ? regle(autre) : `Ce que ${autre} en voit, c'est toi qui le décides.`,
      montant: null,
      apres: '',
      // La planche ajoute « Quitter l'onglet referme les montants ». Ce n'est
      // pas vrai de cet écran aujourd'hui — les dépenses privées y sont
      // affichées en clair — et la phrase n'est donc pas écrite.
      note: 'Le refus vient du serveur, pas de l\'application : cet espace n\'est lisible '
        + 'que par ton compte, et toi seul peux en ouvrir l\'accès.'
    };
  }

  if (retenue === PORTEES.SOLO) {
    // Sans revenus, il n'y a rien à diviser : la tête le dit plutôt que
    // d'inventer un reste. Le 50-50 n'en demande aucun — ce versant est le
    // premier écran qui en ait besoin.
    if (!moisPersonnel || !moisPersonnel.disponible) {
      return {
        ...base, ton: 'aucun-chiffre', sens: null, avant: 'Ton reste à vivre attend tes revenus.',
        montant: null, apres: '', note: ''
      };
    }

    const reste = moisPersonnel.resteAVivre;
    const sens = SENS_DU_HEROS.moi(reste);

    // Un reste négatif ne se lit pas « il te reste −120 € » : c'est un
    // dépassement, et la phrase le nomme. Le montant reste positif, comme
    // celui de la créance — le sens est dans les mots et dans l'encre.
    if (reste < 0) {
      return {
        ...base, ton: 'neutre', sens, avant: 'Tu dépasses tes revenus de',
        montant: Math.abs(reste), apres: `en ${moisNomme}`, note: ''
      };
    }

    // Zéro : il ne reste RIEN à vivre. La phrase le dit, d'un seul tenant et
    // sans montant — « Il te reste 0,00 € » se lirait comme un reste. Le
    // grand-livre juste dessous montre le 0,00 €. `reste` est arrondi au
    // centime par `computeMoisPersonnel` : « zéro » veut dire moins d'un
    // demi-centime.
    if (reste === 0) {
      return {
        ...base, ton: 'epuise', sens, avant: `Il ne te reste rien à vivre en ${moisNomme}`,
        montant: null, apres: '', note: ''
      };
    }

    return {
      ...base,
      ton: 'neutre',
      sens,
      avant: VERBE_DU_RESTE[etat] || 'Il te reste',
      montant: reste,
      apres: `à vivre en ${moisNomme}`,
      note: ''
    };
  }

  // À deux. À zéro, la tête le DIT : `barre-solde.js` se tait tant que cette
  // carte est à l'écran, et un bilan qui ne porterait plus le solde dans un cas
  // laisserait « Comptes équilibrés » nulle part.
  if (!solde || !solde.emplacementDebiteur) {
    return {
      ...base,
      ton: 'equilibre',
      // Soldé est l'état sain : favorable (voir `SENS_DU_HEROS`, asymétrie assumée).
      sens: SENS_DU_HEROS.deux(false),
      avant: 'Comptes équilibrés',
      montant: null,
      apres: '',
      note: 'Rien à se rembourser.'
    };
  }

  const jeDois = solde.emplacementDebiteur === moi;
  return {
    ...base,
    ton: 'creance',
    sens: SENS_DU_HEROS.deux(jeDois),
    // Le montant est toujours positif : le sens est dans les mots, et un signe
    // moins devant une dette se lirait comme une dette négative.
    avant: jeDois ? 'Tu dois' : `${solde.debiteur} te doit`,
    montant: Math.abs(montant),
    apres: jeDois ? `à ${solde.crediteur}` : '',
    note: ''
  };
}

/**
 * La tête du bilan, dessinée — UN gabarit pour les trois portées
 *
 * Il ne rédige rien : tout vient de `teteDuBilan`. Le bilan (`summary.js`) et
 * l'espace privé (`prive.js`) l'appellent tous les deux ; deux gabarits de la
 * même carte divergeraient au premier correctif (règle 4).
 *
 * Les morceaux de la phrase — « Tu dois », le montant, « à Cindy » — sont des
 * éléments distincts d'une ligne qui S'ENROULE : à 320 px, les trois sur une
 * ligne en 54 px débordaient de 107 px (mesuré le 2026-09-11). Le montant,
 * lui, reste insécable. Les espaces entre les morceaux ne se voient pas — une
 * boîte flexible les ignore — mais restent dans le texte, pour qui le lit sans
 * le voir.
 *
 * ── LE TÉMOIN DE LA BARRE EST LA PHRASE, PAS LA CARTE ──
 *
 * `barre-solde.js` se tait tant que les deux tiers de `.summary-balance` sont à
 * l'écran. Posé sur la carte entière, grand-livre ouvert compris, il n'en
 * voyait qu'un tiers à 1280 × 720 et la barre répétait le solde juste au-dessus
 * de la phrase qui le disait (`data-flow:786`, mesuré rouge). Le témoin est
 * donc la plus petite surface qui contienne ce que la barre répéterait.
 *
 * @param {Object} tete - Sortie de `teteDuBilan`
 * @param {Object} [options]
 * @param {string} [options.temoin] - Classes INTERNES posées sur ce que la tête
 *   dit — jamais une donnée saisie : sur « À deux », `summary-balance`
 * @param {string} [options.dit] - Fragment déjà échappé, rendu avec la phrase
 * @param {string} [options.suite] - Fragment déjà échappé, rendu après elle
 * @returns {string} Fragment échappé
 */
export function gabaritDeTete(tete, { temoin = '', dit = '', suite = '' } = {}) {
  // La marque du sens se pose sur ce qui PORTE le chiffre : le montant, ou la
  // phrase quand il n'y en a pas — « Comptes équilibrés », « Il ne te reste
  // rien ». Une tête sans sens (Privé, revenus absents) n'en porte aucune.
  const avecSens = Boolean(tete.sens);
  const marqueSurLaPhrase = avecSens && tete.montant === null;
  const mot = (texte, porteur = false) => (texte
    ? `<span class="bilan-heros-mot${porteur ? ' bilan-heros-sens' : ''}">${escapeHtml(texte)}</span>`
    : '');
  const montant = tete.montant === null
    ? ''
    : `<strong class="bilan-heros-montant${avecSens ? ' bilan-heros-sens' : ''}">${formatCurrency(tete.montant)}</strong>`;
  const classeDuSens = avecSens ? ` bilan-heros--${escapeHtml(tete.sens)}` : '';

  return `
      <section class="bilan-heros bilan-heros--${escapeHtml(tete.ton)}${classeDuSens}" data-tete="${escapeHtml(tete.portee)}">
        <div class="bilan-heros-dit ${temoin}">
          <span class="bilan-tete">${escapeHtml(tete.libelle)}</span>
          <p class="bilan-heros-phrase">${mot(tete.avant, marqueSurLaPhrase)} ${montant} ${mot(tete.apres)}</p>
          ${tete.note ? `<p class="bilan-heros-note">${escapeHtml(tete.note)}</p>` : ''}
          ${dit}
        </div>
        ${suite}
      </section>`;
}
