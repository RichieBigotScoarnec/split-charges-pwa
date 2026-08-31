import { describe, it, expect } from 'vitest';
import {
  themeLisible,
  cleDuTheme,
  themesConnus,
  themeExistant,
  enveloppesDuTheme,
  normaliserEnveloppe,
  normaliserEnveloppes,
  budgetLisible,
  dateLisible,
  fenetreCoherente,
  enveloppesOuvertes,
  enveloppeParId,
  chargesDeLEnveloppe,
  totalEnveloppe,
  chargesDeLEnveloppeTousMois,
  bilanEnveloppe
} from '../../public/js/utils/enveloppes.js';
import { computeSummary } from '../../public/js/utils/calculations.js';

/**
 * L'enveloppe transversale
 *
 * Elle regroupe des dépenses qui vont ensemble sans partager de catégorie ni de
 * mois — une semaine de vacances, un déménagement. Le plein d'essence de la
 * route des vacances reste de l'essence.
 *
 * L'exigence qui commande toutes les autres se trouve au bas de ce fichier :
 * rattacher une charge à une enveloppe ne doit rien changer au solde. Une
 * étiquette de lecture qui déplacerait de l'argent serait le pire défaut
 * possible dans cette application — et le plus discret, puisque personne ne
 * pense à vérifier un solde après avoir posé une étiquette.
 */

describe('Lecture d\'une enveloppe venue de la base', () => {
  it('retient les champs attendus', () => {
    const lue = normaliserEnveloppe({
      id: 'vacances-ete',
      label: 'Vacances été',
      icon: '🏖️',
      budget: 1200,
      debut: '2026-07-04',
      fin: '2026-07-18',
      cloturee: false
    });

    // La forme exacte, et non un sous-ensemble : c'est ce qui a signalé
    // l'arrivée des champs `nature`, `report`, `rang` et `perimetre`. Les
    // valeurs ci-dessous sont donc aussi la déclaration de leurs défauts — une
    // enveloppe écrite avant qu'ils existent est une cagnotte commune sans
    // rang, c'est-à-dire exactement ce qu'elle était.
    expect(lue).toEqual({
      id: 'vacances-ete',
      label: 'Vacances été',
      icon: '🏖️',
      budget: 1200,
      debut: '2026-07-04',
      fin: '2026-07-18',
      cloturee: false,
      nature: 'cagnotte',
      report: false,
      rang: null,
      perimetre: 'commun',
      proprietaire: null,
      // Une enveloppe écrite avant que la provenance existe n'en porte pas, et
      // `null` se lit « on ne sait pas » — jamais « personne ».
      creePar: null,
      creeLe: null,
      // Et pas de thème : le regroupement est arrivé après, et une enveloppe
      // qui n'en porte pas reste parfaitement valide — c'est ce qui préserve
      // tout l'existant sans une ligne de migration.
      theme: null
    });
  });

  describe('LA PROVENANCE : qui a créé cette enveloppe, et quand', () => {
    // Le foyer a découvert « Vacances 2027 » sans savoir d'où elle sortait, et
    // l'application n'avait aucune réponse possible : rien n'était enregistré.
    // Un versement porte un auteur nominatif depuis toujours.

    it('retient l\'auteur et l\'instant quand ils sont là', () => {
      const lue = normaliserEnveloppe({
        id: 'vacances-2027', label: 'Vacances 2027',
        creePar: 'conjointe', creeLe: 1756500000000
      });

      expect(lue.creePar).toBe('conjointe');
      expect(lue.creeLe).toBe(1756500000000);
    });

    it('un auteur qui ne désigne personne n\'en désigne aucun', () => {
      // La même règle que pour l'auteur d'un versement : plutôt le vide qu'un
      // nom choisi au hasard.
      for (const faux of ['Richard', '', null, 42, 'VOUS']) {
        expect(normaliserEnveloppe({ id: 'e', label: 'E', creePar: faux }).creePar).toBe(null);
      }
    });

    it('un instant illisible ou nul ne fabrique pas de date', () => {
      // `formatDate(0)` afficherait le 1er janvier 1970 : une absence devenue
      // affirmation fausse.
      for (const faux of [0, -1, '1756500000000', NaN, Infinity, null]) {
        expect(normaliserEnveloppe({ id: 'e', label: 'E', creeLe: faux }).creeLe).toBe(null);
      }
    });
  });

  it('écarte une entrée sans identifiant ou sans libellé', () => {
    // Une enveloppe à moitié valide ne désigne personne, et se propagerait
    // ensuite dans les listes déroulantes et les totaux.
    expect(normaliserEnveloppe({ label: 'Sans identifiant' })).toBeNull();
    expect(normaliserEnveloppe({ id: 'sans-libelle' })).toBeNull();
    expect(normaliserEnveloppe(null)).toBeNull();
    expect(normaliserEnveloppe('vacances')).toBeNull();
  });

  it('donne une image par défaut plutôt que rien', () => {
    const lue = normaliserEnveloppe({ id: 'chantier', label: 'Chantier' });
    expect(lue.icon).toBe('🧳');
  });

  it('rend `null`, jamais `undefined`, pour les champs absents', () => {
    // Firebase refuse `undefined` à l'écriture : une enveloppe relue puis
    // réenregistrée aurait fait échouer la sauvegarde de toute la liste.
    const lue = normaliserEnveloppe({ id: 'chantier', label: 'Chantier' });
    expect(lue.budget).toBeNull();
    expect(lue.debut).toBeNull();
    expect(lue.fin).toBeNull();
    expect(lue.cloturee).toBe(false);
  });

  it('ne retient une liste que par ses entrées exploitables', () => {
    const liste = normaliserEnveloppes([
      { id: 'a', label: 'Vacances' },
      null,
      { label: 'orpheline' },
      { id: 'b', label: 'Chantier' }
    ]);

    expect(liste.map(e => e.id)).toEqual(['a', 'b']);
  });

  it('accepte un nœud absent sans se plaindre', () => {
    // Un foyer qui n'a jamais créé d'enveloppe est le cas normal, pas une
    // anomalie : Firebase rend `null` pour un nœud vide.
    expect(normaliserEnveloppes(null)).toEqual([]);
    expect(normaliserEnveloppes(undefined)).toEqual([]);
    expect(normaliserEnveloppes({})).toEqual([]);
  });
});

