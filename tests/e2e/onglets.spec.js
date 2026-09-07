import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Trois destinations plutôt qu'un seul long écran
 *
 * La page principale empilait cinq sections et une rangée de dix boutons
 * d'outils. Sur un téléphone, répondre à « qui doit combien à qui » et
 * corriger une charge de la semaine passée demandaient le même geste : faire
 * défiler jusqu'à trouver.
 *
 * Le découpage suit la question qu'on se pose :
 *
 *     📊 Bilan     — où on en est
 *     🧾 Charges   — ce qu'on a dépensé
 *     ⚙️ Réglages  — ce qui ne bouge presque jamais
 *
 * Le point de rupture est celui qui existait déjà, 900 px : c'est là que la
 * mise en page passe en colonnes. **Au-delà, la barre disparaît et les trois
 * panneaux s'affichent ensemble** — masquer les deux tiers d'un grand écran
 * serait une régression, pas un rangement. Les deux régimes sont éprouvés ici.
 */

const TELEPHONE = { width: 390, height: 844 };
const ORDINATEUR = { width: 1280, height: 900 };

/**
 * De quoi faire paraître la barre de solde
 *
 * Deux salaires et une charge : c'est le minimum pour que `#balanceBar` porte
 * un montant. Les contrôles de géométrie qui mesurent `.bandeau-colle` en ont
 * besoin — sans elle, ils mesurent un bandeau que personne ne voit.
 */
async function semerUnSolde(page) {
  await allerAuPanneau(page, 'panneauReglages');
  await page.locator('#salaireVous').fill('2500');
  await page.locator('#salaireVous').blur();
  await page.locator('#salaireConjointe').fill('1800');
  await page.locator('#salaireConjointe').blur();
  await page.waitForTimeout(600);

  const periode = await page.locator('#periodSelect').inputValue();
  await page.evaluate(async ({ periode }) => {
    const { dbUpdate } = await import('/js/db.js');
    await dbUpdate(undefined, {
      [`periods/${periode}/variableCharges/v1`]: {
        description: 'Courses', amount: 420.5, category: 'Courses',
        paidBy: 'vous', date: `${periode}-03`, deleted: false
      }
    });
    await window.changePeriod(periode);
  }, { periode });
  await page.waitForTimeout(1200);
}

/** Les identifiants des panneaux réellement visibles */
async function panneauxVisibles(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.panneau')]
      .filter((p) => p.getBoundingClientRect().height > 0)
      .map((p) => p.id));
}

