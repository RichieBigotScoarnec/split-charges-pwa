/**
 * Les règles acceptent tous les chemins que l'application écrit
 *
 * `database.rules.json` ferme chaque niveau par un fourre-tout
 * `"$autre": { ".validate": false }` — refus par défaut, et c'est la bonne
 * valeur par défaut. Le prix en est qu'un champ ajouté dans le code, mais
 * oublié dans les règles, est refusé par le serveur.
 *
 * C'est arrivé, et c'est passé inaperçu pendant des semaines :
 * `reconduction.js:83` réserve le mois cible en écrivant
 * `periods/{mois}/reconductedFrom`, une clé qui n'était déclarée nulle part.
 * Le serveur refusait (401, mesuré contre le moteur réel), la transaction
 * échouait, et les charges fixes n'étaient jamais reconduites — le loyer ne
 * revenait pas, chaque mois, avec à l'écran une promesse de rattrapage que la
 * règle rendait impossible à tenir.
 *
 * Rien ne pouvait le voir : le test unitaire de la reconduction remplace
 * Firebase par des doubles, et le seul test end-to-end qui écrit ce champ
 * porte `test.skip(!MOT_DE_PASSE)` — la CI n'a pas ce secret, par conception.
 *
 * Ce test-ci ne parle à aucun serveur : il compare le code aux règles, à plat.
 * Il ne dit pas si une valeur est acceptable, seulement si le *chemin* est
 * déclaré. C'est exactement ce qui manquait.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `fileURLToPath` et non `.pathname` : sous Windows ce dernier rend
// `/C:/Users/...`, que `join` préfixe en `C:\C:\Users\...`. Les contrôles
// tombaient donc chez le développeur et passaient en CI, où personne ne les
// voyait échouer.
const RACINE = fileURLToPath(new URL('..', import.meta.url));
const REGLES = JSON.parse(readFileSync(join(RACINE, 'database.rules.json'), 'utf-8')).rules;

/** Tous les fichiers JS livrés */
function sources(dossier, trouves = []) {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) sources(chemin, trouves);
    else if (entree.endsWith('.js')) trouves.push(chemin);
  }
  return trouves;
}

/**
 * Les fonctions dont le premier argument EST un chemin de données
 *
 * `fusionnerListe` en fait partie : son corps appelle `getDataPath(chemin)`,
 * et c'est par elle que passent les trois listes du foyer.
 */
const ECRIVAINS = 'getDataPath|dbSet|dbUpdate|dbPush|dbGet|fusionnerListe';

/**
 * Et celles qui visent la racine de la BASE, hors de l'espace de données
 *
 * Les trois racines privées — `prive`, `aval`, `totauxPrives` — vivent hors de
 * `household` à dessein : `.write` cascade dans les règles Firebase, et sous un
 * nœud ouvert aux deux comptes il aurait été impossible de réserver une lecture
 * à une seule personne. Leurs chemins ne sont donc jamais préfixés, et se
 * vérifient contre la racine des règles.
 */
const ECRIVAINS_ABSOLUS = 'dbGetAbsolu|dbSetAbsolu|dbUpdateAbsolu|dbPushAbsolu';

/**
 * Les constantes de chemin déclarées dans un fichier
 *
 * Deux formes, et la seconde compte : `const noeud = x ? 'fixedCharges' :
 * 'variableCharges'` désigne DEUX nœuds. La lire comme un segment variable
 * rendrait le contrôle permissif là où il doit être exact — renommer les deux
 * littéraux passerait alors inaperçu, ce qui était le cas.
 *
 * La casse n'entre pas en jeu ici : un `const` lié à un littéral est résoluble,
 * qu'il crie ou non. C'est seulement en PREMIÈRE POSITION d'un appel qu'un
 * identifiant minuscule reste un paramètre — un relais, pas un site d'appel.
 *
 * @param {string} source
 * @returns {Map<string, Array<string>>} Nom → valeurs possibles
 */
function constantesLocales(source) {
  const table = new Map();

  // Le ternaire d'abord : sa forme contient celle du littéral simple.
  for (const [, nom, , a, , b] of source.matchAll(
    /const\s+([A-Za-z_$][\w$]*)\s*=[^;\n]*\?\s*(['"`])([^'"`]*)\2\s*:\s*(['"`])([^'"`]*)\4/g
  )) {
    table.set(nom, [a, b]);
  }

  for (const [, nom, , valeur] of source.matchAll(
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])([^'"`]*)\2\s*[;,\n)]/g
  )) {
    if (!table.has(nom)) table.set(nom, [valeur]);
  }

  return table;
}

