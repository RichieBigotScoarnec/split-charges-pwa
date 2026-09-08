import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * L'espace privé est une VUE, pas une fenêtre
 *
 * ─────────────────────────────────────────────────────────────────────
 * LA DETTE QUE CE FICHIER FERME
 *
 * Le sélecteur de portée offre trois segments depuis le lot 5 : « À deux »,
 * « Moi ce mois », « Privé ». Les deux premiers gouvernent le résumé depuis la
 * fusion du 2026-09-08. Le troisième ne gouverne rien : choisir « Privé » rend
 * le panneau du foyer, exactement comme « À deux ».
 *
 * `selecteur-portee.js` porte cette dette écrite en toutes lettres — « une
 * dette assumée et bornée au lot suivant » — et `summary.js` l'explique : le
 * test est `!== SOLO` et jamais `=== DEUX`, parce que rendre le versant
 * personnel sous une étiquette qui promet le privé mentirait davantage que de
 * laisser le foyer.
 *
 * L'espace privé vit aujourd'hui dans une modale, ouverte par deux commandes.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LES DEUX ENTRÉES, RELEVÉES AVANT D'ÉCRIRE
 *
 *   1. `FairSplit.html:360` — le bouton « 🔒 Privé » de `.acces-rapides` ;
 *   2. `resume-prive.js:93` — une rangée « Gérer mes dépenses privées et le
 *      partage / Ouvrir », **dans le bloc privé du versant personnel**.
 *
 * La seconde ne peut pas simplement disparaître, et c'est une mesure qui le
 * dit : depuis le versant personnel, une fois défilé jusqu'au bloc privé, le
 * segment « Privé » est **415 px plus haut à 320 px** (373 à 390) — hors de
 * l'écran. La retirer coûterait ce défilement à chaque fois. Elle change donc
 * de DESTINATION plutôt que de disparaître : le geste reste où il est, la
 * surface qu'il ouvre change.
 *
 * ─────────────────────────────────────────────────────────────────────
 * POURQUOI LA MODALE PART, ET NE RESTE PAS « AUSSI »
 *
 * Deux surfaces pour la même chose est très exactement le défaut refermé le
 * 2026-09-08 sur les deux sélecteurs de portée : deux commandes, deux états,
 * une seule grandeur — et l'écran finit par en annoncer deux différentes.
 * Ici ce serait pire qu'un désaccord d'étiquette : la modale et la vue liraient
 * la base séparément, et un partage refermé dans l'une resterait ouvert dans
 * l'autre.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE QUE CES CONTRÔLES NE NOMMENT PAS
 *
 * Ni `#modalPrive`, ni `.prive-avals`, ni `showPrivateExpensesModal`. L'espace
 * privé est reconnu à ce qu'il MONTRE : les trois crans de partage — « Rien »,
 * « Total seul », « Total + détail », trois libellés qui n'existent nulle part
 * ailleurs dans l'application — et un champ où inscrire un montant.
 *
 * La modale, elle, est reconnue à son RÔLE : `role="dialog"` avec
 * `aria-modal`. C'est un contrat sémantique, pas une classe : il survivra au
 * renommage de `.modal-overlay`, et c'est ce que la personne subit — une
 * couche qui capture le focus et qu'il faut refermer.
 */

const LARGEURS = [
  { nom: '320', viewport: { width: 320, height: 720 } },
  { nom: '390', viewport: { width: 390, height: 844 } }
];

const CRANS = ['Rien', 'Total seul', 'Total + détail'];

/**
 * Ce que l'écran montre de l'espace privé, à cet instant
 *
 * Cherché par le TEXTE PROPRE des éléments, jamais par une classe. Le texte
 * propre — sans celui des descendants — évite que la racine du document porte
 * tout et satisfasse n'importe quoi.
 */
