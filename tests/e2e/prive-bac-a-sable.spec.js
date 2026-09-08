import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Le bac à sable ne touche pas au privé — ni en lecture, ni en écriture
 *
 * ## Le défaut, mesuré le 2026-09-07
 *
 * `?sandbox=1` bascule `DATA_ROOT` de `household` à `sandbox`. Mais le détail
 * privé ne vit pas sous `household` : il occupe **trois racines sœurs** —
 * `prive`, `aval`, `totauxPrives` — et les quatre accès absolus de `db.js` ne
 * préfixent rien, par construction et à dessein.
 *
 * Conséquence : **le bac à sable lit et écrit le VRAI espace privé.** Relevé —
 * les mots `sandbox`, `DATA_ROOT` et `getDataRoot` n'apparaissent nulle part
 * dans `prive.js` ni `resume-prive.js`. Aucune garde n'existe.
 *
 * Ce n'est pas une conséquence du chantier de refonte : c'est un défaut de
 * confidentialité en production aujourd'hui, indépendant de lui. Quelqu'un qui
 * ouvre `?sandbox=1` pour essayer sans rien casser voit ses dépenses privées
 * réelles, et peut en écrire.
 *
 * ## Ce que « se taire » veut dire, et ce qu'il ne veut pas dire
 *
 * **Un refus explicite, expliqué à l'écran** — jamais un écran vide.
 *
 * Un privé vide dans le bac à sable serait indiscernable d'un privé réel qui
 * n'a rien ce mois-ci : c'est la règle 1 appliquée à un produit, une absence
 * qui se lit comme une présence sans contenu. Pire, il inviterait à SAISIR — et
 * une saisie dans un espace qu'on croit jetable est exactement ce que ce lot
 * doit empêcher.
 *
 * ## Les trois propriétés, et pourquoi la dernière compte le plus
 *
 * Lire est réparable — on ferme l'écran. **Écrire ne l'est pas** : une dépense
 * privée déposée depuis le bac à sable atterrit dans le vrai espace, et rien ne
 * dit qu'elle vient de là. C'est le cas qui justifie que le refus vive au niveau
 * des ACCÈS, pas de l'écran : masquer un bouton ne referme pas une écriture.
 */

/** Le mois affiché, tel que l'application le calcule */
function moisCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Une dépense privée RÉELLE, déjà en base avant que l'application n'ouvre */
function semenceReelle() {
  const p = moisCourant();
  return {
    'household/salaries': { vous: 2500, conjointe: 1800 },
    [`household/periods/${p}/salaries`]: { vous: 2500, conjointe: 1800 },
    [`prive/vous/periods/${p}/depenses`]: {
      k1: { montant: 137.5, description: 'Cadeau anniversaire', date: `${p}-09`, deleted: false }
    }
  };
}

/** Les clés effectivement présentes aux trois racines privées */
const clesPrivees = (page) => page.evaluate(() =>
  Object.keys(window.__db).filter((c) =>
    c.startsWith('prive') || c.startsWith('aval') || c.startsWith('totauxPrives')));

async function ouvrir(page, { sandbox }) {
  await setupFirebaseMock(page);
  await page.addInitScript(`window.__db = ${JSON.stringify(semenceReelle())};`);
  await waitForApp(page, { query: sandbox ? '?sandbox=1' : '' });
  await page.waitForTimeout(600);
}

/** L'espace de données sur lequel l'application travaille */
const espace = (page) => page.evaluate(async () => {
  const { getDataRoot } = await import('/js/db.js');
  return getDataRoot();
});

