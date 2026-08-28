import { describe, it, expect } from 'vitest';
import { coutDesChargesFixes, haussesDepuisLAnDernier } from '../../public/js/utils/cout-annuel.js';

/**
 * Ce qu'une charge fixe coûte à l'année
 *
 * Un loyer se lit par mois : c'est ainsi qu'il se paie. Un abonnement, non —
 * 9,99 € ne se remarquent jamais, 119,88 € se discutent. L'application
 * n'affichait que le mois.
 */

const fixe = (description, amount, extra = {}) => ({
  description, amount, category: 'Maison', paidBy: 'vous', deleted: false, ...extra
});

describe('Le coût des charges fixes', () => {
  it('donne le mois et l\'année', () => {
    const { parMois, parAn, nombre } = coutDesChargesFixes([
      fixe('Loyer', 950), fixe('Internet', 39.99), fixe('Assurance', 24.5)
    ]);

    expect(parMois).toBeCloseTo(1014.49, 6);
    expect(parAn).toBeCloseTo(12173.88, 6);
    expect(nombre).toBe(3);
  });

  it('écarte la corbeille et les dépenses solo', () => {
    // Une dépense solo n'engage pas le foyer : la verser dans un total commun
    // contredirait le bilan affiché à côté.
    const { parMois, nombre } = coutDesChargesFixes([
      fixe('Loyer', 950),
      fixe('Ancienne', 300, { deleted: true }),
      fixe('Salle de sport', 35, { perimetre: 'solo' })
    ]);

    expect(parMois).toBe(950);
    expect(nombre).toBe(1);
  });

  it('un montant inexploitable vaut zéro, jamais NaN', () => {
    const { parMois, parAn } = coutDesChargesFixes([fixe('Loyer', 950), fixe('Bancale')]);
    expect(parMois).toBe(950);
    expect(parAn).toBe(11400);
  });

  it('une liste vide ou illisible rend zéro', () => {
    expect(coutDesChargesFixes([]).parAn).toBe(0);
    expect(coutDesChargesFixes(null).parAn).toBe(0);
  });

  describe('UNE PONCTUELLE NE SE PAIE PAS DOUZE FOIS', () => {
    // `recurring: false` est la bascule « Récurrente (reconduction auto) »
    // décochée. La liste des charges fixes étiquette ces lignes « ponctuelle » :
    // écrire « soit 25 200 € sur une année » deux lignes plus bas contredirait
    // l'étiquette que l'écran vient d'afficher.

    it('la compte une fois, quand la récurrente est comptée douze', () => {
      const { parMois, parAn, ponctuelles } = coutDesChargesFixes([
        fixe('Loyer', 900),
        fixe('Taxe foncière', 1200, { recurring: false })
      ]);

      expect(parMois).toBeCloseTo(2100, 6);
      // 900 × 12 + 1 200 = 12 000. Le défaut rendait 2 100 × 12 = 25 200.
      expect(parAn).toBeCloseTo(12000, 6);
      expect(ponctuelles).toBe(1);
    });

    it('l\'absence du drapeau vaut récurrente — tout l\'existant est préservé', () => {
      // Même convention que `recurrence.js` : c'est le défaut du formulaire, et
      // aucune charge saisie avant l'ajout du drapeau n'en porte.
      const { parAn, ponctuelles } = coutDesChargesFixes([fixe('Loyer', 900)]);

      expect(parAn).toBeCloseTo(10800, 6);
      expect(ponctuelles).toBe(0);
    });

    it('`recurring: true` explicite se comporte comme son absence', () => {
      const explicite = coutDesChargesFixes([fixe('Loyer', 900, { recurring: true })]);
      const implicite = coutDesChargesFixes([fixe('Loyer', 900)]);

      expect(explicite.parAn).toBe(implicite.parAn);
    });

    it('une ponctuelle solo ou supprimée ne compte nulle part', () => {
      const { parAn, ponctuelles } = coutDesChargesFixes([
        fixe('Loyer', 900),
        fixe('Réparation', 500, { recurring: false, deleted: true }),
        fixe('Vélo', 400, { recurring: false, perimetre: 'solo' })
      ]);

      expect(parAn).toBeCloseTo(10800, 6);
      expect(ponctuelles).toBe(0);
    });
  });
});

