/**
 * FairSplit — Lire un CSV de charges
 *
 * Les données n'entraient que charge par charge. Le premier mois se saisissait
 * à la main, et un relevé bancaire — qui contient déjà les trois quarts de ce
 * qu'on va retaper — ne pouvait pas être versé.
 *
 * ## Pourquoi pas le format de l'export
 *
 * `export.js` produit un **rapport lisible** : des en-têtes, des sections, des
 * totaux, des montants formatés en euros. C'est fait pour être lu, pas pour
 * revenir. Le reparser demanderait de deviner où commence chaque section et de
 * défaire un formatage monétaire — fragile, et cassé au premier changement de
 * mise en forme. L'import accepte donc un format simple et documenté, celui
 * qu'un tableur produit naturellement.
 *
 * ## Ce qui est toléré, et ce qui ne l'est pas
 *
 * Tolérant sur la forme : séparateur `;` ou `,`, colonnes dans n'importe quel
 * ordre, intitulés sans égard à la casse ni aux accents, montants à virgule ou
 * à point, dates en `AAAA-MM-JJ` ou `JJ/MM/AAAA`.
 *
 * Intraitable sur le fond : **une ligne dont le payeur est illisible est
 * rejetée**, jamais devinée. L'application entière sert à dire qui doit combien
 * à qui ; attribuer une dépense au hasard fausserait le solde des deux
 * personnes sans que rien ne le signale. Une colonne absente est une autre
 * histoire — l'écran demande alors un payeur par défaut, et c'est un choix
 * conscient.
 */

import { parseMontant } from './montant.js';
import { plier } from './recherche-texte.js';

/** Les emplacements que l'application connaît */
const EMPLACEMENTS = ['vous', 'conjointe', 'partage'];

/** Plafond d'un montant, aligné sur celui des formulaires */
const MONTANT_MAX = 100000;

/**
 * Les intitulés reconnus pour chaque colonne
 *
 * Plusieurs par colonne : un relevé bancaire dit « Libellé », un tableur
 * recopié de l'export dit « Description », et les deux veulent dire la même
 * chose.
 */
const COLONNES = {
  description: ['description', 'libelle', 'libelle operation', 'intitule', 'nom'],
  category: ['categorie', 'category', 'rubrique'],
  amount: ['montant', 'amount', 'somme', 'debit', 'prix'],
  paidBy: ['paye par', 'payee par', 'payeur', 'paidby', 'qui'],
  date: ['date', 'date operation', 'jour'],
  type: ['type', 'nature']
};

/**
 * Découpe une ligne CSV en respectant les guillemets
 *
 * Un libellé peut contenir le séparateur — « Restaurant, chez Paul » — et
 * découper bêtement sur le caractère produirait une colonne de plus, décalant
 * tout ce qui suit. Les guillemets doublés à l'intérieur d'un champ sont la
 * convention CSV pour un guillemet littéral.
 *
 * @param {string} ligne
 * @param {string} separateur
 * @returns {string[]}
 */
export function decouperLigne(ligne, separateur) {
  const champs = [];
  let courant = '';
  let entreGuillemets = false;

  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];

    if (c === '"') {
      if (entreGuillemets && ligne[i + 1] === '"') { courant += '"'; i++; }
      else entreGuillemets = !entreGuillemets;
      continue;
    }

    if (c === separateur && !entreGuillemets) { champs.push(courant.trim()); courant = ''; continue; }
    courant += c;
  }

  champs.push(courant.trim());
  return champs;
}

/**
 * Le séparateur employé par un fichier
 *
 * Décidé sur la ligne d'en-tête, pas sur tout le fichier : un libellé contenant
 * des virgules ferait pencher le compte du mauvais côté alors que les colonnes,
 * elles, sont séparées par des points-virgules.
 *
 * @param {string} entete
 * @returns {string} `;` ou `,`
 */
export function separateurDe(entete) {
  const texte = String(entete || '');
  const pointsVirgules = (texte.match(/;/g) || []).length;
  const virgules = (texte.match(/,/g) || []).length;
  // Égalité comprise : le point-virgule est la convention des tableurs
  // francophones, et c'est celle de l'export du dépôt.
  return virgules > pointsVirgules ? ',' : ';';
}

/**
 * Associe chaque colonne connue à son indice dans l'en-tête
 *
 * @param {string[]} entetes
 * @returns {Object} `{description: 0, amount: 2, …}` — absente si non trouvée
 */
export function reconnaitreLesColonnes(entetes) {
  const trouvees = {};
  const plies = (Array.isArray(entetes) ? entetes : []).map(e => plier(String(e || '')));

  for (const [champ, intitules] of Object.entries(COLONNES)) {
    const indice = plies.findIndex(entete => entete && intitules.includes(entete));
    if (indice >= 0) trouvees[champ] = indice;
  }
  return trouvees;
}

/**
 * Lit un emplacement écrit à la main
 *
 * @param {string} valeur
 * @returns {string|null} `vous`, `conjointe`, `partage`, ou null
 */
export function lireLePayeur(valeur) {
  const plie = plier(String(valeur || ''));
  if (!plie) return null;
  if (EMPLACEMENTS.includes(plie)) return plie;
  // Les libellés que l'écran affiche, et quelques évidences.
  if (['moi', 'me', 'vous meme'].includes(plie)) return 'vous';
  if (['conjoint', 'partenaire', 'elle', 'lui'].includes(plie)) return 'conjointe';
  if (['commun', 'les deux', 'partagé', 'partage'].includes(plie)) return 'partage';
  return null;
}

