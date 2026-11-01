import { describe, it, expect } from 'vitest';
import {
  periodeDeDestination, avertissementDeReconduction, messageDuDeplacement, questionDuDeplacement
} from '../../public/js/utils/changement-de-mois.js';

/**
 * Une modification qui change le mois de la date déplace la charge
 *
 * Mesuré le 2026-10-29 sur une sauvegarde réelle : une charge commune de 182 €
 * datée du 2026-11-01 vivait sous `periods/2026-10` et pesait sur le solde
 * d'octobre. L'AJOUT range par la date, la MODIFICATION rangeait par le mois
 * affiché : deux chemins qui décidaient différemment de la même grandeur.
 *
 * Le critère retenu (décision du foyer, 2026-10-29) : la charge se déplace
 * quand le MOIS DE SA DATE CHANGE — l'ancienne date contre la nouvelle —, et
 * jamais parce qu'elle vivait déjà ailleurs que sa date. Une charge mal rangée
 * dont on corrige le montant ne bouge pas : ce n'est pas le geste qu'on a fait.
 */

describe('Le mois où une charge modifiée doit vivre', () => {
  it('LE CAS RÉEL — la date passe d\'octobre au 1er novembre : novembre', () => {
    expect(periodeDeDestination({
      ancienne: { date: '2026-10-20' }, nouvelleDate: '2026-11-01', periodeActuelle: '2026-10'
    })).toBe('2026-11');
  });

  it('un changement de JOUR dans le même mois ne déplace rien', () => {
    expect(periodeDeDestination({
      ancienne: { date: '2026-10-05' }, nouvelleDate: '2026-10-28', periodeActuelle: '2026-10'
    })).toBe('2026-10');
  });

  it('CRITÈRE (b) — une charge déjà mal rangée dont la date ne change pas RESTE où elle est', () => {
    // La 182 € elle-même : datée de novembre, rangée en octobre. Corriger son
    // montant n'est pas un geste sur sa date. Le critère (a) — « le mois de la
    // date diffère du mois où elle vit » — la déplacerait ici.
    expect(periodeDeDestination({
      ancienne: { date: '2026-11-01' }, nouvelleDate: '2026-11-01', periodeActuelle: '2026-10'
    })).toBe('2026-10');
  });

  it('… et pas davantage quand on change son jour sans changer son mois', () => {
    expect(periodeDeDestination({
      ancienne: { date: '2026-11-01' }, nouvelleDate: '2026-11-15', periodeActuelle: '2026-10'
    })).toBe('2026-10');
  });

  it('une charge mal rangée qu\'on re-date dans son mois de rangement y reste', () => {
    expect(periodeDeDestination({
      ancienne: { date: '2026-11-01' }, nouvelleDate: '2026-10-15', periodeActuelle: '2026-10'
    })).toBe('2026-10');
  });

  it('une charge mal rangée qu\'on re-date ailleurs suit sa nouvelle date', () => {
    expect(periodeDeDestination({
      ancienne: { date: '2026-11-01' }, nouvelleDate: '2026-12-03', periodeActuelle: '2026-10'
    })).toBe('2026-12');
  });

  it('une charge d\'avant le champ date se lit à la date que le formulaire a montrée', () => {
    // `dateSaisissable` ouvre une charge sans `date` à son horodatage : c'est
    // ce que la personne a vu. Ne pas y toucher ne doit rien déplacer.
    const ancienne = { timestamp: new Date(2026, 8, 12, 10).getTime() };
    expect(periodeDeDestination({
      ancienne, nouvelleDate: '2026-09-12', periodeActuelle: '2026-10'
    })).toBe('2026-10');
  });

  it('une date illisible retombe sur le mois où la charge vit, sans rien inventer', () => {
    expect(periodeDeDestination({
      ancienne: { date: '2026-10-20' }, nouvelleDate: '', periodeActuelle: '2026-10'
    })).toBe('2026-10');
    expect(periodeDeDestination({
      ancienne: { date: '2026-10-20' }, nouvelleDate: '2026-13-01', periodeActuelle: '2026-10'
    })).toBe('2026-10');
  });
});

describe('Le toast du déplacement nomme le mois d\'arrivée', () => {
  it('par son nom lisible', () => {
    expect(messageDuDeplacement('2026-11')).toBe('Charge déplacée en novembre 2026, sa date');
  });
});

describe('La question posée avant un déplacement qui a des conséquences', () => {
  it('nomme la charge, son montant, le mois d\'arrivée — puis chaque conséquence', () => {
    const question = questionDuDeplacement({
      description: 'Netflix', montant: 4, cible: '2026-11',
      consequences: ['Novembre 2026 porte déjà une charge « Netflix » : la déplacer la comptera deux fois.']
    });
    expect(question).toMatch(/^Déplacer « Netflix » \(4,00\s€\) en novembre 2026, le mois de sa date \?/);
    expect(question).toMatch(/la déplacer la comptera deux fois\.$/);
  });

  it('porte TOUTES les conséquences, dans l\'ordre où on les lui donne', () => {
    const question = questionDuDeplacement({
      description: 'Loyer', montant: 900, cible: '2026-11', consequences: ['Première.', 'Seconde.']
    });
    expect(question.indexOf('Première.')).toBeGreaterThan(0);
    expect(question.indexOf('Seconde.')).toBeGreaterThan(question.indexOf('Première.'));
  });
});

