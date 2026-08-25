import { describe, it, expect } from 'vitest';
import {
  getCurrentPeriod,
  formatPeriod,
  formatDate,
  jourEtMois,
  heureDuJour,
  heureDeLaCharge,
  heureSaisissable,
  heureValide,
  formatDateEtHeure,
} from '../../public/js/utils/date.js';

// ===== getCurrentPeriod =====
describe('getCurrentPeriod', () => {
  it('retourne le format YYYY-MM', () => {
    const result = getCurrentPeriod();
    expect(result).toMatch(/^\d{4}-\d{2}$/);
  });

  it('correspond au mois en cours', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    expect(getCurrentPeriod()).toBe(expected);
  });
});

// ===== formatPeriod =====
describe('formatPeriod', () => {
  it('formate en français long', () => {
    const result = formatPeriod('2026-01');
    expect(result).toMatch(/janvier/i);
    expect(result).toMatch(/2026/);
  });

  it('mars 2026', () => {
    expect(formatPeriod('2026-03')).toMatch(/mars/i);
  });

  it('décembre 2025', () => {
    expect(formatPeriod('2025-12')).toMatch(/décembre/i);
  });
});

// ===== formatDate =====
describe('formatDate', () => {
  it('formate un objet Date', () => {
    const date = new Date(2026, 0, 15); // 15 janvier 2026
    const result = formatDate(date);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2026/);
  });

  it('formate une chaîne ISO', () => {
    const result = formatDate('2026-03-22T00:00:00.000Z');
    expect(result).toMatch(/2026/);
  });

  it('contient le mois en français', () => {
    const date = new Date(2026, 2, 1); // mars 2026
    const result = formatDate(date);
    expect(result).toMatch(/mars/i);
  });
});

