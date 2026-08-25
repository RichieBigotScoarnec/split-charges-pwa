import { describe, it, expect } from 'vitest';
import {
  mediane, moyenne, ecartAuHabituel, tauxDEffort,
  resteAVivre, partDuFixe, categorieQuiABouge
} from '../../public/js/utils/tendances.js';

/**
 * Ce que six mois de dépenses ont à dire
 *
 * Le panneau affichait moyenne, minimum, maximum et tendance. Deux de ces
 * quatre chiffres étaient fragiles, et l'ensemble répondait à « quel est le
 * plus gros mois ? » plutôt qu'à « est-ce qu'on s'en sort ? ».
 */

// Le jeu qui a servi à mesurer les deux défauts : trois mois ordinaires, un
// mois exceptionnel.
const MOIS = [380.40, 512.90, 445.10, 1259.97];

describe('Le mois ordinaire', () => {
  it('la médiane ne se laisse pas tirer par un mois exceptionnel', () => {
    // La moyenne annonçait 649,59 € quand trois mois sur quatre tiennent entre
    // 380 et 512 — un mois qui n'a jamais existé.
    expect(mediane(MOIS)).toBeCloseTo(479, 0);
    expect(moyenne(MOIS)).toBeCloseTo(649.59, 2);
  });

  it('se calcule sur un nombre impair de mois', () => {
    expect(mediane([100, 300, 200])).toBe(200);
  });

  it('ignore ce qui n\'est pas un nombre', () => {
    // Une charge héritée sans montant rendait NaN, qui se propageait ensuite
    // dans tout le panneau.
    expect(mediane([100, undefined, 300])).toBe(200);
    expect(moyenne([100, null, 300])).toBe(200);
  });

  it('ne rend rien plutôt que NaN sur une liste vide', () => {
    expect(mediane([])).toBeNull();
    expect(moyenne(null)).toBeNull();
  });
});

describe('L\'écart au mois habituel', () => {
  it('compare le dernier mois à la médiane des précédents', () => {
    // L'ancienne tendance comparait le premier et le dernier, en ignorant tout
    // ce qu'il y a entre : sur ce jeu, elle annonçait +231 % à partir de deux
    // points sur quatre.
    const ecart = ecartAuHabituel(MOIS);

    expect(ecart.reference).toBeCloseTo(445.10, 2);
    expect(ecart.variation).toBeCloseTo(814.87, 2);
    expect(ecart.part).toBeCloseTo(183.1, 1);
  });

  it('ne se laisse pas dicter par le mois de départ', () => {
    // C'était la fragilité de l'ancienne mesure. Les deux séries ne diffèrent
    // que par leur premier mois ; leur fin est identique, donc le verdict
    // devrait l'être à peu près aussi.
    const atypique = [1000, 400, 420, 410];
    const ordinaire = [390, 400, 420, 410];

    // L'ancienne définition : dernier moins premier.
    const ancienne = serie => serie[serie.length - 1] - serie[0];
    const ecartAncien = Math.abs(ancienne(atypique) - ancienne(ordinaire));

    const nouvelle = serie => ecartAuHabituel(serie).variation;
    const ecartNouveau = Math.abs(nouvelle(atypique) - nouvelle(ordinaire));

    // 610 € d'écart de verdict pour l'ancienne, 20 € pour la nouvelle.
    expect(ecartAncien).toBeCloseTo(610, 0);
    expect(ecartNouveau).toBeCloseTo(20, 0);
    expect(ecartNouveau).toBeLessThan(ecartAncien / 10);
  });

  it('voit une baisse', () => {
    const ecart = ecartAuHabituel([500, 500, 300]);
    expect(ecart.variation).toBe(-200);
    expect(ecart.part).toBeCloseTo(-40, 1);
  });

  it('exige deux mois : un seul n\'est pas un écart', () => {
    expect(ecartAuHabituel([450])).toBeNull();
    expect(ecartAuHabituel([])).toBeNull();
  });

  it('ne rend pas de pourcentage sans référence positive', () => {
    // Un mois à zéro suivi d'un mois à 400 € n'est pas « +∞ % ».
    const ecart = ecartAuHabituel([0, 400]);
    expect(ecart.variation).toBe(400);
    expect(ecart.part).toBeNull();
  });
});

