import { describe, it, expect } from 'vitest';
import { decomposerParRegle } from '../../public/js/utils/decomposition.js';
import { calculateChargeShares } from '../../public/js/utils/calculations.js';

/**
 * Pourquoi ma part vaut ce qu'elle vaut
 *
 * Le dépliant du bilan répondait à « qui a payé quoi ». Il ne répondait pas à
 * la question qu'on se pose devant le chiffre : **pourquoi ma part vaut
 * 1 089,34 €.** Cette décomposition l'explique — une ligne par règle appliquée.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PAR RÈGLE, ET NON PAR CATÉGORIE — TRANCHÉ PAR CE JEU D'ESSAI
 *
 * La maquette montrait trois charges : deux « Courses » au prorata, un
 * « Festival » en 50/50. Sur ce jeu, les deux lectures produisent EXACTEMENT
 * les mêmes lignes — il ne pouvait donc trancher ni pour l'une ni pour l'autre.
 * C'est la règle 2 appliquée à une maquette au lieu d'un test : un jeu d'essai
 * qui ne sépare pas les hypothèses ne prouve aucune des deux.
 *
 * Le jeu ci-dessous SÉPARE, parce qu'il porte les deux croisements qui
 * manquaient :
 *
 *   - une CATÉGORIE portant PLUSIEURS règles — Loisirs : 50/50, 50/50, 70/30
 *   - une RÈGLE traversant PLUSIEURS catégories — le prorata : Alimentation,
 *     Maison, Transport
 *
 * Sans le premier, une ligne de catégorie porte toujours une règle unique, et
 * les deux lectures se confondent. Sans le second, une ligne de règle porte
 * toujours une catégorie unique — elles se confondent encore.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE QUE LA MESURE A DIT, LE 2026-09-09
 *
 *     A — PAR RÈGLE                      B — PAR CATÉGORIE
 *       872,84 €  au prorata de 70,6 %     129,91 €  Alimentation, prorata
 *        52,50 €  [50/50]                  698,82 €  Maison, prorata
 *        84,00 €  [70/30]                   44,12 €  Transport, prorata
 *        80,00 €  [100/0]                  136,50 €  Loisirs  ⚠️ DEUX règles
 *       → 4 lignes                          80,00 €  Animaux, 100/0
 *                                          → 5 lignes
 *
 * **« Loisirs 136,50 € » ne peut porter AUCUNE règle** : elle mélange 50/50 et
 * 70/30, aucun pourcentage ne s'y attache. Ce n'est donc pas un arbitrage entre
 * deux formes — c'en est une qui répond à la question du dépliant et une qui en
 * est structurellement incapable. Pour rendre « Loisirs » explicable il
 * faudrait la scinder par règle, c'est-à-dire produire la lecture A avec plus
 * de lignes.
 *
 * Trois raisons de plus, mesurées :
 *
 *   1. bornée par construction — au plus trois modes, plus les dérogations
 *      distinctes ; la lecture par catégorie n'a pas de plafond ;
 *   2. « Budgets par catégorie » rend DÉJÀ `catégorie → montant`, dans le même
 *      panneau, quelques centaines de pixels plus bas. Deux ventilations par
 *      catégorie sur un même écran, avec des nombres différents — 184,04 €
 *      dépensés et 129,91 € de ma part sous « Alimentation » — c'est
 *      `normalizePair`, visible d'un coup d'œil ;
 *   3. à 320 px au doigt, les libellés de A tiennent sur une ligne (30 px) là
 *      où ceux de B s'enroulent (49 px) : 120 px contre 207 pour la même
 *      information.
 */

/** Prorata 2 400 / 3 400 = 70,588 % — un nombre qui ne tombe pas rond, à dessein */
const SALAIRES = { vous: 2400, conjointe: 1000 };
const TOTAL_SALAIRES = SALAIRES.vous + SALAIRES.conjointe;
const CUSTOM_GLOBAL = { vous: 50, conjointe: 50 };

