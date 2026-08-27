import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Le garde-fou qui manquait : ce qui a l'air faux
 *
 * La suite compte près de deux mille contrôles unitaires et plusieurs centaines
 * de bout en bout. Ils vérifient très bien ce qu'on a pensé à leur demander —
 * et **deux défauts trouvés le même jour l'ont été sur une capture d'écran** :
 *
 *   - « Renseigner les salaires », visible et inerte, parce qu'il visait un
 *     champ d'un panneau replié ;
 *   - l'en-tête qui mangeait 35 % du premier écran.
 *
 * Aucun test ne les voyait, parce qu'aucun test ne regardait la **géométrie**.
 * Ce fichier n'ajoute pas de scénario : il pose des propriétés que toute
 * disposition doit respecter, quelle que soit la largeur et quel que soit
 * l'onglet.
 *
 * ## Pourquoi pas des captures de référence
 *
 * Playwright sait comparer des images. Mais une référence produite dans ce
 * conteneur et comparée sur un exécuteur d'intégration diverge sur le lissage
 * des polices : la CI passerait au rouge sans qu'aucun défaut existe, et le
 * garde-fou serait débranché dans la semaine. Les propriétés ci-dessous
 * attrapent la même famille de défauts sans dépendre du rendu au pixel.
 */

const LARGEURS = [
  { nom: '320', viewport: { width: 320, height: 720 } },
  { nom: '390', viewport: { width: 390, height: 844 } },
  { nom: '768', viewport: { width: 768, height: 1024 } },
  { nom: '1280', viewport: { width: 1280, height: 900 } }
];

const ONGLETS = ['panneauBilan', 'panneauCharges', 'panneauReglages'];

/** Sème de quoi remplir les trois onglets */
async function semer(page) {
  // Les salaires vivent dans les réglages : sous 900 px il faut y aller.
  await ouvrir(page, 'panneauReglages');
  await page.locator('#salaireVous').fill('2500');
  await page.locator('#salaireVous').blur();
  await page.locator('#salaireConjointe').fill('1800');
  await page.locator('#salaireConjointe').blur();
  await page.waitForTimeout(500);

  const p = await page.locator('#periodSelect').inputValue();
  await page.evaluate(async ({ p }) => {
    const { dbUpdate } = await import('/js/db.js');
    const chemins = {};
    for (let i = 0; i < 5; i++) {
      chemins[`periods/${p}/variableCharges/v${i}`] = {
        description: `Une dépense au libellé plutôt long ${i + 1}`,
        amount: 20 + i * 13, category: 'Courses',
        paidBy: i % 2 ? 'conjointe' : 'vous', date: `${p}-1${i}`, deleted: false };
    }
    chemins[`periods/${p}/fixedCharges/f1`] = {
      description: 'Loyer', amount: 950, category: 'Maison',
      paidBy: 'vous', date: `${p}-05`, deleted: false };
    await dbUpdate(undefined, chemins);
    await window.changePeriod(p);
  }, { p });
  await page.waitForTimeout(1200);
}

/** Ouvre un onglet, si la barre est là */
async function ouvrir(page, id) {
  const onglet = page.locator(`.onglet[data-panneau="${id}"]`);
  if (await onglet.isVisible()) {
    await onglet.click();
    await page.waitForTimeout(350);
  }
}

