import { describe, it, expect } from 'vitest';
import {
  cleVersementAuto, clesDuMois, versementMensuelLisible, planVersementMensuel
} from '../../public/js/utils/versement-mensuel.js';

/**
 * Le versement qui se fait tout seul, chaque mois
 *
 * Mêmes garanties que la reconduction des charges fixes : une seule fois par
 * mois, jamais vers le passé. Ce sont les SILENCES qui portent la correction —
 * une écriture d'argent qui se répète est le défaut le plus cher qu'on puisse
 * introduire dans une application dont tout l'objet est un solde exact.
 */

const VACANCES = Object.freeze({
  id: 'vacances-2027',
  label: 'Vacances 2027',
  cloturee: false,
  debut: null,
  fin: null,
  versementMensuel: { montant: 150, auteur: 'deux' }
});

/** Le cas nominal : septembre à alimenter, on est en septembre */
const NOMINAL = Object.freeze({
  enveloppe: VACANCES,
  cible: '2026-09',
  moisCourant: '2026-09',
  clesExistantes: []
});

describe('La clé est l\'empreinte', () => {
  it('elle est déterministe, et dit le mois et la personne', () => {
    expect(cleVersementAuto('2026-09', 'vous')).toBe('auto-2026-09-vous');
    expect(cleVersementAuto('2026-09', 'conjointe')).toBe('auto-2026-09-conjointe');
  });

  it('elle ne peut pas se confondre avec une clé poussée par Firebase', () => {
    // Celles-ci commencent toujours par `-`. Sans cette distinction, une clé
    // automatique pourrait un jour heurter une clé poussée.
    expect(cleVersementAuto('2026-09', 'vous').startsWith('-')).toBe(false);
  });

  it('un mois porte les DEUX clés, quel que soit le réglage', () => {
    // Un foyer qui passe de « à deux » à « moi seul » en cours d'année ne doit
    // pas se voir réalimenter un mois déjà alimenté sous l'autre forme.
    expect(clesDuMois('2026-09')).toEqual(['auto-2026-09-vous', 'auto-2026-09-conjointe']);
  });
});

describe('Le réglage porté par l\'enveloppe', () => {
  it('un montant et un destinataire', () => {
    expect(versementMensuelLisible({ montant: 150, auteur: 'deux' }))
      .toEqual({ montant: 150, auteur: 'deux' });
  });

  it('un montant textuel est lu comme partout ailleurs', () => {
    expect(versementMensuelLisible({ montant: '150,50', auteur: 'vous' }))
      .toEqual({ montant: 150.5, auteur: 'vous' });
  });

  it.each([
    ['sans montant', { auteur: 'deux' }],
    ['montant nul', { montant: 0, auteur: 'deux' }],
    ['montant négatif', { montant: -10, auteur: 'deux' }],
    ['montant démesuré', { montant: 99999999999, auteur: 'deux' }],
    ['sans destinataire', { montant: 150 }],
    ['destinataire inconnu', { montant: 150, auteur: 'licorne' }],
    ['pas un objet', 'oui'],
    ['absent', null]
  ])('%s : rien à faire', (_, brut) => {
    // Un réglage à moitié lisible ne doit pas être rattrapé : un montant sans
    // destinataire ne peut pas s'écrire, et trancher à la place du foyer
    // mettrait de l'argent sur le compte de quelqu'un qu'il n'a pas désigné.
    expect(versementMensuelLisible(brut)).toBeNull();
  });
});

describe('Le cas où il faut alimenter', () => {
  it('rend le montant, le destinataire et le premier du mois', () => {
    // Le premier du mois, et non le jour de l'ouverture : ouvrir le 17 ne doit
    // pas dater du 17 une décision prise pour tout le mois.
    expect(planVersementMensuel(NOMINAL))
      .toEqual({ montant: 150, auteur: 'deux', date: '2026-09-01' });
  });

  it('un mois À VENIR est alimenté, lui aussi', () => {
    // Consulter octobre en septembre et le préparer est un geste légitime : ce
    // qui est interdit, c'est de réécrire le passé.
    expect(planVersementMensuel({ ...NOMINAL, cible: '2026-10' })).not.toBeNull();
  });

  it('la fenêtre de l\'enveloppe se compare au MOIS, pas au jour', () => {
    // Une échéance au 29 août n'ampute pas août : le versement du mois
    // appartient au mois entier.
    const aout = { ...VACANCES, fin: '2026-08-29' };
    expect(planVersementMensuel({
      ...NOMINAL, enveloppe: aout, cible: '2026-08', moisCourant: '2026-08'
    })).not.toBeNull();
  });
});

