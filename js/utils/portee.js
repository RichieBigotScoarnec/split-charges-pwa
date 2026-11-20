/**
 * FairSplit — Sur quel argent l'écran porte
 *
 * Deux axes orthogonaux, et c'est toute la décision de navigation :
 *
 *     la TÂCHE   — Bilan / Charges / Réglages, la barre du bas
 *     la PORTÉE  — À deux / Solo / Privé, un sélecteur sous le mois
 *
 * La portée n'est pas une quatrième destination. C'est un filtre : elle dit sur
 * quel argent la tâche courante s'exerce. Les trois identifiants de panneau,
 * leurs `data-panneau` et la classe `.onglet` ne bougent pas, et
 * `allerAuPanneau` ne change ni de nom ni de destinations.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE MODULE NE TOUCHE NI AU DOM NI À LA BASE
 *
 * Il ne fait que répondre à trois questions : cette valeur est-elle une portée,
 * laquelle retenir quand on en demande une douteuse, et ce panneau en a-t-il
 * une. La surface qui les pose est le lot suivant ; les écrire d'abord, ici,
 * garantit qu'il n'y aura **qu'une** fabrique quand deux panneaux la liront.
 *
 * Deux fabriques d'une même grandeur finissent toujours par diverger, et le
 * second calcul paraît toujours plus simple sur le moment. Celui-ci est écrit
 * avant qu'il y ait une occasion d'en écrire un second.
 *
 * ─────────────────────────────────────────────────────────────────────
 * `PANNEAUX_AVEC_PORTEE` N'EST PAS EXPORTÉE, ET C'EST DÉLIBÉRÉ
 *
 * La propriété qui compte — « Réglages n'a pas de portée » — doit être éprouvée
 * par le COMPORTEMENT, pas par la lecture de la liste qui le décide. Un test qui
 * importerait la liste et constaterait que `panneauReglages` n'y figure pas
 * relirait la source au lieu de mesurer l'effet : il survivrait à la
 * suppression du bloc qui s'en sert, et tomberait sur un simple renommage.
 *
 * En la gardant privée, la seule façon de l'éprouver est d'appeler les
 * fonctions avec des identifiants nommés dans le test — ce qui est exactement
 * ce qu'on veut tenir.
 */

import { chargesCommunes, chargesSolo, totalDesCharges, PERSONNES } from './perimetre.js';

/**
 * Les trois portées, et rien d'autre
 *
 * Les valeurs sont celles qu'écrit déjà `utils/perimetre.js` pour une charge
 * (`commun` / `solo`) — non, justement : elles en DIFFÈRENT, et il faut le
 * dire. `perimetre.js` classe une CHARGE ; ce module choisit une VUE. Une vue
 * « à deux » montre les charges de périmètre `commun`, une vue « solo » montre
 * les charges `solo` de la personne connectée, et la vue « privé » ne lit même
 * pas le même arbre. Le vocabulaire est séparé parce que les objets le sont.
 */
export const PORTEES = Object.freeze({
  DEUX: 'deux',
  SOLO: 'solo',
  PRIVE: 'prive'
});

/**
 * Ce que l'application montre quand personne n'a rien demandé
 *
 * « À deux », parce que c'est la question à laquelle l'application répond. Le
 * même raisonnement que la barre d'onglets, qui ouvre sur le bilan.
 */
export const PORTEE_PAR_DEFAUT = PORTEES.DEUX;

/**
 * Le nom que l'écran donne à chaque portée
 *
 * Il vivait dans `SEGMENTS`, privé de `modules/selecteur-portee.js`, et c'était
 * juste tant que le sélecteur était le seul à le prononcer. Le lot P2 lui donne
 * un second lecteur : le renvoi en pied de liste, qui doit dire OÙ sont parties
 * les dépenses personnelles qu'il vient de retirer de la vue.
 *
 * Deux rédactions du même nom divergeraient — et la moins à jour enverrait
 * quelqu'un chercher un segment qui ne s'appelle plus comme ça. Le nom vit donc
 * ici, dans le module qui décide ce qu'une portée est, et le sélecteur le lit.
 */
export const LIBELLES_DE_PORTEE = Object.freeze({
  [PORTEES.DEUX]: 'À deux',
  [PORTEES.SOLO]: 'Moi ce mois',
  [PORTEES.PRIVE]: 'Privé'
});

/**
 * Le nom d'une portée, celui de « À deux » pour une valeur inconnue
 *
 * @param {*} portee
 * @returns {string}
 */
export function libelleDeLaPortee(portee) {
  return LIBELLES_DE_PORTEE[porteeRetenue(portee)];
}

