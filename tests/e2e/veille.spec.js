import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Ce que l'application remarque, à l'écran
 *
 * Le cas vient de l'usage, capture à l'appui : une enveloppe « Vacances »
 * arrivée à son échéance, sur laquelle le foyer a dépensé 1 009,81 € pour
 * 800 € prévus. La question utile n'est plus « où en est-on » mais « combien
 * mettre de côté chaque mois pour que l'an prochain soit déjà payé ».
 *
 * `tests/utils/veille.test.js` verrouille le calcul. Ce qui est vérifié ici,
 * c'est que l'observation **atteint l'écran** — et qu'elle porte son
 * fondement, sans quoi ce n'est plus un conseil mais une injonction.
 */

/** Le mois affiché par l'application au moment du test */
function moisCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Sème l'enveloppe de la capture, et ses dépenses réparties sur deux mois */
function semer() {
  const p = moisCourant();
  const annee = Number(p.slice(0, 4));
  const mois = p.slice(5, 7);

  // Le mois précédent, pour prouver que le total est bien « tous mois confondus »
  const precedent = mois === '01'
    ? `${annee - 1}-12`
    : `${annee}-${String(Number(mois) - 1).padStart(2, '0')}`;

  const db = {
    'household/salaries': { vous: 2600, conjointe: 2100 },
    // Un TABLEAU : c'est ce que `normaliserEnveloppes` attend, et ce que
    // Realtime Database rend sur des clés numériques consécutives.
    'household/envelopes': [{
      id: 'vacances',
      label: 'Vacances',
      icon: '🧳',
      nature: 'cagnotte',
      rang: 'provision',
      budget: 800,
      // Échéance dans le mois affiché : l'observation se déclenche.
      fin: `${p}-28`
    }],
    [`household/periods/${p}/salaries`]: { vous: 2600, conjointe: 2100 }
  };

  // 1 009,81 € en tout : 609,81 le mois dernier, 400 celui-ci.
  db[`household/periods/${precedent}/variableCharges/v1`] = {
    description: 'Camping', amount: 609.81, category: 'Loisirs',
    paidBy: 'vous', envelope: 'vacances', date: `${precedent}-14`, deleted: false
  };
  db[`household/periods/${p}/variableCharges/v2`] = {
    description: 'Restaurant', amount: 400, category: 'Restos',
    paidBy: 'conjointe', envelope: 'vacances', date: `${p}-03`, deleted: false
  };

  return db;
}

async function ouvrir(page, db) {
  await setupFirebaseMock(page);
  await page.addInitScript(`window.__db = ${JSON.stringify(db)};`);
  await waitForApp(page);
  await page.waitForTimeout(1200);
}

