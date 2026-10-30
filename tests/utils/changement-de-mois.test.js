import { describe, it, expect } from 'vitest';
import {
  periodeDeDestination, avertissementDeReconduction, messageDuDeplacement
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

describe('Ce qu\'un déplacement de charge fixe fait à la reconduction', () => {
  const LOYER = { description: 'Loyer', amount: 900, paidBy: 'vous', recurring: true };
  const NETFLIX = { description: 'Netflix', amount: 14, paidBy: 'vous', recurring: true };

  /** Octobre porte deux abonnements ; on déplace Netflix vers novembre */
  const OCTOBRE = () => ({
    '2026-10': { fixedCharges: { f1: LOYER, f2: NETFLIX } }
  });

  const deplacerNetflix = (periods, extra = {}) => avertissementDeReconduction({
    charge: NETFLIX, id: 'f2', origine: '2026-10', cible: '2026-11',
    moisCourant: '2026-10', periods, moi: 'vous', empreintePersonnelle: null, ...extra
  });

  it('BLOCAGE — vers un mois pas encore reconduit : il ne recevra pas le loyer', () => {
    // `planDeLaPoche` refuse un mois « déjà garni » : la charge déplacée suffit
    // à le garnir, et le loyer n'y serait jamais recopié.
    const phrase = deplacerNetflix(OCTOBRE());
    expect(phrase).toMatch(/Novembre 2026 ne recevra pas les charges récurrentes d'octobre 2026/);
  });

  it('DOUBLON — vers un mois déjà reconduit qui porte une charge du même libellé', () => {
    const periods = {
      ...OCTOBRE(),
      '2026-11': { reconductedFrom: '2026-10', fixedCharges: { r1: { ...NETFLIX } } }
    };
    expect(deplacerNetflix(periods)).toMatch(/Novembre 2026 porte déjà une charge « Netflix »/);
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

  it('TÉMOIN — vers le passé, la reconduction ne s\'y joue pas : rien à dire', () => {
    expect(avertissementDeReconduction({
      charge: NETFLIX, id: 'f2', origine: '2026-10', cible: '2026-09',
      moisCourant: '2026-10', periods: OCTOBRE(), moi: 'vous', empreintePersonnelle: null
    })).toBeNull();
  });

  it('TÉMOIN — la charge déplacée était la SEULE récurrente : rien ne manquera', () => {
    // La reconduction aurait recopié… cette charge-là, qui arrive de toute
    // façon. Le plan se calcule SANS elle à son origine.
    expect(deplacerNetflix({ '2026-10': { fixedCharges: { f2: NETFLIX } } })).toBeNull();
  });

  it('la poche de la charge décide : une charge PERSONNELLE lit l\'empreinte personnelle', () => {
    const perso = { ...NETFLIX, perimetre: 'solo' };
    const periods = {
      '2026-10': { fixedCharges: { f1: { ...LOYER, perimetre: 'solo' }, f2: perso } },
      // Le commun de novembre est reconduit : cela ne dit RIEN de ma poche.
      '2026-11': { reconductedFrom: '2026-10' }
    };
    expect(avertissementDeReconduction({
      charge: perso, id: 'f2', origine: '2026-10', cible: '2026-11',
      moisCourant: '2026-10', periods, moi: 'vous', empreintePersonnelle: null
    })).toMatch(/ne recevra pas/);

    // Et ma poche reconduite, elle, lève le blocage.
    expect(avertissementDeReconduction({
      charge: perso, id: 'f2', origine: '2026-10', cible: '2026-11',
      moisCourant: '2026-10', periods, moi: 'vous', empreintePersonnelle: '2026-10'
    })).toBeNull();
  });

  it('les charges COMMUNES ne regardent pas ma poche, et inversement', () => {
    // Le loyer commun d'octobre ne bloque pas une charge personnelle, ni ne la
    // fait passer pour un doublon.
    const perso = { ...NETFLIX, perimetre: 'solo' };
    expect(avertissementDeReconduction({
      charge: perso, id: 'f2', origine: '2026-10', cible: '2026-11',
      moisCourant: '2026-10',
      periods: { '2026-10': { fixedCharges: { f1: LOYER, f2: perso } } },
      moi: 'vous', empreintePersonnelle: null
    })).toBeNull();
  });
});