// ===== formatDate : l'absence ne doit pas devenir une affirmation =====
describe('formatDate face à une date absente', () => {
  it('rend une chaîne vide plutôt que la date du jour', () => {
    // `Intl.format(undefined)` formate l'instant présent : une charge sans
    // date s'affichait donc comme datée d'aujourd'hui. Sur une carte de
    // dépenses, c'est une information fausse présentée comme sûre.
    expect(formatDate(undefined)).toBe('');
    expect(formatDate(null)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('rend une chaîne vide pour une date illisible', () => {
    expect(formatDate('pas une date')).toBe('');
    expect(formatDate(new Date('x'))).toBe('');
  });

  it('formate toujours ce qui est exploitable', () => {
    expect(formatDate('2026-08-22')).toMatch(/2026/);
    expect(formatDate(new Date(2026, 7, 22))).toMatch(/2026/);
    expect(formatDate(1755820800000)).toMatch(/20\d\d/);
  });
});

describe('jourEtMois', () => {
  // Pour nommer une échéance dans le mois qu'on regarde : « EDF le 12 sept. ».
  // `formatDate` y ajoute l'année, ce qui pèse trop dans une phrase qui en
  // enchaîne trois.

  it('rend le jour et le mois abrégé, sans l\'année', () => {
    expect(jourEtMois('2026-09-12')).toBe('12 sept.');
  });

  it('ne recule pas d\'un jour à l\'ouest de Greenwich', () => {
    // « 2026-09-01 » lu par `new Date` vaut minuit UTC : réaffiché à l'ouest,
    // il devenait le 31 août. La date est reconstruite en local.
    expect(jourEtMois('2026-09-01')).toBe('1 sept.');
  });

  it('garde le mois : la ligne peut décrire un mois à venir', () => {
    expect(jourEtMois('2026-10-05')).toBe('5 oct.');
  });

  it('rend une chaîne vide plutôt qu\'une date inventée', () => {
    expect(jourEtMois('')).toBe('');
    expect(jourEtMois(null)).toBe('');
    expect(jourEtMois('05/09/2026')).toBe('');
    expect(jourEtMois(1756000000000)).toBe('');
  });
});

/**
 * L'heure de la dépense
 *
 * La date répond à « quel jour », jamais à « à quel moment ». Deux courses du
 * même samedi se lisaient donc à l'identique, et rien ne disait laquelle était
 * celle du marché du matin.
 *
 * `heure` est un champ à part, en HH:MM local. Il ne se déduit pas de
 * `timestamp` : cet horodatage est l'instant d'écriture en base, et une course
 * de samedi matin saisie le lundi soir en tirerait « 21:14 » — une heure
 * parfaitement crédible, et fausse.
 */
describe('heureDuJour', () => {
  it('rend HH:MM sur 24 heures', () => {
    expect(heureDuJour(new Date(2026, 7, 25, 8, 5))).toBe('08:05');
    expect(heureDuJour(new Date(2026, 7, 25, 21, 14))).toBe('21:14');
  });

  it('lit l\'heure de l\'appareil, pas UTC', () => {
    // Même raison que `dateDuJour` : `toISOString` rendrait l'heure de
    // Greenwich, soit deux heures de moins qu'à Paris l'été.
    const instant = new Date(2026, 7, 25, 0, 30);
    expect(heureDuJour(instant)).toBe('00:30');
  });

  it('rend l\'heure courante quand on ne lui donne rien', () => {
    expect(heureDuJour()).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
  });
});

describe('heureDeLaCharge', () => {
  it('rend l\'heure déclarée', () => {
    expect(heureDeLaCharge({ heure: '08:30' })).toBe('08:30');
  });

  it('ne déduit rien de `timestamp`', () => {
    // C'est l'instant d'écriture, pas celui de la dépense. En tirer une heure
    // produirait une précision qu'on n'a pas.
    expect(heureDeLaCharge({ timestamp: Date.now() })).toBe('');
  });

  it('traite une heure illisible comme une absence', () => {
    expect(heureDeLaCharge({ heure: '25:00' })).toBe('');
    expect(heureDeLaCharge({ heure: '08:70' })).toBe('');
    expect(heureDeLaCharge({ heure: '8:30' })).toBe('');
    expect(heureDeLaCharge({ heure: 'midi' })).toBe('');
    expect(heureDeLaCharge({ heure: 830 })).toBe('');
  });

  it('accepte les deux bornes de la journée', () => {
    expect(heureDeLaCharge({ heure: '00:00' })).toBe('00:00');
    expect(heureDeLaCharge({ heure: '23:59' })).toBe('23:59');
  });

  it('ne lève sur aucune entrée aberrante', () => {
    expect(heureDeLaCharge(null)).toBe('');
    expect(heureDeLaCharge(undefined)).toBe('');
    expect(heureDeLaCharge('08:30')).toBe('');
  });
});

describe('heureSaisissable', () => {
  it('rend l\'heure de la charge', () => {
    expect(heureSaisissable({ heure: '08:30' })).toBe('08:30');
  });

  it('laisse le champ vide pour une charge qui n\'en porte pas', () => {
    // Rouvrir une dépense d'avant ce champ ne doit pas lui inventer l'heure du
    // jour : l'édition déplacerait la dépense dans la journée sans qu'on l'ait
    // demandé, comme le faisait autrefois la date.
    expect(heureSaisissable({ date: '2026-08-25' })).toBe('');
    expect(heureSaisissable({ timestamp: Date.now() })).toBe('');
  });
});

describe('heureValide', () => {
  it('laisse passer une heure bien formée', () => {
    expect(heureValide('08:30')).toBe('08:30');
  });

  it('rend le vide sur ce qui n\'est pas une heure', () => {
    // La valeur peut venir d'ailleurs que du champ : rejeu de la file hors
    // ligne, import, restauration de sauvegarde.
    expect(heureValide('')).toBe('');
    expect(heureValide('24:00')).toBe('');
    expect(heureValide('08:30:00')).toBe('');
    expect(heureValide(null)).toBe('');
    expect(heureValide(830)).toBe('');
  });
});

describe('formatDateEtHeure', () => {
  it('joint le jour et l\'heure', () => {
    const lisible = formatDateEtHeure({ date: '2026-08-25', heure: '08:30' });

    expect(lisible).toMatch(/25/);
    expect(lisible).toMatch(/août/);
    expect(lisible).toMatch(/2026/);
    expect(lisible).toContain('à 08:30');
  });

  it('n\'affiche que le jour quand l\'heure manque', () => {
    const lisible = formatDateEtHeure({ date: '2026-08-25' });

    expect(lisible).toMatch(/25/);
    expect(lisible).not.toContain('à');
  });

  it('se tait quand la charge n\'apprend rien', () => {
    // `formatDate` d'une valeur absente affiche la date du jour : l'absence
    // deviendrait une affirmation fausse.
    expect(formatDateEtHeure({})).toBe('');
    expect(formatDateEtHeure(null)).toBe('');
  });

  it('replie sur l\'horodatage d\'écriture, sans lui emprunter d\'heure', () => {
    // Une charge d'avant le champ « date » s'affiche à sa date d'écriture,
    // faute de mieux — mais sans heure, qui serait une invention.
    const lisible = formatDateEtHeure({ timestamp: new Date(2026, 7, 25, 21, 14).getTime() });

    expect(lisible).toMatch(/25/);
    expect(lisible).not.toContain('21:14');
  });
});
