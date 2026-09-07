# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: detail-depenses.spec.js >> Le détail d'un payeur >> elle montre les dépenses avancées, et pas celles d'en face
- Location: tests/e2e/detail-depenses.spec.js:86:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('[data-action="ouvrirDetailPayeur"][data-arg="vous"]')
    - locator resolved to <button type="button" data-arg="vous" data-action="ouvrirDetailPayeur" class="summary-row summary-row--ouvrable">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button type="button" class="onglet" data-panneau="panneauCharges">…</button> from <nav id="onglets" class="onglets" aria-label="Sections de l'application">…</nav> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <div class="summary-divider"></div> intercepts pointer events
  2 × retrying click action
      - waiting 100ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="status" id="balanceBar" class="balance-bar balance-positive">…</div> from <div class="bandeau-colle">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <button type="button" class="onglet" data-panneau="panneauCharges">…</button> from <nav id="onglets" class="onglets" aria-label="Sections de l'application">…</nav> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <details open="" class="summary-details">…</details> intercepts pointer events
  2 × retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="status" id="balanceBar" class="balance-bar balance-positive">…</div> from <div class="bandeau-colle">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="status" id="balanceBar" class="balance-bar balance-positive">…</div> from <div class="bandeau-colle">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button type="button" class="onglet" data-panneau="panneauCharges">…</button> from <nav id="onglets" class="onglets" aria-label="Sections de l'application">…</nav> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="summary-divider"></div> intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="status" id="balanceBar" class="balance-bar balance-positive">…</div> from <div class="bandeau-colle">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="status" id="balanceBar" class="balance-bar balance-positive">…</div> from <div class="bandeau-colle">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button type="button" class="onglet" data-panneau="panneauCharges">…</button> from <nav id="onglets" class="onglets" aria-label="Sections de l'application">…</nav> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - performing click action
      - <div class="summary-divider"></div> intercepts pointer events
  2 × retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="status" id="balanceBar" class="balance-bar balance-positive">…</div> from <div class="bandeau-colle">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="status" id="balanceBar" class="balance-bar balance-positive">…</div> from <div class="bandeau-colle">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button type="button" class="onglet" data-panneau="panneauCharges">…</button> from <nav id="onglets" class="onglets" aria-label="Sections de l'application">…</nav> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div class="summary-divider"></div> intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="status" id="balanceBar" class="balance-bar balance-positive">…</div> from <div class="bandeau-colle">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="status" id="balanceBar" class="balance-bar balance-positive">…</div> from <div class="bandeau-colle">…</div> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <button type="button" class="onglet" data-panneau="panneauCharges">…</button> from <nav id="onglets" class="onglets" aria-label="Sections de l'application">…</nav> subtree intercepts pointer events
    - retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <details open="" class="summary-details">…</details> intercepts pointer events
  2 × retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="status" id="balanceBar" class="balance-bar balance-positive">…</div> from <div class="bandeau-colle">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <button type="button" class="onglet" data-panneau="panneauCharges">…</button> from <nav id="onglets" class="onglets" aria-label="Sections de l'application">…</nav> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <div class="summary-divider"></div> intercepts pointer events
  2 × retrying click action
      - waiting 500ms
      - waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <div role="status" id="balanceBar" class="balance-bar balance-positive">…</div> from <div class="bandeau-colle">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Aller au contenu principal" [ref=e2] [cursor=pointer]:
    - /url: "#mainApp"
  - main [ref=e3]:
    - generic [ref=e4]:
      - heading "FairSplit" [level=1] [ref=e5]
      - generic [ref=e9]:
        - generic [ref=e10]: Test User
        - button "Déconnexion" [ref=e11] [cursor=pointer]
    - generic [ref=e12]:
      - navigation "Navigation des périodes" [ref=e13]:
        - generic [ref=e15]:
          - button "Mois précédent" [ref=e16] [cursor=pointer]: ◀
          - generic [ref=e17]: Sélectionner la période
          - combobox "Sélectionner la période" [ref=e18] [cursor=pointer]:
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
          - button "Mois suivant" [ref=e19] [cursor=pointer]: ▶
      - status [ref=e20]:
        - generic [ref=e21]:
          - text: Conjointe vous doit
          - strong [ref=e22]: 377,30 €
    - region [ref=e24]:
      - generic [ref=e25]:
        - heading "Résumé du Mois" [level=2] [ref=e26]:
          - generic [ref=e27]: 📊
          - text: Résumé du Mois
        - generic [ref=e29]:
          - generic [ref=e30]:
            - generic [ref=e31]: Ensemble ce mois
            - strong [ref=e32]: 1 412,75 €
            - paragraph [ref=e33]: "À rééquilibrer : 377,30 € — Conjointe vers Vous"
            - generic [ref=e34]: Vous a payé 377,30 € de plus que sa part
            - button "Régler ce solde" [ref=e35] [cursor=pointer]
          - generic [ref=e36]:
            - generic [ref=e37]:
              - text: ⏳
              - strong [ref=e38]: 1 412,75 €
              - text: encore à passer sur 1 412,75 €
            - generic [ref=e39]: Loyer le 5 sept., Courses du samedi le 12 sept., Restaurant du port le 14 sept. et 1 autre — déjà comptés dans le solde ci-dessus
          - group [ref=e40]:
            - generic "Voir le détail ▲" [active] [ref=e41] [cursor=pointer]
            - generic [ref=e42]:
              - generic [ref=e43]: Total des charges
              - strong [ref=e44]: 1 412,75 €
            - generic [ref=e46]: Répartition à payer
            - generic [ref=e47]:
              - generic [ref=e48]:
                - text: Vous
                - generic [ref=e49]: 58%
              - strong [ref=e50]: 821,37 €
            - generic [ref=e51]:
              - generic [ref=e52]:
                - text: Conjointe
                - generic [ref=e53]: 42%
              - strong [ref=e54]: 591,38 €
            - generic [ref=e56]: Paiements réels
            - button "Vous a payé › 1 198,67 €" [ref=e57] [cursor=pointer]:
              - generic [ref=e58]: Vous a payé ›
              - strong [ref=e59]: 1 198,67 €
            - button "Conjointe a payé › 214,08 €" [ref=e60] [cursor=pointer]:
              - generic [ref=e61]: Conjointe a payé ›
              - strong [ref=e62]: 214,08 €
          - button "📄 Le mois en un coup d'œil" [ref=e63] [cursor=pointer]
        - generic [ref=e64]:
          - generic [ref=e65]: 🎯 Budgets par catégorie
          - generic [ref=e66]:
            - button "Maison 950,00 €" [ref=e67] [cursor=pointer]:
              - generic [ref=e68]:
                - generic [ref=e69]: Maison
                - generic [ref=e70]: 950,00 €
            - button "Loisirs 300,00 €" [ref=e71] [cursor=pointer]:
              - generic [ref=e72]:
                - generic [ref=e73]: Loisirs
                - generic [ref=e74]: 300,00 €
            - button "Restaurant 88,50 €" [ref=e75] [cursor=pointer]:
              - generic [ref=e76]:
                - generic [ref=e77]: Restaurant
                - generic [ref=e78]: 88,50 €
            - button "Courses 74,25 €" [ref=e79] [cursor=pointer]:
              - generic [ref=e80]:
                - generic [ref=e81]: Courses
                - generic [ref=e82]: 74,25 €
            - generic [ref=e83]: Aucun budget défini
            - button "Définir les budgets" [ref=e84] [cursor=pointer]
        - button "Tendances sur 6 mois" [ref=e86] [cursor=pointer]:
          - generic [ref=e87]: 📈
          - text: Tendances sur 6 mois
          - generic [ref=e88]: ▼
        - generic [ref=e89]:
          - button "Enveloppes" [ref=e90] [cursor=pointer]:
            - generic [ref=e91]: 🧳
            - text: Enveloppes
          - button "Privé" [ref=e92] [cursor=pointer]:
            - generic [ref=e93]: 🔒
            - text: Privé
    - navigation "Sections de l'application" [ref=e94]:
      - button "Bilan" [ref=e95] [cursor=pointer]:
        - generic [ref=e96]: 📊
      - button "Charges" [ref=e98] [cursor=pointer]:
        - generic [ref=e99]: 🧾
      - button "Réglages" [ref=e101] [cursor=pointer]:
        - generic [ref=e102]: ⚙️
  - text: ▾
  - button "Saisie rapide de charge" [ref=e104] [cursor=pointer]:
    - generic [ref=e105]: ➕
