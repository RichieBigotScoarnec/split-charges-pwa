// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { REIMBURSEMENT_DIRECTIONS } from '../../public/js/config.js';
import { computeSummary } from '../../public/js/utils/calculations.js';

const dbPush = vi.fn(() => Promise.resolve('nouvelle-cle'));
/** L'instantané que la relecture obtiendra */
let INSTANTANE = { '2026-08': { variableCharges: { v1: { amount: 10 } } } };
const dbGet = vi.fn(chemin => Promise.resolve(chemin === 'periods' ? INSTANTANE : null));
/** La liaison est-elle rompue ? Remplaçable par test. */
let liaisonRompueMock = () => false;

// Le double de `db.js` enveloppe l'ORIGINAL plutôt que de le remplacer.
//
// Depuis le lot P1b, les lectures de charges passent par `poches.js`, qui
// demande `cheminDuPersonnel` à `db.js`. Un double qui ne le porte pas fait
// échouer la fusion ; un double qui le RÉÉCRIT en donnerait une seconde
// rédaction, et ces cas mesureraient alors un chemin que l'application
// n'emprunte pas. Seuls les accès sont remplacés.
vi.mock('../../public/js/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  // Accesseurs PARESSEUX, et ce n'est pas un style : le facteur d'un double
  // `async` est invoqué AVANT les `const` du fichier, et une référence
  // directe y tombe en zone morte temporelle. Vitest sert alors le module
  // ORIGINAL — silencieusement — et le cas mesure la vraie base.
  dbPush: (...a) => dbPush(...a),
  dbGet: (...a) => dbGet(...a),
  dbSet: vi.fn(() => Promise.resolve()),
  dbUpdate: vi.fn(() => Promise.resolve()),
  getDataPath: vi.fn(path => `household/${path}`),
  liaisonRompue: vi.fn(() => liaisonRompueMock())
}));

// Les collaborateurs de la relecture. Ce qui est vérifié ici, c'est qu'ils
// sont TOUS appelés, et tous sur le même instantané — pas ce qu'ils font.
const appliquerLesTermesDuMois = vi.fn();
const loadVariableCharges = vi.fn();
const loadFixedCharges = vi.fn();
const refreshCarryOver = vi.fn();
vi.mock('../../public/js/modules/period.js', () => ({ appliquerLesTermesDuMois }));
vi.mock('../../public/js/modules/variable-charges.js', () => ({ loadVariableCharges }));
vi.mock('../../public/js/modules/fixed-charges.js', () => ({ loadFixedCharges }));
vi.mock('../../public/js/modules/carry-over.js', () => ({ refreshCarryOver }));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(),
  closeModal: vi.fn(),
  showConfirmModal: vi.fn(() => Promise.resolve(true))
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));

let soldeCourant = 0;
vi.mock('../../public/js/modules/summary.js', () => ({
  calculateSummary: vi.fn(() => ({ balance: soldeCourant }))
}));

const {
  settleBalance, confirmerLeReglement, initReimbursements
} = await import('../../public/js/modules/reimbursements.js');
const { setState } = await import('../../public/js/state.js');
const { toast } = await import('../../public/js/components/toast.js');
const { showModal, closeModal } = await import('../../public/js/components/modal.js');
const { oublierLesEcouteurs } = await import('../../public/js/utils/ecouteur.js');

/**
 * Le balisage de la modale, tel qu'il vit dans `FairSplit.html`
 *
 * Recopié plutôt qu'importé, et c'est une duplication délibérée dont le prix
 * est connu : ce qui la tient est le contrôle de bout en bout, qui charge la
 * vraie page. Ce que ces cas mesurent est la MÉCANIQUE — ce qui est lu, ce qui
 * est écrit, ce qui ne l'est pas —, pas le balisage.
 */
function poserLaModale() {
  document.body.innerHTML = `
    <button id="addReimbursementBtn"></button>
    <button id="saveReimbursement"></button>
    <div id="modalReglerSolde">
      <h2 id="modalReglerSoldeTitre"></h2>
      <p id="reglerSoldeSens"></p>
      <input type="text" id="reglerSoldeMontant" />
      <p id="reglerSoldeConsequence"></p>
      <p id="reglerSoldeAvertissement" hidden></p>
      <button id="reglerSoldeValider"></button>
    </div>
    <div id="reimbursementsList"></div>`;
  for (const id of ['addReimbursementBtn', 'saveReimbursement', 'reglerSoldeValider',
    'reglerSoldeMontant']) {
    oublierLesEcouteurs(document.getElementById(id));
  }
}

