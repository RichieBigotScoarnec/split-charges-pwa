import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Le thème, depuis l'écran qui le choisit
 *
 * `tests/utils/enveloppes.test.js` prouve que `themeLisible`, `cleDuTheme` et
 * `themesConnus` sont justes ; `tests/modules/enveloppe-neuve.test.js` prouve
 * que la fabrique de forme écrit ce que les règles déclarent. **Aucun des deux
 * ne prouve qu'on puisse choisir un thème.** Entre la fonction pure et la base,
 * il y a un `<select>` dont les options sont des RANGS, une sentinelle `'+'`,
 * un champ révélé par un écouteur, et deux appelants — création et édition —
 * qui doivent relire la liste au moment du geste plutôt qu'à celui du rendu.
 *
 * C'est très exactement la forme de défaut que ce dépôt paie le plus cher : les
 * fonctions pures blindées, le CÂBLAGE qui les relie laissé nu. `themes` hors
 * portée dans `ajouter` — un `ReferenceError` à chaque clic, la création morte,
 * la promesse rejetée en silence — a été trouvé par un sceptique qui exécutait
 * la conception, pas par les 2 600 contrôles unitaires.
 *
 * Et un dernier point que seule la géométrie mesure : deux champs sont venus
 * s'ajouter à un formulaire qui en comptait huit, dans une modale que
 * `coherence-visuelle.spec.js` ne visite pas — il ne connaît que les trois
 * panneaux.
 */

test.use({ viewport: { width: 390, height: 844 } });

/** Ouvre l'écran de gestion des enveloppes, et attend son formulaire */
async function ouvrirGestion(page) {
  await page.evaluate(() => window.showManageEnvelopesModal());
  await expect(page.locator('#envelopeNewLabel')).toBeVisible();
}

/**
 * Crée une enveloppe en passant par le formulaire
 *
 * `theme` désigne une option existante par son libellé ; `themeNeuf` passe par
 * « + Nouveau thème… » et le champ de saisie. Les deux chemins sont distincts
 * dans `themeChoisi`, et un seul des deux canonicalise.
 */
async function creer(page, { nom, theme, themeNeuf, perimetre, budget }) {
  await page.locator('#envelopeNewLabel').fill(nom);
  if (budget) await page.locator('#envelopeNewBudget').fill(String(budget));
  if (perimetre) await page.locator('#envelopeNewPerimetre').selectOption(perimetre);

  if (theme) {
    await page.locator('#envelopeNewTheme').selectOption({ label: theme });
  } else if (themeNeuf) {
    await page.locator('#envelopeNewTheme').selectOption('+');
    await page.locator('#envelopeNewThemeNouveau').fill(themeNeuf);
  }

  await page.locator('#envelopeAddBtn').click();
  await page.waitForTimeout(450);
}

/** Les enveloppes telles qu'elles sont écrites en base */
async function enBase(page) {
  return page.evaluate(async () => (await (await import('/js/db.js')).dbGet('envelopes')) || []);
}

