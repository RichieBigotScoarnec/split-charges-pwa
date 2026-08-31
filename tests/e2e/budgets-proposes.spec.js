import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

test.use({ viewport: { width: 390, height: 844 } });

/**
 * Un budget qu'on corrige, pas un budget qu'on invente
 *
 * L'éditeur listait les DIX-NEUF catégories du foyer par ordre alphabétique —
 * « Autre, Bar, Boulangerie, Bricolage, Café, Coiffeur, Courses… » —, chacune
 * avec un champ vide, alors que sept seulement portaient une dépense. Il
 * fallait parcourir dix-neuf lignes, en reconnaître sept, et INVENTER un
 * nombre pour chacune.
 *
 * C'est la règle du dépôt enfreinte de la façon la plus coûteuse : ne pas
 * demander ce que l'application peut calculer. Elle connaît la médiane de
 * chaque catégorie sur l'historique qu'elle porte déjà — sans une lecture de
 * plus. Et tant qu'aucun budget n'existe, `veille.js` et `rythmeDuBudget`
 * n'ont rien à surveiller : une fonctionnalité entière restait dormante par
 * simple friction d'amorçage.
 */
test('l\'éditeur propose, classe, et ne décide pas', async ({ page }) => {
  test.setTimeout(180000);
  await setupFirebaseMock(page);
  await waitForApp(page);

  await page.evaluate(async () => {
    const { dbUpdate, dbSet } = await import('/js/db.js');
    const now = new Date();
    const mois = d => { const x = new Date(now.getFullYear(), now.getMonth() + d, 1);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
    await dbSet('salaries', { vous: 2600, conjointe: 1900 });
    const c = {};
    const profil = [['Courses', 300], ['Transport', 65], ['Restaurant', 80], ['Santé', 24]];
    for (const d of [-1, -2, -3]) {
      const p = mois(d);
      c[`periods/${p}/salaries`] = { vous: 2600, conjointe: 1900 };
      profil.forEach(([category, amount], i) => {
        c[`periods/${p}/variableCharges/v${i}`] = {
          description: category, amount: amount + d * 4, category,
          paidBy: 'vous', date: `${p}-1${i}`, deleted: false };
      });
    }
    const p0 = mois(0);
    c[`periods/${p0}/salaries`] = { vous: 2600, conjointe: 1900 };
    profil.forEach(([category, amount], i) => {
      c[`periods/${p0}/variableCharges/v${i}`] = {
        description: category, amount, category, paidBy: 'vous',
        date: `${p0}-0${i + 1}`, deleted: false };
    });
    await dbUpdate(undefined, c);
    await window.changePeriod(p0);
  });
  await page.waitForTimeout(2500);

  await page.locator('button:has-text("Définir les budgets")').click();
  await page.waitForTimeout(900);

  const r = await page.evaluate(() => {
    const liste = document.getElementById('budgetEditorList');
    const visibles = [...liste.children].filter(n => n.classList.contains('budget-editor-row'));
    return {
      visibles: visibles.map(n => [
        n.querySelector('.budget-editor-label').textContent,
        (n.querySelector('.budget-editor-indice') || {}).textContent || null,
        n.querySelector('.budget-editor-input').placeholder,
        n.querySelector('.budget-editor-input').value
      ]),
      repliTitre: (liste.querySelector('.budget-editor-repli > summary') || {}).textContent || null,
      repliNombre: liste.querySelectorAll('.budget-editor-repli .budget-editor-row').length,
      totalChamps: liste.querySelectorAll('.budget-editor-input').length
    };
  });

  // Classées par dépense décroissante, pas par alphabet.
  expect(r.visibles.map(v => v[0])).toEqual(['Courses', 'Restaurant', 'Transport', 'Santé']);
  // Chacune propose un ordre de grandeur.
  for (const [nom, indice, placeholder] of r.visibles) {
    expect(indice, `${nom} sans indice`).toContain('par mois');
    expect(Number(placeholder), `${nom} sans proposition`).toBeGreaterThan(0);
  }
  // Rien n'est prérempli : proposer n'est pas décider.
  expect(r.visibles.every(v => v[3] === '')).toBe(true);
  // Les catégories dormantes sont repliées, pas retirées.
  expect(r.repliNombre).toBeGreaterThan(5);
  expect(r.repliTitre).toMatch(/autres? catégories?/);
  expect(r.totalChamps).toBe(r.visibles.length + r.repliNombre);
});