/** Les chemins nommés de `config.js`, sous la forme `DB_PATHS.X` */
function cheminsNommes() {
  const source = readFileSync(join(RACINE, 'public/js/config.js'), 'utf-8');
  const debut = source.indexOf('export const DB_PATHS = {');
  const bloc = source.slice(debut, source.indexOf('};', debut));

  return new Map(
    [...bloc.matchAll(/([A-Z_]+)\s*:\s*'([^']+)'/g)].map(([, cle, valeur]) => [`DB_PATHS.${cle}`, [valeur]])
  );
}

/** Un identifiant nu, ou un accès `OBJET.PROPRIETE` */
const EST_IDENTIFIANT = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;

/** Au-delà, un gabarit à plusieurs inconnues explose sans rien apprendre */
const VARIANTES_MAX = 16;

/** Une constante liée à un gabarit peut en appeler une autre — mais pas sans fin */
const PASSES_MAX = 4;

/**
 * Toutes les valeurs qu'un gabarit peut prendre, constantes résolues
 *
 * `` `${CHEMIN_VERSEMENTS}/${id}` `` vise `versements/…`, et non « n'importe
 * quel enfant de la racine », ce que `estVariable` supposerait. Résoudre rend
 * le contrôle exact plutôt que permissif — et un `${DB_PATHS.REMINDERS}/v2`
 * cesse d'échapper au relevé, le point ayant longtemps arrêté le motif.
 *
 * @param {string} gabarit
 * @param {(nom: string) => Array<string>|undefined} resoudre
 * @returns {Array<string>}
 */
function developper(gabarit, resoudre) {
  let variantes = [gabarit];

  // ITÉRATIF, et c'est nécessaire : une constante peut être liée à un GABARIT.
  // `const chemin = ` + '`${RACINE_PRIVE}/${etat.emplacement}/…`' + ` visait bien
  // `prive/…`, mais une substitution unique rendait le texte brut, tête
  // comprise — le chemin restait donc « n'importe quel enfant de la racine »,
  // et renommer la racine privée passait inaperçu sur ce chemin-là.
  for (let passe = 0; passe < PASSES_MAX; passe += 1) {
    const noms = new Set(
      variantes.flatMap(v => [...v.matchAll(/\$\{([A-Za-z_$][\w$.]*)\}/g)].map(([, n]) => n))
    );
    const resolubles = [...noms].filter(nom => resoudre(nom));
    if (resolubles.length === 0) break;

    for (const nom of resolubles) {
      variantes = variantes.flatMap(
        variante => resoudre(nom).map(valeur => variante.split(`\${${nom}}`).join(valeur))
      );
      if (variantes.length > VARIANTES_MAX) return variantes.slice(0, VARIANTES_MAX);
    }
  }

  return variantes;
}

/**
 * Les chemins de base que le code écrit
 *
 * ## Ce que le motif d'origine ne voyait pas
 *
 * Il n'acceptait qu'une chaîne littérale en première position. Or la moitié
 * des nœuds du foyer sont désignés par une CONSTANTE — `dbSet(BUDGETS_PATH, …)`,
 * `dbSet(DB_PATHS.REMINDERS, …)`, `fusionnerListe(CHEMIN, …)`. Sept nœuds
 * échappaient donc à l'énumération : `envelopes`, `versements`,
 * `categoryBudgets`, `members`, `carryOverEnabled`, `reminders`, `shareMode`.
 *
 * ## Et trois formes qu'il ne voyait toujours pas
 *
 *   1. **Le lot multi-chemins.** `dbUpdate(undefined, ecritures)` n'a aucun
 *      chemin en premier argument : ils sont les CLÉS de l'objet. C'est ainsi
 *      qu'écrivent l'import CSV et le renommage — deux gestes qui touchent des
 *      centaines de charges d'un coup. Mesuré : renommer les nœuds visés par
 *      l'import laissait le relevé muet.
 *   2. **Les accès absolus**, hors de l'espace de données. Les trois racines
 *      privées ne sont jamais préfixées, et se vérifient contre la racine des
 *      règles.
 *   3. **Une tête de gabarit POINTÉE** — `` `${DB_PATHS.REMINDERS}/v2` `` — que
 *      le motif de résolution refusait à cause du point.
 *
 * ## Ce qui est résolu, et ce qui ne l'est pas
 *
 * Une constante liée à un littéral est résolue : dans son fichier d'abord, puis
 * dans `DB_PATHS`. Une constante en MAJUSCULES qui ne se résout pas fait
 * ÉCHOUER le test — c'est un chemin qu'on n'a pas lu, et le silence serait
 * exactement le défaut qu'on ferme ici.
 *
 * Un identifiant minuscule en première position est un PARAMÈTRE : un relais,
 * pas un site d'appel. `fusionnerListe(chemin, …)` ne désigne rien ; ce sont ses
 * appelants qui désignent, et le motif les voit.
 *
 * `undefined` vise la racine de l'espace — `getDataPath('')` rend `household`.
 * Elle est déclarée par construction : c'est le nœud qui porte tous les autres.
 */