describe('Ce qui a augmenté depuis l\'an dernier', () => {
  const mois = (charges) => ({
    fixedCharges: Object.fromEntries(charges.map((c, i) => [`f${i}`, c]))
  });

  const HISTORIQUE = {
    '2025-08': mois([fixe('Loyer', 920), fixe('Internet', 29.99), fixe('Assurance', 24.5)]),
    '2026-08': mois([fixe('Loyer', 950), fixe('Internet', 39.99), fixe('Assurance', 24.5)])
  };

  it('compare au MÊME MOIS de l\'an dernier, et chiffre l\'écart', () => {
    // Pas au mois précédent : une charge fixe ne bouge pas d'un mois sur
    // l'autre, et la comparer à son voisin ne dirait rien.
    const vu = haussesDepuisLAnDernier({ periods: HISTORIQUE, moisCourant: '2026-08' });

    expect(vu.compare).toBe('2025-08');
    expect(vu.ecartMensuel).toBeCloseTo(40, 6);
    expect(vu.lignes.map(l => l.description)).toEqual(['Loyer', 'Internet']);
  });

  it('la plus forte hausse d\'abord : c\'est celle sur laquelle on peut agir', () => {
    const vu = haussesDepuisLAnDernier({ periods: HISTORIQUE, moisCourant: '2026-08' });
    expect(vu.lignes[0]).toMatchObject({ description: 'Loyer', avant: 920, apres: 950, ecart: 30 });
  });

  it('une charge stable n\'est pas signalée', () => {
    const vu = haussesDepuisLAnDernier({ periods: HISTORIQUE, moisCourant: '2026-08' });
    expect(vu.lignes.map(l => l.description)).not.toContain('Assurance');
  });

  it('une charge APPARUE depuis n\'a pas augmenté', () => {
    // Les confondre gonflerait la hausse d'un déménagement entier.
    const avecNouvelle = {
      '2025-08': mois([fixe('Loyer', 920)]),
      '2026-08': mois([fixe('Loyer', 920), fixe('Crèche', 480)])
    };
    expect(haussesDepuisLAnDernier({ periods: avecNouvelle, moisCourant: '2026-08' })).toBe(null);
  });

  it('une baisse n\'est pas une hausse', () => {
    const baisse = {
      '2025-08': mois([fixe('Internet', 39.99)]),
      '2026-08': mois([fixe('Internet', 29.99)])
    };
    expect(haussesDepuisLAnDernier({ periods: baisse, moisCourant: '2026-08' })).toBe(null);
  });

  it('un centime d\'écart vient d\'un arrondi, pas d\'une augmentation', () => {
    const bruit = {
      '2025-08': mois([fixe('Eau', 30.00)]),
      '2026-08': mois([fixe('Eau', 30.20)])
    };
    expect(haussesDepuisLAnDernier({ periods: bruit, moisCourant: '2026-08' })).toBe(null);
  });

  it('les accents et la casse ne cassent pas l\'appariement', () => {
    const orthographe = {
      '2025-08': mois([fixe('Électricité', 80)]),
      '2026-08': mois([fixe('electricite', 95)])
    };
    const vu = haussesDepuisLAnDernier({ periods: orthographe, moisCourant: '2026-08' });
    expect(vu.ecartMensuel).toBeCloseTo(15, 6);
  });

  it('se tait sans le mois d\'il y a un an', () => {
    // On ne compare pas à ce qu'on n'a pas.
    const court = { '2026-08': mois([fixe('Loyer', 950)]) };
    expect(haussesDepuisLAnDernier({ periods: court, moisCourant: '2026-08' })).toBe(null);
  });

  it('des entrées inexploitables ne font pas tomber le calcul', () => {
    expect(haussesDepuisLAnDernier({ periods: null, moisCourant: '2026-08' })).toBe(null);
    expect(haussesDepuisLAnDernier({ periods: HISTORIQUE, moisCourant: 'pas un mois' })).toBe(null);
  });

  it('les dépenses solo ne comptent pas dans la hausse du foyer', () => {
    const avecSolo = {
      '2025-08': mois([fixe('Sport', 30, { perimetre: 'solo' })]),
      '2026-08': mois([fixe('Sport', 60, { perimetre: 'solo' })])
    };
    expect(haussesDepuisLAnDernier({ periods: avecSolo, moisCourant: '2026-08' })).toBe(null);
  });
});