/** Les panneaux sur lesquels une portée a un sens. Volontairement privée. */
const PANNEAUX_AVEC_PORTEE = Object.freeze(['panneauBilan', 'panneauCharges']);

/**
 * Cette valeur est-elle une portée ?
 *
 * @param {*} valeur
 * @returns {boolean}
 */
export function porteeValide(valeur) {
  return Object.values(PORTEES).includes(valeur);
}

/**
 * La portée à retenir pour une demande, valide ou non
 *
 * Une demande inconnue retombe sur « à deux » plutôt que de lever : la portée
 * peut venir d'un état plus ancien, d'une clé absente au premier rendu, ou d'un
 * lien recopié à la main. Montrer le commun est toujours un comportement juste.
 *
 * **Et le repli n'est jamais « privé ».** C'est la seule des trois dont
 * l'ouverture par accident aurait un coût : elle affiche à l'écran ce que le
 * foyer a rangé hors de la vue de l'autre. Le repli va donc vers la portée la
 * moins révélatrice, pas vers la dernière connue.
 *
 * @param {*} demandee
 * @returns {string} Une valeur de `PORTEES`
 */
export function porteeRetenue(demandee) {
  return porteeValide(demandee) ? demandee : PORTEE_PAR_DEFAUT;
}

/**
 * Ce panneau porte-t-il un sélecteur de portée ?
 *
 * `panneauReglages` n'en porte pas : ses réglages sont ceux du FOYER — les
 * revenus, la règle de partage, les rappels, les outils. Aucun d'eux ne change
 * selon qu'on regarde le commun, le solo ou le privé, et un sélecteur qui ne
 * gouverne rien enseigne que la moitié des commandes ne font rien.
 *
 * Un identifiant inconnu rend `false` : on n'invente pas une portée pour une
 * surface qu'on ne connaît pas.
 *
 * @param {string} idPanneau
 * @returns {boolean}
 */
export function panneauPorteLaPortee(idPanneau) {
  return PANNEAUX_AVEC_PORTEE.includes(idPanneau);
}

/**
 * La portée qui s'applique à un panneau, ou `null` s'il n'en a pas
 *
 * `null` et non `PORTEE_PAR_DEFAUT` : « ce panneau n'a pas de portée » et « ce
 * panneau est en portée À deux » sont deux états différents, et les confondre
 * ferait peindre un segment actif sur un écran qui n'a pas de segments.
 *
 * @param {string} idPanneau
 * @param {*} porteeCourante
 * @returns {string|null}
 */
export function porteeDuPanneau(idPanneau, porteeCourante) {
  if (!panneauPorteLaPortee(idPanneau)) return null;
  return porteeRetenue(porteeCourante);
}

/**
 * Ce que devient la portée quand on change de mois
 *
 * ─────────────────────────────────────────────────────────────────────
 * DÉCISION — ELLE PERSISTE. Prise le 2026-09-06, et elle se reposerait.
 *
 * Deux comportements défendables, et ce n'est pas un détail : ils produisent
 * deux applications différentes.
 *
 *   - se réinitialiser à « À deux » — le mois qu'on ouvre pose la question à
 *     laquelle l'application répond ;
 *   - persister — la portée est un point de vue, pas une propriété du mois.
 *
 * **Persister est retenu**, et le dépôt avait déjà tranché la même question
 * sous un autre nom. `onglets.js` distingue deux échelles : l'onglet de départ
 * vient du BALISAGE et non d'une session précédente — « ouvrir l'application
 * doit poser la question à laquelle elle répond » — mais la position de
 * défilement, elle, EST retenue d'un panneau à l'autre, parce que l'aller-retour
 * est le geste d'une session de vérification et que le punir à chaque passage
 * rend l'application hostile.
 *
 * Changer de mois est cette seconde échelle. Regarder son solo en septembre,
 * reculer d'un mois pour le comparer à août, revenir : c'est un seul geste. Le
 * ramener trois fois à « À deux » ferait payer la comparaison.
 *
 * L'autre échelle est tenue gratuitement : cette portée vit en mémoire vive,
 * dans `state.js`. Un rechargement rouvre donc sur « À deux » sans qu'aucune
 * ligne ne s'en occupe — ce qui est le comportement voulu, et particulièrement
 * pour « Privé » : rouvrir l'application directement sur l'espace privé
 * l'exposerait au premier regard par-dessus l'épaule.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE QUE CETTE DÉCISION NE DIT PAS
 *
 * Elle porte sur la PORTÉE, jamais sur le dévoilement des montants privés.
 * Celui-ci se referme de son côté, et il n'a pas à suivre la même règle : rester
 * dans la portée « Privé » d'un mois à l'autre est un point de vue, garder les
 * chiffres à découvert en est un autre. Le second appartient au lot qui rendra
 * cet écran.
 *
 * @param {*} porteeCourante
 * @returns {string} La portée à appliquer au mois qu'on affiche
 */
