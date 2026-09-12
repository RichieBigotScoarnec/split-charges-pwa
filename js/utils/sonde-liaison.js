/**
 * FairSplit — Savoir pourquoi la base ne répond pas
 *
 * Le bandeau sait dire que la liaison est rompue. Il ne sait pas dire
 * *pourquoi*, et trois causes très différentes produisent exactement le même
 * écran :
 *
 * 1. la session a expiré — le jeton d'authentification ne se renouvelle plus,
 *    et Realtime Database attend ce jeton avant même d'ouvrir sa liaison ;
 * 2. le jeton s'obtient, mais la base le refuse — règles, compte non autorisé ;
 * 3. tout est valide, et seul le transport est bloqué — Realtime Database parle
 *    par WebSocket, qu'un pare-feu, un opérateur ou un proxy peut couper sans
 *    toucher au HTTPS ordinaire.
 *
 * Chacune appelle un remède différent, et deux d'entre eux sont inutiles voire
 * nuisibles pour les autres cas. On a passé des heures à supposer ; ce module
 * mesure.
 *
 * Il procède en deux temps, sur le chemin le plus court possible :
 * renouveler le jeton de force, puis s'en servir pour une lecture HTTPS d'un
 * seul champ. Le tableau se lit alors sans ambiguïté :
 *
 * | jeton   | lecture HTTPS | cause                                  |
 * |---------|---------------|----------------------------------------|
 * | échoue  | —             | session expirée : se reconnecter       |
 * | obtenu  | 200           | jeton et règles bons : transport bloqué|
 * | obtenu  | 401 / 403     | la base refuse ce compte               |
 * | obtenu  | pas de réponse| l'hôte est hors d'atteinte             |
 *
 * Le jeton n'est jamais journalisé, jamais rendu, jamais conservé : c'est un
 * secret de courte durée qui ouvre l'accès aux comptes du foyer. Seule sa
 * longueur est notée, ce qui suffit à prouver qu'il existe.
 */

import { noter } from './diagnostics.js';

/**
 * Délai au-delà duquel une étape est tenue pour perdue, en millisecondes
 *
 * Court : on ne cherche pas à aboutir, on cherche à savoir. Un diagnostic qui
 * met trente secondes à conclure « toujours rien » ne vaut pas mieux que pas
 * de diagnostic.
 */
const DELAI_MS = 8000;

/**
 * Borne l'attente d'une promesse
 *
 * `getIdToken` ne rend pas toujours la main : quand la couche réseau est
 * bloquée, il attend sans limite. Un diagnostic qui n'aboutit jamais ne
 * diagnostique rien — et c'est précisément dans ce cas-là qu'on l'appelle.
 *
 * @param {Promise} promesse
 * @param {number} delaiMs
 * @param {string} quoi - Nommé dans le message, faute de quoi l'échec est muet
 * @returns {Promise<*>}
 */
function avecDelai(promesse, delaiMs, quoi) {
  return new Promise((resoudre, rejeter) => {
    const minuteur = setTimeout(
      () => rejeter(new Error(`${quoi} sans réponse après ${delaiMs / 1000} s`)),
      delaiMs
    );

    promesse.then(
      (valeur) => { clearTimeout(minuteur); resoudre(valeur); },
      (erreur) => { clearTimeout(minuteur); rejeter(erreur); }
    );
  });
}

/**
 * Renouvelle le jeton d'authentification, et dit ce qui s'est passé
 *
 * Le renouvellement est forcé. Sans cela, Firebase rend le jeton qu'il garde en
 * mémoire — valide une heure — et l'on ne saurait rien de ce qui compte : la
 * capacité à en obtenir un *nouveau*. C'est elle qui manque quand une session
 * a expiré, et c'est elle que Realtime Database exige pour se connecter.
 *
 * @param {Object} utilisateur - `auth.currentUser`
 * @param {number} [delaiMs]
 * @returns {Promise<{ok: boolean, ms: number, taille: number, motif: string|null, jeton: string|null}>}
 */