test.describe('Sur téléphone — un panneau à la fois', () => {
  test.use({ viewport: TELEPHONE });

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('la barre propose trois destinations', async ({ page }) => {
    await expect(page.locator('#onglets')).toBeVisible();
    await expect(page.locator('.onglet')).toHaveCount(3);
    await expect(page.locator('#onglets')).toContainText('Bilan');
    await expect(page.locator('#onglets')).toContainText('Charges');
    await expect(page.locator('#onglets')).toContainText('Réglages');
  });

  test('l\'application s\'ouvre sur le bilan', async ({ page }) => {
    // L'application répond à une question : elle doit la poser d'entrée.
    expect(await panneauxVisibles(page)).toEqual(['panneauBilan']);
  });

  for (const [nom, id] of [['Bilan', 'panneauBilan'], ['Charges', 'panneauCharges'], ['Réglages', 'panneauReglages']]) {
    test(`toucher « ${nom} » n'affiche que son panneau`, async ({ page }) => {
      await allerAuPanneau(page, id);
      expect(await panneauxVisibles(page)).toEqual([id]);
    });
  }

  test('l\'onglet courant est annoncé, et lui seul', async ({ page }) => {
    // La couleur seule ne suffirait pas — WCAG 1.4.1 — et un lecteur d'écran
    // n'en voit rien. `aria-current` porte l'information, et le liseré la
    // rend visible sans dépendre de la teinte.
    await allerAuPanneau(page, 'panneauCharges');
    await expect(page.locator('.onglet[aria-current="true"]')).toHaveCount(1);
    await expect(page.locator('.onglet[aria-current="true"]')).toContainText('Charges');
  });

  test('changer d\'onglet remonte en haut du nouveau panneau', async ({ page }) => {
    // Sans cela, on quitterait le bas du bilan pour le bas des charges, en
    // paraissant n'avoir rien fait.
    await allerAuPanneau(page, 'panneauReglages');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await allerAuPanneau(page, 'panneauCharges');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('la barre ne recouvre pas la fin du panneau', async ({ page }) => {
    // Le défaut classique d'une barre fixe : la dernière carte passe dessous
    // et devient illisible. `.container` réserve sa hauteur.
    await allerAuPanneau(page, 'panneauReglages');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const { basDuContenu, hautDeLaBarre } = await page.evaluate(() => {
      const panneau = document.getElementById('panneauReglages');
      const barre = document.getElementById('onglets');
      return {
        basDuContenu: panneau.getBoundingClientRect().bottom,
        hautDeLaBarre: barre.getBoundingClientRect().top
      };
    });

    expect(basDuContenu,
      'la dernière carte passe sous la barre d\'onglets').toBeLessThanOrEqual(hautDeLaBarre + 1);
  });

  test('le bouton flottant ne se pose pas sur la barre', async ({ page }) => {
    const chevauchement = await page.evaluate(() => {
      const fab = document.querySelector('.fab');
      const barre = document.getElementById('onglets');
      if (!fab || !barre) return null;
      return fab.getBoundingClientRect().bottom - barre.getBoundingClientRect().top;
    });

    expect(chevauchement, 'aucun bouton flottant trouvé').not.toBeNull();
    expect(chevauchement, 'le bouton flottant recouvre les onglets').toBeLessThanOrEqual(0);
  });

  test('le solde reste lisible depuis les trois onglets', async ({ page }) => {
    // La barre de solde vit hors des panneaux, au-dessus d'eux : c'est ce qui
    // permet de changer d'onglet sans perdre de vue la réponse.
    await allerAuPanneau(page, 'panneauReglages');
    await page.locator('#salaireVous').fill('2000');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('2000');
    await page.locator('#salaireConjointe').blur();
    await page.waitForTimeout(400);

    for (const id of ['panneauBilan', 'panneauCharges', 'panneauReglages']) {
      await allerAuPanneau(page, id);
      const dansUnPanneau = await page.evaluate(() =>
        Boolean(document.getElementById('balanceBar').closest('.panneau')));
      expect(dansUnPanneau, 'la barre de solde a été enfermée dans un panneau').toBe(false);
    }
  });

  test('la saisie rapide reste joignable depuis n\'importe quel onglet', async ({ page }) => {
    // Le geste le plus fréquent de l'application ne doit dépendre d'aucun
    // onglet : le bouton flottant et sa modale vivent hors des panneaux.
    for (const id of ['panneauBilan', 'panneauCharges', 'panneauReglages']) {
      await allerAuPanneau(page, id);
      await page.locator('.fab').click();
      await expect(page.locator('#modalQuickAdd')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#modalQuickAdd')).toBeHidden();
    }
  });
});

test.describe('Ce que chaque onglet porte', () => {
  test.use({ viewport: TELEPHONE });

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('le bilan ne garde que les lectures du mois', async ({ page }) => {
    // Dix boutons se disputaient cette rangée. N'y restent que les enveloppes
    // et le privé — la carte s'ajoute quand une dépense est localisée.
    const boutons = await page.locator('.acces-rapides .btn:visible').allInnerTexts();
    expect(boutons.length).toBeLessThanOrEqual(3);
    expect(boutons.join(' ')).toContain('Enveloppes');
    expect(boutons.join(' ')).toContain('Privé');
  });

  test('les huit autres outils sont dans les réglages, groupés', async ({ page }) => {
    await allerAuPanneau(page, 'panneauReglages');
    const reglages = page.locator('#panneauReglages');

    for (const outil of ['Catégories', 'Destinations', 'Sauvegarde', 'Corbeille', 'Export CSV', 'Imprimer PDF']) {
      await expect(reglages, `« ${outil} » introuvable dans les réglages`).toContainText(outil);
    }

    // Groupés, et non alignés à égalité : un intitulé au-dessus de deux
    // boutons se lit d'un coup d'œil, huit boutons en file se lisent un par un.
    const titres = (await reglages.locator('.outils-titre').allInnerTexts()).map((t) => t.toLowerCase());
    expect(titres).toEqual(['vos listes', 'vos données', 'sortir les données']);
  });

  test('les rappels ont quitté l\'écran d\'accueil', async ({ page }) => {
    // Trois bascules qu'on arme une fois n'ont rien à faire sur l'écran qu'on
    // ouvre dix fois par semaine.
    await expect(page.locator('#panneauBilan')).not.toContainText('Rappels');
    await allerAuPanneau(page, 'panneauReglages');
    await expect(page.locator('#panneauReglages')).toContainText('Rappels');
  });

  test('« Renseigner les salaires » traverse la frontière entre deux onglets', async ({ page }) => {
    // Le seul bouton de l'application qui vise un champ d'un autre panneau.
    // Sans changement d'onglet, `scrollIntoView` n'a nulle part où aller et
    // `focus()` échoue en silence : le bouton serait resté visible et inerte,
    // exactement là où l'application réclame une action. Défaut trouvé sur
    // une capture d'écran, pas dans le code.
    const bouton = page.locator('[data-action="focusSalaires"], [data-action="focusSalaries"]');
    await expect(bouton).toBeVisible();
    await bouton.click();

    await expect(page.locator('#panneauReglages')).toBeVisible();
    await expect(page.locator('#salaireVous')).toBeVisible();
    await expect(page.locator('#salaireVous')).toBeFocused({ timeout: 3000 });
  });

  test('les trois listes de charges tiennent dans un seul onglet', async ({ page }) => {
    await allerAuPanneau(page, 'panneauCharges');
    const charges = page.locator('#panneauCharges');
    await expect(charges).toContainText('Charges Variables');
    await expect(charges).toContainText('Charges Fixes');
    await expect(charges).toContainText('Remboursements');
  });
});

test.describe('L\'en-tête, et ce qu\'il coûte', () => {
  test.use({ viewport: TELEPHONE });

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  /**
   * La hauteur d'un élément RENDU, marges comprises
   *
   * Elle rendait `0` pour un élément sans géométrie, sous un commentaire qui
   * l'annonçait — « nulle s'il est masqué ». Or son unique lecteur demande
   * `toBeLessThan(100)`, et `0 < 100` est vrai : un en-tête devenu invisible
   * passait pour un en-tête qui tient sur une ligne. La seule mesure de ce
   * fichier qui puisse tomber en silence, et elle tombait du bon côté.
   *
   * Zéro n'est pas une hauteur : c'est l'absence de mesure. Absent du document
   * ou présent sans géométrie, le résultat est le même — `null`, que
   * `toBeLessThan` REJETTE bruyamment. La distinction est portée par le
   * message, pas par une valeur qu'un opérateur de comparaison accepterait.
   *
   * Ce que cela ne couvre pas, et c'est mesuré : `visibility: hidden` laisse la
   * géométrie intacte. Un en-tête invisible mais toujours mis en page occupe
   * réellement sa place, et « tient sur une ligne » garde alors son sens.
   *
   * @returns {Promise<number|null>} La hauteur, ou `null` si rien n'est rendu
   */
  async function hauteurDe(page, selecteur) {
    return page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.height === 0) return null;
      const style = getComputedStyle(el);
      return Math.round(r.height + parseFloat(style.marginTop) + parseFloat(style.marginBottom));
    }, selecteur);
  }

  test('l\'en-tête tient sur une ligne, sous la barre des 100 px', async ({ page }) => {
    // Mesuré avant correction : 159 px pour une marque et un nom de compte,
    // sur trois rangées centrées. Le seuil est large à dessein — ce qui est
    // verrouillé, c'est « une ligne », pas un pixel précis.
    const entete = await hauteurDe(page, '#mainApp > header');

    // Deux moitiés d'une même propriété, et la première n'était pas dite :
    // « tient sur une ligne » présuppose « est là ». Sans elle, la seule façon
    // de satisfaire ce contrôle à coup sûr serait de faire disparaître ce
    // qu'il mesure.
    expect(entete, 'aucun en-tête rendu : il n\'y a rien à mesurer').not.toBeNull();
    expect(entete, `l'en-tête mesure ${entete} px`).toBeLessThan(100);
  });

  test('TÉMOIN — un en-tête masqué ne passe pas pour un en-tête compact', async ({ page }) => {
    // Le contrôle ci-dessus doit pouvoir ÉCHOUER. Tant que la mesure rendait
    // `0`, le rendre inattaquable ne demandait pas de compacter l'en-tête : il
    // suffisait de le retirer de l'écran, et « 0 px, sous la barre des 100 »
    // s'affichait comme une réussite.
    //
    // `display: none` et non `visibility: hidden` : c'est la GÉOMÉTRIE nulle
    // qui est en cause, et la seconde la laisse entière.
    await page.addStyleTag({ content: '#mainApp > header { display: none !important; }' });

    expect(
      await hauteurDe(page, '#mainApp > header'),
      'un en-tête sans géométrie rend une hauteur, donc un chiffre comparable'
    ).toBeNull();
  });

  // « moins d'un quart de l'écran avant le premier contenu » a quitté ce
  // groupe : il ne tournait qu'à 390 px sur le mois courant, soit un cas sur
  // quatre. Il vit désormais dans son propre bloc, plus bas, aux deux largeurs
  // et dans les deux états du mois.

  test('au défilement, le mois reste épinglé en haut', async ({ page }) => {
    // Le défaut que cela corrige : passé le premier écran, plus rien ne disait
    // quel mois on lisait.
    await allerAuPanneau(page, 'panneauCharges');
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(400);

    const bandeau = await page.locator('.bandeau-colle').boundingBox();
    expect(bandeau, 'le bandeau a disparu').not.toBeNull();
    expect(bandeau.y, 'le bandeau est parti avec la page').toBeLessThanOrEqual(1);
    await expect(page.locator('#periodSelect')).toBeInViewport();
  });

  test('le bandeau épinglé reste mince', async ({ page }) => {
    /**
     * IL NE SEMAIT AUCUN SALAIRE, ET IL MESURAIT DONC UN AUTRE ÉCRAN.
     *
     * `.bandeau-colle` réunit le sélecteur de mois ET la barre de solde. Sans
     * salaires, `#balanceBar` reste vide : le contrôle mesurait **54 px** là où
     * un foyer réel en voit **103**. Quarante-neuf pixels de budget qui
     * n'existaient pas.
     *
     * Ce n'est pas une imprécision, c'est un seuil qui valide des agencements
     * cassés à l'écran. Mesuré sur les agencements du chantier de refonte :
     * poser le sélecteur de portée DANS le bandeau donne **108 px sans solde**
     * — vert — et **163 px avec** — rouge, très au-delà des 120. Le contrôle
     * aurait laissé passer exactement ce qu'il existe pour empêcher.
     *
     * Le seuil ne bouge pas : c'est la mise en place qui s'étend, pour qu'il
     * porte sur l'écran que les gens voient. Mesuré après renforcement :
     * **103 px**, dix-sept de marge.
     */
    await semerUnSolde(page);

    await allerAuPanneau(page, 'panneauCharges');
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(500);

    // La prémisse, et elle porte tout le renforcement : sans barre de solde
    // rendue, ce cas remesure l'écran d'avant sans que rien ne le dise.
    const solde = await page.locator('#balanceBar').boundingBox();
    expect(solde, 'prémisse : aucune barre de solde rendue — le bandeau mesuré n\'est pas celui du foyer')
      .not.toBeNull();
    expect(solde.height, 'prémisse : la barre de solde est là mais sans hauteur')
      .toBeGreaterThan(0);

    const bandeau = await page.locator('.bandeau-colle').boundingBox();
    expect(bandeau.height, `le bandeau épinglé mesure ${Math.round(bandeau.height)} px`)
      .toBeLessThan(120);
  });

  test('le bandeau du mois se compacte au défilement, et se rétablit', async ({ page }) => {
    /**
     * CE CAS A CHANGÉ DE SUJET, ET L'ARGUMENT EST ÉCRIT ICI.
     *
     * Il mesurait « l'indication de période s'efface au défilement, et
     * revient » : `#periodInfo` portait « 📁 Mois archivé — modifiable », et une
     * règle l'effaçait sous `body[data-defile="true"]`.
     *
     * Cette rangée n'existe plus. Elle coûtait 28 px de premier écran à chaque
     * visite d'un mois passé, et elle confondait deux informations : l'ÉTAT est
     * passé dans le libellé du mois, la LEVÉE DE MALENTENDU dans un toast à
     * l'arrivée (cf. `mois-archive.spec.js`, qui tient les deux).
     *
     * Le laisser tel quel l'aurait rendu rouge sur un sélecteur absent — un
     * échec qui n'aurait rien appris. Le supprimer aurait laissé la compaction
     * du bandeau sans aucun contrôle, alors qu'elle existe toujours et qu'elle
     * est ce qui garde le mois sous les yeux sans manger l'écran.
     *
     * Ce qui est mesuré est donc la propriété qui SURVIT : le bandeau se
     * resserre quand on descend, et reprend sa taille quand on remonte. C'est
     * une géométrie, pas la présence d'un texte — elle ne dépend d'aucun libellé
     * et survivra au prochain déplacement.
     */
    await allerAuPanneau(page, 'panneauCharges');

    const hauteurDuBandeau = () => page.evaluate(() => {
      const el = document.querySelector('.period-navigation');
      return el ? Math.round(el.getBoundingClientRect().height) : null;
    });

    const auRepos = await hauteurDuBandeau();
    expect(auRepos, 'aucun bandeau de période rendu').not.toBeNull();

    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(500);
    const compact = await hauteurDuBandeau();

    expect(await page.evaluate(() => document.body.dataset.defile)).toBe('true');
    expect(compact, `au repos ${auRepos} px, au défilement ${compact} px — le bandeau ne se compacte pas`)
      .toBeLessThan(auRepos);
    // Il se resserre, il ne disparaît pas : c'est ce qui garde le mois lisible.
    await expect(page.locator('#periodSelect')).toBeInViewport();

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.body.dataset.defile)).toBeUndefined();
    expect(await hauteurDuBandeau(), 'le bandeau ne reprend pas sa taille en remontant')
      .toBe(auRepos);
  });

  test('le solde s\'empile sous le mois, sans le recouvrir', async ({ page }) => {
    // Les deux sont collés ensemble plutôt que chacun de son côté : décalés à
    // la main, il aurait fallu un nombre exact que l'état compact fait mentir.
    await allerAuPanneau(page, 'panneauReglages');
    await page.locator('#salaireVous').fill('2000');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('2000');
    await page.locator('#salaireConjointe').blur();
    await page.waitForTimeout(600);

    await allerAuPanneau(page, 'panneauCharges');
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(500);

    const chevauchement = await page.evaluate(() => {
      const mois = document.querySelector('.period-navigation').getBoundingClientRect();
      const solde = document.getElementById('balanceBar').getBoundingClientRect();
      if (solde.height === 0) return null;
      return Math.round(mois.bottom - solde.top);
    });
    if (chevauchement !== null) {
      expect(chevauchement, 'le solde recouvre le sélecteur de mois').toBeLessThanOrEqual(1);
    }
  });
});

