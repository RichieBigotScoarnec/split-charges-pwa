/**
 * FairSplit - Date Utilities
 * @description Fonctions de manipulation de dates et périodes
 */

/**
 * Get current period string (YYYY-MM)
 * @returns {string}
 */
export function getCurrentPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Parse period string to Date
 * @param {string} period - Period string (YYYY-MM)
 * @returns {Date}
 */
export function parsePeriod(period) {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

/**
 * Format period for display
 * @param {string} period - Period string (YYYY-MM)
 * @returns {string} Formatted string (e.g., "janvier 2026")
 */
export function formatPeriod(period) {
  const date = parsePeriod(period);
  return new Intl.DateTimeFormat('fr-FR', {
    year: 'numeric',
    month: 'long'
  }).format(date);
}

/**
 * Le jour courant, tel qu'il est ici — AAAA-MM-JJ
 *
 * La saisie rapide le calculait par `new Date().toISOString().split('T')[0]`,
 * qui rend le jour **UTC**. La France n'y est jamais : UTC+1 en heure d'hiver,
 * UTC+2 en heure d'été. Les dépenses faites après minuit et avant le décalage
 * étaient donc datées de la veille — une heure de fenêtre l'hiver, deux l'été.
 *
 * Rien ne le signalait — la charge s'enregistrait, le toast était vert, et la
 * date fausse ne se voyait nulle part puisque aucune vue ne l'affichait.
 *
 * Les composantes locales n'ont pas ce défaut, et n'ont rien à savoir des deux
 * bascules annuelles : `getFullYear`, `getMonth` et `getDate` interrogent la
 * base de fuseaux du système, qui encode depuis toujours la règle française —
 * dernier dimanche de mars, dernier dimanche d'octobre. Le décalage du jour
 * demandé en découle, sans qu'aucun code d'ici n'ait à en connaître.
 *
 * Et il n'y a rien à tirer du GPS pour cela : le fuseau d'un téléphone suit
 * déjà sa position. En vacances à l'étranger, une dépense est datée du jour
 * qu'affiche le téléphone sur place — celui du ticket de caisse. Déduire un
 * fuseau des coordonnées exigerait une base de frontières, hors ligne comme en
 * ligne, pour retrouver ce que l'appareil sait déjà.
 *
 * @param {Date} [instant] - Instant à convertir ; maintenant par défaut
 * @returns {string} AAAA-MM-JJ
 */
export function dateDuJour(instant = new Date()) {
  const annee = instant.getFullYear();
  const mois = String(instant.getMonth() + 1).padStart(2, '0');
  const jour = String(instant.getDate()).padStart(2, '0');
  return `${annee}-${mois}-${jour}`;
}

/** Format d'une heure telle qu'on l'écrit et la lit : HH:MM, sur 24 heures */
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * L'heure courante, telle qu'elle est ici — HH:MM
 *
 * Mêmes raisons que `dateDuJour` : les composantes locales interrogent la base
 * de fuseaux du système, qui sait à quelle heure il est là où se trouve
 * l'appareil. Un café pris à Lisbonne porte l'heure du ticket de caisse, pas
 * celle de Paris.
 *
 * @param {Date} [instant] - Instant à convertir ; maintenant par défaut
 * @returns {string} HH:MM
 */
export function heureDuJour(instant = new Date()) {
  const heures = String(instant.getHours()).padStart(2, '0');
  const minutes = String(instant.getMinutes()).padStart(2, '0');
  return `${heures}:${minutes}`;
}

/**
 * L'heure d'une charge, si elle en déclare une
 *
 * Il n'y a pas de repli sur `timestamp`, et c'est le point important : cet
 * horodatage est l'instant d'écriture en base. Une course de samedi matin
 * saisie le lundi soir en tirerait « 21:14 », qui a l'air d'une heure de
 * dépense et n'en est pas une. Une date approchée d'un jour reste lisible ;
 * une heure fausse ne se distingue pas d'une heure juste.
 *
 * Une heure illisible — écrite par une version future, ou par une main
 * étrangère — est traitée comme absente plutôt qu'affichée telle quelle.
 *
 * @param {Object} charge - Charge fixe ou variable
 * @returns {string} HH:MM, ou une chaîne vide
 */
export function heureDeLaCharge(charge) {
  if (!charge || typeof charge !== 'object') return '';
  return typeof charge.heure === 'string' && HEURE.test(charge.heure) ? charge.heure : '';
}

/**
 * L'heure d'une charge au format qu'attend `<input type="time">`
 *
 * Vide quand la charge n'en porte pas : rouvrir une dépense d'avant ce champ
 * ne doit pas lui inventer l'heure du jour. Le champ reste effaçable, et ce
 * vide-là se conserve.
 *
 * @param {Object} charge - Charge fixe ou variable
 * @returns {string} HH:MM, ou une chaîne vide
 */
export function heureSaisissable(charge) {
  return heureDeLaCharge(charge);
}

/**
 * Ce qu'une saisie d'heure vaut une fois relue
 *
 * `<input type="time">` rend une chaîne vide quand il est vidé, et le
 * navigateur garantit le format quand il ne l'est pas — mais la valeur peut
 * aussi venir d'ailleurs : un rejeu de la file d'attente hors ligne, un import,
 * une restauration de sauvegarde. Ce qui n'est pas une heure devient une
 * absence d'heure, jamais une heure approximative.
 *
 * @param {string} saisie - Valeur brute du champ
 * @returns {string} HH:MM, ou une chaîne vide
 */
export function heureValide(saisie) {
  return typeof saisie === 'string' && HEURE.test(saisie) ? saisie : '';
}

/**
 * La date d'une charge, et son heure si elle en a une
 *
 * « 25 août 2026 à 08:30 », ou « 25 août 2026 » quand l'heure manque. Les deux
 * formes cohabitent dans une même liste : les dépenses d'avant ce champ n'en
 * porteront jamais, et l'heure reste effaçable pour celles qu'on ne sait pas
 * situer dans la journée.
 *
 * @param {Object} charge - Charge fixe ou variable
 * @returns {string} Date lisible, ou une chaîne vide si la charge n'apprend rien
 */
export function formatDateEtHeure(charge) {
  const jour = formatDate(dateDeLaCharge(charge));
  if (!jour) return '';

  const heure = heureDeLaCharge(charge);
  return heure ? `${jour} à ${heure}` : jour;
}

/**
 * La date d'une charge, quelle que soit la façon dont elle a été saisie
 *
 * `date` est la date de la dépense : celle que le foyer déclare. `timestamp`
 * est l'instant d'écriture en base, ce qui n'est pas la même chose — une
 * dépense de samedi saisie le lundi porte les deux, et seule la première est
 * vraie.
 *
 * Les charges antérieures à ce champ n'ont que `timestamp`. Le repli les
 * affiche donc à leur date d'écriture, faute de mieux : c'est une approximation
 * assumée, pas une invention, puisque la saisie suivait généralement la dépense
 * de peu.
 *
 * Une charge fixe reconduite fait exception et se voit réattribuer une date au
 * moment de la reconduction : sans quoi le loyer de février afficherait celle
 * de janvier, recopiée avec le reste.
 *
 * @param {Object} charge - Charge fixe ou variable
 * @returns {string|number|null} Valeur exploitable par `formatDate`, ou null
 */
export function dateDeLaCharge(charge) {
  if (!charge || typeof charge !== 'object') return null;
  if (typeof charge.date === 'string' && charge.date) return charge.date;
  if (typeof charge.timestamp === 'number' && charge.timestamp > 0) return charge.timestamp;
  return null;
}

/**
 * Reporte une date dans une autre période, en gardant son quantième
 *
 * La reconduction recopie les charges fixes d'un mois sur le suivant. Recopiée
 * telle quelle, la date de janvier ferait afficher « 5 janv. » sur le loyer de
 * février : la charge dirait appartenir à un mois où elle ne figure pas.
 *
 * Le quantième, lui, se conserve — un loyer prélevé le 5 le reste. Les mois
 * courts font exception : le 31 janvier reporté en février donnerait le
 * 3 mars, `Date` débordant sans se plaindre. Il est ramené au dernier jour du
 * mois, qui est la date à laquelle le prélèvement tombe réellement.
 *
 * @param {string} date - Date d'origine, AAAA-MM-JJ
 * @param {string} periode - Période cible, AAAA-MM
 * @returns {string|null} Date reportée, ou null si l'une des deux est illisible
 */
export function reporterDansLaPeriode(date, periode) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (typeof periode !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periode)) return null;

  const quantieme = Number(date.slice(8, 10));
  const annee = Number(periode.slice(0, 4));
  const mois = Number(periode.slice(5, 7));

  // Le jour 0 du mois suivant est le dernier jour de celui-ci.
  const dernierJour = new Date(annee, mois, 0).getDate();
  const jour = Math.min(quantieme, dernierJour);

  return `${periode}-${String(jour).padStart(2, '0')}`;
}