const espacePriveRendu = (page) => page.evaluate((crans) => {
  const visible = (el) => Boolean(el.checkVisibility && el.checkVisibility())
    && el.getBoundingClientRect().height > 0;
  const propre = (el) => [...el.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();

  const tous = [...document.querySelectorAll('body *')];
  const cransVus = crans.filter((c) =>
    tous.some((el) => visible(el) && propre(el) === c));

  // Un champ où inscrire un montant : c'est ce qui distingue « je consulte mon
  // privé » de « on m'en montre un résumé ».
  const saisie = [...document.querySelectorAll('input')]
    .filter(visible)
    .some((el) => el.inputMode === 'decimal' || el.getAttribute('inputmode') === 'decimal');

  // Une couche modale RENDUE, quelle que soit sa classe.
  const dialogues = [...document.querySelectorAll('[role="dialog"]')]
    .filter(visible)
    .map((el) => (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40));

  const segmentActif = [...document.querySelectorAll('[data-portee]')]
    .filter(visible)
    .find((el) => el.getAttribute('aria-checked') === 'true');

  return {
    cransVus,
    saisie,
    dialogues,
    porteeAnnoncee: segmentActif ? segmentActif.getAttribute('data-portee') : null
  };
}, CRANS);

async function ouvrir(page) {
  await setupFirebaseMock(page);
  await page.addInitScript(() => {
    const d = new Date();
    const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    window.__db = window.__db || {};
    window.__db['household/salaries'] = { vous: 2500, conjointe: 1800 };
    window.__db[`household/periods/${p}/salaries`] = { vous: 2500, conjointe: 1800 };
    window.__db[`household/periods/${p}/variableCharges/v1`] = {
      description: 'Courses', amount: 320, category: 'Courses',
      paidBy: 'vous', date: `${p}-03`, deleted: false
    };
  });
  await waitForApp(page);
  await page.waitForTimeout(1200);
  await allerAuPanneau(page, 'panneauBilan');
}

for (const { nom, viewport } of LARGEURS) {
  test.describe(`Privé est une vue — ${nom} px`, () => {
    test.use({ viewport, hasTouch: true });

    test.beforeEach(async ({ page }) => {
      await ouvrir(page);
    });

    test('choisir « Privé » rend l\'espace privé, sans autre geste', async ({ page }) => {
      // ── LA PRÉMISSE FAIT TOUT LE TRAVAIL ──
      // « L'espace privé est à l'écran » est satisfait par une application qui
      // le montre en permanence. Sans ce relevé d'avant, le cas resterait vert
      // le jour où le segment cesserait de gouverner quoi que ce soit.
      const avant = await espacePriveRendu(page);
      expect(avant.cransVus,
        'prémisse : l\'espace privé est déjà rendu avant qu\'on le demande')
        .toEqual([]);

      await page.locator('.panneau--actif [data-portee="prive"]').click();
      await page.waitForTimeout(700);

      const apres = await espacePriveRendu(page);

      expect(apres.porteeAnnoncee,
        'le segment n\'annonce pas la portée qu\'on vient de choisir')
        .toBe('prive');

      expect(apres.cransVus,
        `l'espace privé n'est pas rendu : ${apres.cransVus.length} cran(s) de `
        + 'partage sur 3 à l\'écran. Choisir « Privé » montre encore le panneau '
        + 'du foyer — le segment n\'a jamais gouverné cette portée')
        .toEqual(CRANS);

      expect(apres.saisie,
        'aucun champ de montant : on peut consulter son privé, pas y écrire')
        .toBe(true);
    });

    test('et il n\'est pas dans une fenêtre par-dessus l\'écran', async ({ page }) => {
      /**
       * La moitié qui manquerait si l'on se contentait du cas précédent : un
       * segment qui OUVRE une modale le satisferait entièrement — l'espace
       * privé serait bien rendu, sans autre geste.
       *
       * Ce serait pourtant l'inverse de ce que le lot vise. Une portée est un
       * filtre, pas une destination : elle change ce que l'écran montre, comme
       * un mois. Ouvrir une couche par-dessus ferait du quatrième geste une
       * navigation, et le geste retour devrait la refermer.
       */
      await page.locator('.panneau--actif [data-portee="prive"]').click();
      await page.waitForTimeout(700);

      const m = await espacePriveRendu(page);

      expect(m.cransVus.length,
        'prémisse : sans espace privé rendu, « pas de modale » est vrai pour rien')
        .toBeGreaterThan(0);

      expect(m.dialogues,
        `l'espace privé est rendu dans une fenêtre modale — « ${m.dialogues[0]} » : `
        + 'une portée est un filtre, pas une destination, et une couche à '
        + 'refermer n\'en est pas un')
        .toEqual([]);
    });

    test('la commande du versant personnel mène à la VUE, pas à une seconde surface', async ({ page }) => {
      /**
       * La rangée « Gérer mes dépenses privées et le partage » vit dans le bloc
       * privé du versant personnel. Elle reste — le segment est 415 px plus
       * haut à 320 px une fois qu'on a défilé jusque-là, et la retirer
       * coûterait ce défilement — mais elle change de destination.
       *
       * Elle est cherchée par son INTITULÉ, pas par son `data-action` : c'est
       * précisément l'attribut que le lot doit changer.
       *
       * ── « GÉRER », ET PAS SEULEMENT « DÉPENSES PRIVÉES » ──
       *
       * Première rédaction : `{ name: /dépenses privées/i }`. Elle relevait
       * DEUX boutons, et `.first()` prenait le mauvais — « Afficher », dont
       * l'étiquette d'accessibilité est « Afficher mes dépenses privées » et
       * qui ne fait que dévoiler un montant masqué. Le cas tombait alors sur la
       * bonne conclusion pour la mauvaise raison, et son message envoyait
       * chercher là où il n'y avait rien. Le compte exact — `toBe(1)` — est ce
       * qui empêche la même méprise de revenir.
       */
      await page.locator('.panneau--actif [data-portee="solo"]').click();
      await page.waitForTimeout(700);

      const commande = page.getByRole('button', { name: /gérer mes dépenses privées/i });
      expect(await commande.count(),
        'prémisse : le versant personnel n\'offre pas exactement une commande vers le privé')
        .toBe(1);

      await commande.scrollIntoViewIfNeeded();
      await commande.click();
      await page.waitForTimeout(900);

      const m = await espacePriveRendu(page);

      expect(m.dialogues,
        `la commande ouvre une fenêtre — « ${m.dialogues[0]} » — au lieu de mener `
        + 'à la vue : deux surfaces pour le même espace finissent par se '
        + 'contredire, et un partage refermé dans l\'une resterait ouvert dans '
        + 'l\'autre')
        .toEqual([]);

      expect(m.porteeAnnoncee,
        'la commande n\'a pas emmené l\'écran dans la portée « Privé »')
        .toBe('prive');
    });
  });
}

test.describe('Une seule porte vers l\'espace privé', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('la rangée des lectures du mois ne l\'offre plus', async ({ page }) => {
    /**
     * `onglets:184` change de sujet avec son argument : il exigeait que la
     * rangée contienne « Privé ». La portée le porte désormais, et un bouton
     * qui double un segment situé 400 px plus haut est la seconde surface que
     * ce lot existe pour supprimer.
     *
     * La prémisse tient la rangée elle-même : sans elle, « Privé n'y est pas »
     * serait satisfait par une rangée disparue — et personne ne verrait que les
     * enveloppes sont parties avec.
     */
    await ouvrir(page);

    const rangee = await page.evaluate(() => {
      const r = document.querySelector('.acces-rapides');
      if (!r) return null;
      return [...r.querySelectorAll('.btn')]
        .filter((b) => b.checkVisibility() && b.getBoundingClientRect().height > 0)
        .map((b) => b.innerText.replace(/\s+/g, ' ').trim());
    });

    expect(rangee, 'prémisse : la rangée des lectures du mois a disparu').not.toBeNull();
    expect(rangee.join(' '), 'prémisse : « Enveloppes » a quitté la rangée')
      .toContain('Enveloppes');

    expect(rangee.join(' '),
      `la rangée offre encore « Privé » — ${rangee.length} boutons : `
      + `${rangee.join(' | ')}. C'est une seconde porte vers un espace que le `
      + 'segment gouverne déjà')
      .not.toContain('Privé');
  });
});
