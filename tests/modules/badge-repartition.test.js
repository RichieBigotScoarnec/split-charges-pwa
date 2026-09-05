// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * La SEULE trace visible de `splitOverride`, et personne ne la tenait
 *
 * Une charge peut déroger au mode de partage du foyer : `splitOverride` porte
 * alors « 50-50 » ou deux pourcentages, et le calcul les applique — bilan,
 * paiements réels, report de solde, détail par payeur, montants à virer. Quatre
 * surfaces dont les chiffres changent.
 *
 * Une seule le DIT : la pastille des deux listes de charges
 * (`variable-charges.js`, `fixed-charges.js`). C'est le seul endroit de
 * l'application où l'on apprend qu'une charge ne suit pas la règle commune.
 *
 * Depuis, la grammaire est passée en fabrique unique (`utils/repartition.js`)
 * et deux surfaces de plus la portent : le récap des virements — son témoin
 * vit dans `virements-du-mois.test.js`, avec le reste du panneau — et la
 * modale du détail, tenue plus bas dans ce fichier.
 *
 * Elle n'avait aucun témoin. `grep -rn "charge-split-tag" tests/` rendait zéro :
 * retirer la pastille — donc effacer d'un coup la seule trace visible du champ —
 * laissait la suite entière verte. Huitième site du motif « un contrôle qui ne
 * mesure rien est pire qu'un contrôle absent », et le premier dans le code
 * applicatif : les sept précédents étaient dans le banc d'essai.
 *
 * ## Pourquoi les deux modules dans le même fichier
 *
 * La pastille est écrite DEUX FOIS, mot pour mot (`variable-charges.js:757`,
 * `fixed-charges.js:809`). Un témoin qui n'en tiendrait qu'une laisserait la
 * jumelle libre — et une copie ne se dégrade pas d'un coup, elle se dégrade au
 * correctif suivant que personne n'y reporte. Chaque propriété est donc jouée
 * sur les deux listes.
 *
 * ## Ce qui est mesuré, et pourquoi pas moins
 *
 * 1. La pastille EXISTE sur la ligne dérogatoire — sinon la trace disparaît.
 * 2. Elle est sur CETTE ligne-là — une étiquette posée ailleurs dans la liste
 *    ne dirait pas de quelle charge on parle.
 * 3. Elle DIT LA RÈGLE — « 50/50 », « 70/30 ». Une pastille muette (« modifié »,
 *    « dérogation ») satisferait les deux premières et n'apprendrait rien.
 * 4. TÉMOIN POSITIF : une charge ordinaire n'en porte aucune. Sans lui, poser la
 *    pastille sur toutes les lignes passerait, et elle cesserait de distinguer
 *    quoi que ce soit.
 */

vi.mock('../../public/js/db.js', () => ({
  dbGet: vi.fn(() => Promise.resolve(null)),
  dbSet: vi.fn(() => Promise.resolve()),
  dbUpdate: vi.fn(() => Promise.resolve()),
  dbPush: vi.fn(() => Promise.resolve('cle')),
  getDataPath: vi.fn(path => `household/${path}`)
}));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(),
  showConfirmModal: vi.fn(() => Promise.resolve(true))
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../../public/js/modules/summary.js', () => ({
  calculateSummary: vi.fn(() => ({ balance: 0 }))
}));
vi.mock('../../public/js/modules/trash.js', () => ({ refreshTrashButton: vi.fn() }));
vi.mock('../../public/js/modules/map.js', () => ({ refreshMapButton: vi.fn() }));
vi.mock('../../public/js/modules/trends.js', () => ({ invalidateTrends: vi.fn() }));
vi.mock('../../public/js/modules/custom-lists.js', () => ({
  getCategoryIcon: vi.fn(() => '🏠'),
  getCategories: vi.fn(() => [{ id: 'maison', icon: '🏠', label: 'Maison' }]),
  populateCategorySelect: vi.fn(),
  populateDestinationSelect: vi.fn()
}));
vi.mock('../../public/js/modules/envelopes.js', () => ({
  populateEnvelopeSelect: vi.fn(),
  etiquetteEnveloppe: vi.fn(() => '')
}));

const { renderVariableCharges } = await import('../../public/js/modules/variable-charges.js');
const { renderFixedCharges } = await import('../../public/js/modules/fixed-charges.js');
const { ouvrirDetailPayeur, ouvrirDetailCategorie } =
  await import('../../public/js/modules/detail-depenses.js');
const { setState, resetState } = await import('../../public/js/state.js');

/**
 * Trois charges : une au 50-50, une aux pourcentages libres, une ordinaire
 *
 * La troisième n'est pas du décor : c'est elle qui rend la pastille
 * DISTINCTIVE. Sans elle, « toujours poser la pastille » passerait.
 */
