# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: detail-depenses.spec.js >> Le détail d'un payeur >> Échap referme
- Location: tests/e2e/detail-depenses.spec.js:140:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#modalDetailDepenses')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('#modalDetailDepenses')

```

```yaml
- link "Aller au contenu principal":
  - /url: "#mainApp"
- main:
  - heading "FairSplit" [level=1]
  - text: Test User
  - button "Déconnexion"
  - navigation "Navigation des périodes":
    - button "Mois précédent": ◀
    - text: Sélectionner la période
    - combobox "Sélectionner la période":
      - option "octobre 2026"
      - option "septembre 2026" [selected]
      - option "août 2026"
      - option "juillet 2026"
      - option "juin 2026"
      - option "mai 2026"
      - option "avril 2026"
      - option "mars 2026"
      - option "février 2026"
      - option "janvier 2026"
      - option "décembre 2025"
      - option "novembre 2025"
      - option "octobre 2025"
    - button "Mois suivant": ▶
  - status:
    - text: Conjointe vous doit
    - strong: 377,30 €
  - region "Résumé du Mois":
    - heading "Résumé du Mois" [level=2]
    - tablist "Résumé du mois":
      - tab "À deuxsolde à régler" [selected]: À deux•
      - tab "Moi ce mois-ci"
    - tabpanel "À deuxsolde à régler":
      - text: Ensemble ce mois
      - strong: 1 412,75 €
      - paragraph: "À rééquilibrer : 377,30 € — Conjointe vers Vous"
      - text: Vous a payé 377,30 € de plus que sa part
      - button "Régler ce solde"
      - strong: 1 412,75 €
      - text: encore à passer sur 1 412,75 € Loyer le 5 sept., Courses du samedi le 12 sept., Restaurant du port le 14 sept. et 1 autre — déjà comptés dans le solde ci-dessus
      - group:
        - text: Voir le détail ▲ Total des charges
        - strong: 1 412,75 €
        - text: Répartition à payer Vous 58%
        - strong: 821,37 €
        - text: Conjointe 42%
        - strong: 591,38 €
        - text: Paiements réels
        - button "Vous a payé › 1 198,67 €":
          - text: Vous a payé ›
          - strong: 1 198,67 €
        - button "Conjointe a payé › 214,08 €":
          - text: Conjointe a payé ›
          - strong: 214,08 €
      - button "📄 Le mois en un coup d'œil"
    - text: Budgets par catégorie
    - button "Maison 950,00 €"
    - button "Loisirs 300,00 €"
    - button "Restaurant 88,50 €"
    - button "Courses 74,25 €"
    - text: Aucun budget défini
    - button "Définir les budgets"
    - button "Tendances sur 6 mois"
    - button "Enveloppes"
    - button "Privé"
  - navigation "Sections de l'application":
    - button "Bilan"
    - button "Charges"
    - button "Réglages"
