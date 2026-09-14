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