export function porteeApresChangementDeMois(porteeCourante) {
  return porteeRetenue(porteeCourante);
}

/**
 * Les portées qui rappellent le solde commun dans la barre collante.
 * Volontairement privée, comme `PANNEAUX_AVEC_PORTEE` : la propriété s'éprouve
 * par `porteeRappelleLeSolde`, jamais par la lecture de cette liste.
 */
const PORTEES_QUI_RAPPELLENT_LE_SOLDE = Object.freeze([PORTEES.DEUX, PORTEES.SOLO]);

/**
 * Cette portée rappelle-t-elle le solde commun dans la barre collante ?
 *
 * ─────────────────────────────────────────────────────────────────────
 * « À DEUX » ET « MOI », JAMAIS « PRIVÉ » — vu à l'écran par le foyer, 2026-09-11
 *
 * La barre rappelle « qui doit combien à qui » pendant qu'on fait défiler. Sur
 * « Moi », le rappel a du sens : on regarde son reste à vivre, et la dette
 * commune en est l'autre moitié. Sur « Privé », il n'en a aucun — la portée ne
 * porte aucune créance, et son écran dit en toutes lettres que l'autre n'y voit
 * rien. « Richard doit 145,37 € à Cindy » s'y affichait en haut d'écran : le
 * seul chiffre du couple, sur l'écran qui promet de n'en montrer aucun de
 * l'autre.
 *
 * Une liste DÉCLARÉE plutôt qu'une condition dans le rendu : la règle se lit
 * ici, s'éprouve ici (`portee.test.js`) et sur la page
 * (`barre-par-portee.spec.js`), et une portée ajoutée demain devra dire si elle
 * la porte.
 *
 * Une valeur inconnue suit `porteeRetenue` — « à deux » — et garde donc la
 * barre : une dette ne disparaît pas de l'écran par accident.
 *
 * @param {*} portee
 * @returns {boolean}
 */
export function porteeRappelleLeSolde(portee) {
  return PORTEES_QUI_RAPPELLENT_LE_SOLDE.includes(porteeRetenue(portee));
}

/** Les portées sous lesquelles le panneau Bilan montre les chiffres du foyer */
const PORTEES_QUI_MONTRENT_LE_FOYER = Object.freeze([PORTEES.DEUX]);

/**
 * Le panneau Bilan montre-t-il le foyer sous cette portée ?
 *
 * ─────────────────────────────────────────────────────────────────────
 * « À DEUX » SEULEMENT — décision du foyer, 2026-09-11
 *
 * La portée gouverne TOUT le panneau, pas seulement sa tête. « Moi ce mois »
 * veut dire « cet écran parle de moi » : une carte qui affiche les chiffres du
 * couple dessous fait mentir le segment — le défaut même que la barre
 * collante avait sur « Privé ». Et sur « Privé », une carte du couple serait
 * une fuite de contexte.
 *
 * Mesuré avant la règle : sous « Moi » comme sous « Privé », les quatre
 * cartes du bilan affichaient les catégories du FOYER. Aucune n'avait
 * d'équivalent personnel ; aucune ne se taisait.
 *
 * Le panneau lit cette déclaration et la porte (`data-lecture`) ; la feuille
 * de style fait taire toute carte qui ne se déclare pas personnelle. C'est
 * un refus PAR DÉFAUT : une carte ajoutée demain n'a rien à faire pour être
 * protégée, seulement quelque chose à déclarer pour paraître.
 *
 * Une valeur inconnue suit `porteeRetenue` — « à deux » : l'écran s'ouvre
 * alors sur le foyer, et ses cartes le suivent.
 *
 * @param {*} portee
 * @returns {boolean}
 */
export function porteeMontreLeFoyer(portee) {
  return PORTEES_QUI_MONTRENT_LE_FOYER.includes(porteeRetenue(portee));
}

