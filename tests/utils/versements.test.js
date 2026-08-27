import { describe, it, expect } from 'vitest';
import {
  normaliserVersement,
  normaliserVersements,
  versementsActifs,
  totalVerse,
  estAlimentee,
  bilanCagnotte,
  versementEcrivable
} from '../../public/js/utils/versements.js';

describe('normaliserVersement — un montant inexploitable n\'est pas un versement de zéro', () => {
  it('retient les champs attendus', () => {
    expect(normaliserVersement({ montant: 400, date: '2026-08-15', auteur: 'vous' }, 'k1'))
      .toEqual({ id: 'k1', montant: 400, date: '2026-08-15', auteur: 'vous', deleted: false });
  });

  it('accepte un montant à la virgule, comme partout ailleurs', () => {
    expect(normaliserVersement({ montant: '28,63', auteur: 'vous' }).montant).toBeCloseTo(28.63, 6);
  });

  it.each([
    [undefined, 'absent'],
    [null, 'nul'],
    [0, 'zéro'],
    [-50, 'négatif'],
    ['abc', 'illisible'],
    [NaN, 'NaN'],
    [Infinity, 'infini'],
    [99999999999, 'au-delà du plafond']
  ])('écarte un montant %s (%s) plutôt que de le compter pour zéro', (montant) => {
    // Un versement de zéro se compterait dans le nombre, et ferait basculer une
    // cagnotte vers la lecture « contenu réel » alors qu'elle n'a rien reçu.
    expect(normaliserVersement({ montant, auteur: 'vous' })).toBeNull();
  });

  it.each(['partage', 'both', '', undefined, 'Vous'])(
    'un auteur « %s » n\'en désigne aucun plutôt qu\'un au hasard',
    (auteur) => {
      expect(normaliserVersement({ montant: 100, auteur }).auteur).toBeNull();
    }
  );

  it('une date hors format vaut null, jamais une date inventée', () => {
    expect(normaliserVersement({ montant: 100, date: '15/08/2026' }).date).toBeNull();
    expect(normaliserVersement({ montant: 100, date: '2026-08' }).date).toBeNull();
    expect(normaliserVersement({ montant: 100 }).date).toBeNull();
  });

  it('ne lève pas sur une entrée absurde', () => {
    expect(normaliserVersement(null)).toBeNull();
    expect(normaliserVersement('400')).toBeNull();
  });
});

describe('normaliserVersements — le nœud Firebase devient une liste utilisable', () => {
  const noeud = {
    k1: { montant: 400, date: '2026-06-01', auteur: 'vous' },
    k2: { montant: 300, date: '2026-08-01', auteur: 'conjointe' },
    k3: { montant: 0, auteur: 'vous' },                            // inexploitable
    k4: { montant: 50, date: '2026-07-01', auteur: 'vous', deleted: true }
  };

  it('reporte la clé Firebase en identifiant', () => {
    // Sans elle, l'écran ne pourrait désigner l'entrée à retirer.
    expect(normaliserVersements(noeud).map(v => v.id).sort()).toEqual(['k1', 'k2', 'k4']);
  });

  it('écarte les entrées inexploitables, garde les supprimées', () => {
    // La suppression est un autre critère : la corbeille a besoin de les voir.
    const lus = normaliserVersements(noeud);
    expect(lus).toHaveLength(3);
    expect(lus.some(v => v.deleted)).toBe(true);
  });

  it('rend les plus récents d\'abord', () => {
    expect(normaliserVersements(noeud)[0].date).toBe('2026-08-01');
  });

  it('un nœud absent rend une liste vide', () => {
    expect(normaliserVersements(null)).toEqual([]);
    expect(normaliserVersements('rien')).toEqual([]);
  });
});

describe('totalVerse — ce qui a été mis dans le pot', () => {
  const versements = [
    { montant: 400, auteur: 'vous' },
    { montant: 300, auteur: 'conjointe' },
    { montant: 100, auteur: null },
    { montant: 999, auteur: 'vous', deleted: true }
  ];

  it('additionne les versements actifs', () => {
    expect(totalVerse(versements)).toBe(800);
  });

  it('écarte ceux qui sont à la corbeille', () => {
    expect(totalVerse(versements)).not.toBe(1799);
  });

  it('sait dire qui a mis quoi', () => {
    expect(totalVerse(versements, 'vous')).toBe(400);
    expect(totalVerse(versements, 'conjointe')).toBe(300);
  });

  it('un montant abîmé vaut zéro, jamais NaN', () => {
    const total = totalVerse([{ montant: 100, auteur: 'vous' }, { montant: undefined, auteur: 'vous' }]);
    expect(total).toBe(100);
    expect(Number.isFinite(total)).toBe(true);
  });

  it('une liste vide vaut zéro', () => {
    expect(totalVerse([])).toBe(0);
    expect(totalVerse(null)).toBe(0);
    expect(versementsActifs(undefined)).toEqual([]);
  });
});