describe('Les six raisons de ne rien faire', () => {
  it('le mois visé est PASSÉ', () => {
    // Ouvrir un mois ancien est une consultation, pas une reprise d'activité.
    // Y déverser un versement réécrirait l'histoire d'un pot dont le contenu a
    // déjà servi à juger une échéance.
    expect(planVersementMensuel({ ...NOMINAL, cible: '2026-08' })).toBeNull();
  });

  it('l\'enveloppe est close', () => {
    expect(planVersementMensuel({
      ...NOMINAL, enveloppe: { ...VACANCES, cloturee: true }
    })).toBeNull();
  });

  it('elle ne porte aucun versement mensuel', () => {
    expect(planVersementMensuel({
      ...NOMINAL, enveloppe: { ...VACANCES, versementMensuel: null }
    })).toBeNull();
  });

  it('le mois précède son début', () => {
    expect(planVersementMensuel({
      ...NOMINAL, enveloppe: { ...VACANCES, debut: '2026-10-01' }
    })).toBeNull();
  });

  it('le mois suit son échéance', () => {
    // Une cagnotte « Vacances 2027 » ne doit pas continuer d'être alimentée en
    // 2028 parce que personne n'a pensé à retirer le réglage.
    expect(planVersementMensuel({
      ...NOMINAL, enveloppe: { ...VACANCES, fin: '2026-08-29' }
    })).toBeNull();
  });

  it('le mois est DÉJÀ alimenté', () => {
    expect(planVersementMensuel({
      ...NOMINAL, clesExistantes: ['auto-2026-09-vous']
    })).toBeNull();
  });

  it('une seule des deux clés suffit à dire que c\'est fait', () => {
    // Un mois à moitié écrit reste à moitié écrit : le pot montre ce qu'il
    // contient, et compléter d'office ferait revenir une ligne que le foyer a
    // peut-être retirée exprès.
    expect(planVersementMensuel({
      ...NOMINAL, clesExistantes: ['auto-2026-09-conjointe']
    })).toBeNull();
  });

  it('un versement RETIRÉ ne revient pas', () => {
    // La suppression est douce : la clé demeure, et le retrait tient. Sans
    // cela, retirer un versement automatique le ferait réapparaître à la
    // prochaine ouverture du mois — le défaut exact que `reconductedFrom`
    // existe pour empêcher sur les charges.
    expect(planVersementMensuel({
      ...NOMINAL, clesExistantes: ['auto-2026-09-vous', 'auto-2026-09-conjointe']
    })).toBeNull();
  });

  it('les clés d\'un AUTRE mois ne comptent pas', () => {
    expect(planVersementMensuel({
      ...NOMINAL, clesExistantes: ['auto-2026-08-vous', '-NabcDEF123']
    })).not.toBeNull();
  });
});

describe('Les entrées illisibles ne produisent rien', () => {
  it.each([
    ['sans argument', undefined],
    ['cible absente', { ...NOMINAL, cible: undefined }],
    ['cible mal formée', { ...NOMINAL, cible: '2026-9' }],
    ['mois 13', { ...NOMINAL, cible: '2026-13' }],
    ['mois courant absent', { ...NOMINAL, moisCourant: null }],
    ['enveloppe absente', { ...NOMINAL, enveloppe: null }]
  ])('%s', (_, entree) => {
    expect(planVersementMensuel(entree)).toBeNull();
  });

  it('des clés existantes non tabulaires valent aucune clé', () => {
    expect(planVersementMensuel({ ...NOMINAL, clesExistantes: 'auto-2026-09-vous' }))
      .not.toBeNull();
  });
});
