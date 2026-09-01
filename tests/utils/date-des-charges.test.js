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

describe('Le banc d\'essai lui-même', () => {
  /**
   * Sans ce contrôle, tout ce fichier peut devenir muet sans prévenir.
   *
   * Les tests s'exécutaient en UTC. Or en UTC le jour local et le jour UTC
   * coïncident toujours : les contrôles ci-dessous passaient quoi qu'il arrive,
   * y compris avec le défaut réintroduit. Mesuré — le sabotage n'échouait qu'en
   * forçant le fuseau à la main.
   *
   * `vitest.config.mjs` fixe donc `TZ=Europe/Paris`, le fuseau du foyer. Si ce
   * réglage disparaît, c'est ici que ça se voit, plutôt que nulle part.
   */
  it('s\'exécute dans le fuseau du foyer, seul endroit où ces cas prouvent quelque chose', () => {
    expect(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      'les tests de date ne prouvent rien hors d\'un fuseau décalé d\'UTC : voir test.env.TZ dans vitest.config.mjs'
    ).toBe('Europe/Paris');
  });

  it('le fuseau bascule bien deux fois dans l\'année', () => {
    // Si la base de fuseaux n'était pas chargée, Paris resterait à UTC+0 toute
    // l'année et les cas d'été comme d'hiver deviendraient vides.
    const hiver = -new Date(2026, 0, 15).getTimezoneOffset() / 60;
    const ete = -new Date(2026, 6, 15).getTimezoneOffset() / 60;
    expect(hiver, 'heure d\'hiver attendue à UTC+1').toBe(1);
    expect(ete, 'heure d\'été attendue à UTC+2').toBe(2);
  });
});

describe('Le jour courant', () => {
  it('tient en heure d\'hiver, où la France est à UTC+1', () => {
    // `toISOString().split('T')[0]` rend le jour UTC : de minuit à 01h00, il
    // renvoyait la veille. Mesuré : 2026-01-14 au lieu de 2026-01-15.
    expect(dateDuJour(new Date(2026, 0, 15, 0, 30))).toBe('2026-01-15');
    expect(dateDuJour(new Date(2026, 0, 15, 23, 45))).toBe('2026-01-15');
  });

  it('tient en heure d\'été, où la fenêtre de faux était deux fois plus large', () => {
    // À UTC+2, ce sont les deux premières heures de la nuit qui basculaient sur
    // la veille — pas une seule. J'avais annoncé « en hiver » : c'était
    // incomplet, et l'été est le cas le plus défavorable.
    expect(dateDuJour(new Date(2026, 6, 15, 0, 30))).toBe('2026-07-15');
    expect(dateDuJour(new Date(2026, 6, 15, 1, 30))).toBe('2026-07-15');
    expect(dateDuJour(new Date(2026, 6, 15, 23, 45))).toBe('2026-07-15');
  });

  it('traverse les deux nuits de bascule sans se troubler', () => {
    // Le dernier dimanche de mars, 02h00 devient 03h00 ; le dernier dimanche
    // d'octobre, 03h00 redevient 02h00 — cette heure-là existe donc deux fois.
    // Le jour civil, lui, ne devient jamais ambigu : c'est l'instant qui l'est.
    expect(dateDuJour(new Date(2026, 2, 29, 1, 30))).toBe('2026-03-29');
    expect(dateDuJour(new Date(2026, 2, 29, 3, 30))).toBe('2026-03-29');
    expect(dateDuJour(new Date(2026, 9, 25, 2, 30))).toBe('2026-10-25');
    expect(dateDuJour(new Date(2026, 9, 25, 3, 30))).toBe('2026-10-25');
  });

  it('ne renvoie pas une dépense dans l\'année précédente', () => {
    // Le cas le plus visible : le 1er janvier à 00h01, l'ancien calcul datait
    // la dépense du 31 décembre. La charge était bien rangée dans le mois
    // courant — la période, elle, se calcule en local depuis toujours — mais
    // elle s'affichait comme appartenant au mois d'avant.
    expect(dateDuJour(new Date(2027, 0, 1, 0, 1))).toBe('2027-01-01');
    expect(dateDuJour(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
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