/**
 * Lit une date écrite à la main
 *
 * @param {string} valeur
 * @returns {string|null} `AAAA-MM-JJ`, ou null
 */
export function lireLaDate(valeur) {
  const texte = String(valeur || '').trim();
  if (!texte) return null;

  const iso = texte.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return valider(iso[1], iso[2], iso[3]);

  // `JJ/MM/AAAA` et `JJ-MM-AAAA` : la forme française, celle des relevés.
  const fr = texte.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (fr) return valider(fr[3], fr[2].padStart(2, '0'), fr[1].padStart(2, '0'));

  return null;

  function valider(annee, mois, jour) {
    const m = Number(mois), j = Number(jour);
    if (m < 1 || m > 12 || j < 1 || j > 31) return null;
    return `${annee}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
  }
}

/**
 * Analyse un fichier CSV de charges
 *
 * Rend ce qui est écrivable **et** ce qui a été rejeté, avec le motif : un
 * import qui avale une ligne sur trois sans le dire est pire qu'un import qui
 * refuse tout.
 *
 * @param {string} texte - Contenu du fichier
 * @param {Object} [options]
 * @param {string} [options.payeurParDefaut] - Employé si la colonne est absente
 * @returns {{
 *   lignes: Array<Object>, rejets: Array<{ligne: number, motif: string, contenu: string}>,
 *   separateur: string, colonnes: Object, payeurManquant: boolean
 * }}
 */
export function analyserCsv(texte, { payeurParDefaut = null } = {}) {
  const vide = {
    lignes: [], rejets: [], separateur: ';', colonnes: {}, payeurManquant: false
  };
  if (typeof texte !== 'string' || !texte.trim()) return vide;

  // `\r\n` comme `\n` : un fichier produit sous Windows laisserait sinon un
  // retour chariot collé à la dernière colonne de chaque ligne.
  const brutes = texte.split(/\r?\n/).filter(l => l.trim());
  if (brutes.length < 2) return vide;

  const separateur = separateurDe(brutes[0]);
  const enTete = decouperLigne(brutes[0], separateur);
  const colonnes = reconnaitreLesColonnes(enTete);

  // Sans ces deux-là, il n'y a pas de charge : un libellé et un montant.
  if (colonnes.description === undefined || colonnes.amount === undefined) {
    return { ...vide, separateur, colonnes };
  }

  const payeurManquant = colonnes.paidBy === undefined;
  const lignes = [];
  const rejets = [];

  brutes.slice(1).forEach((brute, index) => {
    const numero = index + 2;                    // 1 pour l'en-tête, 1 pour l'humain
    const champs = decouperLigne(brute, separateur);

    // Plus de champs que l'en-tête n'en déclare : la ligne est ambiguë.
    //
    // Le cas qui l'a révélé : un fichier séparé par des VIRGULES dont les
    // montants sont eux aussi à virgule. « Courses,vous,84,30 » se découpe en
    // quatre champs pour trois colonnes ; la colonne « Montant » attrape « 84 »,
    // « 30 » tombe dans le vide, et 84,00 € part en base — sans rejet, sans
    // avertissement, et l'aperçu affiche 84,00 € comme si de rien n'était.
    // Trente centimes perdus par ligne, sur un relevé entier.
    //
    // On rejette plutôt que de deviner où couper : c'est le principe de cet
    // écran, déjà tenu pour le payeur. Moins de champs reste accepté — une
    // colonne finale vide est simplement omise par beaucoup de tableurs.
    if (champs.length > enTete.length) {
      rejets.push({
        ligne: numero,
        motif: `${champs.length} champs pour ${enTete.length} colonnes — séparateur « ${separateur} » ambigu, montant à virgule ?`,
        contenu: brute.slice(0, 60)
      });
      return;
    }

    const lire = (champ) => (colonnes[champ] === undefined ? '' : (champs[colonnes[champ]] || ''));

    const description = lire('description').slice(0, 100);
    if (!description) {
      rejets.push({ ligne: numero, motif: 'libellé vide', contenu: brute.slice(0, 60) });
      return;
    }

    const amount = parseMontant(lire('amount'));
    if (!Number.isFinite(amount) || amount <= 0 || amount > MONTANT_MAX) {
      rejets.push({ ligne: numero, motif: `montant illisible : « ${lire('amount')} »`, contenu: brute.slice(0, 60) });
      return;
    }

    // Le payeur : deviné jamais, demandé si la colonne manque.
    let paidBy;
    if (payeurManquant) {
      paidBy = lireLePayeur(payeurParDefaut);
      if (!paidBy) {
        rejets.push({ ligne: numero, motif: 'aucun payeur, et aucun défaut choisi', contenu: brute.slice(0, 60) });
        return;
      }
    } else {
      paidBy = lireLePayeur(lire('paidBy'));
      if (!paidBy) {
        rejets.push({ ligne: numero, motif: `payeur illisible : « ${lire('paidBy')} »`, contenu: brute.slice(0, 60) });
        return;
      }
    }

    lignes.push({
      description,
      amount,
      paidBy,
      category: lire('category').slice(0, 50) || 'Autre',
      date: lireLaDate(lire('date')),
      // « fixe » doit être demandé : la variable est le cas courant, et une
      // charge fixe entre dans la reconduction du mois suivant.
      type: plier(lire('type')) === 'fixe' ? 'fixe' : 'variable'
    });
  });

  return { lignes, rejets, separateur, colonnes, payeurManquant };
}