test.describe('Le thème d\'une enveloppe, à l\'écran', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await ouvrirGestion(page);
  });

  test('le champ de saisie ne paraît que sur « + Nouveau thème »', async ({ page }) => {
    // Sans cet écouteur, la sentinelle serait choisissable et le champ qu'elle
    // commande resterait caché : on désignerait un thème neuf sans pouvoir le
    // nommer, et `themeChoisi` rendrait « aucun » — un formulaire qui accepte
    // un choix et n'en fait rien.
    const champ = page.locator('#envelopeNewThemeNouveau');
    const select = page.locator('#envelopeNewTheme');

    await expect(select).toHaveValue('');
    await expect(champ).toBeHidden();

    await select.selectOption('+');
    await expect(champ).toBeVisible();

    await select.selectOption('');
    await expect(champ).toBeHidden();
  });

  test('un thème neuf s\'écrit en base, et la ligne le porte', async ({ page }) => {
    await creer(page, { nom: 'Vacances été', themeNeuf: 'Vacances', budget: 800 });

    const [enveloppe] = await enBase(page);
    expect(enveloppe.label).toBe('Vacances été');
    expect(enveloppe.theme).toBe('Vacances');

    // Le thème ne sert à rien s'il ne se voit pas : c'est par la puce qu'on
    // reconnaît le groupe dans une liste rangée par rang, où les enveloppes
    // d'un même thème sont dispersées.
    await expect(page.locator('.envelope-theme')).toHaveText('Vacances');
  });

  test('le thème connu se repropose à la suivante — c\'est ce qui fait le groupe', async ({ page }) => {
    // `themesConnus` n'a aucun nœud à elle : l'ensemble des thèmes EST
    // l'ensemble des valeurs en usage. Si la liste n'était pas relue au rendu
    // de la modale, le second thème serait à retaper à l'identique, et la
    // moindre variation de casse en ferait deux groupes.
    await creer(page, { nom: 'Vacances été', themeNeuf: 'Vacances' });
    await ouvrirGestion(page);

    const options = await page.locator('#envelopeNewTheme option').allInnerTexts();
    expect(options.join(' | ')).toContain('Vacances');

    await creer(page, { nom: 'Vacances hiver', theme: 'Vacances' });

    const enveloppes = await enBase(page);
    expect(enveloppes.map(e => e.theme)).toEqual(['Vacances', 'Vacances']);
  });

  test('taper « vacances » rejoint « Vacances », ET le dit', async ({ page }) => {
    // La canonicalisation sans un mot est le défaut de la carte dont le montant
    // migrait derrière la loupe en silence : le foyer croit avoir créé un thème
    // et ne le retrouve nulle part. Ici il l'a rejoint, et l'application doit
    // l'annoncer — sinon le geste réussit et paraît avoir échoué.
    await creer(page, { nom: 'Vacances été', themeNeuf: 'Vacances' });
    await ouvrirGestion(page);
    await creer(page, { nom: 'Week-end Rome', themeNeuf: 'vacances' });

    const enveloppes = await enBase(page);
    const rome = enveloppes.find(e => e.label === 'Week-end Rome');
    // Le libellé du thème est celui qui existait, jamais celui qui vient
    // d'être tapé : deux jumeaux ne feraient pas un groupe.
    expect(rome.theme).toBe('Vacances');

    await expect(page.locator('.toast').last()).toContainText('Vacances');
  });

  test('éditer le thème ne perd rien de ce que le formulaire ne montre pas', async ({ page }) => {
    // `fusionnerListe` réécrit le TABLEAU ENTIER par transaction. Une édition
    // qui reconstruirait l'objet au lieu de repartir de l'existant effacerait
    // le périmètre en silence — une enveloppe perso redevenue commune sans que
    // rien ne le dise.
    await creer(page, { nom: 'Sport', themeNeuf: 'Vacances', perimetre: 'vous' });

    await page.locator('.envelope-editer').first().click();
    await expect(page.locator('#envelopeEditTheme')).toBeVisible();

    // Le thème porté est présélectionné : sans cela, toute édition d'un autre
    // champ le retirerait du groupe.
    const choisi = await page.locator('#envelopeEditTheme')
      .evaluate(el => el.options[el.selectedIndex].text);
    expect(choisi).toBe('Vacances');

    await page.locator('#envelopeEditTheme').selectOption('+');
    await page.locator('#envelopeEditThemeNouveau').fill('Sorties');
    await page.locator('#envelopeEditValider').click();
    await page.waitForTimeout(500);

    const [enveloppe] = await enBase(page);
    expect(enveloppe.theme).toBe('Sorties');
    expect(enveloppe.label).toBe('Sport');
    expect(enveloppe.perimetre).toBe('solo');
    expect(enveloppe.proprietaire).toBe('vous');
  });

  test('« — aucun — » reste possible, et n\'écrit pas de thème', async ({ page }) => {
    // Le témoin négatif du champ facultatif. Sans lui, une implémentation qui
    // poserait toujours un thème passerait tous les contrôles ci-dessus.
    await creer(page, { nom: 'Travaux', budget: 1200 });

    const [enveloppe] = await enBase(page);
    // `?? null` et non `toBe(null)` : la fabrique pose bien `null`, mais
    // Realtime Database ne stocke pas une clé nulle — elle se relit absente.
    // Exiger l'une des deux formes ferait dépendre le contrôle du double.
    expect(enveloppe.theme ?? null).toBe(null);
    expect(await page.locator('.envelope-theme').count()).toBe(0);
  });

  test('le formulaire tient toujours dans l\'écran, champ de thème déplié', async ({ page }) => {
    // Deux champs de plus dans un formulaire qui en comptait huit, sur 390 px.
    // `coherence-visuelle.spec.js` pose cette propriété sur les trois panneaux
    // et ne connaît aucune modale : le seul endroit où elle manquait est très
    // exactement celui qu'on vient de modifier.
    await page.locator('#envelopeNewTheme').selectOption('+');
    await expect(page.locator('#envelopeNewThemeNouveau')).toBeVisible();

    const defauts = await page.evaluate(() => {
      const modal = document.getElementById('modalManageEnvelopes');
      const nommer = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`;

      // La barre d'action est COLLÉE au bas de la modale, et c'est le correctif
      // du 31 août : « Ajouter » tombait 374 px sous l'écran. Une barre collante
      // est faite pour passer au-dessus de ce qui défile — la compter
      // signalerait comme défaut son fonctionnement même. La remontée s'arrête
      // à la modale elle-même, qui est fixe par nature.
      const flottant = (el) => {
        for (let n = el; n && n !== modal; n = n.parentElement) {
          const s = getComputedStyle(n);
          if (s.position === 'fixed' || s.position === 'sticky') return true;
        }
        return false;
      };

      const commandes = [...modal.querySelectorAll('button, select, input:not([type="hidden"])')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0'
            && r.bottom > 0 && r.top < window.innerHeight
            && el.closest('details:not([open])') === null && !flottant(el);
        });

      const resultats = [];

      // Deux commandes superposées : on en rate une au doigt sans comprendre.
      for (let i = 0; i < commandes.length; i++) {
        for (let j = i + 1; j < commandes.length; j++) {
          const a = commandes[i], b = commandes[j];
          if (a.contains(b) || b.contains(a)) continue;
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          const largeur = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const hauteur = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          // Deux pixels : les bordures adjacentes se touchent.
          if (largeur > 2 && hauteur > 2) {
            resultats.push(`${nommer(a)} ⨯ ${nommer(b)}`);
          }
        }
      }

      // Et une commande dont la moitié sort du cadre est inatteignable.
      for (const el of commandes) {
        const r = el.getBoundingClientRect();
        if (r.left < -1 || r.right > window.innerWidth + 1) {
          resultats.push(`${nommer(el)} déborde [${Math.round(r.left)} → ${Math.round(r.right)}]`);
        }
      }

      return resultats;
    });

    expect(defauts, defauts.join(' | ')).toEqual([]);
  });
});
