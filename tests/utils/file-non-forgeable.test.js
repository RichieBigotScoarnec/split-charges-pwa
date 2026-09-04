/**
 * La file hors ligne ne rejoue que des saisies
 *
 * `empiler()` contrôle le type et le chemin *à la mise en file*, et le rejeu
 * reprenait ensuite l'enregistrement tel quel. Or la file vit en clair dans
 * `localStorage`, sur une origine que GitHub Pages partage entre tous les
 * dépôts d'un même compte : une autre page du compte y écrit sans la moindre
 * injection, et une extension de navigateur aussi.
 *
 * La charge utile tenait en une entrée : `{ type: 'set', chemin: '',
 * donnees: null }`. `getDataPath('')` rend `household` — l'espace entier — et
 * le rejeu partait seul à la reconnexion, sous la session légitime du foyer,
 * sans rien redemander.
 *
 * Le même contrôle sert au dépôt : une restauration de sauvegarde écrit toute
 * la racine, et la différer en l'annonçant comme réussie est pire que la
 * refuser — l'écrasement survenait à la reconnexion, éventuellement sous la
 * session de l'autre compte, par-dessus ce qu'il avait saisi entre-temps.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { operationRejouable } from '../../public/js/db.js';

const SAISIE = {
  id: 'op-1',
  type: 'set',
  chemin: 'periods/2026-08/variableCharges/c1',
  donnees: { description: 'Courses', amount: 84.3, paidBy: 'vous', timestamp: 1 }
};

describe('Ce que la file accepte de rejouer', () => {
  it('une saisie ordinaire passe', () => {
    expect(operationRejouable(SAISIE)).toBe(true);
  });

  it('une mise à jour partielle passe — c\'est la suppression douce', () => {
    expect(operationRejouable({ ...SAISIE, type: 'update', donnees: { deleted: true } })).toBe(true);
  });

  it('les réglages du foyer passent — le nœud EST la valeur', () => {
    for (const noeud of ['salaries', 'shareMode', 'carryOverEnabled',
      'categoryBudgets', 'members', 'reminders']) {
      expect(operationRejouable({ ...SAISIE, type: 'update', chemin: noeud, donnees: { x: 1 } }),
        noeud).toBe(true);
    }
  });

  it('les deux formes du versement passent : le lot d\'un mois, et une ligne', () => {
    // Le lot est celui d'AUDIT-001 : les deux parts d'un versement « à deux »
    // partent ensemble ou pas du tout.
    expect(operationRejouable({
      ...SAISIE, type: 'update', chemin: 'versements/vacances-2027',
      donnees: { 'auto-2026-09-vous': { montant: 88.64 } }
    })).toBe(true);
    expect(operationRejouable({
      ...SAISIE, chemin: 'versements/vacances-2027/auto-2026-09-vous',
      donnees: { montant: 88.64 }
    })).toBe(true);
  });
});

describe('Ce que la file refuse de rejouer', () => {
  it('la charge utile de l\'effacement : chemin vide et données nulles', () => {
    expect(operationRejouable({ id: 'x', type: 'set', chemin: '', donnees: null })).toBe(false);
  });

  it('un chemin vide, même avec des données', () => {
    // C'est aussi la restauration d'une sauvegarde : elle ne se diffère pas.
    expect(operationRejouable({ id: 'x', type: 'set', chemin: '', donnees: { periods: {} } })).toBe(false);
  });

  it('un chemin qui n\'est que des barres obliques', () => {
    expect(operationRejouable({ id: 'x', type: 'set', chemin: '///', donnees: { a: 1 } })).toBe(false);
  });

  it('un `set` à null — une saisie n\'efface jamais un nœud', () => {
    expect(operationRejouable({ ...SAISIE, donnees: null })).toBe(false);
  });

  it('un type inconnu', () => {
    expect(operationRejouable({ ...SAISIE, type: 'remove' })).toBe(false);
    expect(operationRejouable({ ...SAISIE, type: 'push' })).toBe(false);
  });

  it('un chemin qui n\'est pas une chaîne', () => {
    expect(operationRejouable({ ...SAISIE, chemin: 42 })).toBe(false);
    expect(operationRejouable({ ...SAISIE, chemin: undefined })).toBe(false);
  });

  it('un enregistrement qui n\'est pas un objet', () => {
    for (const brut of [null, undefined, 'op', 7, []]) {
      expect(operationRejouable(brut)).toBe(false);
    }
  });
});

/**
 * AUDIT-011 — une liste blanche de DESTINATIONS, pas une liste noire de formes
 *
 * Les refus ci-dessus n'écartaient que trois formes : type inconnu, chemin
 * vide, `set(null)`. Ils ne regardaient jamais OÙ l'écriture va. Un nœud
 * nommé, une valeur non nulle, et la file rejouait n'importe quelle
 * destination — sous la session légitime du foyer, à la reconnexion, sans
 * rien redemander.
 *
 * Le `CLAUDE.md` décrivait ce point comme clos en annonçant que la file
 * « écrivait n'importe quoi, effacement compris ». La correction du
 * 2026-08-27 n'avait fermé que le second terme.
 */