describe('Budget d\'une enveloppe', () => {
  it('accepte un montant à la française', () => {
    expect(budgetLisible('1200,50')).toBe(1200.5);
    expect(budgetLisible(800)).toBe(800);
  });

  it('traite l\'absence, le zéro et le négatif comme « pas de budget »', () => {
    // Zéro est indiscernable de l'absence une fois écrit, et « 0 € dépensés
    // sur 0 € » afficherait un dépassement dès le premier centime.
    expect(budgetLisible('')).toBeNull();
    expect(budgetLisible(null)).toBeNull();
    expect(budgetLisible(undefined)).toBeNull();
    expect(budgetLisible(0)).toBeNull();
    expect(budgetLisible(-40)).toBeNull();
    expect(budgetLisible('n\'importe quoi')).toBeNull();
  });

  it('refuse au-delà du plafond des règles de sécurité', () => {
    // Au-delà, Firebase refuserait l'écriture de la liste entière : mieux vaut
    // ignorer le budget que perdre l'enveloppe.
    expect(budgetLisible(10000001)).toBeNull();
    expect(budgetLisible(10000000)).toBe(10000000);
  });
});

describe('Fenêtre de dates', () => {
  it('n\'accepte que le format AAAA-MM-JJ', () => {
    expect(dateLisible('2026-07-04')).toBe('2026-07-04');
    expect(dateLisible('04/07/2026')).toBeNull();
    expect(dateLisible('2026-07')).toBeNull();
    expect(dateLisible(20260704)).toBeNull();
    expect(dateLisible('')).toBeNull();
  });

  it('tolère une seule borne', () => {
    // « À partir du 1er juillet » est une intention claire.
    expect(fenetreCoherente('2026-07-01', null)).toBe(true);
    expect(fenetreCoherente(null, '2026-07-18')).toBe(true);
    expect(fenetreCoherente(null, null)).toBe(true);
  });

  it('refuse une fin antérieure au début', () => {
    expect(fenetreCoherente('2026-07-18', '2026-07-04')).toBe(false);
  });

  it('accepte une fenêtre d\'un seul jour', () => {
    expect(fenetreCoherente('2026-07-04', '2026-07-04')).toBe(true);
  });
});