/**
 * Ce que le chrome coûte avant le premier contenu — AUX DEUX LARGEURS, ET DANS
 * LES DEUX ÉTATS DU MOIS.
 *
 * Le cas d'origine vivait dans « L'en-tête, et ce qu'il coûte », et il ne
 * tournait qu'à **390 px sur le mois courant** : un cas sur quatre, et le plus
 * confortable des quatre. Mesuré sur les quatre :
 *
 *        mois courant    mois archivé
 *   390     157 px 19 %     176 px 21 %
 *   320     157 px 22 %     176 px **24 %**
 *
 * L'écran le plus serré n'est pas celui qu'il visitait. À 320 px sur un mois
 * archivé — où une rangée portait « Mois archivé » et poussait tout de 19 px —
 * il ne restait que **quatre pixels** avant le seuil.
 *
 * Ces 19 px sont partis depuis : l'état du mois vit dans son libellé, la levée
 * de malentendu dans un toast (`mois-archive.spec.js`). Les chiffres ci-dessus
 * sont donc l'état du 2026-09-06, gardés parce qu'ils expliquent pourquoi ce
 * bloc existe — pas parce qu'ils décrivent l'écran d'aujourd'hui.
 *
 * Le seuil ne bouge pas. C'est la couverture qui s'étend, et la mesure qui
 * l'étend est écrite ci-dessus. Ce que ça change : l'agencement retenu pour le
 * sélecteur de portée mesure **23 % à 320 sur le mois courant** — vert — et
 * **27 % sur un mois archivé** — rouge. Sans ce bloc, le lot suivant aurait pu
 * livrer un écran qui déborde sans qu'aucun contrôle ne le dise.
 */