- button "Saisie rapide de charge"
```

# Test source

```ts
  45  |     }
  46  |   };
  47  | }
  48  | 
  49  | async function ouvrir(page) {
  50  |   await page.setViewportSize(VUE);
  51  |   await setupFirebaseMock(page);
  52  |   await page.addInitScript(`window.__db = ${JSON.stringify(semence())};`);
  53  |   await waitForApp(page);
  54  |   await page.waitForTimeout(1500);
  55  |   // Les paiements réels vivent sous « Voir le détail ».
  56  |   await page.locator('.summary-details > summary').click();
  57  |   await page.waitForTimeout(250);
  58  | }
  59  | 
  60  | /** Un montant affiché, ramené à un nombre */
  61  | function enNombre(texte) {
  62  |   return Number(
  63  |     String(texte).replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.')
  64  |   );
  65  | }
  66  | 
  67  | test.describe('Le détail d\'un payeur', () => {
  68  |   test('la modale retrouve exactement le chiffre de la ligne', async ({ page }) => {
  69  |     await ouvrir(page);
  70  | 
  71  |     const ligne = page.locator('[data-action="ouvrirDetailPayeur"][data-arg="vous"]');
  72  |     await expect(ligne).toBeVisible();
  73  |     const surLaLigne = enNombre(await ligne.locator('strong').innerText());
  74  | 
  75  |     await ligne.click();
  76  |     await page.waitForTimeout(400);
  77  | 
  78  |     const modale = page.locator('#modalDetailDepenses');
  79  |     await expect(modale).toBeVisible();
  80  | 
  81  |     const dansLaModale = enNombre(await modale.locator('.detail-total-montant').innerText());
  82  |     expect(dansLaModale, 'la modale annonce un autre total que la ligne')
  83  |       .toBeCloseTo(surLaLigne, 2);
  84  |   });
  85  | 
  86  |   test('elle montre les dépenses avancées, et pas celles d\'en face', async ({ page }) => {
  87  |     await ouvrir(page);
  88  | 
  89  |     await page.locator('[data-action="ouvrirDetailPayeur"][data-arg="vous"]').click();
  90  |     await page.waitForTimeout(400);
  91  | 
  92  |     const modale = page.locator('#modalDetailDepenses');
  93  |     await expect(modale).toContainText('Loyer');
  94  |     await expect(modale).toContainText('Courses du samedi');
  95  |     await expect(modale, 'une dépense avancée par la conjointe apparaît')
  96  |       .not.toContainText('Restaurant du port');
  97  |   });
  98  | 
  99  |   test('une charge partagée dit qu\'elle ne compte que pour une part', async ({ page }) => {
  100 |     // Sans cette mention, le lecteur additionne les montants affichés et ne
  101 |     // retombe pas sur le total : c'est le total qu'il mettrait en doute.
  102 |     await ouvrir(page);
  103 | 
  104 |     await page.locator('[data-action="ouvrirDetailPayeur"][data-arg="vous"]').click();
  105 |     await page.waitForTimeout(400);
  106 | 
  107 |     const partagee = page.locator('.detail-ligne', { hasText: 'Week-end' });
  108 |     await expect(partagee).toBeVisible();
  109 |     await expect(partagee.locator('.detail-part')).toContainText('300');
  110 |   });
  111 | 
  112 |   test('les deux détails réunis font le total des charges', async ({ page }) => {
  113 |     await ouvrir(page);
  114 | 
  115 |     const lire = async (qui) => {
  116 |       await page.locator(`[data-action="ouvrirDetailPayeur"][data-arg="${qui}"]`).click();
  117 |       await page.waitForTimeout(350);
  118 |       const total = enNombre(
  119 |         await page.locator('#modalDetailDepenses .detail-total-montant').innerText()
  120 |       );
  121 |       await page.locator('#detailDepensesFermer').click();
  122 |       await page.waitForTimeout(300);
  123 |       return total;
  124 |     };
  125 | 
  126 |     const vous = await lire('vous');
  127 |     const conjointe = await lire('conjointe');
  128 | 
  129 |     // Comparé au total que LE BILAN AFFICHE, sur la même page et dans le même
  130 |     // geste — jamais à une constante écrite à la main. Avec 1 412,75 en dur, le
  131 |     // jour où `computeSummary` se remettrait à compter une charge solo ou
  132 |     // supprimée, le bilan afficherait 1 447,75 € pendant que les deux détails
  133 |     // continueraient de sommer 1 412,75 — et ce contrôle, dont le titre EST
  134 |     // cette égalité, serait resté vert.
  135 |     const duBilan = enNombre(await page.locator('.summary-total-row strong').innerText());
  136 | 
  137 |     expect(vous + conjointe).toBeCloseTo(duBilan, 2);
  138 |   });
  139 | 
  140 |   test('Échap referme', async ({ page }) => {
  141 |     await ouvrir(page);
  142 | 
  143 |     await page.locator('[data-action="ouvrirDetailPayeur"][data-arg="vous"]').click();
  144 |     await page.waitForTimeout(400);
> 145 |     await expect(page.locator('#modalDetailDepenses')).toBeVisible();
      |                                                        ^ Error: expect(locator).toBeVisible() failed
  146 | 
  147 |     await page.keyboard.press('Escape');
  148 |     await page.waitForTimeout(400);
  149 |     await expect(page.locator('#modalDetailDepenses')).toBeHidden();
  150 |   });
  151 | });
  152 | 
  153 | test.describe('Le détail d\'une catégorie', () => {
  154 |   test('la ligne du panneau des budgets ouvre ses dépenses', async ({ page }) => {
  155 |     await ouvrir(page);
  156 | 
  157 |     const ligne = page.locator('[data-action="ouvrirDetailCategorie"][data-arg="Maison"]');
  158 |     await expect(ligne).toBeVisible();
  159 | 
  160 |     const surLaLigne = enNombre(await ligne.locator('.budget-row-amounts').innerText());
  161 | 
  162 |     await ligne.click();
  163 |     await page.waitForTimeout(400);
  164 | 
  165 |     const modale = page.locator('#modalDetailDepenses');
  166 |     await expect(modale).toBeVisible();
  167 |     await expect(modale).toContainText('Loyer');
  168 | 
  169 |     const dansLaModale = enNombre(await modale.locator('.detail-total-montant').innerText());
  170 |     expect(dansLaModale, 'la modale annonce un autre total que la ligne')
  171 |       .toBeCloseTo(surLaLigne, 2);
  172 |   });
  173 | 
  174 |   test('une catégorie ne montre pas les dépenses d\'une autre', async ({ page }) => {
  175 |     await ouvrir(page);
  176 | 
  177 |     await page.locator('[data-action="ouvrirDetailCategorie"][data-arg="Courses"]').click();
  178 |     await page.waitForTimeout(400);
  179 | 
  180 |     const modale = page.locator('#modalDetailDepenses');
  181 |     await expect(modale).toContainText('Courses du samedi');
  182 |     await expect(modale).not.toContainText('Loyer');
  183 |   });
  184 | 
  185 |   test('un libellé hostile est affiché en texte, jamais interprété', async ({ page }) => {
  186 |     const p = moisCourant();
  187 |     const db = semence();
  188 |     db[`household/periods/${p}/variableCharges/v1`].description = '<img src=x onerror=alert(1)>';
  189 | 
  190 |     await page.setViewportSize(VUE);
  191 |     await setupFirebaseMock(page);
  192 |     await page.addInitScript(`window.__db = ${JSON.stringify(db)};`);
  193 |     await waitForApp(page);
  194 |     await page.waitForTimeout(1500);
  195 |     await page.locator('.summary-details > summary').click();
  196 |     await page.waitForTimeout(250);
  197 | 
  198 |     await page.locator('[data-action="ouvrirDetailCategorie"][data-arg="Courses"]').click();
  199 |     await page.waitForTimeout(400);
  200 | 
  201 |     await expect(page.locator('#modalDetailDepenses')).toContainText('<img src=x');
  202 |     expect(await page.locator('#modalDetailDepenses img').count()).toBe(0);
  203 |   });
  204 | });
  205 | 
```