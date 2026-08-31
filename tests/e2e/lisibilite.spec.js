import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Ce que l'écran donne réellement à lire
 *
 * `tests/contraste.test.js` mesure les JETONS, à la source. C'est nécessaire et
 * insuffisant : un jeton conforme appliqué au mauvais endroit produit un texte
 * illisible sans qu'aucune mesure de jeton ne bronche. Trois défauts l'ont
 * montré, tous trouvés en mesurant le RENDU et non la feuille de style :
 *
 *   - `.category-total` — un montant — portait `--text-muted` à 2,42:1 ;
 *   - « Payé par … », l'attribut qui décide du sens du solde, tombait à 2,78:1
 *     en 11 px, dans un ambre qui ne distinguait d'ailleurs pas les payeurs ;
 *   - `--primary-light` frôlait le seuil à 4,47:1 sur les montants du bilan et
 *     à 3,90:1 sur le mode de partage retenu — l'écart qu'aucune capture ne
 *     montre et qu'aucune relecture ne voit.
 *
 * Les trois autres cas de ce fichier tiennent la même exigence, appliquée à ce
 * qui se lit : la langue des montants, la lisibilité d'un axe, et le fait de
 * retrouver sa place.
 */

test.use({ viewport: { width: 390, height: 844 } });

async function semerHistorique(page) {
  await page.evaluate(async () => {
    const { dbUpdate, dbSet } = await import('/js/db.js');
    const now = new Date();
    const mois = d => { const x = new Date(now.getFullYear(), now.getMonth() + d, 1);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
    await dbSet('salaries', { vous: 2600, conjointe: 1900 });
    const c = {};
    for (const d of [0, -1, -2, -3, -4]) {
      const p = mois(d);
      c[`periods/${p}/salaries`] = { vous: 2600, conjointe: 1900 };
      c[`periods/${p}/fixedCharges/f0`] = { description: 'Loyer', amount: 950, category: 'Maison',
        paidBy: 'vous', date: `${p}-05`, deleted: false, recurring: true };
      for (let i = 0; i < 9; i++) {
        c[`periods/${p}/variableCharges/v${i}`] = {
          description: `Course ${i}`, amount: 60 + i * 11 + Math.abs(d) * 7, category: 'Courses',
          paidBy: i % 2 ? 'conjointe' : 'vous', date: `${p}-${String(i + 1).padStart(2, '0')}`, deleted: false };
      }
    }
    await dbUpdate(undefined, c);
    await window.changePeriod(mois(0));
  });
  await page.waitForTimeout(2500);
}

test('P2 — les graduations du graphe sont des nombres ronds', async ({ page }) => {
  test.setTimeout(180000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerHistorique(page);

  // On intercepte les étiquettes que le canevas dessine.
  const etiquettes = await page.evaluate(async () => {
    const vues = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (texte, ...reste) {
      vues.push(String(texte));
      return original.call(this, texte, ...reste);
    };
    document.querySelector('[data-action="toggleTrends"]').click();
    await new Promise(r => setTimeout(r, 1200));
    CanvasRenderingContext2D.prototype.fillText = original;
    return vues;
  });

  const montants = etiquettes
    .filter(t => /€/.test(t))
    .map(t => parseFloat(t.replace(/[^\d,]/g, '').replace(',', '.')))
    .filter(n => Number.isFinite(n));
  expect(montants.length).toBeGreaterThanOrEqual(3);

  // Toutes rondes : multiples du pas, lui-même 1/2/2,5/5 × 10ⁿ.
  const nonNuls = montants.filter(n => n > 0);
  const pas = Math.min(...nonNuls);
  const magnitude = 10 ** Math.floor(Math.log10(pas));
  const normalise = Number((pas / magnitude).toFixed(9));
  expect([1, 2, 2.5, 5, 10], `pas=${pas}`).toContain(normalise);
  for (const m of montants) {
    expect(Number((m / pas).toFixed(6)) % 1, `${m} n'est pas un multiple de ${pas}`).toBe(0);
  }
});

test('P1 — aucun point décimal anglais dans les montants affichés', async ({ page }) => {
  test.setTimeout(180000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerHistorique(page);
  await page.waitForTimeout(1500);

  const fautifs = await page.evaluate(() => {
    const out = [];
    // Un montant en euros écrit avec un point décimal, ou un pourcentage idem.
    const motif = /\d+\.\d{1,2}\s*(€|%)/;
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const t = n.textContent;
      if (motif.test(t)) out.push(t.trim().slice(0, 90));
    }
    return out;
  });
  expect(fautifs).toEqual([]);
});

test('P1 — revenir sur un onglet retrouve sa position', async ({ page }) => {
  test.setTimeout(180000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerHistorique(page);

  await allerAuPanneau(page, 'panneauCharges');
  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(400);
  const pose = await page.evaluate(() => window.scrollY);
  expect(pose).toBeGreaterThan(300);

  await allerAuPanneau(page, 'panneauBilan');
  await page.waitForTimeout(500);
  const surBilan = await page.evaluate(() => window.scrollY);
  // Une destination NOUVELLE s'ouvre en haut : c'est le comportement voulu.
  expect(surBilan).toBe(0);

  await allerAuPanneau(page, 'panneauCharges');
  await page.waitForTimeout(500);
  const retour = await page.evaluate(() => window.scrollY);
  // Tolérance de 20 px, et non l'égalité stricte : la barre de solde collante
  // paraît ou s'efface selon la part visible du bilan, ce qui fait varier la
  // hauteur de page de quelques pixels entre l'aller et le retour. Mesuré à
  // 4 px d'écart. Ce que le contrôle doit prouver, c'est qu'on ne repart pas
  // de zéro — pas que le navigateur soit au pixel près.
  expect(Math.abs(retour - pose), `retour=${retour} contre pose=${pose}`).toBeLessThan(20);
  expect(retour, 'le retour ne doit pas remettre en haut').toBeGreaterThan(300);
});

test('P0 — le texte discret tient le seuil AA', async ({ page }) => {
  test.setTimeout(180000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerHistorique(page);

  for (const panneau of ['panneauBilan', 'panneauCharges', 'panneauReglages']) {
    await allerAuPanneau(page, panneau);
    await page.waitForTimeout(400);
    const bas = await page.evaluate(({ panneau }) => {
      const rgb = s => (s.match(/\d+/g) || []).slice(0, 3).map(Number);
      const lum = c => { const v = c.map(x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4) }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2] };
      const alpha = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return 0; const p = m[1].split(',').map(parseFloat); return p.length > 3 ? p[3] : 1; };
      // Le fond doit être OPAQUE. Un lavis translucide — rgba(5,150,105,.1) —
      // pris pour une couleur pleine donne « vert sur vert », ratio 1, sur un
      // texte parfaitement lisible. On remonte jusqu'à une vraie surface.
      const fond = el => { let e = el; while (e) { const b = getComputedStyle(e).backgroundColor; if (alpha(b) > 0.9) return rgb(b); e = e.parentElement } return [255, 255, 255] };
      const out = []; const vus = new Set();
      const racine = document.getElementById(panneau) || document.body;
      for (const el of racine.querySelectorAll('*')) {
        const texte = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
        if (!texte || texte.length < 2) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const st = getComputedStyle(el);
        if (st.visibility === 'hidden' || st.opacity === '0') continue;
        const f = rgb(st.color); if (f.length !== 3) continue;
        const b = fond(el);
        const l1 = lum(f), l2 = lum(b);
        const ratio = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
        const px = parseFloat(st.fontSize);
        const grand = px >= 24 || (px >= 18.66 && parseInt(st.fontWeight) >= 700);
        const seuil = grand ? 3 : 4.5;
        if (ratio < seuil) {
          const cle = `${texte.slice(0, 20)}|${st.color}`;
          if (vus.has(cle)) continue; vus.add(cle);
          out.push({ texte: texte.slice(0, 40), ratio: Math.round(ratio * 100) / 100, px: Math.round(px), couleur: st.color });
        }
      }
      return out;
    }, { panneau });
    expect(bas, `${panneau} : ${JSON.stringify(bas)}`).toEqual([]);
  }
});