```

# Test source

```ts
  1   | import { test, expect } from './_couverture.js';
  2   | import { setupFirebaseMock, waitForApp } from './_harness.js';
  3   | 
  4   | /**
  5   |  * Ouvrir le détail derrière un chiffre du bilan
  6   |  *
  7   |  * `tests/utils/detail.test.js` verrouille la sélection et les totaux. Ce qui
  8   |  * est vérifié ici, c'est le geste : la ligne s'ouvre, et **la modale retrouve
  9   |  * exactement le chiffre sur lequel on a cliqué**.
  10  |  *
  11  |  * Cette égalité est la seule chose qui compte. Une modale qui afficherait un
  12  |  * autre total que la ligne qui l'a ouverte ferait douter du bilan, pas de la
  13  |  * modale.
  14  |  */
  15  | 
  16  | const VUE = { width: 390, height: 844 };
  17  | 
  18  | function moisCourant() {
  19  |   const d = new Date();
  20  |   return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  21  | }
  22  | 
  23  | /** Un mois où chacun a avancé, plus une charge partagée */
  24  | function semence() {
  25  |   const p = moisCourant();
  26  |   return {
  27  |     'household/salaries': { vous: 2500, conjointe: 1800 },
  28  |     [`household/periods/${p}/salaries`]: { vous: 2500, conjointe: 1800 },
  29  |     [`household/periods/${p}/fixedCharges/f1`]: {
  30  |       description: 'Loyer', amount: 950, category: 'Maison',
  31  |       paidBy: 'vous', date: `${p}-05`, deleted: false
  32  |     },
  33  |     [`household/periods/${p}/variableCharges/v1`]: {
  34  |       description: 'Courses du samedi', amount: 74.25, category: 'Courses',
  35  |       paidBy: 'vous', date: `${p}-12`, deleted: false
  36  |     },
  37  |     [`household/periods/${p}/variableCharges/v2`]: {
  38  |       description: 'Restaurant du port', amount: 88.5, category: 'Restaurant',
  39  |       paidBy: 'conjointe', date: `${p}-14`, deleted: false
  40  |     },
  41  |     // Partagée : chacun n'en a avancé qu'une part.
  42  |     [`household/periods/${p}/variableCharges/v3`]: {
  43  |       description: 'Week-end', amount: 300, category: 'Loisirs',
  44  |       paidBy: 'partage', date: `${p}-20`, deleted: false
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
> 89  |     await page.locator('[data-action="ouvrirDetailPayeur"][data-arg="vous"]').click();
      |                                                                               ^ Error: locator.click: Test timeout of 30000ms exceeded.
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
  145 |     await expect(page.locator('#modalDetailDepenses')).toBeVisible();
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
```