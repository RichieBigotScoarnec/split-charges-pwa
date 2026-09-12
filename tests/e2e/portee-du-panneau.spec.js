import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * La portée gouverne TOUT le panneau Bilan — décision du foyer, 2026-09-11.
 *
 * « Moi ce mois » veut dire « cet écran parle de moi ». Une carte qui affiche
 * les chiffres du couple sous ce segment le fait mentir — le défaut même que
 * la barre collante avait sur Privé. Et sur Privé, une carte du couple serait
 * une fuite de contexte.
 *
 * Mesuré avant le correctif, à 1280 px : sous « Moi » comme sous « Privé »,
 * les quatre cartes restaient à l'écran, et « Où part votre argent » y
 * affichait les catégories du FOYER — « Maison 800,00 € · Courses 777,77 € ».
 * Aucune carte n'avait d'équivalent personnel ; aucune ne se taisait.
 *
 * LA PROPRIÉTÉ PORTE SUR LE PANNEAU, PAS SUR UNE CARTE. Ce fichier ne nomme
 * aucune carte : il lit ce que le panneau montre. Une carte ajoutée demain
 * sans rien déclarer y tomberait d'elle-même.
 */

/** Des chiffres et une destination qui n'existent qu'au foyer */
const DU_FOYER = ['777,77', '800,00', 'Compte Commun'];

async function semer(page) {
  await page.evaluate(async () => {
    const { dbUpdate, dbSet } = await import('/js/db.js');
    const mois = document.getElementById('periodSelect').value;
    const salaires = { vous: 3000, conjointe: 1000 };
    await dbSet('salaries', salaires);
    await dbUpdate(undefined, {
      [`periods/${mois}/salaries`]: salaires,
      [`periods/${mois}/variableCharges/v1`]: {
        description: 'Courses', amount: 777.77, category: 'Courses', paidBy: 'vous',
        date: `${mois}-03`, deleted: false, timestamp: 1,
        location: { lat: 48.8566, lng: 2.3522, name: 'Paris' }
      },
      // Une dépense solo : sous « Moi », elle est à MOI, et peut paraître.
      [`periods/${mois}/variableCharges/s1`]: {
        description: 'Coiffeur', amount: 55.55, category: 'Beauté', paidBy: 'vous',
        perimetre: 'solo', date: `${mois}-04`, deleted: false, timestamp: 2
      },
      [`periods/${mois}/fixedCharges/f1`]: {
        description: 'Loyer', amount: 800, category: 'Maison', paidBy: 'vous',
        destination: 'Compte Commun', recurring: true, date: `${mois}-05`, deleted: false
      }
    });
    await window.changePeriod();
  });
  await page.waitForTimeout(1500);
}

/** Ce que le panneau Bilan montre — `innerText` écarte ce qui n'est pas rendu */
async function texteDuBilan(page) {
  return page.evaluate(() => document.getElementById('panneauBilan').innerText);
}

for (const { largeur, hauteur } of [
  { largeur: 390, hauteur: 844 },
  { largeur: 1280, hauteur: 900 }
]) {
  test.describe(`La portée gouverne le panneau Bilan — ${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: hauteur } });

    test.beforeEach(async ({ page }) => {
      await setupFirebaseMock(page);
      await waitForApp(page);
      await semer(page);
    });

    test('TÉMOIN — sur « À deux », le bilan montre bien les chiffres du foyer', async ({ page }) => {
      // Sans ce témoin, un semis raté rendrait les deux cas suivants verts :
      // un bilan qui ne montre rien ne montre rien du foyer non plus.
      const texte = await texteDuBilan(page);
      for (const m of DU_FOYER) {
        expect(texte, `le semis n'a pas fait paraître « ${m} » sur « À deux »`).toContain(m);
      }
    });

    for (const { portee, nom } of [
      { portee: 'solo', nom: 'Moi' },
      { portee: 'prive', nom: 'Privé' }
    ]) {
      test(`sous « ${nom} », aucune carte du bilan n'affiche de chiffre du foyer`, async ({ page }) => {
        await page.locator(`#panneauBilan [data-portee="${portee}"]`).click();
        await page.waitForTimeout(1500);

        const texte = await texteDuBilan(page);
        for (const m of DU_FOYER) {
          expect(texte, `le bilan affiche « ${m} » sous « ${nom} » : l'écran dit « ${nom} » et montre le foyer`)
            .not.toContain(m);
        }
      });
    }
  });
}