function cheminsEcrits() {
  const motif = new RegExp(`(?:${ECRIVAINS})\\(\\s*([^,)]+)`, 'g');
  const motifAbsolu = new RegExp(`(?:${ECRIVAINS_ABSOLUS})\\(\\s*([^,)]+)`, 'g');
  // Une clé calculée qui porte une barre oblique EST un chemin de données :
  // `ecritures[\`periods/${periode}/${noeud}/${cle}\`] = …`. Sans barre, c'est
  // une table de correspondance quelconque, et non un chemin.
  const motifLot = /\w+\[\s*([`'"])([^`'"]*\/[^`'"]*)\1\s*\]\s*=/g;

  const nommes = cheminsNommes();
  const trouves = new Set();
  const absolus = new Set();
  const irresolus = new Set();

  for (const fichier of sources(join(RACINE, 'public/js'))) {
    const source = readFileSync(fichier, 'utf-8');
    const locales = constantesLocales(source);
    const resoudre = (nom) => locales.get(nom) ?? nommes.get(nom);

    const retenir = (ensemble, gabarit) => {
      for (const chemin of developper(gabarit, resoudre)) {
        if (chemin.trim()) ensemble.add(chemin);
      }
    };

    for (const [, , cle] of source.matchAll(motifLot)) retenir(trouves, cle);

    for (const [, brut] of source.matchAll(motifAbsolu)) {
      const litteral = brut.trim().match(/^([`'"])([^`'"]*)\1$/);
      if (litteral) retenir(absolus, litteral[2]);
    }

    for (const [, brut] of source.matchAll(motif)) {
      const argument = brut.trim();

      const litteral = argument.match(/^([`'"])([^`'"]*)\1$/);
      if (litteral) {
        retenir(trouves, litteral[2]);
        continue;
      }

      if (argument === 'undefined') continue;
      if (!EST_IDENTIFIANT.test(argument)) continue;

      const valeurs = resoudre(argument);
      if (valeurs) {
        for (const valeur of valeurs) if (valeur.trim()) trouves.add(valeur);
        continue;
      }

      // Minuscule initiale et non résolue : un paramètre, donc un relais.
      if (!/^[A-Z]/.test(argument)) continue;

      irresolus.add(`${fichier.slice(RACINE.length)} → ${argument}`);
    }
  }

  return {
    chemins: [...trouves].sort(),
    absolus: [...absolus].sort(),
    irresolus: [...irresolus].sort()
  };
}

/** Un segment est-il une interpolation, donc n'importe quelle clé ? */
const estVariable = (segment) => /^\$\{.*\}$/.test(segment);

/** Le nœud de règles refuse-t-il tout ? */
const refuseTout = (noeud) => !noeud || noeud['.validate'] === false;

/**
 * Le chemin est-il déclaré sous cet espace de règles ?
 *
 * Un segment interpolé peut valoir n'importe quelle clé : on essaie chaque
 * enfant déclaré, et il suffit qu'une descente aboutisse.
 *
 * @param {Object} noeud - Nœud de règles courant
 * @param {Array<string>} segments - Ce qu'il reste du chemin
 * @returns {boolean}
 */
function cheminDeclare(noeud, segments) {
  if (refuseTout(noeud)) return false;
  if (segments.length === 0) return true;

  const [tete, ...reste] = segments;
  const enfants = Object.keys(noeud).filter(cle => !cle.startsWith('.'));

  if (!estVariable(tete)) {
    if (Object.hasOwn(noeud, tete)) return cheminDeclare(noeud[tete], reste);
    // Pas de clé nommée : reste le fourre-tout, s'il en existe un d'ouvert.
    const joker = enfants.find(cle => cle.startsWith('$'));
    return joker ? cheminDeclare(noeud[joker], reste) : false;
  }

  // Segment interpolé : n'importe quel enfant peut convenir.
  return enfants.some(cle => cheminDeclare(noeud[cle], reste));
}

describe('Chaque chemin écrit par l\'application est déclaré dans les règles', () => {
  const { chemins, absolus, irresolus } = cheminsEcrits();

  it('le relevé des chemins n\'est pas vide', () => {
    // Sans cette garde, une expression régulière cassée rendrait le fichier
    // entier silencieusement vert.
    expect(chemins.length).toBeGreaterThan(8);
  });

  it('aucun chemin ne reste illisible', () => {
    // Une constante que le relevé ne sait pas résoudre est un nœud qu'on
    // n'inspecte pas. Passer outre en silence, c'est reproduire le trou qu'on
    // vient de fermer : l'échec force à lire, et à décider.
    expect(irresolus).toEqual([]);
  });

  it.each([
    'envelopes', 'versements', 'categoryBudgets', 'members',
    'carryOverEnabled', 'reminders', 'shareMode'
  ])('le nœud « %s », désigné par une constante, est bien relevé', (noeud) => {
    // Les sept que le motif d'origine ne voyait pas : il n'acceptait qu'une
    // chaîne littérale en première position. Nommés un par un, parce que ce
    // sont eux qui manquaient — et qu'une régression du motif se lirait
    // autrement comme « le relevé n'est pas vide ».
    //
    // Sur la TÊTE du chemin : `versements` n'est écrit que par
    // `versements/${id}`, jamais nu.
    expect(chemins.map(chemin => chemin.split('/')[0])).toContain(noeud);
  });

  it.each(['household', 'sandbox'])('espace %s', (espace) => {
    const refuses = chemins.filter(
      chemin => !cheminDeclare(REGLES[espace], chemin.split('/').filter(Boolean))
    );

    expect(refuses).toEqual([]);
  });

  it('les deux clés de niveau période que le code écrit sont déclarées', () => {
    // Nommément, parce que ce sont elles qui manquaient, et que leur absence
    // ne coûtait rien de visible avant le premier jour d'un mois neuf.
    for (const espace of ['household', 'sandbox']) {
      const periode = REGLES[espace].periods.$periode;
      expect(Object.keys(periode)).toContain('reconductedFrom');
      expect(Object.keys(periode)).toContain('shareMode');
    }
  });

  it.each(['periods/${periode}/fixedCharges/${cle}', 'periods/${periode}/variableCharges/${cle}'])(
    'le lot multi-chemins de l\'import est relevé : %s',
    (chemin) => {
      // `dbUpdate(undefined, ecritures)` n'a AUCUN chemin en premier argument :
      // ils sont les clés de l'objet. C'est ainsi qu'écrivent l'import CSV et le
      // renommage — deux gestes qui touchent des centaines de charges d'un coup.
      // Et le nœud vient d'un ternaire, `ligne.type === 'fixe' ? … : …`, donc de
      // DEUX littéraux qu'il faut résoudre tous les deux.
      expect(chemins).toContain(chemin);
    }
  );

  describe('LES TROIS RACINES PRIVÉES, hors de l\'espace de données', () => {
    /**
     * `prive`, `aval` et `totauxPrives` vivent à la racine de la BASE, et c'est
     * délibéré : `.write` cascade dans les règles Firebase, et sous `household`
     * — ouvert aux deux comptes — il aurait été impossible de réserver une
     * lecture à une seule personne.
     *
     * Leurs chemins ne passent donc jamais par `getDataPath`, mais par les
     * quatre accès absolus — que le relevé ne comptait pas parmi les écrivains.
     * Mesuré : renommer `RACINE_PRIVE` ou `RACINE_TOTAUX` laissait tout vert,
     * et le détail privé se serait écrit dans un nœud que `$autre: false`
     * refuse.
     */
    it('le relevé les voit, tête résolue', () => {
      // Sans la résolution de la tête, chacun vaudrait « n'importe quel enfant
      // de la racine » et le contrôle ne mesurerait rien.
      expect(absolus.length).toBeGreaterThan(4);
      expect(absolus.every(chemin => /^[a-zA-Z]/.test(chemin)),
        `une tête non résolue : ${absolus.filter(c => !/^[a-zA-Z]/.test(c)).join(', ')}`).toBe(true);
    });

    it('et tous sont déclarés à la RACINE des règles', () => {
      const refuses = absolus.filter(
        chemin => !cheminDeclare(REGLES, chemin.split('/').filter(Boolean))
      );

      expect(refuses).toEqual([]);
    });

    it('les trois racines sont bien celles que les règles portent', () => {
      // Nommément : ce sont elles qui n'ont aucun autre garde-fou, l'espace de
      // données ne les couvrant pas.
      for (const racine of ['prive', 'aval', 'totauxPrives']) {
        expect(Object.keys(REGLES)).toContain(racine);
        expect(absolus.some(chemin => chemin.startsWith(`${racine}/`)),
          `aucun chemin relevé sous ${racine}`).toBe(true);
      }
    });
  });

  it('un chemin non déclaré est bien détecté', () => {
    // Le test doit savoir échouer : sans cela il ne prouve rien.
    expect(cheminDeclare(REGLES.household, ['periods', '2026-09', 'inventé'])).toBe(false);
    expect(cheminDeclare(REGLES.household, ['periods', '2026-09', 'reconductedFrom'])).toBe(true);
  });
});
