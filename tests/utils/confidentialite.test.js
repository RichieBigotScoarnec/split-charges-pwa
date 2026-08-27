import { describe, it, expect } from 'vitest';
import {
  EMPLACEMENTS,
  emplacementOppose,
  normaliserAval,
  normaliserDepensePrivee,
  normaliserDepensesPrivees,
  depensesActives,
  resumePublie,
  resumeLu,
  depensePriveeEcrivable
} from '../../public/js/utils/confidentialite.js';

describe('emplacementOppose — désigner l\'autre, ou personne', () => {
  it('rend l\'autre personne du foyer', () => {
    expect(emplacementOppose('vous')).toBe('conjointe');
    expect(emplacementOppose('conjointe')).toBe('vous');
  });

  it.each([[null], [undefined], [''], ['moi'], ['Vous'], [0]])(
    'un emplacement inconnu (%s) ne désigne personne',
    (valeur) => {
      // Désigner quelqu'un au hasard ferait demander son aval à la mauvaise
      // personne — ou pire, le lui accorder.
      expect(emplacementOppose(valeur)).toBeNull();
    }
  );

  it('les deux emplacements sont symétriques', () => {
    for (const e of EMPLACEMENTS) {
      expect(emplacementOppose(emplacementOppose(e))).toBe(e);
    }
  });
});

describe('normaliserAval — l\'absence vaut refus', () => {
  it('un nœud absent n\'est jamais un accès accordé', () => {
    // Le seul défaut acceptable. Un nœud qu'on n'a pas pu lire ne doit jamais
    // être pris pour un espace ouvert : l'écran annoncerait un partage qui
    // n'existe pas, et le serveur refuserait la lecture qui suit.
    expect(normaliserAval(null).actif).toBe(false);
    expect(normaliserAval(undefined).actif).toBe(false);
    expect(normaliserAval({}).actif).toBe(false);
    expect(normaliserAval('oui').actif).toBe(false);
  });

  it.each([['true'], [1], ['oui'], [{}], [null]])(
    'seul le booléen vrai accorde ; « %s » ne suffit pas',
    (actif) => {
      expect(normaliserAval({ actif }).actif).toBe(false);
    }
  );

  it('un aval accordé se lit avec sa date et son auteur', () => {
    expect(normaliserAval({ actif: true, accordeLe: 1756300000000, accordePar: 'conjointe' }))
      .toEqual({ actif: true, accordeLe: 1756300000000, accordePar: 'conjointe' });
  });

  it('un auteur illisible n\'en désigne aucun', () => {
    expect(normaliserAval({ actif: true, accordePar: 'quelquun' }).accordePar).toBeNull();
  });

  it('un aval retiré se lit comme tel, sans perdre sa trace', () => {
    const retire = normaliserAval({ actif: false, accordeLe: 1756300000000, accordePar: 'conjointe' });
    expect(retire.actif).toBe(false);
    expect(retire.accordeLe, 'la trace de l\'accord passé disparaîtrait').toBe(1756300000000);
  });
});

describe('normaliserDepensePrivee — un montant abîmé n\'est pas une dépense de zéro', () => {
  it('retient les champs attendus', () => {
    expect(normaliserDepensePrivee(
      { montant: 45, description: 'Coiffeur', category: 'Soins', date: '2026-08-14' }, 'k1'))
      .toEqual({ id: 'k1', montant: 45, description: 'Coiffeur', category: 'Soins', date: '2026-08-14', deleted: false });
  });

  it('accepte la virgule décimale', () => {
    expect(normaliserDepensePrivee({ montant: '28,63' }).montant).toBeCloseTo(28.63, 6);
  });

  it.each([[undefined], [null], ['abc'], [NaN], [-10], [999999]])(
    'écarte un montant inexploitable (%s)',
    (montant) => {
      // Une dépense à zéro gonflerait le compte publié à l'autre sans rien
      // ajouter au total : le nombre annoncé cesserait de correspondre.
      expect(normaliserDepensePrivee({ montant })).toBeNull();
    }
  );

  it('borne les textes plutôt que de laisser passer un roman', () => {
    const longue = normaliserDepensePrivee({ montant: 10, description: 'x'.repeat(500) });
    expect(longue.description).toHaveLength(200);
  });

  it('une date hors format vaut null, jamais une date inventée', () => {
    expect(normaliserDepensePrivee({ montant: 10, date: '14/08/2026' }).date).toBeNull();
    expect(normaliserDepensePrivee({ montant: 10 }).date).toBeNull();
  });
});