describe('Ce qu\'un déplacement de charge fixe fait à la reconduction', () => {
  const LOYER = { description: 'Loyer', amount: 900, paidBy: 'vous', recurring: true };
  const NETFLIX = { description: 'Netflix', amount: 14, paidBy: 'vous', recurring: true };

  /** Octobre porte deux abonnements ; on déplace Netflix vers novembre */
  const OCTOBRE = () => ({
    '2026-10': { fixedCharges: { f1: LOYER, f2: NETFLIX } }
  });

  const deplacerNetflix = (periods, extra = {}) => avertissementDeReconduction({
    charge: NETFLIX, id: 'f2', cible: '2026-11',
    periods, moi: 'vous', empreintePersonnelle: null, ...extra
  });

  it('vers un mois pas encore reconduit : plus rien à dire', () => {
    // Elle annonçait « ne recevra pas les charges récurrentes ». Depuis le lot 2,
    // ce mois-là reçoit le loyer à son ouverture et reconnaît la charge
    // déplacée : la phrase serait fausse (`recurrence-mois-garni.test.js`, c.).
    expect(deplacerNetflix(OCTOBRE())).toBeNull();
  });

  it('même s\'il porte déjà la charge du même nom : la reconduction l\'écartera', () => {
    expect(deplacerNetflix({
      ...OCTOBRE(),
      '2026-11': { fixedCharges: { a: { ...NETFLIX } } }
    })).toBeNull();
  });

  it('DOUBLON — vers un mois déjà reconduit qui porte une charge du même libellé', () => {
    const periods = {
      ...OCTOBRE(),
      '2026-11': { reconductedFrom: '2026-10', fixedCharges: { r1: { ...NETFLIX } } }
    };
    // Une CONSÉQUENCE, pas un conseil : la phrase paraît dans une modale qui
    // se confirme AVANT l'écriture — « vérifiez » n'y voudrait plus rien dire.
    expect(deplacerNetflix(periods))
      .toBe('Novembre 2026 porte déjà une charge « Netflix » : la déplacer la comptera deux fois.');
  });

  it('le libellé se compare sans la casse ni les espaces', () => {
    const periods = {
      ...OCTOBRE(),
      '2026-11': { reconductedFrom: '2026-10', fixedCharges: { r1: { ...NETFLIX, description: '  netflix ' } } }
    };
    expect(deplacerNetflix(periods)).toMatch(/porte déjà/);
  });

  it('TÉMOIN — mois déjà reconduit SANS charge du même libellé : rien à dire', () => {
    const periods = {
      ...OCTOBRE(),
      '2026-11': { reconductedFrom: '2026-10', fixedCharges: { r1: { ...LOYER } } }
    };
    expect(deplacerNetflix(periods)).toBeNull();
  });

  it('TÉMOIN — une charge supprimée du même libellé ne compte pas', () => {
    const periods = {
      ...OCTOBRE(),
      '2026-11': { reconductedFrom: '2026-10', fixedCharges: { r1: { ...NETFLIX, deleted: true } } }
    };
    expect(deplacerNetflix(periods)).toBeNull();
  });

  it('la poche de la charge décide : une charge PERSONNELLE lit l\'empreinte personnelle', () => {
    const perso = { ...NETFLIX, perimetre: 'solo' };
    const periods = {
      '2026-10': { fixedCharges: { f2: perso } },
      // Le commun de novembre est reconduit : cela ne dit RIEN de ma poche.
      '2026-11': { reconductedFrom: '2026-10', fixedCharges: { r1: { ...perso } } }
    };
    expect(avertissementDeReconduction({
      charge: perso, id: 'f2', cible: '2026-11',
      periods, moi: 'vous', empreintePersonnelle: null
    })).toBeNull();

    // Et ma poche reconduite, elle, porte bien le doublon.
    expect(avertissementDeReconduction({
      charge: perso, id: 'f2', cible: '2026-11',
      periods, moi: 'vous', empreintePersonnelle: '2026-10'
    })).toMatch(/porte déjà/);
  });

  it('les charges COMMUNES ne regardent pas ma poche, et inversement', () => {
    // Un Netflix commun déjà reconduit ne fait pas du mien un doublon.
    const perso = { ...NETFLIX, perimetre: 'solo' };
    expect(avertissementDeReconduction({
      charge: perso, id: 'f2', cible: '2026-11',
      periods: {
        '2026-10': { fixedCharges: { f2: perso } },
        '2026-11': { reconductedFrom: '2026-10', fixedCharges: { r1: { ...NETFLIX } } }
      },
      moi: 'vous', empreintePersonnelle: '2026-10'
    })).toBeNull();
  });
});
