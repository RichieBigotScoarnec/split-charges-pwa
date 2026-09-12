/**
 * FairSplit — Ne pas payer tous les jours une attestation qui n'aboutit jamais
 *
 * App Check atteste que la requête vient bien de cette application. C'est une
 * bonne chose, et ce module ne cherche pas à s'en passer.
 *
 * Il cherche à ne pas la payer pour rien. Mesuré sur l'appareil, journal à
 * l'appui : l'authentification restait bloquée 6 621 ms avec l'attestation
 * active, 1 146 ms sans — et elle repartait à la milliseconde où l'attestation
 * rendait son échec. Six secondes à chaque ouverture, pour un jeton que
 * Firebase refusait en « 400 » et qui n'a jamais été validé une seule fois :
 * zéro requête attestée sur cent cinquante-neuf, sur une base qui n'exige rien.
 *
 * Une protection qui ne protège pas et qui coûte six secondes n'est pas un
 * compromis, c'est une perte sèche des deux côtés.
 *
 * D'où cette mémoire. Après un échec, l'attestation est écartée pour la
 * journée : les ouvertures suivantes ne la paient plus. Une fois par jour, on
 * réessaie pour de bon — sans quoi une configuration réparée dans la console ne
 * serait jamais reprise, et l'on aurait troqué une lenteur permanente contre un
 * abandon permanent. Le premier succès efface la mémoire, et tout revient à la
 * normale sans que personne n'ait à intervenir.
 *
 * Ce que ce module ne fait pas : décider si App Check doit exister. Il n'écarte
 * que ce qui a déjà échoué, et jamais plus d'une journée d'affilée.
 */

/** Clé de stockage — un seul enregistrement, quel que soit l'espace de données */
const STOCKAGE = 'fairsplit.attestation';

/**
 * Délai avant de retenter, en millisecondes
 *
 * Une journée. Plus court, on repaie la lenteur trop souvent pour que la
 * correction se voie. Plus long, une configuration réparée resterait ignorée
 * des jours durant, et le compteur de la console ne bougerait pas — ce qui
 * ferait conclure à tort que la réparation n'a rien changé.
 */
const REPOS_MS = 24 * 60 * 60 * 1000;

/**
 * Lit la mémoire, sans jamais lever
 *
 * `localStorage` est refusé en navigation privée sur certains navigateurs, et
 * son contenu peut avoir été écrit par une version antérieure. Un enregistrement
 * illisible vaut absence d'enregistrement : on retentera, ce qui est le défaut
 * sûr.
 *
 * @returns {{dernierEssai: number, essais: number}|null}
 */
function lire() {
  try {
    const brut = window.localStorage.getItem(STOCKAGE);
    if (!brut) return null;

    const memoire = JSON.parse(brut);
    if (!memoire || typeof memoire !== 'object') return null;
    if (!Number.isFinite(memoire.dernierEssai)) return null;

    return {
      dernierEssai: memoire.dernierEssai,
      essais: Number.isFinite(memoire.essais) ? memoire.essais : 1
    };
  } catch {
    return null;
  }
}

/**
 * L'attestation doit-elle être écartée pour cette ouverture ?
 *
 * @param {number} [maintenant] - Injectable pour les bancs d'essai
 * @returns {boolean}
 */
export function attestationAEviter(maintenant = Date.now()) {
  const memoire = lire();
  if (!memoire) return false;

  // Une horloge qui recule — changement de fuseau, correction de l'heure —
  // rendrait l'écart négatif et l'attestation écartée pour toujours. On
  // retente, ce qui coûte une lenteur et jamais un abandon.
  const ecoule = maintenant - memoire.dernierEssai;
  if (ecoule < 0) return false;

  return ecoule < REPOS_MS;
}

/**
 * Retient qu'une attestation vient d'échouer
 *
 * @param {number} [maintenant]
 * @returns {number} Nombre d'échecs consécutifs retenus
 */
export function noterEchecAttestation(maintenant = Date.now()) {
  const precedent = lire();
  const essais = (precedent ? precedent.essais : 0) + 1;

  try {
    window.localStorage.setItem(STOCKAGE, JSON.stringify({ dernierEssai: maintenant, essais }));
  } catch {
    // Sans mémoire, on repaiera la lenteur à chaque ouverture. C'est
    // désagréable et sans conséquence : rien ne dépend de cet enregistrement.
  }

  return essais;
}

/**
 * Efface la mémoire : l'attestation fonctionne de nouveau
 *
 * Appelée sur le premier succès. Sans elle, une configuration réparée
 * continuerait d'être écartée un jour sur deux, et le compteur de requêtes
 * validées de la console resterait trompeusement bas.
 *
 * @returns {void}
 */
export function noterSuccesAttestation() {
  try {
    window.localStorage.removeItem(STOCKAGE);
  } catch {
    // Rien à faire de plus : le stockage est déjà hors d'atteinte.
  }
}

/**
 * Depuis combien de temps l'attestation échoue-t-elle, et combien de fois ?
 *
 * Pour le journal seul : un abandon silencieux est exactement ce qu'on cherche
 * à éviter ici.
 *
 * @param {number} [maintenant]
 * @returns {{essais: number, depuisMs: number}|null}
 */
export function etatAttestation(maintenant = Date.now()) {
  const memoire = lire();
  if (!memoire) return null;

  return { essais: memoire.essais, depuisMs: Math.max(0, maintenant - memoire.dernierEssai) };
}