const champ = () => document.getElementById('reglerSoldeMontant');
const phrase = () => document.getElementById('reglerSoldeConsequence').textContent;
const avertissement = () => document.getElementById('reglerSoldeAvertissement');
const bouton = () => document.getElementById('reglerSoldeValider');

/** Tape un montant, comme la personne le ferait */
function taper(valeur) {
  champ().value = valeur;
  champ().dispatchEvent(new Event('input'));
}

/** Dernier remboursement transmis à la base */
const dernierEcrit = () => dbPush.mock.calls.at(-1)[1];

/** Ce que `formatCurrency` écrit : espaces fines insécables comprises */
const chiffres = (texte) => texte.replace(/[\s\u202f\u00a0]/g, '');

function remettreAZero() {
  vi.clearAllMocks();
  poserLaModale();
  setState('currentPeriod', '2026-08');
  setState('members', { vous: 'Richard', conjointe: 'Cindy' });
  setState('emplacementCourant', 'vous');
  liaisonRompueMock = () => false;
  INSTANTANE = { '2026-08': { variableCharges: { v1: { amount: 10 } } } };
}

describe('Ouvrir le règlement d\'un mois', () => {
  beforeEach(remettreAZero);

  it('pré-remplit le montant EXACT du solde', async () => {
    soldeCourant = 66.94;
    await settleBalance();

    expect(showModal).toHaveBeenCalledWith('modalReglerSolde');
    expect(champ().value).toBe('66,94');
    expect(phrase()).toBe('Le solde du mois reviendra à zéro.');
    expect(bouton().disabled).toBe(false);
  });

  it('le titre nomme le MOIS AFFICHÉ, celui que le règlement solde', async () => {
    soldeCourant = 500;
    await settleBalance();

    // D5 : un règlement appartient au mois affiché, pas au mois de sa date.
    // Sans le titre, rien à l'écran ne dirait lequel on solde.
    expect(document.getElementById('modalReglerSoldeTitre').textContent)
      .toMatch(/août\s+2026/i);
  });

  it('le sens est DIT, et il suit le signe du solde', async () => {
    soldeCourant = 500;
    await settleBalance();
    const quandElleDoit = document.getElementById('reglerSoldeSens').textContent;

    soldeCourant = -500;
    await settleBalance();
    const quandJeDois = document.getElementById('reglerSoldeSens').textContent;

    expect(quandElleDoit).toContain('Cindy');
    expect(quandJeDois).toContain('Richard');
    expect(quandJeDois).not.toBe(quandElleDoit);
    // Et il n'est pas offert au choix : aucun contrôle de sens dans la modale.
    expect(document.querySelectorAll('#modalReglerSolde select')).toHaveLength(0);
  });

  it('un montant arrondi à la centaine de centimes garde ses deux décimales', async () => {
    soldeCourant = 320.5;
    await settleBalance();

    expect(champ().value).toBe('320,50');
  });

  it('des comptes déjà équilibrés n\'ouvrent rien', async () => {
    soldeCourant = 0;
    await settleBalance();

    expect(showModal).not.toHaveBeenCalled();
    expect(dbPush).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalled();
  });

  it('un écart inférieur au centime n\'ouvre rien non plus', async () => {
    soldeCourant = 0.004;
    await settleBalance();

    expect(showModal).not.toHaveBeenCalled();
    expect(dbPush).not.toHaveBeenCalled();
  });

  it('sans période sélectionnée, rien ne s\'ouvre', async () => {
    soldeCourant = 500;
    setState('currentPeriod', null);
    await settleBalance();

    expect(showModal).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('le BOUTON de la modale mène bien à l\'écriture', async () => {
    // L'export de `confirmerLeReglement` sert au banc d'essai ; ce cas tient le
    // CÂBLAGE, que l'export ne prouve pas. Sans lui, tous les autres cas
    // pourraient passer sur une modale dont le bouton ne fait rien.
    soldeCourant = 500;
    initReimbursements();
    await settleBalance();

    bouton().click();
    await vi.waitFor(() => expect(dbPush).toHaveBeenCalled());
    expect(dernierEcrit().amount).toBe(500);
  });
});

describe('Le montant est LIBRE, et sa conséquence est dite', () => {
  beforeEach(remettreAZero);

  it('un paiement exact ramène le solde à zéro', async () => {
    soldeCourant = 66.94;
    await settleBalance();
    await confirmerLeReglement();

    expect(dernierEcrit()).toMatchObject({
      direction: REIMBURSEMENT_DIRECTIONS.PARTNER_TO_YOU,
      amount: 66.94,
      note: 'Règlement du solde'
    });
  });

  it('UN PAIEMENT PARTIEL écrit ce qui a été tapé, pas le pré-remplissage', async () => {
    soldeCourant = 66.94;
    await settleBalance();
    taper('40');

    expect(chiffres(phrase())).toContain('26,94€');
    await confirmerLeReglement();

    expect(dernierEcrit().amount).toBe(40);
  });

  it('LE GESTE SUIVANT PRÉ-REMPLIT LE RESTE — pas d\'échéancier (D4)', async () => {
    soldeCourant = 66.94;
    await settleBalance();
    taper('40');
    await confirmerLeReglement();

    // Le mois a bougé : le solde vaut désormais ce qui reste.
    soldeCourant = 26.94;
    await settleBalance();

    expect(champ().value).toBe('26,94');
    expect(phrase()).toBe('Le solde du mois reviendra à zéro.');
  });

  it('un TROP-VERSÉ est accepté, sans plafond, et affiché (D3)', async () => {
    soldeCourant = 66.94;
    await settleBalance();
    taper('70');

    expect(phrase()).toContain('Tu devras');
    expect(chiffres(phrase())).toContain('3,06€');
    expect(bouton().disabled).toBe(false);

    await confirmerLeReglement();
    expect(dernierEcrit().amount).toBe(70);
  });

  it('la virgule du clavier français est lue comme le point', async () => {
    soldeCourant = 100;
    await settleBalance();
    taper('12,50');
    await confirmerLeReglement();

    expect(dernierEcrit().amount).toBe(12.5);
  });

  it('un montant illisible DÉSACTIVE la validation, et dit pourquoi', async () => {
    soldeCourant = 500;
    await settleBalance();
    taper('abc');

    expect(bouton().disabled).toBe(true);
    expect(phrase()).toMatch(/[Mm]ontant/);

    await confirmerLeReglement();
    expect(dbPush).not.toHaveBeenCalled();
  });

  it.each([['zéro', '0'], ['négatif', '-5'], ['vide', '']])(
    'un montant %s n\'écrit rien', async (_nom, saisie) => {
      soldeCourant = 500;
      await settleBalance();
      taper(saisie);

      expect(bouton().disabled).toBe(true);
      await confirmerLeReglement();
      expect(dbPush).not.toHaveBeenCalled();
    });

  it('le sens écrit reste celui du solde, même sur un trop-versé', async () => {
    // Verser plus que dû ne change pas QUI verse : c'est le solde d'APRÈS qui
    // s'inverse, pas le versement.
    soldeCourant = -66.94;
    await settleBalance();
    taper('70');
    await confirmerLeReglement();

    expect(dernierEcrit().direction).toBe(REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER);
  });

  it('LE MOIS AFFICHÉ reçoit le règlement, pas le mois de sa date (D5)', async () => {
    soldeCourant = 500;
    await settleBalance();
    await confirmerLeReglement();

    expect(dbPush.mock.calls.at(-1)[0]).toBe('periods/2026-08/reimbursements');
  });
});

/**
 * La relecture qui précède l'écriture
 *
 * Le geste promet en toutes lettres ce que le versement fera au solde. Il
 * relisait pourtant les seuls remboursements avant d'écrire — un sixième de ce
 * dont le solde dépend. Une dépense saisie en face pendant que la modale était
 * à l'écran restait invisible, et la phrase affichée était fausse.
 */
describe('Ce que le règlement relit avant d\'écrire', () => {
  beforeEach(remettreAZero);

  it('tout ce dont le solde dépend, et d\'un seul instantané', async () => {
    soldeCourant = 500;
    await settleBalance();
    await confirmerLeReglement();

    const mois = INSTANTANE['2026-08'];
    expect(appliquerLesTermesDuMois).toHaveBeenCalledWith(mois, null);
    expect(loadVariableCharges).toHaveBeenCalledWith(mois);
    expect(loadFixedCharges).toHaveBeenCalledWith(mois);
    expect(refreshCarryOver).toHaveBeenCalledWith({
      historique: INSTANTANE, salairesGlobaux: null
    });

    // Deux lectures pour la relecture entière, pas une par collaborateur.
    //
    // Une lecture de charges en vaut TROIS depuis le lot P1b — le commun et
    // les deux poches personnelles —, et les trois sont une seule lecture
    // logique : `lirePeriodes` les émet ensemble et n'en rend qu'un nœud.
    const lus = dbGet.mock.calls.map(c => c[0]);
    const lectureDeLHistorique = (chemin) => /(^|\/)periods$/.test(chemin);

    expect(lus.filter(lectureDeLHistorique)).toHaveLength(3);
    expect(lus.filter(c => c === 'periods')).toHaveLength(1);
    expect(lus.filter(c => c === 'salaries')).toHaveLength(1);
    expect(lus.filter(c => !lectureDeLHistorique(c) && c !== 'salaries'))
      .toEqual(['periods/2026-08/reimbursements']);
  });

  it('LE SOLDE QUI A CHANGÉ N\'ÉCRIT RIEN, ET NE FERME PAS LA MODALE', async () => {
    // Ce qui est comparé n'est plus le montant — il est saisi, il ne bouge
    // pas — mais le SOLDE sur lequel la phrase a été affichée.
    soldeCourant = 500;
    await settleBalance();
    taper('70');

    // L'autre personne saisit une dépense pendant la saisie.
    soldeCourant = 180;
    await confirmerLeReglement();

    expect(dbPush, 'une promesse jamais faite a été tenue').not.toHaveBeenCalled();
    expect(closeModal, 'la modale s\'est fermée, il faudra retaper')
      .not.toHaveBeenCalled();
    // Le montant saisi est CONSERVÉ : personne ne l'a contesté.
    expect(champ().value).toBe('70');
  });

  it('et la phrase est recalculée sur le solde FRAIS', async () => {
    soldeCourant = 500;
    await settleBalance();
    taper('70');
    soldeCourant = 180;
    await confirmerLeReglement();

    // 70 sur 500 laissait 430 ; sur 180 il reste 110.
    expect(chiffres(phrase())).toContain('110,00€');
    expect(chiffres(phrase())).not.toContain('430,00€');

    expect(avertissement().hidden).toBe(false);
    expect(chiffres(avertissement().textContent)).toContain('180,00€');
  });

  it('un SECOND appui, lui, écrit — sur le solde frais', async () => {
    soldeCourant = 500;
    await settleBalance();
    taper('70');
    soldeCourant = 180;
    await confirmerLeReglement();
    expect(dbPush).not.toHaveBeenCalled();

    await confirmerLeReglement();
    expect(dernierEcrit().amount).toBe(70);
  });

  it('un solde qui a changé d\'UN CENTIME suffit à retenir l\'écriture', async () => {
    soldeCourant = 500;
    await settleBalance();
    soldeCourant = 500.01;
    await confirmerLeReglement();

    expect(dbPush).not.toHaveBeenCalled();
  });

  it('un solde réglé en face pendant la saisie FERME la modale', async () => {
    // Là, la modale n'a plus d'objet : il n'y a plus rien à régler.
    soldeCourant = 500;
    await settleBalance();
    soldeCourant = 0;
    await confirmerLeReglement();

    expect(dbPush).not.toHaveBeenCalled();
    expect(closeModal).toHaveBeenCalledWith('modalReglerSolde', false);
    expect(toast.info).toHaveBeenCalled();
  });

  it('un règlement abouti ferme la modale', async () => {
    soldeCourant = 500;
    await settleBalance();
    await confirmerLeReglement();

    expect(closeModal).toHaveBeenCalledWith('modalReglerSolde', false);
    expect(toast.success).toHaveBeenCalled();
  });

  it('LE VERROU : deux appuis simultanés n\'écrivent qu\'une fois', async () => {
    soldeCourant = 500;
    await settleBalance();

    await Promise.all([confirmerLeReglement(), confirmerLeReglement()]);

    expect(dbPush).toHaveBeenCalledTimes(1);
  });
});

/**
 * Hors ligne, la vérification est impossible — donc la phrase aussi
 *
 * `dbGet` ne lève pas quand la liaison est rompue : il sert le miroir. La
 * relecture rendrait donc les valeurs de la dernière connexion, et le « solde
 * vérifié » n'aurait rien vérifié. Pire, `dbPush` met l'écriture en file et
 * rend la main : l'application annoncerait « Versement enregistré » pour un
 * règlement qui partira plus tard, calculé sur un solde périmé.
 */
describe('Régler hors ligne', () => {
  beforeEach(remettreAZero);

  it('refuse avant même d\'ouvrir la saisie', async () => {
    soldeCourant = 500;
    liaisonRompueMock = () => true;

    await settleBalance();

    expect(showModal, 'on a ouvert une saisie qu\'on refuse').not.toHaveBeenCalled();
    expect(dbPush).not.toHaveBeenCalled();
    expect(toast.error.mock.calls.at(-1)[0]).toContain('hors ligne');
  });

  it('refuse aussi quand la liaison se rompt PENDANT la saisie', async () => {
    // C'est le contrôle qui décide : le premier n'est qu'une courtoisie.
    soldeCourant = 500;
    let rompue = false;
    liaisonRompueMock = () => rompue;

    await settleBalance();
    rompue = true;
    await confirmerLeReglement();

    expect(dbPush).not.toHaveBeenCalled();
    expect(toast.error.mock.calls.at(-1)[0]).toContain('hors ligne');
  });

  it('les deux refus disent la même chose', async () => {
    soldeCourant = 500;

    liaisonRompueMock = () => true;
    await settleBalance();
    const avant = toast.error.mock.calls.at(-1)[0];

    let rompue = false;
    liaisonRompueMock = () => rompue;
    await settleBalance();
    rompue = true;
    await confirmerLeReglement();
    const apres = toast.error.mock.calls.at(-1)[0];

    expect(apres).toBe(avant);
  });
});

/**
 * Le test qui compte vraiment : un règlement EXACT doit ramener le solde à zéro.
 *
 * Il ne vérifie pas une valeur écrite mais la conséquence de cette écriture,
 * en repassant par le vrai moteur de calcul. Un tel test aurait suffi à
 * détecter l'inversion de signe des remboursements corrigée en amont : avec
 * l'ancienne convention, régler un solde de 500 l'aurait porté à 1000.
 */
describe('Après règlement, les comptes sont soldés', () => {
  /** @returns {Object} Un mois où une personne a payé 1000 € pour des salaires égaux */
  const moisDesequilibre = (payeur) => ({
    salaries: { vous: 2000, conjointe: 2000 },
    fixedCharges: [{ id: 'f1', amount: 1000, paidBy: payeur, deleted: false }],
    variableCharges: [],
    reimbursements: [],
    shareMode: 'prorata',
    customPercents: { vous: 50, conjointe: 50 }
  });

  it.each([
    ['vous', 'vous'],
    ['conjointe', 'conjointe']
  ])('quand %s avance la totalité, le règlement ramène le solde à zéro', (payeur) => {
    const mois = moisDesequilibre(payeur);
    const { balance } = computeSummary(mois);

    // Le déséquilibre doit être réel, sinon le test ne prouve rien
    expect(Math.abs(balance)).toBeCloseTo(500);

    // Même règle de décision que settleBalance
    const direction = balance > 0
      ? REIMBURSEMENT_DIRECTIONS.PARTNER_TO_YOU
      : REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER;

    const apres = computeSummary({
      ...mois,
      reimbursements: [{ id: 'r1', amount: Math.abs(balance), direction, deleted: false }]
    });

    expect(apres.balance).toBeCloseTo(0, 5);
  });

  it('UN PAIEMENT PARTIEL laisse exactement ce que la phrase annonçait', () => {
    // Le raccord entre la phrase et le moteur : ce qu'elle promet est ce que
    // `computeSummary` rendra. Sans ce cas, la phrase pourrait dire n'importe
    // quoi tant qu'elle le dit de façon cohérente avec elle-même.
    const mois = moisDesequilibre('vous');
    const { balance } = computeSummary(mois);

    const apres = computeSummary({
      ...mois,
      reimbursements: [{
        id: 'r1', amount: 300, deleted: false,
        direction: balance > 0
          ? REIMBURSEMENT_DIRECTIONS.PARTNER_TO_YOU
          : REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER
      }]
    });

    expect(Math.abs(apres.balance)).toBeCloseTo(200, 5);
    // Et le sens n'a pas bougé : 300 < 500.
    expect(Math.sign(apres.balance)).toBe(Math.sign(balance));
  });

  it('UN TROP-VERSÉ inverse le sens, du montant annoncé', () => {
    const mois = moisDesequilibre('vous');
    const { balance } = computeSummary(mois);

    const apres = computeSummary({
      ...mois,
      reimbursements: [{
        id: 'r1', amount: 700, deleted: false,
        direction: balance > 0
          ? REIMBURSEMENT_DIRECTIONS.PARTNER_TO_YOU
          : REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER
      }]
    });

    expect(Math.abs(apres.balance)).toBeCloseTo(200, 5);
    expect(Math.sign(apres.balance)).toBe(-Math.sign(balance));
  });
});
