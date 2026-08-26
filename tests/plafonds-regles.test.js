import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { LIMITS } from '../public/js/config.js';

/**
 * Les règles plafonnent ce que les formulaires plafonnent
 *
 * Les deux fichiers disaient des choses différentes, chacun de son côté :
 * `config.js` refusait un salaire au-delà de 100 000 € et une charge au-delà
 * de 100 000 €, tandis que `database.rules.json` acceptait dix fois le premier
 * et cent fois la seconde.
 *
 * Ce n'était pas une porte ouverte — le formulaire refuse avant d'écrire — mais
 * c'est le contraire de ce à quoi servent les règles. Elles sont la dernière
 * ligne, celle qui tient quand le client se trompe, quand une saisie part d'un
 * onglet resté ouvert sur une version ancienne, ou quand une écriture est
 * fabriquée à la main. Une règle plus permissive que le formulaire qu'elle
 * protège ne protège que d'elle-même : un loyer à 5 000 000 € passait, et un
 * seul suffit à rendre le bilan illisible.
 *
 * Les deux valeurs sont donc alignées, et ce contrôle les tient ensemble. Il
 * relit le fichier de règles comme du texte plutôt que de vérifier une constante
 * recopiée : c'est le fichier réellement déployé qui doit être juste.
 */

const REGLES = JSON.parse(readFileSync(
  new URL('../database.rules.json', import.meta.url), 'utf8'));

/**
 * Les plafonds `<= N` rencontrés sous un champ donné, tous espaces confondus
 *
 * @param {string} champ - Nom du champ ('amount', 'vous'…)
 * @param {string[]} [sous] - Segments de chemin que le champ doit traverser
 * @returns {number[]} Les plafonds trouvés, un par emplacement
 */
function plafondsDe(champ, sous = []) {
  const trouves = [];

  const parcourir = (noeud, chemin) => {
    for (const [cle, valeur] of Object.entries(noeud)) {
      if (cle === '.validate') {
        const nom = chemin[chemin.length - 1];
        const passe = sous.every(segment => chemin.includes(segment));
        const borne = /isNumber\(\).*<=\s*(\d+)/.exec(valeur);
        if (nom === champ && passe && borne) trouves.push(Number(borne[1]));
      } else if (valeur && typeof valeur === 'object') {
        parcourir(valeur, [...chemin, cle]);
      }
    }
  };

  parcourir(REGLES.rules, []);
  return trouves;
}

describe('Les règles ne sont pas plus permissives que les formulaires', () => {

  it('plafonne les salaires à MAX_SALARY, dans les quatre champs et les deux espaces', () => {
    const plafonds = [
      ...plafondsDe('vous', ['salaries']),
      ...plafondsDe('conjointe', ['salaries']),
      ...plafondsDe('extraVous'),
      ...plafondsDe('extraConjointe')
    ];

    // Deux espaces × (global + par période) × quatre champs.
    expect(plafonds, 'des emplacements de salaire ont disparu des règles').toHaveLength(16);

    for (const plafond of plafonds) {
      expect(plafond, `une règle accepte ${plafond}, le formulaire refuse au-delà de ${LIMITS.MAX_SALARY}`)
        .toBe(LIMITS.MAX_SALARY);
    }
  });

  it('plafonne les montants à MAX_CHARGE, charges fixes, variables et remboursements', () => {
    const plafonds = plafondsDe('amount');

    // Deux espaces × trois collections.
    expect(plafonds, 'des emplacements de montant ont disparu des règles').toHaveLength(6);

    for (const plafond of plafonds) {
      expect(plafond, `une règle accepte ${plafond}, le formulaire refuse au-delà de ${LIMITS.MAX_CHARGE}`)
        .toBe(LIMITS.MAX_CHARGE);
    }
  });

  it('laisse les budgets plus larges, et le dit', () => {
    // Un budget d'enveloppe n'est pas une dépense : il couvre un séjour ou un
    // chantier entier, sur plusieurs mois, et aucun formulaire ne le borne.
    // L'aligner sur MAX_CHARGE refuserait une valeur légitime — la divergence
    // est ici voulue, et ce contrôle est là pour qu'on ne la corrige pas par
    // symétrie un jour de rangement.
    const budgets = [
      ...plafondsDe('budget'),
      ...plafondsDe('budgetAmount'),
      ...plafondsDe('$categorie')
    ];

    expect(budgets.length).toBeGreaterThan(0);
    for (const plafond of budgets) {
      expect(plafond).toBeGreaterThan(LIMITS.MAX_CHARGE);
    }
  });
});