describe('AUDIT-011 · La file ne vise que ce que l\'application écrit', () => {
  const forgee = (chemin, type = 'set') =>
    operationRejouable({ id: 'x', type, chemin, donnees: { x: 1 } });

  it('remplacer TOUT l\'historique est refusé', () => {
    // `periods` est un conteneur : aucun appel ne le vise, et l'y autoriser
    // laissait une entrée forgée remplacer tous les mois du foyer d'un coup.
    expect(forgee('periods')).toBe(false);
  });

  it('remplacer un mois ENTIER est refusé', () => {
    // `set` remplace le mois ; `update` y pose des chemins relatifs, ce qui
    // permet de marquer `deleted` sur toutes les charges en une entrée.
    expect(forgee('periods/2026-08')).toBe(false);
    expect(forgee('periods/2026-08', 'update')).toBe(false);
  });

  it('un nœud que les règles ne déclarent pas est refusé', () => {
    expect(forgee('noeudInconnu')).toBe(false);
    expect(forgee('periods/2026-08/collectionInventee/c1')).toBe(true);
  });

  it('une période qui n\'en est pas une est refusée', () => {
    for (const mois of ['2026-13', '26-08', '2026-8', 'x', '..']) {
      expect(forgee(`periods/${mois}/variableCharges/c1`), mois).toBe(false);
    }
  });

  it('les trois listes du foyer sont refusées — elles ne passent jamais par la file', () => {
    // `fusionnerListe` les écrit par une `transaction` posée directement sur la
    // référence Firebase : elle ne traverse pas `db.js`, donc rien de légitime
    // ne les met en file. Les y autoriser aurait laissé vider la liste des
    // enveloppes du foyer.
    for (const liste of ['customCategories', 'customDestinations', 'envelopes']) {
      expect(forgee(liste), liste).toBe(false);
    }
  });

  it('ce qui reste ouvert est dit, plutôt que laissé croire fermé', () => {
    // La limite du contrôle, tenue par un test pour qu'elle ne se perde pas :
    // un `update` sur `salaries` avec des revenus inventés est, au caractère
    // près, l'écriture que `period.js:460` produit quand on corrige un salaire.
    // Aucun contrôle posé dans le client ne peut les distinguer — ce qui
    // fermerait ce reste, c'est un nom de domaine propre.
    expect(operationRejouable({
      id: 'x', type: 'update', chemin: 'salaries', donnees: { vous: 99999, conjointe: 1 }
    })).toBe(true);
  });
});

/**
 * La liste blanche comparée au code, dans les deux sens
 *
 * Une liste blanche a deux façons de mal vieillir, et une seule se voit à
 * l'usage : trop étroite, elle fait perdre une saisie hors ligne — silencieuse
 * jusqu'au jour où quelqu'un saisit dans le métro ; trop large, elle rouvre ce
 * qu'AUDIT-011 ferme.
 *
 * Ce contrôle part donc du CODE et non de la liste. Il relève les appels
 * d'écriture de `public/js`, en résout les constantes, et exige que chacun
 * reste différable. Une constante irrésolue le fait ÉCHOUER : le silence
 * serait précisément le trou qu'il ferme — c'est la leçon que
 * `regles-couvrent-les-ecritures.test.js` a payée.
 */