describe('Le taux d\'effort', () => {
  it('rapporte les charges aux revenus', () => {
    // « 1 260 € » ne dit rien ; « 29 % de vos revenus » dit tout.
    expect(tauxDEffort(1260, { vous: 2500, conjointe: 1800 })).toBeCloseTo(29.3, 1);
  });

  it('compte les revenus complémentaires, comme le prorata', () => {
    const sans = tauxDEffort(1000, { vous: 2000, conjointe: 2000 });
    const avec = tauxDEffort(1000, { vous: 2000, conjointe: 2000, extraVous: 1000 });

    expect(sans).toBeCloseTo(25, 1);
    expect(avec).toBeCloseTo(20, 1);
  });

  it('ne rend rien tant que les revenus sont inconnus', () => {
    // Mieux vaut une carte muette qu'un taux calculé sur zéro.
    expect(tauxDEffort(1000, { vous: 0, conjointe: 0 })).toBeNull();
    expect(tauxDEffort(1000, null)).toBeNull();
    expect(tauxDEffort(undefined, { vous: 2000, conjointe: 2000 })).toBeNull();
  });
});

describe('Le reste à vivre', () => {
  it('retranche les charges des revenus', () => {
    expect(resteAVivre(1260, { vous: 2500, conjointe: 1800 })).toBe(3040);
  });

  it('devient négatif quand les charges dépassent', () => {
    // Le cas mérite d'être dit, pas masqué.
    expect(resteAVivre(5000, { vous: 2000, conjointe: 1000 })).toBe(-2000);
  });

  it('ne rend rien sans revenus renseignés', () => {
    expect(resteAVivre(1000, { vous: 0, conjointe: 0 })).toBeNull();
  });
});

describe('La part du fixe', () => {
  it('dit la marge de manœuvre du foyer', () => {
    expect(partDuFixe(800, 200)).toBe(80);
    expect(partDuFixe(400, 600)).toBe(40);
  });

  it('ne rend rien sur un mois vide', () => {
    expect(partDuFixe(0, 0)).toBeNull();
    expect(partDuFixe(undefined, 200)).toBeNull();
  });
});

describe('La catégorie qui a le plus bougé', () => {
  it('désigne la plus grande variation', () => {
    // « Courses : +85 € » désigne quoi regarder ; « total +231 % » ne désigne
    // rien.
    const bougee = categorieQuiABouge(
      { Courses: 300, Essence: 120, Loisirs: 60 },
      { Courses: 215, Essence: 110, Loisirs: 55 }
    );

    expect(bougee.categorie).toBe('Courses');
    expect(bougee.variation).toBeCloseTo(85, 2);
  });

  it('retient aussi bien une baisse qu\'une hausse', () => {
    const bougee = categorieQuiABouge(
      { Courses: 100, Restaurant: 20 },
      { Courses: 110, Restaurant: 300 }
    );

    expect(bougee.categorie).toBe('Restaurant');
    expect(bougee.variation).toBeCloseTo(-280, 2);
  });

  it('compte une catégorie apparue comme une variation', () => {
    // Une dépense qui apparaît est souvent la variation la plus parlante.
    const bougee = categorieQuiABouge({ Santé: 240 }, { Courses: 200 });
    expect(bougee.categorie).toBe('Santé');
    expect(bougee.variation).toBe(240);
  });

  it('ne désigne rien quand rien n\'a bougé', () => {
    expect(categorieQuiABouge({ Courses: 200 }, { Courses: 200 })).toBeNull();
    expect(categorieQuiABouge({}, {})).toBeNull();
    expect(categorieQuiABouge(null, undefined)).toBeNull();
  });
});