describe('Enveloppes ouvertes et closes', () => {
  const enveloppes = [
    { id: 'vacances-2025', label: 'Vacances 2025', cloturee: true },
    { id: 'chantier', label: 'Chantier', cloturee: false },
    { id: 'demenagement', label: 'Déménagement' }
  ];

  it('ne propose que celles qui restent ouvertes', () => {
    expect(enveloppesOuvertes(enveloppes).map(e => e.id))
      .toEqual(['chantier', 'demenagement']);
  });

  it('retrouve une enveloppe close : elle reste consultable', () => {
    // Clore n'est pas supprimer. Les charges de l'an dernier gardent leur
    // rattachement, et l'écran doit savoir le nommer.
    expect(enveloppeParId(enveloppes, 'vacances-2025').label).toBe('Vacances 2025');
  });

  it('ne trouve rien pour un identifiant vide ou inconnu', () => {
    expect(enveloppeParId(enveloppes, '')).toBeNull();
    expect(enveloppeParId(enveloppes, 'inexistante')).toBeNull();
    expect(enveloppeParId(null, 'chantier')).toBeNull();
  });
});

describe('Total d\'une enveloppe', () => {
  const charges = [
    { id: '1', amount: 120, envelope: 'vacances' },
    { id: '2', amount: 80, envelope: 'vacances' },
    { id: '3', amount: 500, envelope: 'chantier' },
    { id: '4', amount: 40 },
    { id: '5', amount: 999, envelope: 'vacances', deleted: true }
  ];

  it('additionne les charges rattachées', () => {
    expect(totalEnveloppe(charges, 'vacances')).toBe(200);
  });

  it('ignore les charges supprimées', () => {
    // La suppression est douce : l'entrée survit en base pour la corbeille,
    // mais elle ne doit plus peser dans un total.
    expect(chargesDeLEnveloppe(charges, 'vacances').map(c => c.id)).toEqual(['1', '2']);
  });

  it('ignore les charges sans enveloppe', () => {
    expect(totalEnveloppe(charges, 'chantier')).toBe(500);
  });

  it('vaut zéro pour une enveloppe vide ou inconnue', () => {
    expect(totalEnveloppe(charges, 'inexistante')).toBe(0);
    expect(totalEnveloppe(charges, '')).toBe(0);
    expect(totalEnveloppe([], 'vacances')).toBe(0);
  });

  it('ne se laisse pas fausser par un montant illisible', () => {
    const abimees = [
      { amount: 100, envelope: 'v' },
      { amount: 'beaucoup', envelope: 'v' },
      { amount: undefined, envelope: 'v' }
    ];
    expect(totalEnveloppe(abimees, 'v')).toBe(100);
  });
});

describe('L\'exigence : une enveloppe ne déplace pas un euro', () => {
  /**
   * Le solde se calcule à partir du montant, du payeur et de la répartition.
   * L'enveloppe n'est aucun des trois. Ce contrôle repasse exactement les mêmes
   * charges dans `computeSummary`, une fois nues, une fois étiquetées, et
   * compare la totalité du résultat.
   *
   * Si un jour quelqu'un fait entrer l'enveloppe dans le calcul — pour
   * « équilibrer les vacances », par exemple — ce cas échouera, et c'est
   * précisément ce qu'on lui demande.
   */
  const salaries = { vous: 2400, conjointe: 1600 };

  const nues = [
    { amount: 900, paidBy: 'vous', category: 'Maison' },
    { amount: 120, paidBy: 'conjointe', category: 'Courses' },
    { amount: 60, paidBy: 'partage', category: 'Restaurant', splitOverride: { mode: '50-50' } }
  ];

  const etiquetees = nues.map(charge => ({ ...charge, envelope: 'vacances' }));

  const entrees = (variableCharges) => ({
    salaries,
    fixedCharges: [],
    variableCharges,
    reimbursements: [],
    shareMode: 'prorata',
    customPercents: { vous: 50, conjointe: 50 }
  });

  it('le bilan est identique, à tous ses postes', () => {
    expect(computeSummary(entrees(etiquetees))).toEqual(computeSummary(entrees(nues)));
  });

  it('y compris quand une seule charge sur trois porte une enveloppe', () => {
    const partiel = nues.map((charge, rang) => (
      rang === 1 ? { ...charge, envelope: 'chantier' } : charge
    ));
    expect(computeSummary(entrees(partiel))).toEqual(computeSummary(entrees(nues)));
  });

  it('y compris sur les charges fixes', () => {
    // Une mensualité de chèques vacances est une charge fixe qui appartient à
    // l'enveloppe Vacances : les deux formulaires portent le même champ, donc
    // les deux chemins de calcul doivent rester insensibles.
    const fixes = [{ amount: 800, paidBy: 'vous', category: 'Maison' }];
    const fixesEtiquetees = fixes.map(c => ({ ...c, envelope: 'vacances' }));

    const avec = computeSummary({ ...entrees(nues), fixedCharges: fixesEtiquetees });
    const sans = computeSummary({ ...entrees(nues), fixedCharges: fixes });

    expect(avec).toEqual(sans);
    // Garde-fou du contrôle lui-même : un bilan vide serait égal à un bilan
    // vide, et ce cas passerait sans rien prouver.
    expect(avec.total).toBeGreaterThan(0);
    expect(avec.balance).not.toBe(0);
  });
});