/**
 * CE QUE CHAQUE PORTÉE MONTRE DE LA LISTE — une seule déclaration
 *
 * Le lot P2 portait une LISTE de portées qui filtrent, plus un unique
 * comportement (`chargesCommunes`) écrit dans la fonction. C'était juste tant
 * qu'il n'y avait qu'un comportement ; à deux, la liste et les comportements
 * seraient deux déclarations du même fait, et la première divergence serait une
 * portée inscrite dans la liste que personne n'a câblée — filtrée par un
 * comportement absent, donc rendue vide sans un mot.
 *
 * La table est donc la SEULE déclaration : `porteeFiltreLaListe` lit ses clés,
 * `chargesDeLaPortee` lit ses valeurs. Une portée absente ne filtre pas.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ELLE LIT LE PÉRIMÈTRE, JAMAIS LE PAYEUR — le seul défaut de ce lot qui
 * coûterait des euros
 *
 * Une charge payée par une personne **et partagée** est COMMUNE
 * (`perimetre.js`, « `paidBy` dit qui a AVANCÉ l'argent, jamais à qui la
 * dépense APPARTIENT »). Un filtre qui déduirait le périmètre du payeur
 * retirerait de la liste du foyer des dépenses qui pèsent bel et bien sur le
 * solde — en silence, puisque le solde, lui, continuerait de les compter.
 *
 * Les deux valeurs de la table ne connaissent donc que `chargesCommunes` et
 * `chargesSolo`, et le jeu d'essai porte les quatre couples payeur × périmètre
 * SOUS LES DEUX PORTÉES : trois des quatre ne séparent pas les deux lectures.
 *
 * ─────────────────────────────────────────────────────────────────────
 * « MOI CE MOIS » EST LE PERSONNEL DE LA PERSONNE CONNECTÉE, ET `moi` EST
 * OBLIGATOIRE
 *
 * Depuis le lot P1b, `poches.js` fusionne dans l'état le personnel de l'autre
 * quand un aval le rend lisible. Un filtre qui ne connaîtrait pas `moi`
 * rendrait donc `chargesSolo(liste)` — TOUT le personnel lisible —, et
 * « Moi ce mois » afficherait les dépenses de l'autre. C'est très exactement ce
 * que le renvoi de P2 refuse déjà : « Moi ce mois » est MON écran.
 *
 * Sans emplacement lisible, la liste est **vide** et non complète. Ce n'est pas
 * de la prudence décorative : un écran vide est un défaut qu'on VOIT — la
 * personne a trois dépenses et n'en voit aucune —, la poche de l'autre affichée
 * est une fuite que personne ne voit. Entre un défaut visible et une fuite
 * silencieuse, on prend le visible.
 */
const FILTRE_DE_LA_PORTEE = Object.freeze({
  [PORTEES.DEUX]: (charges) => chargesCommunes(charges),
  [PORTEES.SOLO]: (charges, moi) => (PERSONNES.includes(moi) ? chargesSolo(charges, moi) : [])
});

/**
 * Les charges qu'une portée montre dans la liste
 *
 * @param {Array<Object>} charges
 * @param {*} portee
 * @param {'vous'|'conjointe'} [moi] - OBLIGATOIRE sous « Moi ». Voir ci-dessus.
 * @returns {Array<Object>} La liste telle quelle quand la portée ne filtre pas
 */
export function chargesDeLaPortee(charges, portee, moi) {
  const liste = Array.isArray(charges) ? charges : [];
  const filtre = FILTRE_DE_LA_PORTEE[porteeRetenue(portee)];
  return filtre ? filtre(liste, moi) : liste;
}

/**
 * Cette portée retire-t-elle des charges de la liste ?
 *
 * Le renvoi en pied et l'état vide en dépendent. Elle lit les CLÉS de la table
 * ci-dessus : une portée qui filtre est une portée qui a un comportement, et
 * il n'y a pas de seconde liste à tenir d'accord avec la première.
 *
 * @param {*} portee
 * @returns {boolean}
 */
export function porteeFiltreLaListe(portee) {
  return Boolean(FILTRE_DE_LA_PORTEE[porteeRetenue(portee)]);
}