describe('AUDIT-011 · La liste blanche ne dérive pas du code', () => {
  const RACINE = fileURLToPath(new URL('../../public/js/', import.meta.url));

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
   * Une valeur concrète pour chaque trou de gabarit
   *
   * Le nom de la variable dit ce qu'elle porte : un mois pour une période, une
   * clé sinon. Se tromper ici rendrait le contrôle trop indulgent, jamais trop
   * strict — un mois mal formé serait refusé et ferait échouer.
   */
  const valeurDuTrou = (nom) =>
    /period|mois|precedente|target|cible/i.test(nom) ? '2026-08' : 'k1';

  /**
   * Les chemins que le code passe à `dbSet`, `dbUpdate` et `dbPush`
   *
   * @returns {{concrets: string[], irresolus: string[]}}
   */
  function cheminsEcrits() {
    const concrets = new Set();
    const irresolus = new Set();

    for (const fichier of sources(RACINE)) {
      const source = readFileSync(fichier, 'utf-8');
      // Les constantes de chemin déclarées dans ce fichier, par leur valeur.
      const constantes = new Map(
        [...source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*'([^']*)'/g)]
          .map(([, nom, valeur]) => [nom, valeur])
      );
      constantes.set('DB_PATHS.REMINDERS', 'reminders');

      for (const [, appel, argument] of source.matchAll(
        /\b(dbSet|dbUpdate|dbPush)\(\s*(`[^`]*`|'[^']*'|[A-Za-z_$][\w$.]*)\s*,/g
      )) {
        // `dbUpdate(undefined, …)` vise la racine : déjà refusé, et à dessein.
        if (argument === 'undefined') continue;

        // Un identifiant en minuscules est un PARAMÈTRE — un relais, pas un
        // site d'appel. C'est ainsi que `db.js` se passe ses propres chemins,
        // et les compter rendrait `chemin/chemin`, qui ne désigne rien.
        // Règle reprise de `regles-couvrent-les-ecritures.test.js`.
        if (/^[a-z][\w$]*$/.test(argument)) continue;

        /** La valeur d'un `${…}` : sa constante si on la connaît, sinon un trou */
        const contenuDuTrou = (expression) => {
          const nom = expression.trim();
          return constantes.has(nom) ? constantes.get(nom) : valeurDuTrou(nom);
        };

        let chemin = null;
        if (argument.startsWith("'")) chemin = argument.slice(1, -1);
        else if (argument.startsWith('`')) {
          chemin = argument.slice(1, -1).replace(/\$\{([^}]*)\}/g,
            (_, expression) => contenuDuTrou(expression));
        } else if (constantes.has(argument)) chemin = constantes.get(argument);

        if (chemin === null) { irresolus.add(`${fichier} → ${argument}`); continue; }

        // `dbPush` met en file `chemin/cléFabriquée`, jamais le conteneur seul.
        concrets.add(appel === 'dbPush' ? `${chemin}/-NcleFabriquee` : chemin);
      }
    }
    return { concrets: [...concrets].sort(), irresolus: [...irresolus] };
  }

  const { concrets, irresolus } = cheminsEcrits();

  it('le relevé n\'est pas vide et ne laisse rien d\'illisible', () => {
    // Sans ces deux lignes, un relevé cassé rendrait zéro chemin et tout ce qui
    // suit passerait sans rien mesurer.
    expect(concrets.length).toBeGreaterThan(10);
    expect(irresolus, `constantes non résolues : ${irresolus.join(', ')}`).toEqual([]);
  });

  it('AUCUN chemin écrit par l\'application ne devient indifférable', () => {
    // Le sens qui coûte une saisie. Un chemin refusé ici, c'est une dépense
    // tapée hors ligne qui n'arrive jamais en base.
    const perdus = concrets.filter(
      chemin => !operationRejouable({ id: 'x', type: 'set', chemin, donnees: { x: 1 } })
    );
    expect(perdus, `chemins que la file refuserait : ${perdus.join(', ')}`).toEqual([]);
  });

  it('et aucune forme déclarée n\'est morte', () => {
    // Le sens qui coûte de la surface. Une forme que plus aucun appel ne
    // produit est une porte ouverte pour rien.
    const temoins = {
      'réglages du foyer': 'shareMode',
      'partie d\'un mois': 'periods/2026-08/variableCharges/c1',
      'cagnotte': 'versements/vacances-2027/auto-2026-09-vous'
    };
    for (const [quoi, temoin] of Object.entries(temoins)) {
      const couvert = concrets.some(chemin => chemin.split('/').length === temoin.split('/').length
        && chemin.split('/')[0] === temoin.split('/')[0]);
      expect(couvert, `plus aucun appel n'écrit : ${quoi}`).toBe(true);
    }
  });
});