for (const { nom, viewport } of [
  { nom: '390', viewport: TELEPHONE },
  { nom: '320', viewport: { width: 320, height: 720 } }
]) {
  test.describe(`Le premier écran — ${nom} px`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      await setupFirebaseMock(page);
      await waitForApp(page);
    });

    /**
     * Le haut de la première carte du bilan, en part de fenêtre.
     *
     * La prémisse n'est pas décorative : mesuré depuis un autre panneau,
     * `#panneauBilan .card` est en `display: none` et rend un `top` de **0** —
     * et `0 < 0.25` est vrai. Un contrôle qui se satisfait d'un panneau non
     * rendu mesure le pire cas comme le meilleur. Éprouvé en écrivant ce bloc :
     * la première version de la sonde a rendu « 0 px = 0 % » depuis Réglages.
     */
    async function partAvantLeContenu(page) {
      await expect(
        page.locator('#panneauBilan'),
        'prémisse : le bilan doit être le panneau rendu — sinon sa carte mesure 0'
      ).toHaveClass(/panneau--actif/);

      const mesure = await page.evaluate(() => {
        const carte = document.querySelector('#panneauBilan .card');
        if (!carte) return null;
        const r = carte.getBoundingClientRect();
        return { avant: Math.round(r.top), hauteur: Math.round(r.height), fenetre: window.innerHeight };
      });

      expect(mesure, 'prémisse : aucune carte dans le bilan').not.toBeNull();
      expect(mesure.hauteur, 'prémisse : la carte du bilan n\'a aucune hauteur').toBeGreaterThan(0);
      return mesure;
    }

    test('moins d\'un quart de l\'écran avant le premier contenu — mois courant', async ({ page }) => {
      // Mesuré avant le découpage en onglets : 294 px sur 844, soit 35 % — et ce
      // péage se repaie à chaque changement d'onglet, qui remonte en haut.
      const { avant, fenetre } = await partAvantLeContenu(page);
      const part = avant / fenetre;
      expect(part, `${avant} px sur ${fenetre}, soit ${Math.round(part * 100)} %`).toBeLessThan(0.25);
    });

    test('moins d\'un quart de l\'écran avant le premier contenu — mois archivé', async ({ page }) => {
      // C'était l'état le plus serré des quatre, et celui que le contrôle ne
      // visitait pas : la rangée « 📁 Mois archivé » y poussait tout le contenu
      // de 19 px.
      //
      // Cette rangée n'existe plus, et l'écart avec le mois courant est tombé à
      // ZÉRO — c'est `mois-archive.spec.js` qui tient cette égalité. Le cas
      // reste ici quand même : il mesure le budget d'un mois passé, et rien ne
      // garantit qu'un lot futur ne lui rendra pas un coût propre.
      await page.locator('[data-action="navigatePeriod"][data-arg="-1"]').click();
      await page.waitForTimeout(900);

      // La prémisse porte désormais sur le LIBELLÉ, où l'état a déménagé. Sans
      // elle, une flèche qui ne répond plus ferait remesurer le mois courant
      // sous le titre « mois archivé » — le contrôle resterait vert en ayant
      // visité deux fois la même surface.
      await expect(
        page.locator('#periodSelect'),
        'prémisse : sans marqueur de mois révolu, ce cas remesure le mois courant'
      ).toContainText('📁');

      const { avant, fenetre } = await partAvantLeContenu(page);
      const part = avant / fenetre;
      expect(part, `${avant} px sur ${fenetre}, soit ${Math.round(part * 100)} %`).toBeLessThan(0.25);
    });
  });
}

