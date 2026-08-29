import { describe, it, expect } from 'vitest';
import {
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
      creeLe: null
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