export async function renouvelerLeJeton(utilisateur, delaiMs = DELAI_MS) {
  const debut = Date.now();

  if (!utilisateur || typeof utilisateur.getIdToken !== 'function') {
    return { ok: false, ms: 0, taille: 0, motif: 'aucune session ouverte', jeton: null };
  }

  try {
    const jeton = await avecDelai(utilisateur.getIdToken(true), delaiMs, 'Renouvellement du jeton');
    const taille = typeof jeton === 'string' ? jeton.length : 0;

    if (taille === 0) {
      return { ok: false, ms: Date.now() - debut, taille: 0, motif: 'jeton vide', jeton: null };
    }

    return { ok: true, ms: Date.now() - debut, taille, motif: null, jeton };
  } catch (erreur) {
    return {
      ok: false,
      ms: Date.now() - debut,
      taille: 0,
      motif: erreur?.message || String(erreur),
      jeton: null
    };
  }
}

/**
 * Lit un champ de la base en HTTPS ordinaire, avec le jeton
 *
 * Realtime Database expose la même base en REST et en WebSocket, derrière les
 * mêmes règles. Une lecture REST qui aboutit prouve donc trois choses d'un
 * coup : l'hôte répond, le jeton est valide, et les règles laissent passer ce
 * compte. Si la liaison ne s'établit pourtant pas, il ne reste que le
 * transport.
 *
 * Le jeton voyage en paramètre d'adresse : c'est le mécanisme documenté par
 * Realtime Database pour un jeton d'identité Firebase, et la requête part en
 * HTTPS. L'adresse n'est ni journalisée ni conservée.
 *
 * @param {Object} options
 * @param {string} options.base - `databaseURL`
 * @param {string} options.chemin - Chemin absolu, racine comprise
 * @param {string} options.jeton
 * @param {number} [options.delaiMs]
 * @param {Function} [options.recuperer] - `fetch`, injectable pour les bancs d'essai
 * @returns {Promise<{statut: number|null, ms: number, motif: string|null}>}
 */