test.describe('Le privé, hors du bac à sable', () => {

  test('TÉMOIN — hors bac à sable, la dépense réelle est bien rendue', async ({ page }) => {
    /**
     * Sans ce cas, « le montant n'apparaît pas » serait satisfait par un écran
     * qui ne rend rien du tout — une semence mal formée, un mois décalé, un
     * sélecteur changé. Il ancre que la donnée EXISTE et que l'écran SAIT
     * l'afficher ; c'est lui qui donne son sens au refus mesuré plus bas.
     */
    await ouvrir(page, { sandbox: false });
    expect(await espace(page), 'prémisse : ce cas doit tourner hors bac à sable')
      .toBe('household');

    await page.evaluate(() => window.showPrivateExpensesModal());
    await expect(page.locator('#modalPrive')).toBeVisible();
    await expect(page.locator('#modalPrive')).toContainText('Cadeau anniversaire');
    await expect(page.locator('#modalPrive')).toContainText('137,50');
  });

  test('en bac à sable, aucune dépense privée réelle n\'atteint l\'écran', async ({ page }) => {
    await ouvrir(page, { sandbox: true });
    expect(await espace(page), 'prémisse : sans bac à sable, ce cas remesure le mode normal')
      .toBe('sandbox');

    await page.evaluate(() => window.showPrivateExpensesModal && window.showPrivateExpensesModal());
    await page.waitForTimeout(600);

    // La recherche porte sur TOUT l'écran, pas sur un conteneur : le refus peut
    // vouloir rendre autre chose qu'une modale, et ce cas doit y survivre.
    const ecran = await page.locator('body').innerText();
    expect(ecran, 'le bac à sable affiche une dépense privée réelle')
      .not.toContain('Cadeau anniversaire');
    expect(ecran.replace(/\s/g, ''), 'le bac à sable affiche un montant privé réel')
      .not.toContain('137,50');
  });

  test('en bac à sable, l\'écran REFUSE et l\'explique, il n\'est pas seulement vide', async ({ page }) => {
    /**
     * La différence entre « vide » et « refusé » est tout l'objet de ce lot. Un
     * écran vide se lit comme un mois sans dépense privée, et invite à saisir ;
     * un refus dit pourquoi il n'y a rien, et que ce n'est pas le bon endroit.
     *
     * ── CE CAS A ÉTÉ RÉÉCRIT PARCE QU'IL PASSAIT POUR RIEN ──
     *
     * Sa première rédaction cherchait « bac à sable » ET « privé » n'importe où
     * dans le texte de la page. Elle était VERTE avant tout correctif : le
     * bandeau de `#sandboxBanner` porte déjà « Bac à sable — données d'essai,
     * isolées de celles du foyer », et le bouton d'accès rapide porte
     * « Privé ». Deux éléments sans rapport, réunis par une recherche à
     * l'échelle de la page.
     *
     * Le refus doit donc tenir dans UN SEUL élément : c'est ce qui distingue une
     * phrase qui explique de deux mots qui se croisent. Et cette exigence exclut
     * le bandeau sans avoir à le nommer — son texte ne contient pas « privé ».
     */
    await ouvrir(page, { sandbox: true });
    expect(await espace(page), 'prémisse').toBe('sandbox');

    await page.evaluate(() => window.showPrivateExpensesModal && window.showPrivateExpensesModal());
    await page.waitForTimeout(600);

    const phrases = await page.evaluate(() => {
      const visible = (el) => el.checkVisibility && el.checkVisibility()
        && el.getBoundingClientRect().height > 0;
      // Le texte PROPRE de l'élément, sans celui de ses descendants : sinon
      // `<body>` porte tout, et n'importe quelle page satisfait n'importe quoi.
      const propre = (el) => [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      return [...document.querySelectorAll('body *')]
        .filter(visible)
        .map(propre)
        .filter((t) => t.length > 20);
    });

    const refus = phrases.filter((t) => /priv/i.test(t)
      && /bac à sable|espace d'essai|indisponible|pas accessible|n'est pas/i.test(t));

    expect(refus, `aucune phrase ne dit pourquoi le privé se tait ici — ${phrases.length} phrases lues`)
      .not.toHaveLength(0);
  });

  test('en bac à sable, aucune saisie de dépense privée n\'est atteignable', async ({ page }) => {
    /**
     * Le pendant comportemental du cas précédent, et il ne peut être satisfait
     * par aucun texte : une explication qui laisse le formulaire ouvert
     * n'empêche rien. C'est aussi le seul des deux qu'un bandeau ne peut pas
     * rendre vert par accident.
     */
    await ouvrir(page, { sandbox: true });
    expect(await espace(page), 'prémisse').toBe('sandbox');

    await page.evaluate(() => window.showPrivateExpensesModal && window.showPrivateExpensesModal());
    await page.waitForTimeout(600);

    const champs = await page.evaluate(() =>
      [...document.querySelectorAll('#modalPrive input, #modalPrive textarea, #modalPrive select')]
        .filter((el) => el.checkVisibility && el.checkVisibility())
        .map((el) => el.id || el.name || el.type));

    expect(champs, 'le bac à sable laisse de quoi saisir une dépense privée')
      .toEqual([]);
  });

  test('en bac à sable, RIEN ne s\'écrit aux trois racines privées', async ({ page }) => {
    /**
     * La propriété qui compte le plus, et le cas n'appuie sur aucun bouton :
     * il appelle les chemins d'écriture eux-mêmes. Masquer une commande ne
     * referme pas une écriture, et c'est ce qui décide où le refus doit vivre.
     */
    await ouvrir(page, { sandbox: true });
    expect(await espace(page), 'prémisse').toBe('sandbox');

    const avant = await clesPrivees(page);
    const p = moisCourant();

    const refus = await page.evaluate(async (periode) => {
      const { dbSetAbsolu, dbPushAbsolu } = await import('/js/db.js');
      const resultats = [];
      const tentatives = [
        () => dbPushAbsolu(`prive/vous/periods/${periode}/depenses`,
          { montant: 9.99, description: 'Essai depuis le bac à sable', date: `${periode}-07`, deleted: false }),
        () => dbSetAbsolu('aval/vous', { actif: true, accordeLe: Date.now(), accordePar: 'vous' }),
        () => dbSetAbsolu(`totauxPrives/vous/${periode}`, { montant: 9.99, compte: 1 })
      ];
      for (const tentative of tentatives) {
        try { await tentative(); resultats.push('ACCEPTÉ'); }
        catch (erreur) { resultats.push('refusé'); }
      }
      return resultats;
    }, p);

    expect(await clesPrivees(page),
      `des clés privées ont été écrites depuis le bac à sable — ${refus.join(' | ')}`)
      .toEqual(avant);

    // Et le refus est BRUYANT : une écriture qui rend la main sans rien faire
    // laisserait l'appelant croire qu'elle a réussi.
    expect(refus.filter((r) => r === 'ACCEPTÉ'),
      'une écriture privée a été acceptée en bac à sable').toEqual([]);
  });
});