describe('estAlimentee — la question qui décide du sens de la jauge', () => {
  it('un pot sans versement garde la lecture d\'avant', () => {
    // Le contrat de rétrocompatibilité : toutes les cagnottes déjà en base
    // n'ont aucun versement, et doivent continuer à se lire comme un objectif
    // dont on retranche les dépenses.
    expect(estAlimentee([])).toBe(false);
    expect(estAlimentee(null)).toBe(false);
  });

  it('un versement à la corbeille ne compte pas', () => {
    expect(estAlimentee([{ montant: 400, deleted: true }])).toBe(false);
  });

  it('un seul versement suffit à basculer', () => {
    expect(estAlimentee([{ montant: 1, auteur: 'vous' }])).toBe(true);
  });
});

describe('bilanCagnotte — la jauge monte, elle ne descend pas', () => {
  const versements = [
    { montant: 400, auteur: 'vous' },
    { montant: 300, auteur: 'conjointe' }
  ];

  it('le pot contient ce qu\'on y a mis, moins ce qu\'on en a sorti', () => {
    const bilan = bilanCagnotte(versements, 671.37, 1200);
    expect(bilan.verse).toBe(700);
    expect(bilan.depense).toBeCloseTo(671.37, 6);
    expect(bilan.dansLePot).toBeCloseTo(28.63, 6);
  });

  it('la part atteinte monte avec ce qu\'on y met', () => {
    // 700 versés, rien dépensé, objectif 1000 → 70 % du chemin.
    expect(bilanCagnotte(versements, 0, 1000).partAtteinte).toBe(70);
    // Et elle redescend si l'on puise dedans : c'est le contenu qui compte.
    expect(bilanCagnotte(versements, 500, 1000).partAtteinte).toBe(20);
  });

  it('dit ce qui manque pour atteindre l\'objectif', () => {
    expect(bilanCagnotte(versements, 0, 1000).manque).toBe(300);
    expect(bilanCagnotte(versements, 0, 1000).atteint).toBe(false);
  });

  it('un objectif atteint ne réclame plus rien', () => {
    const bilan = bilanCagnotte(versements, 0, 500);
    expect(bilan.atteint).toBe(true);
    expect(bilan.manque, 'un manque négatif se lirait comme une dette').toBe(0);
    expect(bilan.partAtteinte, 'la barre déborderait').toBe(100);
  });

  it('un pot à découvert le dit, plutôt que d\'afficher une barre vide', () => {
    // Une barre à zéro se lit « rien dedans », pas « vous êtes en dessous ».
    const bilan = bilanCagnotte(versements, 900, 1000);
    expect(bilan.dansLePot).toBe(-200);
    expect(bilan.aDecouvert).toBe(true);
    expect(bilan.partAtteinte).toBe(0);
  });

  it('sans objectif, ne compare rien mais dit quand même le contenu', () => {
    const bilan = bilanCagnotte(versements, 200, null);
    expect(bilan.dansLePot).toBe(500);
    expect(bilan.objectif).toBeNull();
    expect(bilan.partAtteinte).toBeNull();
    expect(bilan.manque).toBeNull();
    expect(bilan.atteint).toBe(false);
  });

  it('une dépense abîmée vaut zéro, jamais NaN', () => {
    const bilan = bilanCagnotte(versements, undefined, 1000);
    expect(bilan.dansLePot).toBe(700);
    expect(Number.isFinite(bilan.partAtteinte)).toBe(true);
  });

  it('un pot vide ne lève pas', () => {
    expect(bilanCagnotte([], 0, null).dansLePot).toBe(0);
    expect(bilanCagnotte(null, 0, 100).partAtteinte).toBe(0);
  });
});

describe('versementEcrivable — le refus s\'explique avant l\'écriture', () => {
  it('accepte un montant positif signé par une personne', () => {
    const verdict = versementEcrivable('400', 'vous');
    expect(verdict.valide).toBe(true);
    expect(verdict.montant).toBe(400);
  });

  it('accepte la virgule décimale', () => {
    expect(versementEcrivable('28,63', 'conjointe').montant).toBeCloseTo(28.63, 6);
  });

  it.each([['0'], ['-40'], [''], ['abc'], [null]])(
    'refuse un montant « %s », et dit pourquoi',
    (saisi) => {
      const verdict = versementEcrivable(saisi, 'vous');
      expect(verdict.valide).toBe(false);
      expect(verdict.erreur).toMatch(/montant/i);
    }
  );

  it.each(['partage', 'both', '', undefined])(
    'refuse un auteur « %s » : un versement doit dire qui l\'a fait',
    (auteur) => {
      const verdict = versementEcrivable('400', auteur);
      expect(verdict.valide).toBe(false);
      expect(verdict.erreur).toMatch(/qui/i);
    }
  );

  it('refuse au-delà du plafond', () => {
    expect(versementEcrivable('99999999999', 'vous').valide).toBe(false);
  });
});
