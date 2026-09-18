import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Ce que le bouton de confirmation MONTRE, sur deux gestes opposés
 *
 * Le libellé et le ton sont posés par `showConfirmModal` ; `modal.js` a ses
 * contrôles unitaires, et `confirmations-explicites` tient qu'aucun appel ne
 * les omet. Ce qui manquait est le bout de la chaîne : ce que la personne voit
 * réellement, sur un geste qui détruit et sur un geste qui n'en détruit aucun.
 *
 * Deux cas suffisent, et il en faut DEUX : un seul ne dirait pas si le bouton
 * distingue, seulement s'il sait afficher quelque chose.
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
 * Une charge à supprimer, et de quoi faire naître une proposition de cagnotte
 *
 * L'assurance vue deux fois à un an d'écart, échéance trois mois plus loin :
 * c'est le semis d'`anticipation.spec.js`, et une échéance DANS le mois même
 * ferait taire le détecteur.
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
      description: 'Courses de la semaine', amount: 60, category: 'Courses',
      paidBy: 'vous', date: `${p}-02`, deleted: false
    }
  };
}

async function ouvrir(page) {
  await page.setViewportSize(VUE);
  await setupFirebaseMock(page);
  await page.addInitScript(`window.__db = ${JSON.stringify(semence())};`);
  await waitForApp(page);
  await page.waitForTimeout(1500);
}

/** Ce que le bouton de validation MONTRE, et l'encre que le moteur lui donne */
const boutonRendu = (page) => page.evaluate(() => {
  const b = document.getElementById('modalConfirmOk');
  const mesurer = (jeton) => {
    const t = document.createElement('span');
    t.style.background = `var(${jeton})`;
    b.parentElement.appendChild(t);
    const c = getComputedStyle(t).backgroundColor;
    t.remove();
    return c;
  };
  return {
    libelle: b.textContent.trim(),
    fond: getComputedStyle(b).backgroundColor,
    danger: mesurer('--danger-color'),
    primaire: mesurer('--primary-color')
  };
});

test.describe('Le bouton de confirmation dit ce que fait le geste', () => {
  test('UN GESTE QUI DÉTRUIT : « Supprimer », en danger', async ({ page }) => {
    await ouvrir(page);
    await allerAuPanneau(page, 'panneauCharges');

    const ligne = page.locator('.charge-item', { hasText: 'Courses de la semaine' });
    await ligne.locator('[data-action="deleteVariableCharge"]').click();
    await expect(page.locator('#modalConfirm')).toHaveClass(/active/, { timeout: 10000 });

    const rendu = await boutonRendu(page);

    // TÉMOIN : les deux jetons rendent des couleurs DISTINCTES. Confondus,
    // « c'est bien du danger » serait vrai d'un bouton peint en primaire.
    expect(rendu.danger, 'témoin : danger et primaire rendent la même couleur')
      .not.toBe(rendu.primaire);

    expect(rendu.libelle).toBe('Supprimer');
    expect(rendu.fond, `fond rendu : ${rendu.fond}`).toBe(rendu.danger);
  });

  test('UN GESTE QUI CRÉE : le bouton nomme la création, et n\'est PAS rouge', async ({ page }) => {
    await ouvrir(page);
    await allerAuPanneau(page, 'panneauBilan');

    const carte = page.locator('.veille-item', { hasText: 'Assurance habitation' });
    await expect(carte, 'la proposition de cagnotte n\'est pas rendue').toBeVisible({ timeout: 10000 });
    await carte.locator('.veille-action').click();
    await expect(page.locator('#modalConfirm')).toHaveClass(/active/, { timeout: 10000 });

    const rendu = await boutonRendu(page);

    expect(rendu.danger).not.toBe(rendu.primaire);

    // Le mot ET la couleur : les deux mentaient, les deux sont vérifiés.
    expect(rendu.libelle, 'le bouton d\'une création annonce une suppression')
      .not.toMatch(/supprimer/i);
    expect(rendu.libelle).toMatch(/cagnotte/i);
    expect(rendu.fond, `une création peinte en danger : ${rendu.fond}`).not.toBe(rendu.danger);
    expect(rendu.fond).toBe(rendu.primaire);
  });
});