test.describe('Sur grand écran — la barre s\'efface', () => {
  test.use({ viewport: ORDINATEUR });

  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('aucune barre d\'onglets', async ({ page }) => {
    await expect(page.locator('#onglets')).toBeHidden();
  });

  test('les trois panneaux sont affichés ensemble', async ({ page }) => {
    // La régression qu'on veut empêcher : appliquer le découpage mobile à un
    // écran de 1280 px reviendrait à cacher les deux tiers du contenu alors
    // qu'il y a la place de tout montrer.
    expect((await panneauxVisibles(page)).sort())
      .toEqual(['panneauBilan', 'panneauCharges', 'panneauReglages']);
  });

  test('les salaires restent joignables sans toucher un onglet', async ({ page }) => {
    await expect(page.locator('#salaireVous')).toBeVisible();
    await page.locator('#salaireVous').fill('2500');
    expect(await page.locator('#salaireVous').inputValue()).toBe('2500');
  });
});

test.describe('À l\'impression, tout se montre', () => {
  test.use({ viewport: TELEPHONE });

  test('les trois panneaux paraissent, la barre non', async ({ page }) => {
    // `export.js` construit sa propre page dans une nouvelle fenêtre : l'export
    // PDF ne dépend pas de ceci. Mais un Ctrl+P sur la page vivante ne doit pas
    // rendre le seul onglet ouvert — une feuille de comptes amputée des deux
    // tiers sans le dire est pire qu'une impression refusée.
    await setupFirebaseMock(page);
    await waitForApp(page);
    await page.emulateMedia({ media: 'print' });

    expect((await panneauxVisibles(page)).sort())
      .toEqual(['panneauBilan', 'panneauCharges', 'panneauReglages']);
    await expect(page.locator('#onglets')).toBeHidden();
  });
});