test.describe('La veille sur le bilan', () => {
  test('une cagnotte arrivée à terme propose sa provision pour l\'an prochain', async ({ page }) => {
    await ouvrir(page, semer());

    const veille = page.locator('.summary-veille');
    await expect(veille).toBeVisible();
    await expect(veille).toContainText('Vacances');
    await expect(veille).toContainText('an prochain');
  });

  test('le montant mensuel est celui de la dépense réelle, tous mois confondus', async ({ page }) => {
    // 1 009,81 € répartis sur deux mois, divisés par les douze mois à venir
    // → 84,15 €. Un total calculé sur le seul mois affiché aurait donné 400 €
    // de base, soit 33,33 €/mois — et c'est très exactement le piège.
    await ouvrir(page, semer());

    // Le montant est comparé dans la langue de l'application — virgule
    // décimale, espace fine insécable des milliers — et non dans celle de
    // `toFixed`. Écrire « 512.00 » ici verrouillait le défaut que ce format
    // constitue : le test empêchait de le corriger.
    await expect(page.locator('.summary-veille')).toContainText(/84,15/);
  });

  test('l\'observation dit sur quoi elle se fonde', async ({ page }) => {
    await ouvrir(page, semer());

    // La règle du module : un conseil dont on ne peut pas vérifier l'assise
    // n'est pas un conseil.
    await expect(page.locator('.veille-fonde').first()).toContainText(/1\s?009,81/);
  });

  test('rien à dire ne produit aucun encadré', async ({ page }) => {
    // Le cas courant d'un mois qui se passe bien. Un bandeau « tout va bien »
    // deviendrait du bruit, et ferait passer les vraies observations pour
    // du décor.
    const p = moisCourant();
    await ouvrir(page, {
      'household/salaries': { vous: 2600, conjointe: 2100 },
      [`household/periods/${p}/salaries`]: { vous: 2600, conjointe: 2100 },
      [`household/periods/${p}/variableCharges/x`]: {
        description: 'Courses', amount: 50, category: 'Courses',
        paidBy: 'vous', date: `${p}-02`, deleted: false
      }
    });

    await expect(page.locator('#summarySection')).toBeVisible();
    expect(await page.locator('.summary-veille').count()).toBe(0);
  });

  test('CRÉER DEMANDE CONFIRMATION — et refuser n\'écrit rien', async ({ page }) => {
    // Le bouton vit dans une carte qui paraît d'elle-même, en tête du bilan,
    // au-dessus de tout ce qu'on vient y chercher. Il écrivait sans rien
    // demander, là où supprimer une charge fait confirmer : une frappe
    // involontaire devenait indiscernable d'une décision, et le foyer a trouvé
    // une enveloppe qu'il ne se souvenait pas d'avoir créée.
    await ouvrir(page, semer());

    await page.locator('[data-action="creerEnveloppeProposee"]').click();

    const confirmation = page.locator('#modalConfirm');
    await expect(confirmation).toBeVisible();
    // Elle nomme ce qui sera créé, ET ce que ça engage.
    await expect(confirmation).toContainText('Vacances 2027');
    // Le montant est celui de la carte, formaté comme partout où l'application
    // montre de l'argent : « 84,15 € », et non le « 84.15 » brut que le texte
    // de l'observation emploie.
    await expect(confirmation).toContainText('84,15');

    await page.locator('#modalConfirmCancel').click();
    await page.waitForTimeout(600);

    // Rien n'a été écrit, et la carte est toujours là.
    const enBase = await page.evaluate(() =>
      JSON.stringify(window.__db['household/envelopes'] || []));
    expect(enBase).not.toContain('Vacances 2027');
    await expect(page.locator('.summary-veille')).toContainText('an prochain');
  });

  test('accepter crée la cagnotte, et l\'enveloppe garde qui l\'a créée', async ({ page }) => {
    // Le témoin positif : sans lui, une confirmation qui refuserait toujours
    // passerait le contrôle ci-dessus.
    await ouvrir(page, semer());

    await page.locator('[data-action="creerEnveloppeProposee"]').click();
    await page.locator('#modalConfirmOk').click();
    await page.waitForTimeout(900);

    const creee = await page.evaluate(() => {
      const brut = window.__db['household/envelopes'] || [];
      const liste = Array.isArray(brut) ? brut : Object.values(brut);
      return liste.find(e => e && e.label === 'Vacances 2027') || null;
    });

    expect(creee, 'la cagnotte n\'a pas été écrite').not.toBe(null);
    // La question « qui a créé ça, et quand ? » n'avait aucune réponse possible.
    expect(['vous', 'conjointe']).toContain(creee.creePar);
    expect(typeof creee.creeLe).toBe('number');
    expect(creee.creeLe).toBeGreaterThan(0);
  });

  test('un libellé hostile est affiché en texte, jamais interprété', async ({ page }) => {
    const db = semer();
    db['household/envelopes'][0].label = '<img src=x onerror=alert(1)>';
    await ouvrir(page, db);

    await expect(page.locator('.summary-veille')).toContainText('<img src=x');
    expect(await page.locator('.summary-veille img').count()).toBe(0);
  });
});