const CHARGES = [
  {
    id: 'moitie', amount: 1000, description: 'Loyer', category: 'Maison',
    paidBy: 'vous', destination: 'Compte Joint',
    splitOverride: { mode: '50-50' }
  },
  {
    id: 'libre', amount: 200, description: 'Électricité', category: 'Maison',
    paidBy: 'vous', destination: 'Compte Joint',
    splitOverride: { mode: 'custom', vous: 70, conjointe: 30 }
  },
  {
    id: 'ordinaire', amount: 100, description: 'Internet', category: 'Maison',
    paidBy: 'vous', destination: 'Compte Joint'
  }
];

/**
 * Les deux listes, sous le même jeu d'essai
 *
 * Chaque propriété est rejouée pour les deux : la pastille est écrite deux fois
 * dans le code, elle doit être tenue deux fois ici.
 */
const LISTES = [
  { nom: 'charges variables', etat: 'variableCharges', rendre: renderVariableCharges },
  { nom: 'charges fixes', etat: 'fixedCharges', rendre: renderFixedCharges }
];

/** La ligne d'une charge, telle que la liste vient de la peindre */
function ligne(id) {
  return document.querySelector(`.charge-item[data-id="${id}"]`);
}

beforeEach(() => {
  resetState();
  document.body.innerHTML = `
    <div id="variableChargesList"></div><span id="variableChargesTotal"></span>
    <div id="fixedChargesList"></div><span id="fixedChargesTotal"></span>
  `;
  setState('currentPeriod', '2026-09');
});

describe.each(LISTES)('La répartition dérogatoire se voit — $nom', ({ etat, rendre }) => {
  beforeEach(() => {
    setState(etat, CHARGES);
    rendre();
  });

  it('une charge qui déroge porte une pastille SUR SA LIGNE', () => {
    // Sur sa ligne, et pas ailleurs dans la liste : une pastille flottante ne
    // dirait pas de quelle charge elle parle.
    for (const id of ['moitie', 'libre']) {
      expect(ligne(id), `ligne « ${id} » absente du rendu`).not.toBeNull();
      expect(
        ligne(id).querySelector('.charge-split-tag'),
        `« ${id} » déroge au mode du foyer et sa ligne ne le dit pas : `
        + 'la seule trace visible de `splitOverride` a disparu'
      ).not.toBeNull();
    }
  });

  it('et la pastille DIT la règle, elle ne signale pas seulement une dérogation', () => {
    // Une pastille muette — « modifié », « dérogation » — satisferait le
    // contrôle précédent sans rien apprendre. C'est la RÈGLE appliquée qui
    // explique pourquoi le montant à virer n'est pas celui qu'on attendait.
    //
    // La pastille est lue par `?.` plutôt que déréférencée : absente, ce
    // contrôle doit DIRE quelle règle manquait, pas tomber sur un `TypeError`
    // qui ne nomme que la ligne de test.
    expect(
      ligne('moitie').querySelector('.charge-split-tag')?.textContent.trim(),
      'un partage en deux doit se lire « 50/50 » sur sa ligne'
    ).toBe('50/50');

    expect(
      ligne('libre').querySelector('.charge-split-tag')?.textContent.trim(),
      'des pourcentages libres doivent se lire, tous les deux'
    ).toBe('70/30');
  });

  it('TÉMOIN — une charge ordinaire n\'en porte aucune', () => {
    // Sans ce contrôle, poser la pastille sur TOUTES les lignes passerait les
    // deux précédents — et elle cesserait de distinguer quoi que ce soit.
    expect(
      ligne('ordinaire').querySelector('.charge-split-tag'),
      'une charge qui suit le mode du foyer n\'a rien à signaler'
    ).toBeNull();

    expect(document.querySelectorAll('.charge-split-tag')).toHaveLength(2);
  });
});

/**
 * LA QUATRIÈME SURFACE — la modale du détail
 *
 * Elle est celle qui ouvre un chiffre du bilan sur les dépenses qui le
 * composent, et elle dit déjà la PARTIALITÉ d'une ligne (« part de 400,00 € »)
 * sans jamais dire la RÈGLE qui l'a produite. Or c'est exactement là que la
 * question se pose : on vient de cliquer sur un total pour comprendre d'où il
 * sort, et une charge en 50/50 dans un foyer au prorata y entre pour 500,00 €
 * quand la règle commune en donnerait 750,00. Le chiffre était le seul indice.
 *
 * `detail.js:92` pousse déjà la charge ENTIÈRE dans la ligne — `splitOverride`
 * compris : rien n'est à relire, ni à recalculer.
 *
 * ## Le jeu d'essai n'emploie que des charges variables, et c'est délibéré
 *
 * `charge-split-tag` porte aujourd'hui DEUX sémantiques : la répartition
 * dérogatoire et le mot « fixe » (`detail-depenses.js:142`). Une charge fixe
 * dérogatoire porterait donc deux pastilles de même classe, et le témoin de
 * comptage mesurerait la collision plutôt que la pastille. Les trois charges
 * sont variables ; la séparation des deux sens est un lot à elle seule.
 */
