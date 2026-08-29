import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Ce que l'application anticipe, et le geste qu'elle propose
 *
 * `tests/utils/anticipation.test.js` verrouille les calculs. Ce qui est
 * vérifié ici, c'est la chaîne entière : l'observation atteint l'écran, son
 * bouton crée réellement la cagnotte, et la carte **disparaît** une fois le
 * conseil suivi.
 *
 * Cette dernière propriété est la plus facile à rater : sans elle, la carte
 * reparaîtrait indéfiniment après chaque acceptation, et le bouton créerait
 * une enveloppe de plus à chaque clic.
 */

const VUE = { width: 390, height: 844 };

function moisCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Une période décalée de N mois, N pouvant être négatif */
function decaler(periode, n) {
  const total = Number(periode.slice(0, 4)) * 12 + (Number(periode.slice(5, 7)) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * Une assurance vue deux fois, à un an d'écart
 *
 * Elle tombe TROIS MOIS après le mois courant, jamais dedans : une échéance
 * dans le mois même n'a plus aucun mois sur lequel s'étaler, et le détecteur
 * se tait — c'est ce que verrouille `anticipation.test.js`. Ce piège a fait
 * tomber la première version de ce contrôle.
 */
function semence() {
  const p = moisCourant();
  const vieux = decaler(p, 3 - 24);
  const recent = decaler(p, 3 - 12);

  return {
    'household/salaries': { vous: 2500, conjointe: 1800 },
    [`household/periods/${p}/salaries`]: { vous: 2500, conjointe: 1800 },
    [`household/periods/${vieux}/variableCharges/a1`]: {
      description: 'Assurance habitation', amount: 480, category: 'Maison',
      paidBy: 'vous', date: `${vieux}-12`, deleted: false
    },
    [`household/periods/${recent}/variableCharges/a2`]: {
      description: 'Assurance habitation', amount: 512, category: 'Maison',
      paidBy: 'vous', date: `${recent}-12`, deleted: false
    },
    [`household/periods/${p}/variableCharges/v1`]: {
      description: 'Courses', amount: 60, category: 'Courses',
      paidBy: 'vous', date: `${p}-02`, deleted: false
    }
  };
}

async function ouvrir(page, db) {
  await page.setViewportSize(VUE);
  await setupFirebaseMock(page);
  await page.addInitScript(`window.__db = ${JSON.stringify(db)};`);
  await waitForApp(page);
  await page.waitForTimeout(1500);
}

/** Les enveloppes telles qu'elles sont en base */
function enveloppesEnBase(page) {
  return page.evaluate(async () => {
    const { dbGet } = await import('/js/db.js');
    const liste = await dbGet('envelopes');
    return Object.values(liste || {}).map(e => ({
      label: e.label, budget: e.budget, fin: e.fin, nature: e.nature, rang: e.rang
    }));
  });
}

test.describe('Anticiper une charge annuelle', () => {
  test('la carte atteint l\'écran, et dit sur quoi elle se fonde', async ({ page }) => {
    await ouvrir(page, semence());

    const veille = page.locator('.summary-veille');
    await expect(veille).toBeVisible();
    await expect(veille).toContainText('Assurance habitation');
    // Le montant retenu est celui de la DERNIÈRE occurrence, pas la première.
    await expect(veille).toContainText('512.00');
  });

  test('le bouton crée la cagnotte, puis la carte disparaît', async ({ page }) => {
    await ouvrir(page, semence());

    expect(await enveloppesEnBase(page), 'la base ne devrait porter aucune enveloppe')
      .toEqual([]);

    const carte = page.locator('.veille-item', { hasText: 'Assurance habitation' });
    await carte.locator('.veille-action').click();
    // Le geste écrit, donc il se confirme — comme supprimer une charge.
    await page.locator('#modalConfirmOk').click();
    await page.waitForTimeout(900);

    const apres = await enveloppesEnBase(page);
    expect(apres).toHaveLength(1);
    expect(apres[0]).toMatchObject({
      label: 'Assurance habitation', budget: 512, nature: 'cagnotte', rang: 'provision'
    });

    // La propriété qui compte : le conseil suivi ne se répète pas.
    await expect(
      page.locator('.veille-item', { hasText: 'Assurance habitation' }),
      'la carte reparaît alors que l\'enveloppe existe'
    ).toHaveCount(0);
  });

  test('un second clic ne crée pas une deuxième enveloppe', async ({ page }) => {
    // Le cas de la double frappe, et celui des deux téléphones : le contrôle
    // de doublon est rejoué au moment du clic, pas seulement à l'affichage.
    await ouvrir(page, semence());

    const carte = page.locator('.veille-item', { hasText: 'Assurance habitation' });
    await carte.locator('.veille-action').click();
    await page.locator('#modalConfirmOk').click();
    await page.waitForTimeout(900);

    // La carte a disparu : on rejoue le geste par la fonction elle-même.
    const refus = await page.evaluate(async () => {
      const { dbGet } = await import('/js/db.js');
      const avant = Object.values(await dbGet('envelopes') || {}).length;
      // La clé de l'observation, telle que le calcul l'a laissée dans l'état.
      const { getState } = await import('/js/state.js');
      const vues = getState('observations') || [];
      const cle = vues.length ? vues[0].cle : 'charge-annuelle:inconnue';
      // Le refus du doublon tombe avant la confirmation : rien à confirmer,
      // puisque rien ne sera écrit.
      const rendu = await window.creerEnveloppeProposee(cle);
      const apres = Object.values(await dbGet('envelopes') || {}).length;
      return { rendu, avant, apres };
    });

    expect(refus.rendu).toBe(false);
    expect(refus.apres).toBe(refus.avant);
  });

  test('un libellé hostile est affiché en texte, jamais interprété', async ({ page }) => {
    const db = semence();
    const cible = Object.keys(db).find(c => c.endsWith('a2'));
    const vieux = Object.keys(db).find(c => c.endsWith('a1'));
    db[cible].description = '<img src=x onerror=alert(1)>';
    db[vieux].description = '<img src=x onerror=alert(1)>';

    await ouvrir(page, db);

    await expect(page.locator('.summary-veille')).toContainText('<img src=x');
    expect(await page.locator('.summary-veille img').count()).toBe(0);
  });
});

test.describe('Ce que l\'écran ne montre pas', () => {
  test('rien à dire ne produit aucun encadré', async ({ page }) => {
    const p = moisCourant();
    await ouvrir(page, {
      'household/salaries': { vous: 2500, conjointe: 1800 },
      [`household/periods/${p}/salaries`]: { vous: 2500, conjointe: 1800 },
      [`household/periods/${p}/variableCharges/x`]: {
        description: 'Courses', amount: 50, category: 'Courses',
        paidBy: 'vous', date: `${p}-02`, deleted: false
      }
    });

    await expect(page.locator('#summarySection')).toBeVisible();
    expect(await page.locator('.summary-veille').count()).toBe(0);
  });
});

test.describe('Ce qui revient chaque mois sans être déclaré fixe', () => {
  /** Trois mois révolus où Netflix est saisi à la main, jamais déclaré fixe */
  function abonnements() {
    const p = moisCourant();
    const db = {
      'household/salaries': { vous: 2500, conjointe: 1800 },
      [`household/periods/${p}/salaries`]: { vous: 2500, conjointe: 1800 }
    };

    for (let recul = 3; recul >= 1; recul--) {
      const mois = decaler(p, -recul);
      db[`household/periods/${mois}/variableCharges/n`] = {
        description: 'Netflix', amount: 13.49, category: 'Loisirs',
        paidBy: 'vous', date: `${mois}-04`, deleted: false
      };
      db[`household/periods/${mois}/fixedCharges/l`] = {
        description: 'Loyer', amount: 950, category: 'Maison',
        paidBy: 'vous', date: `${mois}-05`, deleted: false
      };
    }
    return db;
  }

  test('la carte donne le mois et l\'année, sans répéter les charges fixes', async ({ page }) => {
    await ouvrir(page, abonnements());

    const veille = page.locator('.summary-veille');
    await expect(veille).toBeVisible();
    await expect(veille).toContainText('Netflix');
    await expect(veille).toContainText('161.88');          // 13,49 × 12
    // Le panneau des charges fixes porte déjà le loyer : le répéter serait du bruit.
    await expect(veille).not.toContainText('Loyer');
  });
});