describe('normaliserDepensesPrivees — le nœud Firebase devient une liste', () => {
  const noeud = {
    k1: { montant: 45, date: '2026-08-14', description: 'Coiffeur' },
    k2: { montant: 22, date: '2026-08-20', description: 'Livre' },
    k3: { montant: 'abc' },
    k4: { montant: 15, date: '2026-08-02', deleted: true }
  };

  it('reporte la clé, écarte l\'inexploitable, garde le supprimé', () => {
    const lues = normaliserDepensesPrivees(noeud);
    expect(lues.map(d => d.id).sort()).toEqual(['k1', 'k2', 'k4']);
  });

  it('rend les plus récentes d\'abord', () => {
    expect(normaliserDepensesPrivees(noeud)[0].date).toBe('2026-08-20');
  });

  it('un nœud absent rend une liste vide', () => {
    expect(normaliserDepensesPrivees(null)).toEqual([]);
    expect(depensesActives(undefined)).toEqual([]);
  });
});

describe('resumePublie — ce qui franchit le mur, et rien d\'autre', () => {
  const depenses = [
    { montant: 45, description: 'Coiffeur' },
    { montant: 22, description: 'Livre' },
    { montant: 999, description: 'Cadeau', deleted: true }
  ];

  it('rend le total et le compte', () => {
    expect(resumePublie(depenses)).toEqual({ montant: 67, nombre: 2 });
  });

  it('écarte ce qui est à la corbeille', () => {
    expect(resumePublie(depenses).montant).not.toBe(1066);
  });

  it('ne laisse filtrer aucun libellé', () => {
    // Le contrat du mur, vérifié sur la forme même de ce qui sort : le résumé
    // ne porte que deux nombres. Y ajouter un champ le trahirait.
    expect(Object.keys(resumePublie(depenses)).sort()).toEqual(['montant', 'nombre']);
    expect(JSON.stringify(resumePublie(depenses))).not.toContain('Coiffeur');
  });

  it('un montant abîmé vaut zéro, jamais NaN', () => {
    const resume = resumePublie([{ montant: 10 }, { montant: undefined }]);
    expect(resume.montant).toBe(10);
    expect(Number.isFinite(resume.montant)).toBe(true);
  });

  it('une liste vide publie un zéro honnête', () => {
    expect(resumePublie([])).toEqual({ montant: 0, nombre: 0 });
  });
});

describe('resumeLu — « rien publié » n\'est pas « zéro dépense »', () => {
  it('distingue les deux', () => {
    // Un nœud absent veut dire « on n'en sait rien ». L'écran doit pouvoir se
    // taire plutôt qu'affirmer que l'autre n'a rien dépensé en privé.
    expect(resumeLu(null).publie).toBe(false);
    expect(resumeLu({}).publie).toBe(false);
    expect(resumeLu({ montant: 0, nombre: 0 }).publie).toBe(true);
  });

  it('lit un résumé publié', () => {
    expect(resumeLu({ montant: 340, nombre: 5 })).toEqual({ publie: true, montant: 340, nombre: 5 });
  });

  it('un compte absent ne rend pas le montant illisible', () => {
    expect(resumeLu({ montant: 340 })).toEqual({ publie: true, montant: 340, nombre: 0 });
  });

  it('un montant non numérique n\'est pas un résumé', () => {
    expect(resumeLu({ montant: '340' }).publie).toBe(false);
  });
});

describe('depensePriveeEcrivable — écrire chez soi ne demande rien', () => {
  it('accepte un montant positif, sans qu\'aucun accord soit requis', () => {
    // Le contrôle qui dit le sujet. Une version antérieure exigeait l'accord de
    // la conjointe pour enregistrer ses PROPRES dépenses privées : elle
    // demandait la permission d'avoir un jardin secret. Ce qui se demande,
    // c'est l'accès au détail de l'autre — et cela se joue dans les règles, pas
    // ici.
    const verdict = depensePriveeEcrivable('45');
    expect(verdict.valide).toBe(true);
    expect(verdict.montant).toBe(45);
  });

  it('n\'a plus de second paramètre, et l\'ignore si on lui en passe un', () => {
    // La signature a changé. Un appelant resté sur l'ancienne forme — qui
    // passerait un aval refusé — ne doit pas voir sa saisie bloquée en silence.
    expect(depensePriveeEcrivable('45', { actif: false }).valide).toBe(true);
    expect(depensePriveeEcrivable.length).toBe(1);
  });

  it('accepte la virgule décimale', () => {
    expect(depensePriveeEcrivable('28,63').montant).toBeCloseTo(28.63, 6);
  });

  it.each([['0'], ['-10'], [''], ['abc'], ['999999']])(
    'refuse un montant « %s », et le dit pour ce qu\'il est',
    (saisi) => {
      const verdict = depensePriveeEcrivable(saisi);
      expect(verdict.valide).toBe(false);
      expect(verdict.erreur).toMatch(/montant/i);
    }
  );
});