for (const { nom, viewport } of LARGEURS) {
  test.describe(`Cohérence visuelle — ${nom} px`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await setupFirebaseMock(page);
      await waitForApp(page);
      await semer(page);
    });

    test('aucune commande du contenu n\'en recouvre une autre', async ({ page }) => {
      // Le défaut qu'attrape cette propriété : deux cibles superposées dans le
      // flux, dont une qu'on rate au doigt sans comprendre pourquoi.
      //
      // Les barres fixes en sont écartées, et il le faut : la barre d'onglets,
      // le bandeau collé et le bouton flottant sont *faits* pour se poser
      // au-dessus du contenu qui défile. Les compter reviendrait à signaler
      // comme défaut le fonctionnement même d'une barre fixe — c'est ce que
      // faisait la première version de ce contrôle, qui rapportait sept
      // chevauchements dont aucun n'en était un.
      const chevauchements = [];

      for (const id of ONGLETS) {
        await ouvrir(page, id);
        const trouves = await page.evaluate(() => {
          const nommer = (el) =>
            `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}`;

          const flottant = (el) => {
            if (el.closest('.onglets, .bandeau-colle, .fab, .modal-overlay')) return true;
            const s = getComputedStyle(el);
            return s.position === 'fixed' || s.position === 'sticky';
          };

          const commandes = [...document.querySelectorAll('button, a[href], select, input:not([type="hidden"])')]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              const s = getComputedStyle(el);
              return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0'
                && r.bottom > 0 && r.top < window.innerHeight && !flottant(el);
            });

          const resultats = [];
          for (let i = 0; i < commandes.length; i++) {
            for (let j = i + 1; j < commandes.length; j++) {
              const a = commandes[i], b = commandes[j];
              // Un élément contenu dans l'autre n'est pas un chevauchement :
              // un `<input>` dans son `<label>` est la construction normale.
              if (a.contains(b) || b.contains(a)) continue;

              const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
              const largeur = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
              const hauteur = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
              // Deux pixels de tolérance : les bordures adjacentes se touchent.
              if (largeur > 2 && hauteur > 2) {
                resultats.push(`${nommer(a)} ⨯ ${nommer(b)}`);
              }
            }
          }
          return resultats;
        });
        trouves.forEach((t) => chevauchements.push(`${id} : ${t}`));
      }

      expect(chevauchements, chevauchements.join(' | ')).toEqual([]);
    });

    test('aucune commande ne dépasse de l\'écran', async ({ page }) => {
      // Un bouton dont la moitié sort du cadre est inatteignable au doigt, et
      // ne se voit pas sur un écran de développement large.
      const dehors = [];

      for (const id of ONGLETS) {
        await ouvrir(page, id);
        const trouves = await page.evaluate(() => {
          const resultats = [];
          for (const el of document.querySelectorAll('button, a[href], select, input:not([type="hidden"])')) {
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            if (r.width === 0 || r.height === 0 || s.visibility === 'hidden') continue;
            if (r.bottom <= 0 || r.top >= window.innerHeight) continue;
            if (r.left < -1 || r.right > window.innerWidth + 1) {
              resultats.push(`${el.id || el.className || el.tagName} [${Math.round(r.left)} → ${Math.round(r.right)}]`);
            }
          }
          return resultats;
        });
        trouves.forEach((t) => dehors.push(`${id} : ${t}`));
      }

      expect(dehors, dehors.join(' | ')).toEqual([]);
    });

    test('aucun texte n\'est coupé sans l\'avoir demandé', async ({ page }) => {
      // Le défaut du graphe de tendances : 25 px de haut pour six graduations,
      // qui se chevauchaient. Un élément dont le contenu déborde de sa boîte
      // sans déclarer ni découpe ni points de suspension perd du texte en
      // silence.
      const coupes = [];

      for (const id of ONGLETS) {
        await ouvrir(page, id);
        const trouves = await page.evaluate(() => {
          const resultats = [];
          for (const el of document.querySelectorAll('p, span, h1, h2, h3, label, button, div')) {
            if (el.children.length > 0) continue;              // seulement les feuilles
            const texte = (el.textContent || '').trim();
            if (!texte) continue;

            const s = getComputedStyle(el);
            if (s.display === 'none' || s.visibility === 'hidden') continue;
            // Une découpe déclarée est un choix : les points de suspension, le
            // défilement interne, la coupe assumée.
            if (s.textOverflow === 'ellipsis') continue;
            if (['hidden', 'auto', 'scroll'].includes(s.overflowX)) continue;
            if (['hidden', 'auto', 'scroll'].includes(s.overflowY)) continue;

            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;

            if (el.scrollWidth > Math.ceil(r.width) + 2) {
              resultats.push(`${el.id || el.className || el.tagName} « ${texte.slice(0, 30)} » ${el.scrollWidth} > ${Math.round(r.width)}`);
            }
          }
          return resultats;
        });
        trouves.forEach((t) => coupes.push(`${id} : ${t}`));
      }

      expect(coupes, coupes.join(' | ')).toEqual([]);
    });

    test('la fin de chaque panneau reste atteignable', async ({ page }) => {
      // La propriété qui compte vraiment. Une barre fixe est *faite* pour que
      // le contenu passe dessous en défilant ; ce qui serait un défaut, c'est
      // qu'arrivé en bas de course il reste du contenu dessous, définitivement
      // inatteignable.
      //
      // C'est exactement le défaut mesuré au moment du découpage en onglets :
      // `responsive.css` réécrivait par un raccourci la réserve gardée pour la
      // barre, et 32 px de contenu restaient masqués en bas de chaque panneau.
      const restes = [];

      for (const id of ONGLETS) {
        await ouvrir(page, id);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(400);

        const trouve = await page.evaluate((panneauId) => {
          const barre = document.getElementById('onglets');
          if (!barre) return null;
          const cadre = barre.getBoundingClientRect();
          if (cadre.height === 0) return null;      // barre absente : rien à réserver

          const panneau = document.getElementById(panneauId);
          if (!panneau) return null;

          const bas = panneau.getBoundingClientRect().bottom;
          // Un pixel de tolérance pour les arrondis de rendu.
          return bas > cadre.top + 1 ? Math.round(bas - cadre.top) : null;
        }, id);

        if (trouve !== null) restes.push(`${id} : ${trouve} px sous la barre`);
      }

      expect(restes, restes.join(' | ')).toEqual([]);
    });
  });
}
