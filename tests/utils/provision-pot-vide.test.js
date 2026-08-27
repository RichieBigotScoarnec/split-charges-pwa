import { describe, it, expect } from 'vitest';
import { acquisSurObjectif } from '../../public/js/utils/versements.js';
import { etatProvision } from '../../public/js/utils/provisions.js';

/**
 * Une provision non alimentée ne réclame pas l'objectif PLUS le déjà-dépensé
 *
 * Signalé à l'usage, capture d'écran à l'appui. L'enveloppe « Vacances » du
 * foyer : objectif 800 €, 22 dépenses pour 1 009,81 €, aucun versement,
 * échéance ce mois-ci. L'écran annonçait :
 *
 *     🗓️ 1 809,81 € par mois
 *     Il manque 1809,81 € pour le 29 août 2026 — ce mois-ci, dernier délai.
 *
 * 1 809,81 = 800 + 1 009,81. La provision demandait de mettre de côté
 * l'objectif **plus la totalité de ce qui avait déjà été dépensé**.
 *
 * La cause : `etatProvision` recevait `bilanCagnotte(...).dansLePot`,
 * c'est-à-dire `versé − dépensé`. Sur un pot vide cela vaut `0 − 1 009,81`,
 * un contenu **négatif** ; et `objectif − (−1 009,81)` fait 1 809,81.
 *
 * L'appelant savait pourtant ce qu'il voulait — son commentaire disait
 * « une provision qu'on n'a pas encore alimentée contient bien zéro ». Le code
 * disait autre chose. C'est la jauge, elle, qui consultait `estAlimentee` et
 * retombait correctement sur la lecture budget ; le bloc de provision, non.
 *
 * `acquisSurObjectif` porte désormais les deux lectures, et une seule fois.
 */

/** Le mois de la capture */
const MOIS = '2026-08';

/** L'enveloppe de la capture : cagnotte, objectif 800 €, échéance ce mois-ci */
const VACANCES = { nature: 'cagnotte', budget: 800, fin: '2026-08-29' };

describe('acquisSurObjectif — les deux lectures', () => {
  it('sans versement, ce qui compte est le déjà-dépensé', () => {
    // Lecture budget : rien n'a été mis de côté, mais l'argent dépensé a bien
    // servi à ce que l'enveloppe vise.
    expect(acquisSurObjectif([], 1009.81)).toBeCloseTo(1009.81, 6);
  });

  it('avec versement, c\'est le contenu réel du pot qui fait foi', () => {
    const versements = [{ montant: 500, auteur: 'vous', deleted: false }];
    expect(acquisSurObjectif(versements, 100)).toBeCloseTo(400, 6);
  });

  it('un versement supprimé ne compte pas : on retombe sur la lecture budget', () => {
    const versements = [{ montant: 500, auteur: 'vous', deleted: true }];
    expect(acquisSurObjectif(versements, 300)).toBeCloseTo(300, 6);
  });

  it('une dépense illisible vaut zéro, jamais NaN', () => {
    expect(acquisSurObjectif([], undefined)).toBe(0);
    expect(acquisSurObjectif([], 'beaucoup')).toBe(0);
  });
});

describe('L\'enveloppe « Vacances » de la capture', () => {
  it('un objectif déjà dépassé ne demande plus rien', () => {
    // 1 009,81 € dépensés sur 800 € visés : il n'y a plus rien à provisionner.
    const etat = etatProvision(VACANCES, acquisSurObjectif([], 1009.81), MOIS);

    expect(etat.manque).toBe(0);
    expect(etat.parMois).toBe(0);
    expect(etat.atteinte).toBe(true);
  });

  it('et surtout : plus jamais 1 809,81 €', () => {
    const etat = etatProvision(VACANCES, acquisSurObjectif([], 1009.81), MOIS);
    expect(etat.manque).not.toBeCloseTo(1809.81, 2);
    expect(etat.parMois).not.toBeCloseTo(1809.81, 2);
  });
});

describe('Témoin négatif — le contrôle sait échouer', () => {
  it('l\'ancienne formule redonne bien 1 809,81 €', () => {
    // `versé − dépensé` sur un pot vide, tel que l'appelant le passait.
    const ancienContenu = 0 - 1009.81;
    const etat = etatProvision(VACANCES, ancienContenu, MOIS);

    expect(etat.manque).toBeCloseTo(1809.81, 2);
    expect(etat.parMois).toBeCloseTo(1809.81, 2);
  });
});

describe('Les cas que la correction ne devait pas casser', () => {
  it('une provision neuve garde tout son sens : rien dépensé, rien versé', () => {
    // Le cas fondateur des provisions : la taxe foncière. C'est précisément
    // celui que l'appelant voulait servir en contournant `estAlimentee`.
    const taxe = { nature: 'cagnotte', budget: 1200, fin: '2027-01-15' };
    const etat = etatProvision(taxe, acquisSurObjectif([], 0), '2026-08');

    expect(etat.manque).toBeCloseTo(1200, 6);
    expect(etat.restants).toBe(6);          // août → janvier, échéance comprise
    expect(etat.parMois).toBeCloseTo(200, 6);
  });

  it('un budget partiellement consommé demande le reste', () => {
    const etat = etatProvision(
      { nature: 'cagnotte', budget: 800, fin: '2026-09-30' },
      acquisSurObjectif([], 300),
      MOIS
    );

    expect(etat.manque).toBeCloseTo(500, 6);
    expect(etat.restants).toBe(2);
    expect(etat.parMois).toBeCloseTo(250, 6);
  });

  it('une cagnotte alimentée suit son contenu réel', () => {
    const versements = [
      { montant: 300, auteur: 'vous', deleted: false },
      { montant: 200, auteur: 'conjointe', deleted: false }
    ];
    const etat = etatProvision(
      { nature: 'cagnotte', budget: 1200, fin: '2026-10-31' },
      acquisSurObjectif(versements, 100),
      MOIS
    );

    // 500 versés − 100 dépensés = 400 dans le pot ; il manque 800 sur 3 mois.
    expect(etat.dansLePot).toBeCloseTo(400, 6);
    expect(etat.manque).toBeCloseTo(800, 6);
    expect(etat.parMois).toBeCloseTo(800 / 3, 6);
  });

  it('une enveloppe mensuelle reste hors du calcul', () => {
    const etat = etatProvision(
      { nature: 'mensuelle', budget: 400, fin: '2026-08-31' },
      acquisSurObjectif([], 900),
      MOIS
    );

    expect(etat.concernee).toBe(false);
    expect(etat.parMois).toBe(0);
  });
});
