import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Une ligne amenée dans la vue est atteignable au pointeur
 *
 * ─────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, IDENTIFIÉ LE 2026-09-01 ET JAMAIS TENU
 *
 * `docs/artefacts/detail-depenses/` garde la trace : `locator.click` expire à
 * 30 s après **25 interceptions** — `#balanceBar` 11 fois, `.onglet` 7,
 * `.summary-divider` 5. La capture montre une page entièrement chargée,
 * défilée de sorte que la ligne visée passe sous le bandeau collant.
 *
 * Playwright juge alors l'élément « visible, enabled and stable » : la
 * géométrie est bonne. C'est le POINTEUR qui atterrit ailleurs. Et le geste
 * réel a le même sort — un doigt qui vise cette ligne touche la barre.
 *
 * CLAUDE.md le consigne depuis, avec son remède supposé et cette phrase :
 * « aucun contrôle ne mesure cette propriété ». Ce fichier est ce contrôle.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE QUE CE CONTRÔLE NE DIT PAS, ET POURQUOI
 *
 * Un balayage complet du défilement — une position tous les 10 px — relève
 * **22 positions à 320 px** où le centre d'une ligne ouvrable appartient à une
 * barre. Il serait tentant d'en faire la propriété. Ce serait une erreur :
 *
 * un bandeau `position: sticky` **recouvre par construction** le contenu qui
 * défile dessous — c'est ce que « collant » veut dire. Aucune valeur de
 * `scroll-margin` ni de `scroll-padding` n'y change quoi que ce soit, et toute
 * application qui porte un en-tête collant a les mêmes positions. Exiger
 * qu'aucune n'existe serait exiger qu'aucune barre ne soit collante.
 *
 * **Le défaut réparable est plus étroit** : le GESTE qui amène une ligne dans
 * la vue la gare sous une barre. C'est celui de l'artefact, celui que
 * `scrollIntoView` produit, et celui que `scroll-padding` corrige. Une personne
 * qui défile à la main et s'arrête mal défile un peu plus ; une personne — ou
 * un contrôle — qu'on amène sur une ligne pour la toucher n'a aucun recours.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LES DEUX GESTES, ET ILS NE SE VALENT PAS
 *
 * Mesuré à 320 px, avant correctif :
 *
 *     ligne   geste                        top    atteignable
 *     0       scrollIntoViewIfNeeded       339    oui
 *     0       scrollIntoView()               0    NON — #periodSelect
 *     1       scrollIntoViewIfNeeded        44    NON — #balanceBar
 *     1       scrollIntoView()               0    NON — #periodSelect
 *
 * `scrollIntoViewIfNeeded` est ce que fait Playwright ; `scrollIntoView()` est
 * ce que fait le code de l'application. Les deux sont éprouvés, parce que les
 * deux amènent quelqu'un à toucher une ligne.
 */

const LARGEURS = [
  { nom: '320', viewport: { width: 320, height: 720 } },
  { nom: '390', viewport: { width: 390, height: 844 } }
];

function moisCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function semence() {
  const p = moisCourant();
  return {
    'household/salaries': { vous: 2500, conjointe: 1800 },
    [`household/periods/${p}/salaries`]: { vous: 2500, conjointe: 1800 },
    [`household/periods/${p}/variableCharges/v1`]: {
      description: 'Courses', amount: 320, category: 'Courses',
      paidBy: 'vous', date: `${p}-03`, deleted: false
    },
    [`household/periods/${p}/variableCharges/v2`]: {
      description: 'Festival', amount: 45, category: 'Loisirs',
      paidBy: 'conjointe', date: `${p}-05`, deleted: false
    }
  };
}

async function ouvrirLeGrandLivre(page) {
  await setupFirebaseMock(page);
  await page.addInitScript(`window.__db = ${JSON.stringify(semence())};`);
  await waitForApp(page);
  await page.waitForTimeout(1400);
  await allerAuPanneau(page, 'panneauBilan');

  const details = page.locator('.summary-details').first();
  await details.evaluate((d) => { d.open = true; });
  await page.waitForTimeout(400);
}

/** Qui se trouve réellement au centre de cette ligne ? */
const quiEstAuCentre = (ligne) => ligne.evaluate((l) => {
  const r = l.getBoundingClientRect();
  const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    top: Math.round(r.top),
    atteignable: dessus === l || l.contains(dessus),
    dessus: dessus ? (dessus.id || String(dessus.className) || dessus.tagName) : 'rien',
    libelle: (l.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 26)
  };
});

for (const { nom, viewport } of LARGEURS) {
  test.describe(`Le clic au bord — ${nom} px`, () => {
    // Au doigt : c'est le contexte de l'artefact, et celui où les barres
    // portent leur géométrie tactile.
    test.use({ viewport, hasTouch: true });

    test.beforeEach(async ({ page }) => {
      await ouvrirLeGrandLivre(page);
    });

    test('les deux barres sont bien là, et elles ont une hauteur', async ({ page }) => {
      // ── LA PRÉMISSE DU FICHIER ENTIER ──
      // « Aucune ligne n'est couverte » est trivialement vrai sur un écran sans
      // barre. Les deux surfaces flottantes doivent exister et occuper de la
      // place, sinon les cas suivants ne mesurent rien.
      const barres = await page.evaluate(() => {
        const lire = (sel) => {
          const e = document.querySelector(sel);
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return { hauteur: Math.round(r.height), position: getComputedStyle(e).position };
        };
        return { basse: lire('.onglets'), haute: lire('.bandeau-colle') };
      });

      expect(barres.basse, 'la barre d\'onglets a disparu du document').not.toBeNull();
      expect(barres.haute, 'le bandeau collant a disparu du document').not.toBeNull();
      expect(barres.basse.hauteur,
        `la barre d'onglets ne fait que ${barres.basse?.hauteur} px : rien à recouvrir`)
        .toBeGreaterThan(20);
      expect(barres.haute.hauteur,
        `le bandeau ne fait que ${barres.haute?.hauteur} px : rien à recouvrir`)
        .toBeGreaterThan(20);
    });

    for (const { geste, appliquer } of [
      {
        geste: 'scrollIntoViewIfNeeded — le geste de Playwright',
        appliquer: async (ligne) => ligne.scrollIntoViewIfNeeded()
      },
      {
        geste: 'scrollIntoView() — le geste du code de l\'application',
        appliquer: async (ligne) => ligne.evaluate((l) => l.scrollIntoView())
      }
    ]) {
      test(`${geste} : la ligne reste atteignable`, async ({ page }) => {
        const lignes = page.locator('.summary-row--ouvrable');
        const combien = await lignes.count();

        expect(combien,
          'prémisse : aucune ligne ouvrable dans le grand-livre, rien à couvrir')
          .toBeGreaterThan(1);

        const couvertes = [];
        for (let i = 0; i < combien; i++) {
          await appliquer(lignes.nth(i));
          await page.waitForTimeout(150);
          const releve = await quiEstAuCentre(lignes.nth(i));
          if (!releve.atteignable) couvertes.push(releve);
        }

        expect(couvertes,
          couvertes.map((c) => `« ${c.libelle} » posée à ${c.top} px est recouverte `
            + `par « ${c.dessus} »`).join(' | ')
          + ' — Playwright la juge « visible, enabled and stable », et le clic '
          + 'atterrit sur la barre. Un doigt qui la vise a le même sort.')
          .toEqual([]);
      });
    }
  });
}
