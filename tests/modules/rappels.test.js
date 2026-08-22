// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Les rappels : ce qu'ils annoncent, et à qui ils obéissent
 *
 * Trois défauts vivaient ici, et aucun test ne regardait ce module.
 *
 * Les trois cases de réglage étaient enregistrées, restaurées à l'écran, et
 * jamais consultées : décocher « fin de mois » ne changeait rien.
 *
 * Le rappel des charges fixes comparait le mois à une liste attendue — Loyer,
 * Énergie, Internet, Assurances — dont aucune entrée n'existe dans les
 * catégories du projet : les quatre étaient déclarées manquantes chaque 3 du
 * mois, quoi qu'on ait saisi.
 *
 * Le rappel des remboursements comptait ceux dont le champ `completed` était
 * absent — champ qui n'est écrit nulle part. Tous comptaient, indéfiniment.
 */

const loadReminders = vi.fn();

vi.mock('../../public/js/db.js', () => ({
  loadReminders,
  saveReminders: vi.fn(() => Promise.resolve()),
  dbGet: vi.fn(() => Promise.resolve(null)),
  dbSet: vi.fn(() => Promise.resolve()),
  dbUpdate: vi.fn(() => Promise.resolve()),
  dbPush: vi.fn(() => Promise.resolve('cle')),
  getDataPath: vi.fn(path => `household/${path}`)
}));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));

const { initNotifications, cleanupNotifications } = await import('../../public/js/modules/notifications.js');
const { setState, resetState } = await import('../../public/js/state.js');

/** Notifications système émises pendant le test */
let emises = [];

/**
 * Installe les réglages, avance jusqu'à leur prise en compte, et rend ce qui
 * a été notifié
 * @param {Object} reglages - Réglages tels que lus en base
 * @returns {Promise<Array<{title: string, body: string}>>} Notifications émises
 */
async function notifierAvec(reglages) {
  loadReminders.mockResolvedValue(reglages);
  emises = [];

  initNotifications();
  // restoreReminderSettings est asynchrone : deux tours de boucle suffisent à
  // la voir aboutir, puisque la base est doublée.
  await Promise.resolve();
  await Promise.resolve();

  return emises;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  document.body.innerHTML = `
    <input type="checkbox" id="reminderFinMois">
    <input type="checkbox" id="reminderBudget">
    <input type="text" id="budgetAmount">
    <input type="checkbox" id="reminderReimbursement">
    <div id="budgetInputRow"></div>
    <div id="notificationsStatus"></div>
  `;
  setState('currentPeriod', '2026-08');

  globalThis.Notification = class {
    static permission = 'granted';
    static requestPermission = vi.fn(() => Promise.resolve('granted'));
    constructor(title, options = {}) {
      emises.push({ title, body: options.body });
      this.close = vi.fn();
    }
  };

  vi.useFakeTimers();
  // 24 août : sept jours avant la fin du mois.
  vi.setSystemTime(new Date(2026, 7, 24, 10, 0, 0));
});

afterEach(() => {
  cleanupNotifications();
  vi.useRealTimers();
  delete globalThis.Notification;
});

describe('Les cases de réglage sont respectées', () => {
  it('tout décoché, rien n\'est notifié', async () => {
    setState('dernierSolde', 250);

    const notifs = await notifierAvec({ finMois: false, budget: false, reimbursement: false });

    expect(notifs).toHaveLength(0);
  });

  it('« fin de mois » cochée, le rappel des sept jours part', async () => {
    const notifs = await notifierAvec({ finMois: true, budget: false, reimbursement: false });

    expect(notifs).toHaveLength(1);
    expect(notifs[0].title).toMatch(/7 jours/);
  });

  it('« fin de mois » décochée, ce même rappel ne part pas', async () => {
    const notifs = await notifierAvec({ finMois: false, budget: false, reimbursement: false });

    expect(notifs).toHaveLength(0);
  });

  it('rien n\'est notifié tant que les réglages sont inconnus', async () => {
    // La base ne répond pas : notifier à ce moment-là, c'est notifier contre
    // le choix de la personne.
    loadReminders.mockReturnValue(new Promise(() => {}));
    emises = [];

    initNotifications();
    await Promise.resolve();

    expect(emises).toHaveLength(0);
  });
});

describe('Le rappel de solde porte sur un état réel', () => {
  it('un solde non réglé est annoncé avec son montant', async () => {
    setState('dernierSolde', -128.4);

    const notifs = await notifierAvec({ finMois: false, budget: false, reimbursement: true });

    expect(notifs).toHaveLength(1);
    expect(notifs[0].body).toContain('128.40');
  });

  it('un écart inférieur à l\'euro relève de l\'arrondi, pas d\'une dette', async () => {
    setState('dernierSolde', 0.4);

    const notifs = await notifierAvec({ finMois: false, budget: false, reimbursement: true });

    expect(notifs).toHaveLength(0);
  });

  it('sans solde calculé, rien n\'est affirmé', async () => {
    const notifs = await notifierAvec({ finMois: false, budget: false, reimbursement: true });

    expect(notifs).toHaveLength(0);
  });
});

describe('Sans permission accordée, rien ne part', () => {
  it('permission refusée : aucune notification', async () => {
    globalThis.Notification.permission = 'denied';
    setState('dernierSolde', 300);

    const notifs = await notifierAvec({ finMois: true, budget: true, reimbursement: true });

    expect(notifs).toHaveLength(0);
  });
});