const contexte = (shareMode = 'prorata') => ({
  shareMode,
  salaries: SALAIRES,
  totalSalaries: TOTAL_SALAIRES,
  customPercents: CUSTOM_GLOBAL
});

/**
 * LE JEU D'ESSAI SÉPARATEUR
 *
 * Huit charges, cinq catégories, quatre règles distinctes. Chaque ligne est là
 * pour une raison : voir les deux croisements décrits en tête de fichier.
 */
const JEU = [
  // Quatre au prorata, sur TROIS catégories — dont deux dans la même
  { description: 'Courses', amount: 184.04, category: 'Alimentation' },
  { description: 'Loyer', amount: 950.00, category: 'Maison' },
  { description: 'Internet', amount: 39.99, category: 'Maison' },
  { description: 'Essence', amount: 62.50, category: 'Transport' },

  // Quatre dérogations, TROIS règles distinctes — dont deux dans la même
  // catégorie, et une règle partagée par deux catégories
  { description: 'Festival', amount: 45.00, category: 'Loisirs',
    splitOverride: { mode: '50-50' } },
  { description: 'Restaurant', amount: 60.00, category: 'Loisirs',
    splitOverride: { mode: '50-50' } },
  { description: 'Cadeau', amount: 120.00, category: 'Loisirs',
    splitOverride: { mode: 'custom', vous: 70, conjointe: 30 } },
  { description: 'Vétérinaire', amount: 80.00, category: 'Animaux',
    splitOverride: { mode: 'custom', vous: 100, conjointe: 0 } }
];

/** Ma part totale, calculée charge par charge — la référence que tout doit rendre */
function maPartTotale(charges, ctx = contexte()) {
  return charges.reduce((somme, c) => somme
    + calculateChargeShares(c, ctx.shareMode, ctx.salaries, ctx.totalSalaries, ctx.customPercents).yourShare, 0);
}

const centimes = (n) => Math.round(n * 100) / 100;

