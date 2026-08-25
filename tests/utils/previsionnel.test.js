import { describe, it, expect } from 'vitest';
import {
  previsionnelDuMois,
  PROCHAINES_NOMMEES
} from '../../public/js/utils/previsionnel.js';

/**
 * Ce qui reste à passer ce mois-ci
 *
 * La donnée existait déjà : la reconduction inscrit les charges fixes au
 * premier du mois, chacune à son quantième. Le bilan les comptait toutes comme
 * acquises. Au 3 du mois, il annonçait donc 1 240 € de charges dont 900 ne
 * sont pas encore sortis du compte, sans que rien ne permette de le lire.
 */
describe('previsionnelDuMois', () => {

  /** Charge fixe minimale */
  const charge = (description, amount, date) => ({ description, amount, date });

  it('sépare ce qui est passé de ce qui reste à venir', () => {
    const bilan = previsionnelDuMois({
      fixedCharges: [
        charge('Loyer', 800, '2026-09-05'),
        charge('EDF', 120, '2026-09-12'),
        charge('Internet', 40, '2026-09-20')
      ],
      aujourdhui: '2026-09-10'
    });

    expect(bilan.passe).toBe(800);
    expect(bilan.aVenir).toBe(160);
    expect(bilan.total).toBe(960);
    expect(bilan.nombreAVenir).toBe(2);
  });

  it('compte les charges variables avec les fixes', () => {
    const bilan = previsionnelDuMois({
      fixedCharges: [charge('Loyer', 800, '2026-09-05')],
      variableCharges: [charge('Courses', 60, '2026-09-08')],
      aujourdhui: '2026-09-10'
    });

    expect(bilan.total).toBe(860);
    expect(bilan.passe).toBe(860);
  });

  it('range le jour même du côté du passé', () => {
    // Un prélèvement du 12 consulté le 12 n'est plus une prévision : l'annoncer
    // comme tel ferait attendre une sortie déjà faite.
    const bilan = previsionnelDuMois({
      fixedCharges: [charge('EDF', 120, '2026-09-12')],
      aujourdhui: '2026-09-12'
    });

    expect(bilan.aVenir).toBe(0);
    expect(bilan.passe).toBe(120);
  });

  it('ignore les charges supprimées', () => {
    const supprimee = { ...charge('Ancien abonnement', 30, '2026-09-25'), deleted: true };

    const bilan = previsionnelDuMois({
      fixedCharges: [charge('Loyer', 800, '2026-09-25'), supprimee],
      aujourdhui: '2026-09-10'
    });

    expect(bilan.aVenir).toBe(800);
    expect(bilan.nombreAVenir).toBe(1);
  });

  it('range une charge sans date déclarée du côté du passé', () => {
    // `timestamp` est l'instant d'écriture, toujours dans le passé. Une charge
    // qui ne déclare pas de date ne peut pas être annoncée comme à venir :
    // l'affirmer serait inventer.
    const bilan = previsionnelDuMois({
      variableCharges: [{ description: 'Café', amount: 3, timestamp: Date.now() }],
      aujourdhui: '2026-09-10'
    });

    expect(bilan.aVenir).toBe(0);
    expect(bilan.passe).toBe(3);
  });

  it('un montant inexploitable vaut zéro, jamais NaN', () => {
    // Même règle que `computeSummary` : une seule charge sans montant rendait
    // autrefois le bilan entier égal à NaN.
    const bilan = previsionnelDuMois({
      fixedCharges: [
        charge('Loyer', 800, '2026-09-25'),
        charge('Sans montant', undefined, '2026-09-26')
      ],
      aujourdhui: '2026-09-10'
    });

    expect(bilan.aVenir).toBe(800);
    // Elle reste annoncée : elle est bien devant, même sans montant.
    expect(bilan.nombreAVenir).toBe(2);
  });

  describe('selon le mois consulté', () => {
    // Aucun cas particulier dans le code, et ce n'est pas un oubli : la
    // comparaison des dates suffit aux trois situations.

    it('un mois révolu n\'a plus rien devant lui', () => {
      const bilan = previsionnelDuMois({
        fixedCharges: [charge('Loyer', 800, '2026-07-05')],
        aujourdhui: '2026-09-10'
      });

      expect(bilan.aVenir).toBe(0);
      expect(bilan.nombreAVenir).toBe(0);
      expect(bilan.passe).toBe(800);
    });

    it('un mois à venir a tout devant lui', () => {
      const bilan = previsionnelDuMois({
        fixedCharges: [charge('Loyer', 800, '2026-10-05')],
        aujourdhui: '2026-09-10'
      });

      expect(bilan.aVenir).toBe(800);
      expect(bilan.passe).toBe(0);
    });
  });

  describe('les prochaines échéances', () => {

    it('nomme les plus proches, dans l\'ordre', () => {
      const bilan = previsionnelDuMois({
        fixedCharges: [
          charge('Internet', 40, '2026-09-20'),
          charge('EDF', 120, '2026-09-12'),
          charge('Assurance', 30, '2026-09-15')
        ],
        aujourdhui: '2026-09-10'
      });

      expect(bilan.prochaines.map(p => p.description)).toEqual(['EDF', 'Assurance', 'Internet']);
    });

    it('n\'en nomme pas plus que la ligne n\'en peut porter', () => {
      const nombreuses = Array.from({ length: 8 }, (_, i) =>
        charge(`Charge ${i}`, 10, `2026-09-${String(15 + i).padStart(2, '0')}`)
      );

      const bilan = previsionnelDuMois({ fixedCharges: nombreuses, aujourdhui: '2026-09-10' });

      expect(bilan.prochaines).toHaveLength(PROCHAINES_NOMMEES);
      // Le compte total, lui, reste donné.
      expect(bilan.nombreAVenir).toBe(8);
    });

    it('départage deux charges du même jour par leur libellé', () => {
      // Sans ce second critère, l'ordre des clés Firebase déciderait, et la
      // ligne se réécrirait d'un rendu à l'autre sans que rien n'ait changé.
      const bilan = previsionnelDuMois({
        fixedCharges: [
          charge('Netflix', 14, '2026-09-15'),
          charge('Assurance', 30, '2026-09-15')
        ],
        aujourdhui: '2026-09-10'
      });

      expect(bilan.prochaines.map(p => p.description)).toEqual(['Assurance', 'Netflix']);
    });
  });

  describe('ce qui ne doit pas la faire tomber', () => {

    it('accepte de n\'être appelée avec rien', () => {
      const bilan = previsionnelDuMois();

      expect(bilan.total).toBe(0);
      expect(bilan.nombreAVenir).toBe(0);
      expect(bilan.prochaines).toEqual([]);
    });

    it('ignore ce qui n\'est pas une liste', () => {
      const bilan = previsionnelDuMois({
        fixedCharges: null,
        variableCharges: 'des charges',
        aujourdhui: '2026-09-10'
      });

      expect(bilan.total).toBe(0);
    });

    it('ignore une date illisible', () => {
      const bilan = previsionnelDuMois({
        fixedCharges: [charge('Loyer', 800, '05/09/2026')],
        aujourdhui: '2026-09-10'
      });

      expect(bilan.aVenir).toBe(0);
      expect(bilan.passe).toBe(800);
    });
  });
});