describe('La répartition dérogatoire se voit — modale du détail', () => {
  /** Salaires inégaux : sans eux, prorata et 50-50 donnent le même chiffre */
  const SALAIRES = { vous: 3000, conjointe: 1000 };

  /**
   * Les deux charges qui dérogent sont PARTAGÉES : c'est le seul cas où la
   * règle change le montant affiché, donc le seul où la pastille explique
   * quelque chose.
   */
  const DEPENSES = [
    {
      id: 'moitie', amount: 1000, description: 'Loyer', category: 'Maison',
      paidBy: 'partage', date: '2026-09-05', deleted: false,
      splitOverride: { mode: '50-50' }
    },
    {
      id: 'libre', amount: 200, description: 'Électricité', category: 'Maison',
      paidBy: 'partage', date: '2026-09-06', deleted: false,
      splitOverride: { mode: 'custom', vous: 70, conjointe: 30 }
    },
    {
      id: 'ordinaire', amount: 100, description: 'Internet', category: 'Maison',
      paidBy: 'vous', date: '2026-09-07', deleted: false
    }
  ];

  /** La ligne d'une dépense, telle que la modale vient de la peindre */
  function ligneDe(description) {
    return [...document.querySelectorAll('#modalDetailDepenses .detail-ligne')]
      .find(l => l.querySelector('.detail-ligne-titre')?.textContent.includes(description));
  }

  const OUVERTURES = [
    { nom: 'détail d\'un payeur', ouvrir: () => ouvrirDetailPayeur('vous') },
    { nom: 'détail d\'une catégorie', ouvrir: () => ouvrirDetailCategorie('Maison') }
  ];

  beforeEach(() => {
    setState('salaries', SALAIRES);
    setState('variableCharges', DEPENSES);
    setState('fixedCharges', []);
    setState('reimbursements', []);
    setState('shareMode', 'prorata');
  });

  describe.each(OUVERTURES)('$nom', ({ ouvrir }) => {
    beforeEach(() => ouvrir());

    it('une charge qui déroge porte une pastille SUR SA LIGNE', () => {
      for (const description of ['Loyer', 'Électricité']) {
        expect(ligneDe(description), `ligne « ${description} » absente`).toBeTruthy();
        expect(
          ligneDe(description).querySelector('.charge-split-tag'),
          `« ${description} » déroge au mode du foyer et la modale ne le dit pas : `
          + 'elle annonce la partialité de la ligne sans jamais nommer la règle'
        ).not.toBeNull();
      }
    });

    it('et la pastille DIT la règle', () => {
      expect(
        ligneDe('Loyer').querySelector('.charge-split-tag')?.textContent.trim(),
        'un partage en deux doit se lire « 50/50 »'
      ).toBe('50/50');

      expect(
        ligneDe('Électricité').querySelector('.charge-split-tag')?.textContent.trim(),
        'des pourcentages libres doivent se lire, tous les deux'
      ).toBe('70/30');
    });

    it('TÉMOIN — une charge ordinaire n\'en porte aucune', () => {
      expect(
        ligneDe('Internet').querySelector('.charge-split-tag'),
        'une charge qui suit le mode du foyer n\'a rien à signaler'
      ).toBeNull();

      expect(
        document.querySelectorAll('#modalDetailDepenses .charge-split-tag')
      ).toHaveLength(2);
    });
  });

  it('la pastille ne remplace pas la mention de partialité, elle s\'y ajoute', () => {
    // Les deux répondent à des questions différentes : « part de 1 000,00 € »
    // dit que la ligne ne compte pas en entier, « 50/50 » dit pourquoi elle
    // compte pour ce montant-là. Poser l'une à la place de l'autre ferait
    // passer les contrôles ci-dessus en perdant la moitié de l'explication.
    ouvrirDetailPayeur('vous');

    const ligne = ligneDe('Loyer');
    expect(ligne.querySelector('.charge-split-tag')?.textContent.trim()).toBe('50/50');
    expect(ligne.querySelector('.detail-part')?.textContent).toContain('part de');
  });
});
