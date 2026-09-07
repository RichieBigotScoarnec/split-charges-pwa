import { describe, it, expect } from 'vitest';
import {
  MARQUEUR_REVOLU,
  LEVEE_DU_MALENTENDU,
  estRevolu,
  libelleMarque,
  doitLeverLeMalentendu
} from '../../public/js/utils/mois-revolu.js';

/**
 * Ce module ne refait aucune part d'`etatDuMois` : il la lit. Ces contrôles
 * tiennent donc ce qu'il ajoute — le marquage du libellé, et la règle de
 * transition qui décide quand le malentendu se lève.
 *
 * Le mois réel est passé explicitement partout : aucun de ces cas ne dépend du
 * calendrier de la machine qui les joue.
 */

const REEL = '2026-09';

describe('estRevolu — les trois états, et rien entre eux', () => {
  it('un mois passé est révolu', () => {
    expect(estRevolu('2026-08', REEL)).toBe(true);
    expect(estRevolu('2025-12', REEL)).toBe(true);
  });

  it('le mois en cours ne l\'est pas', () => {
    expect(estRevolu('2026-09', REEL)).toBe(false);
  });

  it('un mois à VENIR ne l\'est pas — c\'était le défaut', () => {
    // `period.js` comparait « ce mois est-il celui d'aujourd'hui ? » et
    // annonçait « archivé » dès que la réponse était non. Octobre 2026
    // s'affichait donc comme archivé.
    expect(estRevolu('2026-10', REEL)).toBe(false);
    expect(estRevolu('2027-01', REEL)).toBe(false);
  });

  it('une valeur illisible n\'est pas révolue plutôt que de lever', () => {
    // `etatDuMois` rend `null`, et `null === 'revolu'` est faux. Un rendu qui
    // tombe emporterait tout l'écran ; un marqueur absent ne coûte rien.
    for (const valeur of [null, undefined, '', '2026-13', '2026-08-10', 42]) {
      expect(estRevolu(valeur, REEL)).toBe(false);
    }
    expect(estRevolu('2026-08', null)).toBe(false);
  });
});

describe('libelleMarque — l\'état dans le libellé', () => {
  it('marque un mois révolu, marqueur en tête', () => {
    expect(libelleMarque('août 2026', '2026-08', REEL))
      .toBe(`${MARQUEUR_REVOLU} août 2026`);
  });

  it('laisse le mois en cours intact', () => {
    expect(libelleMarque('septembre 2026', '2026-09', REEL)).toBe('septembre 2026');
  });

  it('laisse un mois à venir intact', () => {
    expect(libelleMarque('octobre 2026', '2026-10', REEL)).toBe('octobre 2026');
  });

  it('le marqueur PRÉCÈDE le nom', () => {
    // Dans un `<select>` fermé, c'est la fin du texte qui se rogne quand la
    // place manque. Un marqueur rogné ne dit plus rien.
    const marque = libelleMarque('septembre 2026', '2026-08', REEL);
    expect(marque.indexOf(MARQUEUR_REVOLU)).toBe(0);
  });

  it('rend le libellé tel quel s\'il n\'y a rien à marquer', () => {
    expect(libelleMarque('', '2026-08', REEL)).toBe('');
    expect(libelleMarque(null, '2026-08', REEL)).toBe(null);
  });

  it('ne marque pas deux fois', () => {
    // Le sélecteur se repeuple à chaque changement de mois, et le libellé
    // vient de `formatPeriod` — jamais du DOM. Ce cas fige la propriété
    // plutôt que la mécanique : deux passages rendent la même chose.
    const une = libelleMarque('août 2026', '2026-08', REEL);
    const deux = libelleMarque('août 2026', '2026-08', REEL);
    expect(deux).toBe(une);
    expect(une.split(MARQUEUR_REVOLU)).toHaveLength(2);
  });
});

describe('doitLeverLeMalentendu — une fois par excursion', () => {
  it('annonce en entrant dans le passé depuis le mois en cours', () => {
    expect(doitLeverLeMalentendu('2026-09', '2026-08', REEL)).toBe(true);
  });

  it('annonce au premier rendu si le mois affiché est révolu', () => {
    // `precedent` vaut `null` avant tout changement. L'application ouvre
    // aujourd'hui sur le mois réel, mais la règle est écrite pour le jour où
    // un raccourci d'URL choisira le mois.
    expect(doitLeverLeMalentendu(null, '2026-08', REEL)).toBe(true);
  });

  it('NE RÉPÈTE PAS en passant d\'un mois révolu à un autre', () => {
    // Août → juillet → juin est un seul voyage.
    expect(doitLeverLeMalentendu('2026-08', '2026-07', REEL)).toBe(false);
    expect(doitLeverLeMalentendu('2026-07', '2026-06', REEL)).toBe(false);
  });

  it('n\'annonce rien sur le mois en cours', () => {
    expect(doitLeverLeMalentendu('2026-08', '2026-09', REEL)).toBe(false);
    expect(doitLeverLeMalentendu('2026-09', '2026-09', REEL)).toBe(false);
  });

  it('n\'annonce rien sur un mois à venir', () => {
    expect(doitLeverLeMalentendu('2026-09', '2026-10', REEL)).toBe(false);
    expect(doitLeverLeMalentendu('2026-08', '2026-10', REEL)).toBe(false);
  });

  it('ré-annonce après être repassé par le présent', () => {
    // Deux excursions, deux messages : c'est la propriété voulue, et c'est
    // elle qui distingue « une fois par visite » de « une seule fois ».
    expect(doitLeverLeMalentendu('2026-09', '2026-08', REEL)).toBe(true);
    expect(doitLeverLeMalentendu('2026-08', '2026-09', REEL)).toBe(false);
    expect(doitLeverLeMalentendu('2026-09', '2026-07', REEL)).toBe(true);
  });

  it('revenir d\'un mois à venir vers le passé annonce', () => {
    // Octobre n'est pas révolu : passer d'octobre à août est bien une entrée.
    expect(doitLeverLeMalentendu('2026-10', '2026-08', REEL)).toBe(true);
  });
});

describe('les deux textes exportés', () => {
  it('la levée de malentendu porte le mot qui la justifie', () => {
    // « lecture seule » était faux, et c'est ce mot-là qui ferme le
    // malentendu : sans lui, le message ne dit plus que l'état.
    expect(LEVEE_DU_MALENTENDU).toContain('modifiable');
    expect(LEVEE_DU_MALENTENDU).toContain(MARQUEUR_REVOLU);
  });
});
