// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Alimenter une cagnotte à deux, depuis l'écran
 *
 * Les parts sont fixées par `tests/utils/versement-partage.test.js`. Ce qui se
 * juge ici : ce qui part réellement en base — deux lignes nominatives et non
 * une ligne « à deux » — et ce que l'écran annonce avant de l'écrire.
 */

const dbPush = vi.fn(() => Promise.resolve('cle'));
const dbGet = vi.fn(() => Promise.resolve(null));

vi.mock('../../public/js/db.js', () => ({
  dbPush, dbGet,
  dbSet: vi.fn(() => Promise.resolve()),
  dbUpdate: vi.fn(() => Promise.resolve()),
  getDataPath: vi.fn(path => `household/${path}`)
}));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));

const { setState, resetState } = await import('../../public/js/state.js');
const { toast } = await import('../../public/js/components/toast.js');
await import('../../public/js/modules/envelopes.js');

const VACANCES = {
  id: 'vacances-2027', label: 'Vacances 2027', icon: '🏖️',
  budget: 1800, debut: null, fin: '2027-08-29', cloturee: false, nature: 'cagnotte'
};

/** Ouvre la vue détaillée du pot, seule à porter le formulaire de versement */
async function ouvrirLePot() {
  window.showManageEnvelopesModal();
  const ouvrir = document.querySelector('.envelope-ouvrir');
  ouvrir.click();
  await vi.waitFor(() => {
    expect(document.getElementById('versementMontant')).not.toBeNull();
  });
}

/** Renseigne le formulaire de versement */
function saisir({ montant, auteur, date = '2026-09-05' }) {
  document.getElementById('versementMontant').value = montant;
  document.getElementById('versementDate').value = date;
  const select = document.getElementById('versementAuteur');
  select.value = auteur;
  select.dispatchEvent(new Event('change'));
}

/** Les versements poussés, dans l'ordre */
const versementsEcrits = () => dbPush.mock.calls
  .filter(appel => String(appel[0]).startsWith('versements/'))
  .map(appel => appel[1]);

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  document.body.innerHTML = '';
  setState('currentPeriod', '2026-09');
  setState('envelopes', [VACANCES]);
  setState('shareMode', 'prorata');
  setState('members', { vous: 'Richard', conjointe: 'Cindy' });
  setState('salaries', { vous: 2600, conjointe: 1800, extraVous: 0, extraConjointe: 0 });

  // Le détail lit `periods` et le nœud des versements ; l'aperçu lit les
  // salaires du mois du versement.
  dbGet.mockImplementation(chemin => {
    if (chemin === 'salaries') {
      return Promise.resolve({ vous: 2600, conjointe: 1800 });
    }
    if (chemin === 'periods/2026-09/salaries') {
      return Promise.resolve({ vous: 2600, conjointe: 1800 });
    }
    return Promise.resolve(null);
  });
});

describe('Verser à deux', () => {
  it('écrit DEUX versements nominatifs, jamais une ligne « à deux »', async () => {
    // Un versement porte un auteur, et c'est cette propriété qui permet de dire
    // plus tard « vous avez mis 400, elle 300 ». Une ligne « à deux » de 150 €
    // ne saurait plus répondre, et l'écart à régler deviendrait incalculable.
    await ouvrirLePot();
    saisir({ montant: '150', auteur: 'deux' });
    document.getElementById('versementAjouter').click();

    await vi.waitFor(() => expect(versementsEcrits()).toHaveLength(2));

    const [premier, second] = versementsEcrits();
    expect(premier.auteur).toBe('vous');
    expect(second.auteur).toBe('conjointe');
    expect(premier.montant + second.montant).toBe(150);
  });

  it('les deux lignes portent la date saisie', async () => {
    await ouvrirLePot();
    saisir({ montant: '150', auteur: 'deux', date: '2026-09-05' });
    document.getElementById('versementAjouter').click();

    await vi.waitFor(() => expect(versementsEcrits()).toHaveLength(2));
    expect(versementsEcrits().every(v => v.date === '2026-09-05')).toBe(true);
  });

  it('un seul auteur reste une seule ligne', async () => {
    await ouvrirLePot();
    saisir({ montant: '150', auteur: 'vous' });
    document.getElementById('versementAjouter').click();

    await vi.waitFor(() => expect(versementsEcrits()).toHaveLength(1));
    expect(versementsEcrits()[0]).toMatchObject({ auteur: 'vous', montant: 150 });
  });

  it('sans montant, rien ne part', async () => {
    await ouvrirLePot();
    saisir({ montant: '', auteur: 'deux' });
    document.getElementById('versementAjouter').click();

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(versementsEcrits()).toHaveLength(0);
  });
});

describe('L\'aperçu, dit avant l\'écriture', () => {
  it('annonce les deux parts, les deux prénoms et la règle', async () => {
    await ouvrirLePot();
    saisir({ montant: '150', auteur: 'deux' });

    const zone = document.getElementById('versementPartage');
    await vi.waitFor(() => expect(zone.hidden).toBe(false));

    expect(zone.textContent).toContain('Richard');
    expect(zone.textContent).toContain('Cindy');
    expect(zone.textContent).toContain('88,64');
    expect(zone.textContent).toContain('61,36');
    expect(zone.textContent).toContain('prorata');
  });

  it('reste replié tant que l\'auteur est une personne', async () => {
    await ouvrirLePot();
    saisir({ montant: '150', auteur: 'vous' });

    // Laisser tourner : si l'aperçu devait paraître, il aurait eu le temps.
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById('versementPartage').hidden).toBe(true);
  });

  it('se replie quand le montant est effacé', async () => {
    await ouvrirLePot();
    saisir({ montant: '150', auteur: 'deux' });
    const zone = document.getElementById('versementPartage');
    await vi.waitFor(() => expect(zone.hidden).toBe(false));

    const champ = document.getElementById('versementMontant');
    champ.value = '';
    champ.dispatchEvent(new Event('input'));

    await vi.waitFor(() => expect(zone.hidden).toBe(true));
  });

  it('le mois annoncé est celui de la DATE, pas celui qu\'on affiche', async () => {
    // La vue d'une enveloppe est transversale : elle s'ouvre depuis n'importe
    // quel mois. C'est la date du versement qui désigne les revenus.
    setState('currentPeriod', '2026-12');
    await ouvrirLePot();
    saisir({ montant: '150', auteur: 'deux', date: '2026-09-05' });

    const zone = document.getElementById('versementPartage');
    await vi.waitFor(() => expect(zone.hidden).toBe(false));
    expect(zone.textContent).toContain('septembre 2026');
  });
});