/**
 * LES DEUX NATURES DE RENVOI, ET POURQUOI IL EN FAUT DEUX
 *
 * Sous « À deux », ce que le filtre retire est MON PERSONNEL : le renvoi le
 * compte, le chiffre, et nomme où il est rangé. Sous « Moi », ce qu'il retire
 * est LE COMMUN — et le renvoi de P2 ne sait pas le dire. Rendu « symétrique »,
 * il aurait annoncé « 3 dépenses perso (45,00 €) — rangées dans "Moi ce
 * mois" » **sur l'écran « Moi ce mois »** : un compte de ce qui est affiché,
 * et une destination qui est l'écran où l'on se trouve déjà. Mesuré, parce que
 * la porte est mécanique : `renvoiDeLaPortee` s'ouvre sur
 * `porteeFiltreLaListe`, donc inscrire « Moi » dans la table ci-dessus allume
 * le renvoi tout seul.
 *
 * Deux natures, donc, et la nature — jamais un compte — décide de ce qui
 * s'affiche.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CELLE DU COMMUN NE PORTE AUCUN CHIFFRE, ET C'EST UNE DÉCISION
 *
 * Le montant de ma part du commun est déjà à l'écran, deux cartes plus haut,
 * dans le grand-livre de « Moi » (`summary.js`, `suiteDeMoi`) — ouvert en
 * permanence, décision prise avec son prix mesuré. Le répéter en pied n'achète
 * rien. Ce qui manquait n'était pas un chiffre : c'était une ADRESSE. Un
 * agrégat ne répond pas à « où est passée ma course de 122,07 € ».
 *
 * Une phrase, une destination, zéro nombre.
 */
export const NATURES_DE_RENVOI = Object.freeze({
  /** Rien à annoncer : la portée ne retire rien, ou rien qui m'appartienne. */
  AUCUNE: null,
  /** « À deux » : mes dépenses personnelles, comptées et chiffrées. */
  MON_PERSONNEL: 'mon-personnel',
  /** « Moi » : le commun n'est pas dans cette liste. Sans chiffre. */
  LE_COMMUN: 'le-commun'
});

/** Ce qu'on rend quand il n'y a rien à annoncer. Aucun nombre, aucune nature. */
const RENVOI_VIDE = Object.freeze({
  nature: NATURES_DE_RENVOI.AUCUNE, nombre: 0, total: 0,
  versLaPortee: PORTEES.SOLO, libelle: LIBELLES_DE_PORTEE[PORTEES.SOLO]
});

/**
 * Ce que la portée courante retire de la liste, et où c'est parti
 *
 * ─────────────────────────────────────────────────────────────────────
 * SOUS « À DEUX », COMPTÉ SUR MES SEULES DÉPENSES
 *
 * Sous un aval actif, la liste du foyer porte aussi les dépenses personnelles
 * de l'autre. Le filtre les retire elles aussi, et elles n'ont PAS de renvoi :
 * elles n'appartiennent pas à « Moi ce mois », qui est mon écran. Leur place
 * est la fenêtre en lecture seule de P3, qui n'existe pas encore — trou de P3,
 * consigné plutôt que comblé. Aucun aval n'est actif aujourd'hui, donc le cas
 * est d'école.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SOUS « MOI », SEULEMENT SI LE MOIS PORTE DU COMMUN
 *
 * « Les dépenses communes ne sont pas dans cette liste » sur un mois qui n'en
 * porte aucune annonce l'absence de rien. Même discipline que le volet
 * personnel du total — « seulement s'il existe » — et même effet : le renvoi
 * n'est pas une constante, donc un contrôle peut le faire tomber.
 *
 * @param {Array<Object>} charges - La liste ENTIÈRE du mois, avant filtrage
 * @param {*} portee
 * @param {'vous'|'conjointe'} moi - L'emplacement du compte connecté
 * @returns {{nature: string|null, nombre: number, total: number,
 *   versLaPortee: string, libelle: string}}
 */
export function renvoiDeLaPortee(charges, portee, moi) {
  const retenue = porteeRetenue(portee);
  if (!porteeFiltreLaListe(retenue)) return RENVOI_VIDE;

  const actives = (Array.isArray(charges) ? charges : [])
    .filter(charge => charge && !charge.deleted);

  if (retenue === PORTEES.SOLO) {
    if (chargesCommunes(actives).length === 0) return RENVOI_VIDE;
    return {
      nature: NATURES_DE_RENVOI.LE_COMMUN,
      // Zéro, et pas « le total du commun » : ce qu'on ne calcule pas ne peut
      // pas s'afficher par accident. La décision « aucun chiffre » est dans la
      // donnée, pas seulement dans la rédaction qui la lit.
      nombre: 0,
      total: 0,
      versLaPortee: PORTEES.DEUX,
      libelle: LIBELLES_DE_PORTEE[PORTEES.DEUX]
    };
  }

  const miennes = chargesSolo(actives, moi);
  if (miennes.length === 0) return RENVOI_VIDE;

  return {
    nature: NATURES_DE_RENVOI.MON_PERSONNEL,
    nombre: miennes.length,
    total: totalDesCharges(miennes),
    versLaPortee: PORTEES.SOLO,
    libelle: LIBELLES_DE_PORTEE[PORTEES.SOLO]
  };
}