/**
 * La date d'une charge au format qu'attend `<input type="date">`
 *
 * Le champ n'accepte que AAAA-MM-JJ : lui donner un horodatage le laisse vide,
 * en silence. Une charge ancienne rouverte pour en corriger le montant se
 * serait donc réenregistrée à la date du jour, et l'édition aurait déplacé la
 * dépense dans le temps sans que personne ne l'ait demandé.
 *
 * @param {Object} charge - Charge fixe ou variable
 * @returns {string} AAAA-MM-JJ ; le jour courant si la charge n'apprend rien
 */
export function dateSaisissable(charge) {
  const valeur = dateDeLaCharge(charge);
  if (typeof valeur === 'string') return valeur;
  if (typeof valeur === 'number') return dateDuJour(new Date(valeur));
  return dateDuJour();
}

/**
 * Format date for display
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDate(date) {
  // `Intl.format(undefined)` affiche la date du jour : une charge sans date
  // s'affichait donc comme datée d'aujourd'hui, ce qui est pire qu'un vide —
  // l'absence devenait une affirmation fausse.
  if (date === null || date === undefined || date === '') return '';

  // « 2026-08-23 » seul est interprété par `new Date` comme minuit **UTC**, puis
  // réaffiché dans le fuseau de l'appareil. À l'est de Greenwich cela tombe
  // juste ; à l'ouest, la date reculait d'un jour. Un jour civil n'a pas
  // d'heure : on le reconstruit en local plutôt que de traverser UTC.
  const jourSeul = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const d = jourSeul
    ? new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
    : (typeof date === 'string' || typeof date === 'number' ? new Date(date) : date);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';

  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(d);
}


/**
 * Un jour et son mois, sans l'année
 *
 * Pour nommer une échéance à l'intérieur d'un mois qu'on est en train de
 * regarder : « EDF le 12 sept. ». `formatDate` y ajoute l'année, ce qui est
 * juste dans une liste de charges — on y navigue d'un mois à l'autre — mais
 * pèse trop dans une phrase qui en enchaîne trois.
 *
 * Le mois est conservé plutôt que réduit au quantième : la ligne peut décrire
 * un mois à venir, où « le 12 » seul ne dirait pas lequel.
 *
 * @param {string} date - AAAA-MM-JJ
 * @returns {string} « 12 sept. », ou une chaîne vide si la date est illisible
 */
export function jourEtMois(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';

  // Reconstruit en local, comme `formatDate` : minuit UTC recule d'un jour à
  // l'ouest de Greenwich.
  const d = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  if (Number.isNaN(d.getTime())) return '';

  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(d);
}
