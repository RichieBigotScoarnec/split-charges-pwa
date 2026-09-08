import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

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

/**
 * Va sur l'espace privé — par le SEGMENT, comme la personne
 *
 * Ces cas pilotaient `window.showPrivateExpensesModal()`. L'espace privé est
 * une VUE depuis le 2026-09-08 : la fonction n'existe plus, et le chemin réel
 * passe par la troisième portée du sélecteur.
 *
 * Le changement compte pour ce fichier-ci plus que pour les autres : ce qu'il
 * mesure est que le refus du bac à sable arrive bien **par le chemin qu'on
 * emprunte**. Un refus branché sur une fonction que plus rien n'appelle serait
 * un contrôle qui mesure une porte condamnée.
 */
async function allerAuPrive(page) {
  await allerAuPanneau(page, 'panneauBilan');
  await page.locator('.panneau--actif [data-portee="prive"]').click();
  await page.waitForTimeout(700);
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

    await allerAuPrive(page);
    await expect(page.locator('#resumePanneauPrive')).toBeVisible();
    await expect(page.locator('#resumePanneauPrive')).toContainText('Cadeau anniversaire');
    await expect(page.locator('#resumePanneauPrive')).toContainText('137,50');
  });

  test('en bac à sable, aucune dépense privée réelle n\'atteint l\'écran', async ({ page }) => {
    await ouvrir(page, { sandbox: true });
    expect(await espace(page), 'prémisse : sans bac à sable, ce cas remesure le mode normal')
      .toBe('sandbox');

    await allerAuPrive(page);

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
     * phrase qui explique de deux mots qui se croisent.
     *
     * ── ET IL A RECOMMENCÉ À MESURER LE BANDEAU — 2026-09-08 ──
     *
     * L'exigence « un seul élément » excluait le bandeau « parce que son texte
     * ne contient pas privé ». Elle était juste le jour où elle a été écrite.
     * Elle a cessé de l'être quand le bandeau a été AMÉLIORÉ, deux lots plus
     * tard : il dit maintenant « Bac à sable — données d'essai, isolées de
     * celles du foyer. **L'espace privé n'y est pas accessible.** » Un seul
     * élément, les deux motifs, et le cas redevenait vrai sans rien savoir de
     * l'écran privé.
     *
     * Mesuré par mutation : garde explicative retirée, le panneau annonce
     * « Espace privé illisible — revenez dans un instant » — le refus déguisé
     * en panne que ce lot existe pour empêcher — et le cas restait VERT.
     *
     * Un contrôle peut donc devenir vide parce qu'un VOISIN s'est amélioré.
     * Rien ne le signale : les deux changements sont bons pris séparément.
     *
     * Le remède : chercher dans le panneau RENDU — `.panneau--actif`, le
     * contrat de balisage que ce dépôt tient déjà — et non dans la page. Le
     * bandeau vit au-dessus des panneaux, il en sort donc sans être nommé. Et
     * la seconde moitié, ci-dessous, tient ce que le mutant a révélé : un refus
     * ne se déguise pas en panne.
     */
    await ouvrir(page, { sandbox: true });
    expect(await espace(page), 'prémisse').toBe('sandbox');

    await allerAuPrive(page);

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
      const panneau = document.querySelector('.panneau--actif');
      return {
        dansLePanneau: panneau
          ? [...panneau.querySelectorAll('*')].filter(visible).map(propre).filter((t) => t.length > 20)
          : null,
        toutLEcran: [...document.querySelectorAll('body *')]
          .filter(visible).map(propre).filter((t) => t.length > 20)
      };
    });

    expect(phrases.dansLePanneau, 'prémisse : aucun panneau rendu, rien à lire')
      .not.toBeNull();

    const explique = (t) => /priv/i.test(t)
      && /bac à sable|espace d'essai|indisponible|pas accessible|n'est pas/i.test(t);

    const refus = phrases.dansLePanneau.filter(explique);

    expect(refus,
      'aucune phrase du panneau ne dit pourquoi le privé se tait ici — '
      + `${phrases.dansLePanneau.length} phrases lues dans le panneau, `
      + `${phrases.toutLEcran.filter(explique).length} sur l'écran entier (le bandeau en fait partie)`)
      .not.toHaveLength(0);

    // ── ET IL NE SE DÉGUISE PAS EN PANNE ──
    //
    // C'est la moitié que le mutant a révélée. Sans la garde, la lecture est
    // rejetée par `db.js` — la confidentialité tient — mais l'écran annonce
    // « Espace privé illisible, revenez dans un instant ». Deux fois faux : ce
    // n'est pas illisible, et revenir ne changera rien. On envoie quelqu'un
    // attendre une panne qui n'existe pas.
    const panneEnDeguisement = phrases.dansLePanneau.filter((t) =>
      /illisible|réessayez|revenez|indisponible pour l'instant/i.test(t));

    expect(panneEnDeguisement,
      `le refus se donne des airs de panne — « ${panneEnDeguisement[0]} » : `
      + 'rien n\'est cassé, et rien ne marchera mieux tout à l\'heure')
      .toHaveLength(0);
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

    await allerAuPrive(page);

    const champs = await page.evaluate(() =>
      [...document.querySelectorAll('#resumePanneauPrive input, #resumePanneauPrive textarea, #resumePanneauPrive select')]
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

  test('en bac à sable, une LECTURE absolue rejette — elle ne rend pas le vide', async ({ page }) => {
    /**
     * ── POURQUOI CE CAS EXISTE, ET POURQUOI IL EST SÉPARÉ ──
     *
     * Le refus vit dans `db.js`, aux quatre accès absolus : c'est le seul point
     * qu'aucun appelant ne peut contourner, et la mesure du collatéral l'a
     * autorisé — les vingt appels existants visent tous les trois racines
     * privées, aucun accès absolu ne doit survivre au bac à sable.
     *
     * Mais un refus enfoui est INVISIBLE au point d'appel. S'il rendait `null`,
     * l'appelant lirait « il n'y a rien » — et on retomberait exactement sur le
     * défaut qu'on corrige, déplacé d'un cran : un vide qui se lit comme une
     * présence sans contenu, et un écran qui invite à saisir.
     *
     * La propriété est donc que la promesse REJETTE. C'est ce qui force
     * l'appelant à traiter le cas plutôt qu'à l'ignorer, et c'est ce qui rend
     * la panne lisible depuis un téléphone.
     */
    await ouvrir(page, { sandbox: true });
    expect(await espace(page), 'prémisse').toBe('sandbox');
    const p = moisCourant();

    const issue = await page.evaluate(async (periode) => {
      const { dbGetAbsolu } = await import('/js/db.js');
      try {
        const valeur = await dbGetAbsolu(`prive/vous/periods/${periode}/depenses`);
        return { rejete: false, valeur: valeur === null ? 'null' : typeof valeur };
      } catch (erreur) {
        return { rejete: true, message: String(erreur?.message || erreur) };
      }
    }, p);

    expect(issue.rejete,
      `la lecture a rendu « ${issue.valeur} » au lieu de rejeter — un appelant y lirait un espace vide`)
      .toBe(true);

    // L'erreur doit être NOMMÉE : « undefined is not a function » ferait chercher
    // un défaut de code là où il y a un refus délibéré.
    expect(issue.message, `l'erreur ne dit pas pourquoi : « ${issue.message} »`)
      .toMatch(/bac à sable|priv/i);
  });
});
