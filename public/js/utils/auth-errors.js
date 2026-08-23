/**
 * FairSplit — Traduction des échecs d'authentification
 *
 * Firebase renvoie ses erreurs en anglais, dans les termes de son API :
 * « Unable to establish a connection with the popup. It may have been blocked
 * by the browser. (auth/popup-blocked). » Le message dit vrai, mais il dit
 * seulement ce qui s'est passé — jamais quoi faire — et il le dit dans une
 * langue qui n'est pas celle de l'application.
 *
 * Un échec de connexion est le pire endroit où laisser quelqu'un sans issue :
 * il est dehors, et rien à l'écran ne lui indique comment rentrer.
 *
 * Chaque message nomme donc le geste qui débloque. Le cas non prévu conserve le
 * texte d'origine et son code : mieux vaut de l'anglais lisible qu'un « une
 * erreur est survenue » qui ne permet à personne de comprendre, ni à distance
 * ni après coup.
 */

/**
 * Messages par code Firebase.
 *
 * Le blocage de fenêtre est le cas courant sur téléphone : les navigateurs
 * mobiles bloquent les fenêtres surgissantes par défaut, et l'application est
 * servie depuis GitHub Pages, où le parcours par redirection n'est pas une
 * solution de repli fiable — le domaine d'authentification y est un tiers.
 */
const MESSAGES = {
  'auth/popup-blocked':
    'Votre navigateur a bloqué la fenêtre de connexion Google. Autorisez les '
    + 'fenêtres pop-up pour ce site — le bandeau en haut de l\'écran propose '
    + '« Toujours afficher » — puis réessayez.',

  'auth/operation-not-supported-in-this-environment':
    'Ce navigateur n\'accepte pas la connexion Google depuis cette page. '
    + 'Essayez avec votre adresse e-mail et votre mot de passe.',

  'auth/web-storage-unsupported':
    'Ce navigateur bloque le stockage nécessaire à la connexion. Désactivez la '
    + 'navigation privée ou le blocage des cookies pour ce site.',

  'auth/network-request-failed':
    'Réseau injoignable. Vérifiez votre connexion, puis réessayez.',

  'auth/too-many-requests':
    'Trop de tentatives. Patientez quelques minutes avant de réessayer.',

  'auth/invalid-email':
    'Adresse e-mail invalide.',

  'auth/user-disabled':
    'Ce compte est désactivé.',

  // Firebase ne distingue plus l'adresse inconnue du mot de passe faux, pour ne
  // pas révéler quels comptes existent. Le message n'en dit donc pas plus.
  'auth/invalid-credential': 'Adresse ou mot de passe incorrect.',
  'auth/wrong-password': 'Adresse ou mot de passe incorrect.',
  'auth/user-not-found': 'Adresse ou mot de passe incorrect.',

  'auth/weak-password':
    'Mot de passe trop court : six caractères au minimum.',

  'auth/email-already-in-use':
    'Un compte existe déjà avec cette adresse.'
};

/**
 * Codes qui ne décrivent pas un échec, mais un geste de l'utilisateur.
 *
 * Fermer la fenêtre de connexion, ou en rouvrir une seconde, n'est pas une
 * panne : afficher une erreur rouge pour cela apprend à ignorer les erreurs
 * rouges.
 */
const GESTES_UTILISATEUR = [
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request'
];

/**
 * L'échec vient-il d'un geste de l'utilisateur plutôt que d'une panne ?
 *
 * @param {{code?: string}} erreur - Erreur remontée par Firebase
 * @returns {boolean}
 */
export function estUnGesteUtilisateur(erreur) {
  return GESTES_UTILISATEUR.includes(erreur?.code);
}

/**
 * Message affichable pour un échec d'authentification
 *
 * @param {{code?: string, message?: string}} erreur - Erreur remontée par Firebase
 * @returns {string} Message en français, nommant le geste qui débloque
 */
export function messageErreurAuth(erreur) {
  const connu = MESSAGES[erreur?.code];
  if (connu) return connu;

  // Cas non prévu : on ne masque rien. Le code sert au diagnostic à distance,
  // le texte d'origine reste la seule description disponible.
  const code = erreur?.code ? ` (${erreur.code})` : '';
  const texte = erreur?.message || String(erreur ?? 'cause inconnue');
  return `Connexion impossible${code} : ${texte}`;
}