/**
 * La carte du mois est compactée sous 900 px — et elle ne l'était pas
 *
 * `onglets.css:315` déclare, sous 900 px :
 *
 *     .period-navigation { padding: var(--space-sm) var(--space-md); }
 *
 * avec son intention écrite à côté — « le sélecteur au repos : resserré, pas
 * amputé ». Elle n'a jamais rien fait sur un téléphone.
 *
 * `responsive.css` déclare `@media (max-width: 600px) { .card { padding:
 * var(--space-md) } }`. Le fichier charge **après** `onglets.css`, la
 * spécificité est la même — (0,1,0) contre (0,1,0) — et l'élément porte
 * `class="card period-navigation"`. C'est donc la dernière déclarée qui gagne,
 * et elle rend le rembourrage de carte pleine taille.
 *
 * Résultat mesuré le 2026-09-07 : **16 px de rembourrage vertical au lieu de
 * 8**, à 320 comme à 390 px, soit **16 px de premier écran perdus sur tout
 * téléphone**. La règle fonctionne entre 601 et 899 px — une tablette — et
 * nulle part ailleurs.
 *
 * Ce que ce bloc verrouille est la PROPRIÉTÉ, pas la règle : « la carte du mois
 * est compactée partout sous 900 px ». Un contrôle qui vérifierait la présence
 * du sélecteur `.card.period-navigation` dans une feuille survivrait à sa
 * suppression par une future refonte du CSS ; celui-ci mesure ce que le
 * navigateur applique.
 *
 * Les trois largeurs ne sont pas décoratives : 320 et 390 sont les deux qui
 * étaient cassées, 700 est celle qui marchait déjà. Sans elle, un correctif qui
 * casserait la tablette pour réparer le téléphone passerait au vert.
 */
