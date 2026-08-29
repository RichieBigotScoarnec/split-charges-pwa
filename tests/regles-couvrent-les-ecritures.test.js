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

const RACINE = new URL('..', import.meta.url).pathname;
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

/** Les constantes de chemin déclarées dans un fichier : `const NOM = 'valeur'` */
function constantesLocales(source) {
  const table = new Map();
  for (const [, nom, , valeur] of source.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*=\s*(['"`])([^'"`]*)\2/g)) {
    table.set(nom, valeur);
  }
  return table;
}

/** Les chemins nommés de `config.js`, sous la forme `DB_PATHS.X` */
function cheminsNommes() {
  const source = readFileSync(join(RACINE, 'public/js/config.js'), 'utf-8');
  const debut = source.indexOf('export const DB_PATHS = {');
  const bloc = source.slice(debut, source.indexOf('};', debut));

  return new Map(
    [...bloc.matchAll(/([A-Z_]+)\s*:\s*'([^']+)'/g)].map(([, cle, valeur]) => [`DB_PATHS.${cle}`, valeur])
  );
}

/** Un identifiant nu, ou un accès `OBJET.PROPRIETE` */
const EST_IDENTIFIANT = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;

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
 * C'est-à-dire que le test qui existe pour attraper un nœud non déclaré ne
 * regardait pas `envelopes` — le nœud dont l'écriture est la plus large de
 * l'application, puisque `fusionnerListe` réécrit le tableau entier.
 *
 * ## Ce qui est résolu, et ce qui ne l'est pas
 *
 * Une constante en MAJUSCULES est résolue : dans son fichier d'abord, puis
 * dans `DB_PATHS`. Une constante qui ne se résout pas fait ÉCHOUER le test —
 * c'est un chemin qu'on n'a pas lu, et le silence serait exactement le défaut
 * qu'on ferme ici.
 *
 * Un identifiant en minuscules est un PARAMÈTRE : un relais, pas un site
 * d'appel. `fusionnerListe(chemin, …)` ne désigne rien ; ce sont ses appelants
 * qui désignent, et le motif les voit.
 *
 * `undefined` vise la racine de l'espace — `getDataPath('')` rend `household`.
 * Elle est déclarée par construction : c'est le nœud qui porte tous les autres.
 */
function cheminsEcrits() {
  const motif = new RegExp(`(?:${ECRIVAINS})\\(\\s*([^,)]+)`, 'g');
  const nommes = cheminsNommes();
  const trouves = new Set();
  const irresolus = new Set();

  for (const fichier of sources(join(RACINE, 'public/js'))) {
    const source = readFileSync(fichier, 'utf-8');
    const locales = constantesLocales(source);
    const resoudre = (nom) => locales.get(nom) ?? nommes.get(nom);

    for (const [, brut] of source.matchAll(motif)) {
      const argument = brut.trim();

      const litteral = argument.match(/^([`'"])([^`'"]*)\1$/);
      if (litteral) {
        // Un gabarit dont la tête est une constante connue désigne un nœud
        // précis : `` `${CHEMIN_VERSEMENTS}/${id}` `` vise `versements/…`, et
        // non « n'importe quel enfant de la racine », ce que `estVariable`
        // aurait supposé. La résoudre rend le contrôle exact au lieu de
        // permissif.
        const chemin = litteral[2].replace(
          /\$\{([A-Z][A-Z0-9_]*)\}/g,
          (tel, nom) => resoudre(nom) ?? tel
        );
        if (chemin.trim()) trouves.add(chemin);
        continue;
      }

      if (argument === 'undefined') continue;
      if (!EST_IDENTIFIANT.test(argument)) continue;

      // Minuscule initiale : un paramètre, donc un relais.
      if (!/^[A-Z]/.test(argument)) continue;

      const valeur = resoudre(argument);
      if (valeur) trouves.add(valeur);
      else irresolus.add(`${fichier.slice(RACINE.length)} → ${argument}`);
    }
  }

  return { chemins: [...trouves].sort(), irresolus: [...irresolus].sort() };
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
  const { chemins, irresolus } = cheminsEcrits();

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

  it('un chemin non déclaré est bien détecté', () => {
    // Le test doit savoir échouer : sans cela il ne prouve rien.
    expect(cheminDeclare(REGLES.household, ['periods', '2026-09', 'inventé'])).toBe(false);
    expect(cheminDeclare(REGLES.household, ['periods', '2026-09', 'reconductedFrom'])).toBe(true);
  });
});