/**
 * Une enveloppe se lit sur toute sa durée
 *
 * L'écran de gestion ne comptait que le mois consulté, et le disait
 * honnêtement — « 320 € ce mois-ci ». Mais c'est l'inverse du besoin : une
 * enveloppe existe précisément pour traverser les mois, et le seul chiffre
 * qu'on lui demande — ce qu'ont coûté les vacances en tout — était le seul
 * qu'on ne pouvait pas obtenir. Son budget, comparé à un total mensuel, se
 * mesurait au mauvais nombre.
 */

const BASE = {
  '2026-07': {
    variableCharges: {
      a: { description: 'Péage', amount: 42, envelope: 'vacances', date: '2026-07-28' },
      b: { description: 'Courses', amount: 30, envelope: 'quotidien' }
    }
  },
  '2026-08': {
    variableCharges: {
      c: { description: 'Restaurant', amount: 58, envelope: 'vacances', date: '2026-08-03' },
      d: { description: 'Musée', amount: 24, envelope: 'vacances', deleted: true }
    },
    fixedCharges: {
      e: { description: 'Location', amount: 600, envelope: 'vacances', date: '2026-08-01' }
    }
  },
  undefined: { variableCharges: { f: { amount: 99, envelope: 'vacances' } } }
};

describe('Les charges d\'une enveloppe, tous mois confondus', () => {
  it('rassemble les mois, les fixes et les variables', () => {
    const charges = chargesDeLEnveloppeTousMois(BASE, 'vacances');

    expect(charges.map(c => c.description)).toEqual(['Restaurant', 'Location', 'Péage']);
  });

  it('écarte les charges supprimées', () => {
    // Elles ne comptent pas dans le solde : elles ne doivent pas compter ici.
    const charges = chargesDeLEnveloppeTousMois(BASE, 'vacances');
    expect(charges.some(c => c.description === 'Musée')).toBe(false);
  });

  it('ignore les clés de période qui n\'en sont pas', () => {
    const charges = chargesDeLEnveloppeTousMois(BASE, 'vacances');
    expect(charges.some(c => c.periode === 'undefined')).toBe(false);
  });

  it('retient la période et l\'origine de chaque charge', () => {
    const location = chargesDeLEnveloppeTousMois(BASE, 'vacances')
      .find(c => c.description === 'Location');

    expect(location.periode).toBe('2026-08');
    expect(location.fixe).toBe(true);
  });

  it('range du plus récent au plus ancien', () => {
    const dates = chargesDeLEnveloppeTousMois(BASE, 'vacances').map(c => c.date);
    expect(dates).toEqual(['2026-08-03', '2026-08-01', '2026-07-28']);
  });

  it('ne lève sur aucune entrée inexploitable', () => {
    expect(chargesDeLEnveloppeTousMois(null, 'vacances')).toEqual([]);
    expect(chargesDeLEnveloppeTousMois(BASE, '')).toEqual([]);
  });
});

