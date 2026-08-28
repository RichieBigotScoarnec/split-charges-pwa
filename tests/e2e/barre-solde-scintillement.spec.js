import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * La barre de solde ne scintille pas — et paraît quand même
 *
 * `#balanceBar` vit dans `.bandeau-colle`, qui est dans le flux ; le bilan est
 * **après** dans le document. Faire paraître la barre pousse donc le bilan vers
 * le bas de sa propre hauteur, et le faire disparaître le remonte d'autant. Or
 * c'est la part visible du bilan qui décide de la barre : chaque bascule
 * provoquait la suivante.
 *
 * Mesuré avant correction, sur 390 × 844 : le navigateur rapporte 0,62 barre
 * masquée et 0,93 barre affichée, de part et d'autre du seuil de 0,66 —
 * **62 bascules réelles pour une descente et une remontée, une par image
 * d'affichage**. À l'œil, une bande qui scintille sur toute une plage de
 * défilement. Signalé à l'usage ; aucune capture ne le montrait, une image
 * fige un état.
 *
 * Ce contrôle tient les DEUX propriétés, parce que l'une sans l'autre se
 * satisfait trivialement : une barre qui ne paraît jamais ne scintille pas.
 */

const VUE = { width: 390, height: 844 };

/** Seuil au-delà duquel on ne parle plus de transition mais de scintillement */
const BASCULES_TOLEREES = 6;

function moisCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Un mois assez fourni pour que le bilan sorte franchement de l'écran */
function semence() {
  const p = moisCourant();
  const db = {
    'household/salaries': { vous: 2500, conjointe: 1800 },
    [`household/periods/${p}/salaries`]: { vous: 2500, conjointe: 1800 }
  };
  for (let i = 0; i < 30; i++) {
    db[`household/periods/${p}/variableCharges/v${i}`] = {
      description: `Dépense numéro ${i + 1}`, amount: 20 + i * 7, category: 'Courses',
      paidBy: i % 2 ? 'conjointe' : 'vous', date: `${p}-1${i % 9}`, deleted: false
    };
  }
  db[`household/periods/${p}/fixedCharges/f1`] = {
    description: 'Loyer', amount: 950, category: 'Maison',
    paidBy: 'vous', date: `${p}-05`, deleted: false
  };
  return db;
}

async function ouvrir(page) {
  await page.setViewportSize(VUE);
  await setupFirebaseMock(page);
  await page.addInitScript(`window.__db = ${JSON.stringify(semence())};`);
  await waitForApp(page);
  await page.waitForTimeout(1500);
}

/** Descend puis remonte par pas de 2 px, en comptant les changements RÉELS */
function balayer(page) {
  return page.evaluate(async () => {
    const barre = document.getElementById('balanceBar');
    const R = 'balance-bar--redondante';
    let bascules = 0;

    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        // Une classe réécrite à l'identique ne se voit pas : seul un
        // changement de valeur compte comme une bascule.
        if ((m.oldValue || '').includes(R) !== m.target.classList.contains(R)) bascules++;
      }
    });
    obs.observe(barre, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });

    const max = document.documentElement.scrollHeight - window.innerHeight;
    const vue = () => !barre.classList.contains(R);

    const etats = { hautAvant: null, bas: null, hautApres: null };
    etats.hautAvant = vue();

    for (let y = 0; y <= max; y += 2) {
      window.scrollTo(0, y);
      await new Promise(r => requestAnimationFrame(() => r()));
    }
    await new Promise(r => setTimeout(r, 250));
    etats.bas = vue();

    for (let y = max; y >= 0; y -= 2) {
      window.scrollTo(0, y);
      await new Promise(r => requestAnimationFrame(() => r()));
    }
    await new Promise(r => setTimeout(r, 250));
    etats.hautApres = vue();

    obs.disconnect();
    return { bascules, etats, max };
  });
}

/** Passe à un onglet, sous 900 px */
async function allerA(page, id) {
  const onglet = page.locator(`.onglet[data-panneau="${id}"]`);
  await onglet.click();
  await page.waitForTimeout(400);
}

/** La barre est-elle visible ? */
function barreVisible(page) {
  return page.evaluate(() =>
    !document.getElementById('balanceBar').classList.contains('balance-bar--redondante'));
}

test.describe('La barre de solde au défilement', () => {
  test('elle ne scintille sur aucune plage de défilement', async ({ page }) => {
    await ouvrir(page);
    const { bascules } = await balayer(page);

    // Une descente et une remontée ne demandent que deux transitions. Mesuré à
    // 62 avant correction — une par image, sur toute une plage de défilement.
    expect(bascules, `${bascules} bascules pour un seul aller-retour`)
      .toBeLessThanOrEqual(BASCULES_TOLEREES);
  });

  test('elle paraît quand même là où elle sert', async ({ page }) => {
    // Sans cette moitié, la correction se satisferait trivialement : une barre
    // qui ne paraît jamais ne scintille pas.
    await ouvrir(page);

    expect(await barreVisible(page),
      'en haut du bilan, le solde est écrit en gros juste dessous : la barre répète')
      .toBe(false);

    // L'onglet Charges est le cas d'usage : une longue liste, et le bilan hors
    // écran — c'est là que la barre est le seul endroit qui porte le solde.
    await allerA(page, 'panneauCharges');
    expect(await barreVisible(page),
      'sur les charges, le solde n\'est plus nulle part : la barre doit le porter')
      .toBe(true);

    await allerA(page, 'panneauBilan');
    expect(await barreVisible(page), 'revenu au bilan, la barre devrait se taire')
      .toBe(false);
  });
});