for (const largeur of [320, 390, 700]) {
  test.describe(`La carte du mois compactée — ${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: 720 } });

    test.beforeEach(async ({ page }) => {
      await setupFirebaseMock(page);
      await waitForApp(page);
    });

    test('son rembourrage vertical vaut --space-sm, pas celui d\'une carte pleine', async ({ page }) => {
      const mesure = await page.evaluate(() => {
        const el = document.querySelector('.period-navigation');
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          haut: s.paddingTop,
          bas: s.paddingBottom,
          attendu: getComputedStyle(document.documentElement)
            .getPropertyValue('--space-sm').trim()
        };
      });

      // La prémisse : sans la carte, il n'y a rien à mesurer — et `null` ne se
      // compare pas en silence.
      expect(mesure, 'aucune carte de période rendue').not.toBeNull();

      expect(mesure.haut, `rembourrage haut ${mesure.haut} pour ${mesure.attendu} attendu`)
        .toBe(mesure.attendu);
      expect(mesure.bas, `rembourrage bas ${mesure.bas} pour ${mesure.attendu} attendu`)
        .toBe(mesure.attendu);
    });
  });
}

test.describe('La carte du mois compactée — TÉMOIN au-delà de 900 px', () => {
  test.use({ viewport: ORDINATEUR });

  /**
   * Le témoin positif du bloc ci-dessus.
   *
   * Sans lui, « le rembourrage vaut 8 px » pourrait être satisfait par un CSS
   * qui compacte la carte du mois PARTOUT — ce qui n'est pas la propriété
   * voulue, et retirerait de l'air à un écran qui en a. Ce cas exige que la
   * compaction reste bornée aux petites largeurs.
   *
   * IL N'EXIGE PAS UNE VALEUR PRÉCISE, et c'est mesuré plutôt que supposé.
   * Une première rédaction attendait `--space-md`, parce que
   * `components.css:214` déclare `.period-navigation { padding: var(--space-md) }`.
   * Le navigateur rend **24 px**, soit `--space-lg` : `.card` (ligne 289) est
   * déclarée APRÈS, à spécificité égale, et l'emporte — exactement le même
   * mécanisme que le défaut corrigé ici, mais dans le sens qui aère.
   *
   * Figer 24 px enregistrerait cet écrasement comme une intention. Ce qu'on
   * tient est la borne : la compaction ne franchit pas 900 px.
   */
  test('elle reprend un rembourrage plein, la place ne manquant plus', async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);

    const mesure = await page.evaluate(() => {
      const el = document.querySelector('.period-navigation');
      const s = getComputedStyle(el);
      const racine = getComputedStyle(document.documentElement);
      return {
        haut: parseFloat(s.paddingTop),
        sm: parseFloat(racine.getPropertyValue('--space-sm'))
      };
    });

    expect(
      mesure.haut,
      `rembourrage ${mesure.haut} px pour ${mesure.sm} px de compaction — `
      + 'la compaction mobile déborde sur le grand écran'
    ).toBeGreaterThan(mesure.sm);
  });
});
