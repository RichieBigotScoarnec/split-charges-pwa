import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Les cartes du rang 3 montrent ce que le mois dit, sans qu'on clique.
 *
 * Relevé le 2026-09-12, après le lot E : « 📍 Où vous dépensez » ne portait
 * qu'un bouton « Carte » — 130 px pour un titre et une commande —, et
 * « 🧳 Enveloppes à deux » qu'un bouton « Enveloppes ». La planche 1, elle,
 * rend « 184,04 € à Landivisiau · 92,02 € par passage, sur 2 passages », puis
 * « Saint-Goazec · 45,00 € ».
 *
 * La donnée existait déjà des deux côtés : les charges portent un `location`
 * avec son nom — `map.js` s'en sert pour ses marqueurs — et les enveloppes
 * vivent dans l'état avec leurs charges. Ce qui manquait, c'est de l'écrire.
 *
 * Ce fichier lit le TEXTE des cartes, jamais une classe : un rendu réécrit
 * autrement doit le laisser vert s'il dit les mêmes chiffres.
 */

/** Deux passages à Landivisiau, un à Saint-Goazec, et une enveloppe alimentée */
async function semer(page) {
  await page.evaluate(async () => {
    const { dbUpdate, dbSet } = await import('/js/db.js');
    const mois = document.getElementById('periodSelect').value;
    await dbSet('salaries', { vous: 3000, conjointe: 1000 });
    await dbSet('envelopes', [
      { id: 'e1', label: 'Vacances', nature: 'cagnotte', perimetre: 'commun' }
    ]);
    await dbUpdate(undefined, {
      [`periods/${mois}/salaries`]: { vous: 3000, conjointe: 1000 },
      [`periods/${mois}/variableCharges/v1`]: {
        description: 'Courses', amount: 100, category: 'Courses', paidBy: 'vous',
        date: `${mois}-03`, deleted: false, timestamp: 1,
        location: { lat: 48.5, lng: -4.06, name: 'Landivisiau' }
      },
      [`periods/${mois}/variableCharges/v2`]: {
        description: 'Essence', amount: 84.04, category: 'Transport', paidBy: 'vous',
        date: `${mois}-04`, deleted: false, timestamp: 2,
        location: { lat: 48.5, lng: -4.06, name: 'Landivisiau' }
      },
      [`periods/${mois}/variableCharges/v3`]: {
        description: 'Crêperie', amount: 45, category: 'Loisirs', paidBy: 'conjointe',
        date: `${mois}-05`, deleted: false, timestamp: 3,
        location: { lat: 48.16, lng: -3.83, name: 'Saint-Goazec' }
      },
      [`periods/${mois}/variableCharges/v4`]: {
        description: 'Camping', amount: 220, category: 'Loisirs', paidBy: 'vous',
        date: `${mois}-06`, deleted: false, timestamp: 4, envelope: 'e1'
      }
    });
    await window.changePeriod();
  });

  // LES ENVELOPPES SONT GLOBALES, PAS MENSUELLES — mesuré le 2026-09-12 :
  // après ce semis, `household/envelopes` existe en base et `getState`
  // rend toujours `[]`. `changePeriod` recharge les charges du mois ;
  // `loadEnvelopes` n'est appelée qu'une fois, par `initEnvelopes`
  // (`auth.js:385`). On relit donc par le chemin de l'application, et non
  // par une seconde lecture écrite pour le test.
  await page.evaluate(async () => {
    const { loadEnvelopes } = await import('/js/modules/envelopes.js');
    await loadEnvelopes();
  });
  await page.waitForTimeout(1500);
}

/** Le texte d'une carte, retrouvée par son titre — jamais par sa classe */
async function texteDeLaCarte(page, titre) {
  return page.evaluate((t) => {
    const porteur = [...document.querySelectorAll('#panneauBilan *')].find((e) =>
      e.checkVisibility()
      && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes(t)));
    if (!porteur) return null;
    const carte = porteur.closest('section, div.category-analysis, div.carte-rang3') || porteur.parentElement;
    return carte.innerText.replace(/\s+/g, ' ').trim();
  }, titre);
}

for (const { largeur, hauteur } of [
  { largeur: 390, hauteur: 844 },
  { largeur: 1280, hauteur: 900 }
]) {
  test.describe(`Les cartes parlent sans clic — ${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: hauteur } });

    test.beforeEach(async ({ page }) => {
      await setupFirebaseMock(page);
      await waitForApp(page);
      await semer(page);
    });

    test('« Où vous dépensez » nomme les lieux, leur total et le montant par passage', async ({ page }) => {
      const carte = await texteDeLaCarte(page, 'Où vous dépensez');
      expect(carte, 'la carte des lieux n\'est pas à l\'écran').not.toBeNull();

      expect(carte).toMatch(/Landivisiau/);
      expect(carte, 'le total du lieu').toMatch(/184,04/);
      expect(carte, 'le montant par passage').toMatch(/92,02/);
      expect(carte, 'le nombre de passages').toMatch(/2 passages/);
      expect(carte, 'le second lieu').toMatch(/Saint-Goazec/);
      expect(carte).toMatch(/45,00/);
    });

    test('« Enveloppes à deux » nomme les enveloppes ouvertes et ce qu\'elles portent', async ({ page }) => {
      const carte = await texteDeLaCarte(page, 'Enveloppes à deux');
      expect(carte, 'la carte des enveloppes n\'est pas à l\'écran').not.toBeNull();

      expect(carte, 'le nom de l\'enveloppe').toMatch(/Vacances/);
      expect(carte, 'ce que l\'enveloppe porte ce mois-ci').toMatch(/220,00/);
    });
  });
}