/**
 * Savoir se taire, et savoir dire qu'il n'y a rien
 *
 * Le panneau disparaissait dès que tout était passé. Le 25 du mois, avec des
 * charges datées du 3 et du 12, il ne montrait donc rien — et un panneau absent
 * est indiscernable d'une fonctionnalité en panne. C'est ainsi qu'il a été
 * signalé comme ne fonctionnant pas.
 *
 * Il faut donc distinguer deux silences : « j'ai regardé, rien n'est devant »,
 * qui se dit, et « je n'ai aucune date, je n'en sais rien », qui se tait.
 */
describe('Ce que le prévisionnel sait de ce qu\'il ignore', () => {

  const charge = (description, amount, date) => ({ description, amount, date });

  it('compte les charges qui portent une date', () => {
    const bilan = previsionnelDuMois({
      fixedCharges: [
        charge('Loyer', 800, '2026-09-05'),
        { description: 'Vieille charge', amount: 40, timestamp: 1756000000000 }
      ],
      aujourdhui: '2026-09-10'
    });

    expect(bilan.datees).toBe(1);
  });

  it('tout passé, mais daté : le bilan peut l\'affirmer', () => {
    const bilan = previsionnelDuMois({
      fixedCharges: [charge('Loyer', 800, '2026-09-05')],
      aujourdhui: '2026-09-25'
    });

    expect(bilan.nombreAVenir).toBe(0);
    expect(bilan.datees).toBe(1);
  });

  it('aucune date : rien ne permet d\'affirmer que tout est passé', () => {
    // Une charge d'avant le champ « date », ou reconduite depuis une charge qui
    // n'en avait pas. Dire « tout est passé » serait inventer.
    const bilan = previsionnelDuMois({
      fixedCharges: [{ description: 'Loyer', amount: 800, timestamp: 1756000000000 }],
      aujourdhui: '2026-09-25'
    });

    expect(bilan.nombreAVenir).toBe(0);
    expect(bilan.datees).toBe(0);
  });

  it('une date illisible ne compte pas comme une date', () => {
    const bilan = previsionnelDuMois({
      fixedCharges: [charge('Loyer', 800, '05/09/2026')],
      aujourdhui: '2026-09-25'
    });

    expect(bilan.datees).toBe(0);
  });
});
