import { describe, it, expect } from 'vitest';
import {
  mediane, moyenne, ecartAuHabituel, tauxDEffort,
  resteAVivre, partDuFixe, categorieQuiABouge,
  totalCommunDuMois, moisOrdinaire
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

/**
 * Ce que coûte un mois ordinaire — la fabrique unique
 *
 * Trois surfaces annoncent ce nombre : le panneau des tendances, le rapport
 * mensuel et la projection du bilan. Deux fabriques le calculaient, sur des
 * fenêtres différentes — mesuré 950,00 € d'un côté, 1 000,00 € de l'autre, même
 * mois, même application. Huitième occurrence du défaut `normalizePair`.
 */
const uneCharge = (amount, extra = {}) => ({
  description: 'Vie', amount, category: 'Maison', paidBy: 'vous', ...extra
});

const unMois = (variables, fixes = []) => ({
  fixedCharges: Object.fromEntries(fixes.map((c, i) => [`f${i}`, c])),
  variableCharges: Object.fromEntries(variables.map((c, i) => [`v${i}`, c]))
});

describe('totalCommunDuMois', () => {
  it('additionne les deux collections', () => {
    expect(totalCommunDuMois(unMois([uneCharge(300)], [uneCharge(900)]))).toBeCloseTo(1200, 2);
  });

  it('écarte la corbeille et les dépenses solo', () => {
    const periode = unMois([
      uneCharge(300),
      uneCharge(500, { deleted: true }),
      uneCharge(200, { perimetre: 'solo' })
    ]);

    // Le même entonnoir que `totauxParCategorie` : ce que le FOYER dépense.
    expect(totalCommunDuMois(periode)).toBeCloseTo(300, 2);
  });

  it('un montant inexploitable vaut zéro, jamais NaN', () => {
    const periode = unMois([uneCharge(300), uneCharge(undefined), uneCharge('douze')]);
    expect(totalCommunDuMois(periode)).toBeCloseTo(300, 2);
  });

  it('une période absente vaut zéro', () => {
    expect(totalCommunDuMois(null)).toBe(0);
    expect(totalCommunDuMois({})).toBe(0);
    expect(totalCommunDuMois({ variableCharges: 'pas un objet' })).toBe(0);
  });
});

describe('moisOrdinaire', () => {
  /** Sept mois strictement croissants : la seule forme qui voit une fenêtre */
  const croissant = {
    '2026-01': unMois([uneCharge(600)]),
    '2026-02': unMois([uneCharge(700)]),
    '2026-03': unMois([uneCharge(800)]),
    '2026-04': unMois([uneCharge(900)]),
    '2026-05': unMois([uneCharge(1000)]),
    '2026-06': unMois([uneCharge(1100)]),
    '2026-07': unMois([uneCharge(1200)]),
    '2026-08': unMois([uneCharge(700)])
  };

  it('prend les cinq mois qui précèdent, jamais celui qu\'on regarde', () => {
    // 800 · 900 · 1 000 · 1 100 · 1 200 → médiane 1 000. Sur six mois elle
    // vaudrait 950 : c'est l'écart exact qui séparait les deux fabriques.
    const vu = moisOrdinaire({ periods: croissant, mois: '2026-08' });

    expect(vu.reference).toBeCloseTo(1000, 2);
    expect(vu.moisCompares).toBe(5);
  });

  it('rend aussi le mois regardé et son écart', () => {
    const vu = moisOrdinaire({ periods: croissant, mois: '2026-08' });

    expect(vu.dernier).toBeCloseTo(700, 2);
    expect(vu.variation).toBeCloseTo(-300, 2);
    expect(vu.part).toBeCloseTo(-30, 2);
  });

  it('un mois à zéro compte dans la médiane : il ne s\'efface pas', () => {
    // L'écarter ferait passer un foyer qui a vraiment peu dépensé pour un foyer
    // sans historique. Seconde source de divergence entre les deux fabriques,
    // indépendante de la largeur de fenêtre.
    const avecUnVide = { ...croissant, '2026-06': unMois([]) };
    const vu = moisOrdinaire({ periods: avecUnVide, mois: '2026-08' });

    // 800 · 900 · 0 · 1 200 · 1 000 triés → 0 · 800 · 900 · 1 000 · 1 200 → 900.
    expect(vu.reference).toBeCloseTo(900, 2);
  });

  it('mais un mois à zéro ne compte pas dans le SEUIL', () => {
    // Trois mois où il s'est passé quelque chose, sinon « ordinaire » ne veut
    // rien dire. Ici deux seulement.
    const presqueVide = {
      '2026-05': unMois([uneCharge(1000)]),
      '2026-06': unMois([]),
      '2026-07': unMois([uneCharge(1000)]),
      '2026-08': unMois([uneCharge(700)])
    };

    expect(moisOrdinaire({ periods: presqueVide, mois: '2026-08' })).toBe(null);
  });

  it('se tait sous trois mois révolus', () => {
    const court = {
      '2026-07': unMois([uneCharge(1000)]),
      '2026-08': unMois([uneCharge(700)])
    };

    expect(moisOrdinaire({ periods: court, mois: '2026-08' })).toBe(null);
  });

  it('des entrées inexploitables ne font pas tomber le calcul', () => {
    expect(moisOrdinaire({ periods: null, mois: '2026-08' })).toBe(null);
    expect(moisOrdinaire({ periods: croissant, mois: 'pas un mois' })).toBe(null);
    expect(moisOrdinaire({ periods: croissant, mois: '2026-13' })).toBe(null);
    expect(moisOrdinaire({ periods: 'pas un objet', mois: '2026-08' })).toBe(null);
  });

  it('un mois regardé qui n\'existe pas encore rend zéro, pas NaN', () => {
    // Le sélecteur propose un mois d'avance : la fabrique doit tenir.
    const vu = moisOrdinaire({ periods: croissant, mois: '2026-09' });

    expect(vu).not.toBe(null);
    expect(vu.dernier).toBe(0);
    expect(Number.isFinite(vu.variation)).toBe(true);
  });
});