describe('Le bilan d\'une enveloppe', () => {
  const charges = chargesDeLEnveloppeTousMois(BASE, 'vacances');

  it('additionne toute la durée, et non le seul mois consulté', () => {
    // C'est le chiffre qui manquait : 58 + 600 + 42, et non les 658 d'août.
    expect(bilanEnveloppe(charges, { nature: 'cagnotte', budget: null }).total).toBe(700);
  });

  it('compte les dépenses et les mois traversés', () => {
    const bilan = bilanEnveloppe(charges, { nature: 'cagnotte', budget: null });
    expect(bilan.nombre).toBe(3);
    expect(bilan.mois).toBe(2);
  });

  it('situe le total par rapport au budget', () => {
    const bilan = bilanEnveloppe(charges, { nature: 'cagnotte', budget: 1000 });
    expect(bilan.reste).toBe(300);
    expect(bilan.part).toBe(70);
    expect(bilan.depasse).toBe(false);
  });

  it('annonce un dépassement sans faire sortir la barre de son cadre', () => {
    const bilan = bilanEnveloppe(charges, { nature: 'cagnotte', budget: 500 });
    expect(bilan.depasse).toBe(true);
    expect(bilan.reste).toBe(-200);
    expect(bilan.part, 'la barre déborderait').toBe(100);
  });

  it('sans budget, ne compare rien', () => {
    const bilan = bilanEnveloppe(charges, { nature: 'cagnotte', budget: null });
    expect(bilan.reste).toBeNull();
    expect(bilan.part).toBeNull();
    expect(bilan.depasse).toBe(false);
  });

  it('ne lève pas sur une liste vide', () => {
    expect(bilanEnveloppe([], { nature: 'cagnotte', budget: 500 }).total).toBe(0);
    expect(bilanEnveloppe(null, null).nombre).toBe(0);
  });
});

/**
 * LE THÈME : ce qui regroupe des enveloppes qui ne se suivent pas
 *
 * « Vacances 2026 », « Week-end Bretagne », « Vacances 2027 » parlent de la même
 * chose. Le `rang` ne pouvait pas les réunir — il classe par rythme de
 * trésorerie, à dessein.
 *
 * Deux fabriques distinctes, et c'est tout le sujet : `themeLisible` décide de
 * ce qui s'AFFICHE, `cleDuTheme` de ce qui se COMPARE. Les confondre imposerait
 * au foyer une casse qu'il n'a pas choisie ; les séparer sans les tenir ferait
 * quatre thèmes de « Week-end », « week end », « Weekend » et « WEEK END ».
 */