describe('La décomposition du grand-livre, par règle', () => {

  describe('le jeu d\'essai sépare vraiment les deux lectures', () => {
    /**
     * ── LES PRÉMISSES DU FICHIER ENTIER ──
     *
     * Tout ce qui suit mesure une décomposition. Sur un jeu qui ne porte
     * qu'une règle, ou qu'une catégorie par règle, chaque cas serait vrai sans
     * rien prouver — et c'est exactement ce que la maquette a fait pendant
     * trois jours. Ces deux gardes disent que l'instrument a de quoi séparer.
     */
    it('une catégorie porte PLUSIEURS règles', () => {
      const parCategorie = new Map();
      for (const c of JEU) {
        const regle = c.splitOverride ? JSON.stringify(c.splitOverride) : 'mois';
        parCategorie.set(c.category, (parCategorie.get(c.category) || new Set()).add(regle));
      }
      const ambigues = [...parCategorie].filter(([, r]) => r.size > 1);

      expect(ambigues.map(([c]) => c),
        'sans catégorie à plusieurs règles, les deux lectures se confondent')
        .toEqual(['Loisirs']);
    });

    it('une règle traverse PLUSIEURS catégories', () => {
      const auProrata = JEU.filter((c) => !c.splitOverride);
      const categories = new Set(auProrata.map((c) => c.category));

      expect(categories.size,
        'sans règle traversant plusieurs catégories, les deux lectures se confondent')
        .toBeGreaterThan(1);
    });
  });

  describe('la somme des lignes égale la part totale', () => {
    it('aux deux décimales, sur le jeu séparateur', () => {
      // La propriété qui rend la décomposition CROYABLE. Un dépliant dont les
      // lignes ne somment pas au chiffre de tête invite à douter du chiffre de
      // tête — et c'est le chiffre juste qu'on mettrait en doute.
      const lignes = decomposerParRegle(JEU, contexte());
      const somme = lignes.reduce((s, l) => s + l.mien, 0);

      expect(centimes(somme)).toBe(centimes(maPartTotale(JEU)));
    });

    it('et sur un mois sans aucune dérogation', () => {
      const sansDerogation = JEU.filter((c) => !c.splitOverride);
      const lignes = decomposerParRegle(sansDerogation, contexte());

      expect(lignes).toHaveLength(1);
      expect(centimes(lignes.reduce((s, l) => s + l.mien, 0)))
        .toBe(centimes(maPartTotale(sansDerogation)));
    });

    it('et sur un mois qui n\'est QUE dérogations', () => {
      const queDesDerogations = JEU.filter((c) => c.splitOverride);
      const lignes = decomposerParRegle(queDesDerogations, contexte());

      // Aucune ligne de base : rien ne suit la règle du mois.
      expect(lignes.every((l) => l.derogatoire), 'une ligne de base est apparue sans charge pour la porter')
        .toBe(true);
      expect(centimes(lignes.reduce((s, l) => s + l.mien, 0)))
        .toBe(centimes(maPartTotale(queDesDerogations)));
    });

    it('et sur un mois vide, sans inventer de ligne', () => {
      expect(decomposerParRegle([], contexte())).toEqual([]);
    });
  });

  describe('une ligne par règle appliquée, pas par catégorie', () => {
    it('rend quatre lignes là où les catégories en donneraient cinq', () => {
      const lignes = decomposerParRegle(JEU, contexte());
      const categories = new Set(JEU.map((c) => c.category));

      expect(lignes).toHaveLength(4);
      expect(categories.size, 'prémisse : le jeu ne porte pas cinq catégories')
        .toBe(5);
    });

    it('fond les catégories dans la règle, jamais l\'inverse', () => {
      // Les quatre charges au prorata vivent dans trois catégories : elles ne
      // font qu'UNE ligne, et son montant est leur somme.
      const lignes = decomposerParRegle(JEU, contexte());
      const base = lignes.find((l) => !l.derogatoire);

      expect(base.nombre, 'les quatre charges du prorata ne sont pas réunies').toBe(4);
      expect(centimes(base.mien))
        .toBe(centimes(maPartTotale(JEU.filter((c) => !c.splitOverride))));
    });

    it('sépare deux dérogations de règles différentes dans la MÊME catégorie', () => {
      // Loisirs porte 50/50 et 70/30. C'est le croisement que la maquette
      // n'avait pas, et celui qui rend la lecture par catégorie incapable.
      const lignes = decomposerParRegle(JEU, contexte());
      const desLoisirs = lignes.filter((l) => l.derogatoire);

      expect(desLoisirs.map((l) => l.pastille).sort())
        .toEqual(['100/0', '50/50', '70/30']);
    });

    it('réunit deux dérogations de MÊME règle dans des catégories différentes', () => {
      // Le miroir : deux charges à 50/50 ne font qu'une ligne, même si elles
      // sont rangées ailleurs.
      const deuxCategories = [
        { description: 'Festival', amount: 45, category: 'Loisirs', splitOverride: { mode: '50-50' } },
        { description: 'Péage', amount: 25, category: 'Transport', splitOverride: { mode: '50-50' } }
      ];
      const lignes = decomposerParRegle(deuxCategories, contexte());

      expect(lignes).toHaveLength(1);
      expect(lignes[0].nombre).toBe(2);
      expect(centimes(lignes[0].mien)).toBe(35);
    });
  });

  describe('LE TÉMOIN — une dérogation n\'est jamais fondue dans la ligne de base', () => {
    /**
     * C'est ce qui distingue « décomposé par règle » de « décomposé, plus un
     * total ». Sans lui, une mise en œuvre qui rendrait UNE ligne portant tout
     * satisferait la somme, le compte de lignes sur un jeu pauvre, et le
     * libellé — et n'expliquerait rien du tout.
     */
    it('la ligne de base ne contient QUE ce qui suit la règle du mois', () => {
      const lignes = decomposerParRegle(JEU, contexte());
      const base = lignes.find((l) => !l.derogatoire);
      const partDesDerogations = maPartTotale(JEU.filter((c) => c.splitOverride));

      expect(partDesDerogations, 'prémisse : le jeu ne porte aucune dérogation')
        .toBeGreaterThan(0);
      expect(centimes(base.mien),
        `la ligne de base pèse ${centimes(base.mien)} € : elle a absorbé des `
        + `dérogations, qui valent ${centimes(partDesDerogations)} €`)
        .toBe(centimes(maPartTotale(JEU.filter((c) => !c.splitOverride))));
    });

    it('chaque dérogation distincte a SA ligne, et le compte le dit', () => {
      const lignes = decomposerParRegle(JEU, contexte());
      const derogations = lignes.filter((l) => l.derogatoire);

      // Trois règles distinctes parmi quatre charges dérogatoires : deux
      // charges partagent 50/50, les deux autres ont chacune la sienne.
      expect(derogations).toHaveLength(3);
      expect(derogations.reduce((s, l) => s + l.nombre, 0),
        'des charges dérogatoires ont disparu du décompte')
        .toBe(4);
    });

    it('une charge dérogatoire retirée fait maigrir SA ligne, jamais celle de base', () => {
      // La mesure qui prouve que le rangement est le bon : on retire une
      // charge à 50/50, et c'est la ligne 50/50 qui bouge.
      const avant = decomposerParRegle(JEU, contexte());
      const sansRestaurant = JEU.filter((c) => c.description !== 'Restaurant');
      const apres = decomposerParRegle(sansRestaurant, contexte());

      const cinquante = (l) => l.find((x) => x.pastille === '50/50');
      const base = (l) => l.find((x) => !x.derogatoire);

      expect(centimes(cinquante(avant).mien - cinquante(apres).mien)).toBe(30);
      expect(centimes(base(avant).mien), 'la ligne de base a bougé pour une charge dérogatoire')
        .toBe(centimes(base(apres).mien));
    });
  });

  describe('le libellé porte le pourcentage RÉEL, pas le mode nominal', () => {
    it('le prorata se dit en pourcentage, lu sur les montants de sa propre ligne', () => {
      // 2 400 / 3 400 = 70,588… → « 70,6 % ». Le pourcentage est calculé sur
      // `mien / plein` de la ligne elle-même : il ne peut donc pas diverger des
      // deux montants qu'il accompagne — c'est la règle 2, appliquée à
      // l'intérieur d'une ligne.
      const lignes = decomposerParRegle(JEU, contexte());
      const base = lignes.find((l) => !l.derogatoire);

      expect(base.libelle).toBe('Au prorata de 70,6 %');
      expect(base.libelle, 'le libellé dit le mode au lieu du taux')
        .not.toContain('prorata »');
    });

    it('et il suit les revenus, plutôt que d\'être écrit en dur', () => {
      // Le témoin du cas précédent : sur d'autres revenus, un autre taux. Sans
      // lui, « 70,6 % » pourrait être une constante.
      const autres = { ...contexte(), salaries: { vous: 1000, conjointe: 1000 }, totalSalaries: 2000 };
      const lignes = decomposerParRegle(JEU.filter((c) => !c.splitOverride), autres);

      expect(lignes[0].libelle).toBe('Au prorata de 50,0 %');
    });

    it('un mois à parts égales le dit sans pourcentage', () => {
      // « À parts égales » se comprend mieux que « au prorata de 50,0 % », et
      // dit la règle plutôt que son effet.
      const lignes = decomposerParRegle(JEU.filter((c) => !c.splitOverride), contexte('50-50'));
      expect(lignes[0].libelle).toBe('À parts égales');
    });

    it('un mois en parts choisies dit la part, pas le mot « custom »', () => {
      const ctx = { ...contexte('custom'), customPercents: { vous: 60, conjointe: 40 } };
      const lignes = decomposerParRegle(JEU.filter((c) => !c.splitOverride), ctx);
      expect(lignes[0].libelle).toBe('Selon vos parts, 60,0 %');
    });
  });

  describe('la dérogation se lit sur sa ligne, dans la forme héritée', () => {
    it('la pastille vient de la fabrique unique, jamais d\'une seconde formule', () => {
      // `libelleDeLaRepartition` écrit déjà cette pastille pour les deux listes
      // de charges ET le récap des virements. En écrire une quatrième forme
      // ici aurait été la dixième occurrence de `normalizePair`.
      const lignes = decomposerParRegle(JEU, contexte());
      const pastilles = lignes.filter((l) => l.derogatoire).map((l) => l.pastille);

      expect(pastilles.sort()).toEqual(['100/0', '50/50', '70/30']);
    });

    it('le montant PLEIN reste hors de la ligne', () => {
      // Décision du 2026-09-05, mesurée : « [50/50] sur 1 000,00 € » fait
      // boucler toute ligne dérogatoire à 320 px. La pastille répond à
      // « pourquoi ce chiffre n'est pas celui que j'attendais », jamais à
      // « ce chiffre est-il exact ».
      const lignes = decomposerParRegle(JEU, contexte());
      for (const l of lignes) {
        expect(l.libelle, `« ${l.libelle} » porte un montant`).not.toMatch(/\d+[,.]\d{2}/);
      }
    });

    it('la ligne de base ne porte aucune pastille', () => {
      const lignes = decomposerParRegle(JEU, contexte());
      expect(lignes.find((l) => !l.derogatoire).pastille).toBe('');
    });
  });

  describe('le cas que le prédicat hérité rend délicat', () => {
    it('un `splitOverride` qui redit le mode du mois rejoint la ligne de base', () => {
      /**
       * ── ET CE N'EST PAS UNE ENTORSE AU PRÉDICAT ──
       *
       * Le prédicat hérité — « la charge porte un `splitOverride` » — gouverne
       * la PASTILLE, sur quatre surfaces. Ici on groupe par RÈGLE APPLIQUÉE, et
       * `{ mode: 'prorata' }` applique exactement la règle du mois.
       *
       * `libelleDeLaRepartition` dit la même chose de son côté : elle rend la
       * chaîne vide pour ce mode, « il ne s'écarte de rien puisque c'est le
       * partage par défaut du foyer ». Lui donner sa ligne produirait deux
       * lignes portant le même libellé, ce qui n'explique rien de plus.
       *
       * La forme est admise par les règles de base (`database.rules.json:278`)
       * mais aucun formulaire ne l'écrit : rare, pas impossible.
       */
      const avecRedondance = [
        { description: 'Courses', amount: 100, category: 'Alimentation' },
        { description: 'Cinéma', amount: 50, category: 'Loisirs',
          splitOverride: { mode: 'prorata' } }
      ];
      const lignes = decomposerParRegle(avecRedondance, contexte());

      expect(lignes).toHaveLength(1);
      expect(lignes[0].nombre).toBe(2);
      expect(lignes[0].pastille).toBe('');
      expect(centimes(lignes[0].mien)).toBe(centimes(maPartTotale(avecRedondance)));
    });
  });

  describe('l\'ordre des lignes', () => {
    it('la règle du mois vient d\'abord, les dérogations par poids décroissant', () => {
      // La ligne de base est le point de départ de l'explication ; les
      // dérogations la corrigent, la plus lourde d'abord.
      const lignes = decomposerParRegle(JEU, contexte());

      expect(lignes[0].derogatoire).toBe(false);
      const poids = lignes.slice(1).map((l) => centimes(l.mien));
      expect(poids).toEqual([...poids].sort((a, b) => b - a));
    });
  });
});
