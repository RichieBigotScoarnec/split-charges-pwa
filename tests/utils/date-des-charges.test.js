import { describe, it, expect } from 'vitest';
import {
  dateDuJour,
  dateDeLaCharge,
  dateSaisissable,
  reporterDansLaPeriode,
  formatDate
} from '../../public/js/utils/date.js';

/**
 * La date d'une dépense
 *
 * Signalé à l'usage : aucune charge n'affichait de date. Le défaut était plus
 * profond qu'un affichage manquant — les deux formulaires complets n'écrivaient
 * aucune date, et les exports remplissaient leur colonne « Date » avec
 * `timestamp`, l'instant d'écriture en base.
 *
 * Ces deux choses ne sont pas la même. Une course de samedi saisie le lundi
 * porte les deux, et seule la première est vraie. Pour une charge fixe
 * reconduite, l'écart est systématique : la reconduction réécrit `timestamp`,
 * donc le loyer de février était daté du jour où la reconduction s'est
 * déclenchée.
 */

describe('Le jour courant', () => {
  it('est celui du fuseau de l\'appareil, pas celui d\'UTC', () => {
    // `new Date().toISOString().split('T')[0]` rend le jour UTC. En hiver la
    // France est à UTC+1 : une course faite à 00h30 était datée de la veille.
    // Rien ne le signalait, puisque aucune vue n'affichait la date.
    const minuitEtDemi = new Date(2026, 0, 15, 0, 30, 0);
    expect(dateDuJour(minuitEtDemi)).toBe('2026-01-15');

    const presqueMinuit = new Date(2026, 0, 15, 23, 45, 0);
    expect(dateDuJour(presqueMinuit)).toBe('2026-01-15');
  });

  it('complète le mois et le jour à deux chiffres', () => {
    // « 2026-1-5 » n'est pas accepté par <input type="date"> : le champ reste
    // vide, en silence.
    expect(dateDuJour(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('rend le jour courant sans argument', () => {
    expect(dateDuJour()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('La date que porte une charge', () => {
  it('retient la date déclarée quand elle existe', () => {
    const charge = { date: '2026-08-15', timestamp: Date.parse('2026-08-17T10:00:00Z') };
    // Saisie le 17 pour une dépense du 15 : c'est le 15 qui compte.
    expect(dateDeLaCharge(charge)).toBe('2026-08-15');
  });

  it('retombe sur l\'horodatage pour les charges d\'avant ce champ', () => {
    // Approximation assumée, pas une invention : la saisie suivait
    // généralement la dépense de peu.
    const horodatage = Date.parse('2026-08-17T10:00:00Z');
    expect(dateDeLaCharge({ timestamp: horodatage })).toBe(horodatage);
  });

  it('ne rend rien quand la charge n\'apprend rien', () => {
    // `formatDate(undefined)` affichait autrefois la date du jour : l'absence
    // devenait une affirmation fausse. Mieux vaut un vide.
    expect(dateDeLaCharge({})).toBeNull();
    expect(dateDeLaCharge({ date: '', timestamp: 0 })).toBeNull();
    expect(dateDeLaCharge(null)).toBeNull();
    expect(dateDeLaCharge('2026-08-15')).toBeNull();
  });
});

describe('La date rendue au champ de saisie', () => {
  it('rend la date déclarée telle quelle', () => {
    expect(dateSaisissable({ date: '2026-08-15' })).toBe('2026-08-15');
  });

  it('convertit un horodatage, que le champ refuserait', () => {
    // `<input type="date">` n'accepte que AAAA-MM-JJ. Un horodatage le laisse
    // vide sans un mot : rouvrir une vieille charge pour corriger son montant
    // l'aurait réenregistrée à la date du jour, déplaçant la dépense dans le
    // temps sans que personne ne l'ait demandé.
    const charge = { timestamp: new Date(2026, 7, 17, 14, 30).getTime() };
    expect(dateSaisissable(charge)).toBe('2026-08-17');
  });

  it('rend toujours une date exploitable, jamais une chaîne vide', () => {
    expect(dateSaisissable({})).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateSaisissable(null)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('Le report d\'une date lors de la reconduction', () => {
  it('garde le quantième et change de mois', () => {
    // Un loyer prélevé le 5 le reste.
    expect(reporterDansLaPeriode('2026-01-05', '2026-02')).toBe('2026-02-05');
  });

  it('ramène au dernier jour quand le mois est plus court', () => {
    // Sans cette borne, `Date` déborde sans se plaindre : le 31 janvier
    // reporté en février donnerait le 3 mars.
    expect(reporterDansLaPeriode('2026-01-31', '2026-02')).toBe('2026-02-28');
    expect(reporterDansLaPeriode('2026-01-31', '2026-04')).toBe('2026-04-30');
  });

  it('tient compte des années bissextiles', () => {
    expect(reporterDansLaPeriode('2028-01-31', '2028-02')).toBe('2028-02-29');
  });

  it('traverse une année', () => {
    expect(reporterDansLaPeriode('2026-12-10', '2027-01')).toBe('2027-01-10');
  });

  it('ne rend rien plutôt qu\'une date inventée', () => {
    // Une charge d'avant ce champ n'a pas de date : la reconduction doit lui en
    // laisser aucune, pas lui en fabriquer une.
    expect(reporterDansLaPeriode(undefined, '2026-02')).toBeNull();
    expect(reporterDansLaPeriode('', '2026-02')).toBeNull();
    expect(reporterDansLaPeriode('15/01/2026', '2026-02')).toBeNull();
    expect(reporterDansLaPeriode('2026-01-05', '2026-13')).toBeNull();
    expect(reporterDansLaPeriode('2026-01-05', 'février')).toBeNull();
  });
});

describe('L\'affichage d\'un jour civil', () => {
  it('n\'est pas décalé par le passage en UTC', () => {
    // « 2026-08-23 » seul est interprété comme minuit UTC puis réaffiché dans
    // le fuseau de l'appareil : à l'ouest de Greenwich, la date reculait d'un
    // jour. Un jour civil n'a pas d'heure.
    expect(formatDate('2026-08-23')).toContain('23');
    expect(formatDate('2026-01-01')).toContain('2026');
    expect(formatDate('2026-01-01')).toContain('1');
  });

  it('reste vide quand il n\'y a rien à dire', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
    expect(formatDate('pas une date')).toBe('');
  });

  it('sait encore lire un horodatage', () => {
    // Le repli des charges anciennes en dépend.
    expect(formatDate(new Date(2026, 7, 23, 12, 0).getTime())).toContain('23');
  });
});