describe('Le thème d\'une enveloppe', () => {
  describe('themeLisible — ce qui sera écrit', () => {
    it('garde le libellé tel que le foyer l\'a tapé', () => {
      expect(themeLisible('Vacances')).toBe('Vacances');
      expect(themeLisible('Week-end')).toBe('Week-end');
      expect(themeLisible('  Noël 2026  ')).toBe('Noël 2026');
    });

    it('réduit les blancs multiples à un seul', () => {
      expect(themeLisible('Week   end')).toBe('Week end');
      expect(themeLisible('Vacances\tété')).toBe('Vacances été');
    });

    it('neutralise ce qui est INVISIBLE à l\'écran', () => {
      // Un espace de largeur nulle survivait à `\s+` : le thème passait la
      // validation serveur (longueur 1), s'écrivait en base, et donnait une
      // option vide qu'on ne pouvait ni nommer ni retrouver.
      expect(themeLisible('​')).toBe(null);
      expect(themeLisible('﻿')).toBe(null);
      expect(themeLisible('Week​end')).toBe('Week end');
    });

    it('mais garde le liant des emoji composés', () => {
      // U+200D est un caractère de format, comme l'espace de largeur nulle. Le
      // retirer couperait une famille en trois personnes.
      const famille = '\u{1F468}‍\u{1F469}‍\u{1F467}';
      expect(themeLisible(famille)).toBe(famille);
    });

    it('rend null pour tout ce qui ne se lit pas', () => {
      expect(themeLisible('')).toBe(null);
      expect(themeLisible('   ')).toBe(null);
      expect(themeLisible(null)).toBe(null);
      expect(themeLisible(42)).toBe(null);
    });

    it('borne à cent caractères, sans laisser de blanc en fin', () => {
      const long = themeLisible('a'.repeat(120));
      expect(long).toHaveLength(100);
      // La coupe peut tomber juste après une espace : le libellé est retrimé.
      expect(themeLisible('a'.repeat(99) + ' bcdef')).toBe('a'.repeat(99));
    });
  });

  describe('cleDuTheme — ce qui se compare', () => {
    it('réunit les orthographes d\'un même thème', () => {
      const attendue = cleDuTheme('Week-end');
      expect(cleDuTheme('week end')).toBe(attendue);
      expect(cleDuTheme('Weekend')).toBe(attendue);
      expect(cleDuTheme('WEEK END')).toBe(attendue);
      expect(cleDuTheme('  week-END  ')).toBe(attendue);
    });

    it('plie les accents, comme la recherche', () => {
      expect(cleDuTheme('Noël')).toBe(cleDuTheme('Noel'));
      expect(cleDuTheme('Été')).toBe(cleDuTheme('ete'));
    });

    it('mais ne confond pas deux thèmes distincts', () => {
      // Le témoin positif : sans lui, une fabrique qui rendrait toujours la
      // même clé satisferait tout ce qui précède.
      expect(cleDuTheme('Noël 2026')).not.toBe(cleDuTheme('Noël 2027'));
      expect(cleDuTheme('Vacances')).not.toBe(cleDuTheme('Week-end'));
    });

    it('garde son identité à un thème fait d\'emoji', () => {
      // Sans le repli, tous les thèmes sans lettre ni chiffre se confondraient
      // sur la clé vide — deux pots distincts fusionnés en silence.
      expect(cleDuTheme('🏖️')).not.toBe(cleDuTheme('🎿'));
      expect(cleDuTheme('🏖️')).not.toBe('');
    });

    it('rend la chaîne vide pour ce qui ne se lit pas', () => {
      expect(cleDuTheme('')).toBe('');
      expect(cleDuTheme(null)).toBe('');
      expect(cleDuTheme('   ')).toBe('');
    });
  });

  describe('themesConnus — l\'ensemble EST ce qui est en usage', () => {
    const enveloppe = (id, theme, extra = {}) => normaliserEnveloppe({
      id, label: id, theme, ...extra
    });

    it('réunit les variantes sous un seul thème', () => {
      const vus = themesConnus([
        enveloppe('a', 'Vacances'),
        enveloppe('b', 'vacances'),
        enveloppe('c', 'Week-end')
      ]);

      expect(vus).toHaveLength(2);
      expect(vus.map(t => t.label).sort()).toEqual(['Vacances', 'Week-end']);
      expect(vus.find(t => t.label === 'Vacances').nombre).toBe(2);
    });

    it('nomme le thème comme le PREMIER qui l\'a nommé', () => {
      const vus = themesConnus([enveloppe('a', 'vacances'), enveloppe('b', 'Vacances')]);
      expect(vus[0].label).toBe('vacances');
    });

    it('compte les enveloppes CLOSES', () => {
      // Le piège : « Vacances 2026 » est close le jour même où le bilan du
      // thème se lit. La brancher sur `enveloppesOuvertes` ferait disparaître
      // le thème au moment précis où il sert.
      const vus = themesConnus([
        enveloppe('a', 'Vacances', { cloturee: true }),
        enveloppe('b', 'Vacances')
      ]);

      expect(vus).toHaveLength(1);
      expect(vus[0].nombre).toBe(2);
    });

    it('ignore les enveloppes sans thème, et les entrées illisibles', () => {
      expect(themesConnus([enveloppe('a', null), enveloppe('b', '  ')])).toEqual([]);
      expect(themesConnus(null)).toEqual([]);
      expect(themesConnus([null, undefined])).toEqual([]);
    });

    it('range les thèmes par ordre alphabétique français', () => {
      const vus = themesConnus([
        enveloppe('a', 'Week-end'), enveloppe('b', 'École'), enveloppe('c', 'Vacances')
      ]);
      expect(vus.map(t => t.label)).toEqual(['École', 'Vacances', 'Week-end']);
    });
  });

  describe('themeExistant et enveloppesDuTheme', () => {
    const enveloppe = (id, theme) => normaliserEnveloppe({ id, label: id, theme });
    const liste = [
      enveloppe('a', 'Vacances'),
      enveloppe('b', 'week end'),
      enveloppe('c', 'Vacances'),
      enveloppe('d', null)
    ];

    it('retrouve un thème par n\'importe laquelle de ses orthographes', () => {
      const themes = themesConnus(liste);
      expect(themeExistant(themes, 'VACANCES').label).toBe('Vacances');
      expect(themeExistant(themes, 'Week-End').label).toBe('week end');
      expect(themeExistant(themes, 'Chantier')).toBe(null);
      expect(themeExistant(themes, '')).toBe(null);
    });

    it('rassemble les enveloppes d\'un thème, quelle que soit l\'orthographe', () => {
      expect(enveloppesDuTheme(liste, 'vacances').map(e => e.id)).toEqual(['a', 'c']);
      expect(enveloppesDuTheme(liste, 'WEEK-END').map(e => e.id)).toEqual(['b']);
      expect(enveloppesDuTheme(liste, 'Inconnu')).toEqual([]);
      expect(enveloppesDuTheme(liste, '')).toEqual([]);
    });
  });
});