export async function lireEnHttps({ base, chemin, jeton, delaiMs = DELAI_MS, recuperer }) {
  const debut = Date.now();
  const aller = typeof recuperer === 'function'
    ? recuperer
    : (typeof fetch === 'function' ? fetch.bind(globalThis) : null);

  if (!aller || !base || !jeton) {
    return { statut: null, ms: 0, motif: 'sondage impossible' };
  }

  const abandon = typeof AbortController === 'function' ? new AbortController() : null;
  const minuteur = abandon ? setTimeout(() => abandon.abort(), delaiMs) : null;

  try {
    // `shallow=true` : on veut un code de réponse, pas des données. Sur une
    // valeur simple il ne change rien ; sur un nœud il évite de rapatrier des
    // montants pour un diagnostic qui n'en a que faire.
    // Le jeton voyage en en-tête, jamais dans l'adresse.
    //
    // `?auth=` est le mécanisme hérité des *database secrets* ; Realtime
    // Database accepte `Authorization: Bearer` depuis longtemps, et rend le
    // même code de réponse — le diagnostic garde donc exactement son pouvoir
    // de discrimination.
    //
    // Le commentaire ci-dessus affirmait « L'adresse n'est ni journalisée ni
    // conservée ». C'était vrai de l'application, et faux de l'environnement.
    // Une query string ressort par deux endroits qu'on ne contrôle pas :
    // `performance.getEntriesByType('resource')`, qui l'expose à tout script
    // de l'origine et l'y laisse après coup, et les journaux de tout proxy
    // qui déchiffre le TLS. Or cette sonde ne part *que* si la liaison est
    // rompue — c'est-à-dire précisément dans le cas d'un tunnel d'entreprise,
    // que `docs/compte-de-test.md` documente sur ces postes. Le jeton partait
    // donc de préférence là où il risquait d'être lu.
    const reponse = await aller(
      `${base}/${chemin}.json?shallow=true`,
      {
        method: 'GET',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${jeton}` },
        referrerPolicy: 'no-referrer',
        signal: abandon ? abandon.signal : undefined
      }
    );

    return { statut: reponse.status, ms: Date.now() - debut, motif: null };
  } catch (erreur) {
    return {
      statut: null,
      ms: Date.now() - debut,
      motif: erreur?.name === 'AbortError'
        ? `abandon après ${delaiMs / 1000} s`
        : (erreur?.message || String(erreur))
    };
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }
}

/**
 * Ce que les deux mesures disent, en une phrase
 *
 * Rendue à part du journal pour être vérifiable : c'est la lecture du tableau
 * en tête de module, et c'est elle qui doit être juste.
 *
 * @param {{ok: boolean}} jeton - Issue de `renouvelerLeJeton`
 * @param {{statut: number|null}|null} lecture - Issue de `lireEnHttps`, ou null si non tentée
 * @returns {string}
 */
export function conclusion(jeton, lecture) {
  return PHRASES[causeDeLaPanne(jeton, lecture)]
    || `réponse inattendue de la base (${lecture && lecture.statut})`;
}

/**
 * Ce que chaque cause se dit, pour le journal
 *
 * Le code sert au programme, la phrase à qui lit le journal. Les séparer évite
 * qu'une reformulation ne casse une comparaison de chaînes ailleurs.
 */
const PHRASES = {
  'session-expiree': 'session expirée : le jeton ne se renouvelle plus, se reconnecter',
  'hote-muet': 'jeton obtenu, mais l\'hôte n\'a pas répondu en HTTPS',
  'refus': 'jeton obtenu mais refusé par la base : règles ou compte',
  'transport': 'jeton et règles bons, la base répond en HTTPS : seul le transport est bloqué'
};

/**
 * La cause, sous une forme stable dont le programme peut décider
 *
 * @param {{ok: boolean}} jeton
 * @param {{statut: number|null}|null} lecture
 * @returns {'session-expiree'|'hote-muet'|'refus'|'transport'|'inattendu'}
 */
export function causeDeLaPanne(jeton, lecture) {
  if (!jeton || !jeton.ok) return 'session-expiree';
  if (!lecture || lecture.statut === null) return 'hote-muet';
  if (lecture.statut === 401 || lecture.statut === 403) return 'refus';
  if (lecture.statut >= 200 && lecture.statut < 300) return 'transport';
  return 'inattendu';
}

/**
 * Mesure les deux étapes et consigne l'issue
 *
 * Ne lève jamais et ne bloque rien : son seul objet est de rendre visible une
 * cause qu'aucun écran ne nomme.
 *
 * @param {Object} options
 * @param {Object} options.utilisateur - `auth.currentUser`
 * @param {string} options.base - `databaseURL`
 * @param {string} options.chemin - Chemin absolu à lire, racine comprise
 * @param {Function} [options.recuperer]
 * @returns {Promise<string>} Le code de la cause, pour qui sait quoi en faire
 */
export async function diagnostiquerLaLiaison({ utilisateur, base, chemin, recuperer }) {
  const jeton = await renouvelerLeJeton(utilisateur);

  noter('liaison', jeton.ok ? 'jeton renouvelé' : 'jeton non renouvelé', {
    ms: jeton.ms,
    ...(jeton.ok ? { taille: jeton.taille } : { motif: jeton.motif })
  });

  if (!jeton.ok) {
    noter('liaison', 'diagnostic', { cause: conclusion(jeton, null) });
    return causeDeLaPanne(jeton, null);
  }

  const lecture = await lireEnHttps({ base, chemin, jeton: jeton.jeton, recuperer });

  noter('liaison', 'lecture HTTPS authentifiée', {
    statut: lecture.statut === null ? 'aucune réponse' : lecture.statut,
    ms: lecture.ms,
    ...(lecture.motif ? { motif: lecture.motif } : {})
  });

  noter('liaison', 'diagnostic', { cause: conclusion(jeton, lecture) });
  return causeDeLaPanne(jeton, lecture);
}
