import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * « À deux » montre le COMMUN, et rien d'autre — lot P2
 *
 * Le sélecteur de portée existait depuis le lot 5, et il ne filtrait pas la
 * liste : « À deux » rendait le commun ET le personnel, avec un badge « perso »
 * et un second total en pied. La commande promettait un filtre qu'elle
 * n'appliquait pas.
 *
 * ## LE PIÈGE QUE CE FICHIER EXISTE POUR ATTRAPER
 *
 * Le filtre lit `utils/perimetre.js`, et il ne DÉDUIT JAMAIS le périmètre du
 * payeur : **une charge payée par une personne ET partagée est COMMUNE**
 * (`perimetre.js`, « `paidBy` dit qui a *avancé* l'argent, jamais à qui la
 * dépense *appartient* »). Un filtre écrit sur le payeur — « je ne garde que
 * `partage` » — retirerait de la liste du foyer des dépenses qui pèsent sur le
 * solde, en silence, puisque le solde continuerait de les compter.
 *
 * Le jeu d'essai porte donc **les quatre combinaisons**, et c'est la seule
 * forme qui les sépare :
 *
 * | payeur | périmètre | sous « À deux » |
 * |---|---|---|
 * | vous | partagée | **reste** |
 * | vous | solo | part |
 * | conjointe | partagée | **reste** — c'est elle qu'un filtre par payeur perd |
 * | conjointe | solo | part |
 *
 * Trois sur quatre suffiraient à laisser passer le défaut : sans une dépense
 * payée par une personne et partagée, « je garde ce qui est `partage` » et
 * « je garde ce qui est commun » rendent le même écran.
 *
 * ## LE TÉMOIN POSITIF EST UN CHANGEMENT DE PORTÉE
 *
 * « Ces deux lignes ne sont pas là » est satisfait par un semis qui n'a jamais
 * été écrit, par une liste vide, par une navigation qui a échoué. Le contrôle
 * passe donc sur « Moi ce mois » — que ce lot ne filtre PAS, délibérément — et
 * exige d'y retrouver les quatre. Ce qui prouve à la fois que le semis porte
 * les quatre, qu'elles sont lisibles, et que le changement de portée redessine
 * bien les listes.
 */

const TELEPHONE = { width: 390, height: 844 };
test.use({ viewport: TELEPHONE });

/** Le mois courant, tel que l'application le nomme */
const moisSeme = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Les quatre combinaisons, chacune à SA place réelle en base
 *
 * Depuis le lot P1b, ce n'est pas un marqueur qui met une dépense derrière le
 * mur, c'est son CHEMIN : le personnel de chacun vit sous
 * `personnel/{qui}/periods/…`. Semer une solo dans le commun mesurerait un
 * arbre que l'application n'écrit plus.
 */
async function semerLesQuatre(page) {
  await page.evaluate(async () => {
    const { dbUpdate, dbSet } = await import('/js/db.js');
    const now = new Date();
    const p = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await dbSet('salaries', { vous: 2000, conjointe: 3000 });

    const c = {};
    // Les deux COMMUNES — dont une payée par une personne, et partagée.
    c[`periods/${p}/variableCharges/c1`] = {
      description: 'Courses partagées', amount: 120, category: 'Courses',
      paidBy: 'partage', date: `${p}-02`, deleted: false };
    c[`periods/${p}/variableCharges/c2`] = {
      description: 'Essence avancée par Cindy', amount: 60, category: 'Transport',
      paidBy: 'conjointe', date: `${p}-03`, deleted: false };
    // Les deux PERSONNELLES, une par poche.
    c[`personnel/vous/periods/${p}/variableCharges/s1`] = {
      description: 'Coiffeur à moi', amount: 45, category: 'Courses',
      paidBy: 'vous', perimetre: 'solo', date: `${p}-04`, deleted: false };
    c[`personnel/conjointe/periods/${p}/variableCharges/s2`] = {
      description: 'Magazine de Cindy', amount: 5, category: 'Loisirs',
      paidBy: 'conjointe', perimetre: 'solo', date: `${p}-05`, deleted: false };

    await dbUpdate(undefined, c);
    await window.changePeriod(p);
  });
  await page.waitForTimeout(2500);
}

/**
 * Les libellés des lignes RENDUES dans la liste des charges variables
 *
 * Le texte PROPRE de `.charge-description`, sans ses enfants : l'étiquette
 * « perso » vit à l'intérieur, et `textContent` rendait « Coiffeur à moi
 * perso ». Le cas était rouge sur une égalité de libellé, pour une raison qui
 * n'avait rien à voir avec la propriété — et, plus grave, les assertions
 * d'ABSENCE auraient pu devenir vraies pour la même raison, en vert.
 *
 * C'est la plus petite surface qui contienne encore la propriété : le libellé
 * que la personne lit, et lui seul.
 */
const lignesRendues = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#variableChargesList .charge-item .charge-description')]
    .map(el => [...el.childNodes]
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent)
      .join('')
      .trim()));

/**
 * Change de portée par le segment que l'écran porte
 *
 * `.panneau--actif` et non `.first()` : le sélecteur est rendu dans DEUX
 * panneaux — c'est le doublon que le lot P4 doit refermer —, et le premier du
 * document appartient au Bilan, masqué sous 900 px quand on est sur les
 * charges. `.first()` visait donc un bouton invisible, et le clic expirait à
 * 30 s. C'est l'idiome du dépôt, employé par six autres specs.
 */
async function choisirLaPortee(page, portee) {
  await page.locator(`.panneau--actif [data-portee="${portee}"]`).click();
  await page.waitForTimeout(600);
}

test.describe('La portée filtre la liste', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await semerLesQuatre(page);
    await allerAuPanneau(page, 'panneauCharges');
    await page.waitForTimeout(400);
  });

  test('LES QUATRE COMBINAISONS — « À deux » garde les deux communes', async ({ page }) => {
    const sousDeux = await lignesRendues(page);

    // Les deux communes, dont celle qu'un filtre par payeur perdrait.
    expect(sousDeux).toContain('Courses partagées');
    expect(sousDeux, 'une charge avancée par une personne et partagée est COMMUNE')
      .toContain('Essence avancée par Cindy');

    // Les deux personnelles, dans les deux poches.
    expect(sousDeux).not.toContain('Coiffeur à moi');
    expect(sousDeux).not.toContain('Magazine de Cindy');
    expect(sousDeux).toHaveLength(2);
  });

  test('LE TÉMOIN — « Privé », qui ne filtre pas, les rend toutes les quatre', async ({ page }) => {
    // ⚠️ CE TÉMOIN PASSAIT PAR « MOI », qui ne filtrait pas au lot P2. Elle
    // filtre depuis le lot « Moi », donc il change de portée : « Privé » est
    // désormais la seule qui ne retire rien.
    //
    // Sa raison d'être ne bouge pas : sans lui, les assertions d'absence —
    // ici et dans les deux cas de « Moi » ci-dessous — seraient satisfaites
    // par un semis qui n'a jamais été écrit, ou par une liste qui ne rend
    // rien du tout.
    await choisirLaPortee(page, 'prive');
    const sansFiltre = await lignesRendues(page);

    for (const libelle of ['Courses partagées', 'Essence avancée par Cindy',
      'Coiffeur à moi', 'Magazine de Cindy']) {
      expect(sansFiltre, `« ${libelle} » doit être semée et lisible`).toContain(libelle);
    }

    // Et le retour redessine : le changement de portée agit dans les deux sens.
    await choisirLaPortee(page, 'deux');
    expect(await lignesRendues(page)).toHaveLength(2);
  });

  test('LES QUATRE COMBINAISONS — « Moi ce mois » ne garde QUE ma personnelle', async ({ page }) => {
    await choisirLaPortee(page, 'solo');
    const sousMoi = await lignesRendues(page);

    expect(sousMoi).toEqual(['Coiffeur à moi']);
  });

  test('LE CAS QUI COÛTERAIT DES EUROS, dans l\'autre sens', async ({ page }) => {
    // Un filtre sur le payeur ramènerait sous « Moi » tout ce que j'ai avancé
    // — « Courses partagées » est payée `partage`, mais le grand-livre juste
    // au-dessus compte les deux communes dans « Ta part du commun » et non
    // dans « Tes dépenses solo ». Les afficher ici le contredirait.
    //
    // Et « Magazine de Cindy » est SON personnel : sous un aval actif il est
    // dans l'état, et « Moi ce mois » est MON écran.
    await choisirLaPortee(page, 'solo');
    const sousMoi = await lignesRendues(page);

    expect(sousMoi).not.toContain('Courses partagées');
    expect(sousMoi).not.toContain('Essence avancée par Cindy');
    expect(sousMoi, 'le personnel de l\'autre appartient à la fenêtre de P3')
      .not.toContain('Magazine de Cindy');
  });

  test('sous « Moi », le renvoi nomme « À deux » — et ne chiffre RIEN', async ({ page }) => {
    // La seconde nature du renvoi. Ce qui manquait sous « Moi » n'était pas un
    // chiffre — ma part du commun est déjà dans le grand-livre, deux cartes
    // plus haut — c'était une ADRESSE : « où est passée ma course de 120 € ? »
    await choisirLaPortee(page, 'solo');

    const renvoi = page.locator('#variableChargesRenvoi');
    await expect(renvoi).toBeVisible();
    await expect(renvoi).toContainText(/communes/i);
    expect(await renvoi.innerText(), 'le renvoi du commun ne porte aucun chiffre')
      .not.toMatch(/\d/);

    // Et il MÈNE là où il dit. C'est le tiers du renvoi qui referme le défaut.
    await renvoi.locator('button[data-action="allerALaPortee"]').click();
    await page.waitForTimeout(600);
    expect(await lignesRendues(page)).toHaveLength(2);
  });

  test('sous « Moi », l\'en-tête ne dit QUE ce qu\'il montre', async ({ page }) => {
    // Le défaut que le lot aurait produit sans `coupleDeLaPortee` : l'en-tête
    // annonçait le couple du groupe ENTIER, donc « 120,00 € + 45,00 € perso »
    // au-dessus d'une liste qui ne montre que les 45 €. Le commun du FOYER,
    // sur l'écran qui dit « moi ».
    await choisirLaPortee(page, 'solo');

    const entete = await page.evaluate(() => document.querySelector(
      '#variableChargesList .charge-category[data-categorie="Courses"] .category-total'
    ).textContent.replace(/[\s\u202F\u00A0]/g, ''));

    expect(entete).toBe('45,00€');
  });

  test('sous « Moi », les charges fixes sont vides ET LE DISENT', async ({ page }) => {
    // Le cas NOMINAL : relevé sur la base réelle le 2026-09-17, zéro charge
    // fixe personnelle. La section reste, et sa phrase lève l'ambiguïté qu'une
    // section vide installe — « je n'en ai pas » ou « on ne me les montre
    // pas » ?
    await choisirLaPortee(page, 'solo');

    const fixes = page.locator('#fixedChargesList');
    await expect(fixes.locator('.empty-state')).toBeVisible();
    await expect(fixes).toContainText(/perso/i);
    await expect(fixes, 'la phrase du mois vide ne dit rien de « moi »')
      .not.toContainText('pour cette période');
  });

  test('une catégorie ENTIÈREMENT personnelle disparaît de « À deux »', async ({ page }) => {
    // « Loisirs » ne porte que le magazine de Cindy. Un en-tête sans une seule
    // ligne dessous serait plus déroutant que son absence : l'annotation du
    // total est BORNÉE aux catégories qui gardent quelque chose à montrer, et
    // le renvoi en pied couvre celle-ci.
    const categories = await page.evaluate(() =>
      [...document.querySelectorAll('#variableChargesList .charge-category')]
        .map(b => b.dataset.categorie));

    expect(categories).toContain('Courses');
    expect(categories).toContain('Transport');
    expect(categories).not.toContain('Loisirs');
  });

  test('l\'en-tête baisse ET le dit', async ({ page }) => {
    // « Courses » porte 120 € de commun et 45 € de personnel. Un en-tête qui
    // baisserait en silence prétendrait encore être un chiffre du foyer — c'est
    // le défaut mesuré à la main sur septembre 2026 : 381,75 € dont 10,00 de
    // personnel, sans un mot.
    const entete = await page.evaluate(() => document.querySelector(
      '#variableChargesList .charge-category[data-categorie="Courses"] .category-total'
    ).textContent.replace(/[\s\u202F\u00A0]/g, ''));

    expect(entete).toContain('120,00');
    expect(entete).toContain('45,00');
    expect(entete).toContain('perso');

    // Et « Transport », qui n'en porte pas, ne dit rien : tous les mois déjà en
    // base gardent leur apparence.
    const transport = await page.evaluate(() => document.querySelector(
      '#variableChargesList .charge-category[data-categorie="Transport"] .category-total'
    ).textContent);
    expect(transport).not.toContain('perso');
  });

  test('le renvoi ne chiffre QUE mes dépenses, jamais celles de l\'autre', async ({ page }) => {
    // Le personnel de l'autre, quand un aval le rend lisible, appartient à la
    // fenêtre du lot P3 : il n'a pas de renvoi ici, et le compter ferait dire
    // au pied « 2 dépenses perso (50,00 €) » là où une seule est à moi.
    const renvoi = page.locator('#variableChargesRenvoi');
    await expect(renvoi).toBeVisible();

    // ⚠️ La première rédaction de ce cas interdisait la sous-chaîne « 5,00 € »
    // pour écarter le magazine de Cindy. Elle était FAUSSE, et rouge : « 45,00 €
    // » la contient. Une exclusion de sous-chaîne ne sait pas distinguer un
    // montant d'un morceau d'un autre montant — le total s'ancre, il ne
    // s'exclut pas.
    const texte = (await renvoi.innerText()).replace(/[\s\u202F\u00A0]/g, '');
    expect(texte).toMatch(/1dépenseperso\(45,00€\)/);
    expect(texte).not.toMatch(/\d+dépensesperso/);
    expect(texte).not.toContain('50,00');
  });
});

test.describe('Un mois qui ne porte QUE du personnel', () => {
  /**
   * L'ÉCRAN NE PRÉTEND JAMAIS QU'UN MOIS EST VIDE QUAND IL NE L'EST PAS
   *
   * C'est le seul endroit du lot où le renvoi ne complète pas l'écran mais
   * CORRIGE une affirmation : « Aucune charge variable pour cette période »
   * devient faux dès que le filtre retire quelque chose. Le mois en porte,
   * elles sont ailleurs.
   */
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await page.evaluate(async (p) => {
      const { dbUpdate, dbSet } = await import('/js/db.js');
      await dbSet('salaries', { vous: 2000, conjointe: 3000 });
      await dbUpdate(undefined, {
        [`personnel/vous/periods/${p}/variableCharges/s1`]: {
          description: 'Coiffeur à moi', amount: 45, category: 'Courses',
          paidBy: 'vous', perimetre: 'solo', date: `${p}-04`, deleted: false }
      });
      await window.changePeriod(p);
    }, moisSeme());
    await page.waitForTimeout(2500);
    await allerAuPanneau(page, 'panneauCharges');
    await page.waitForTimeout(400);
  });

  test('il ne s\'annonce pas vide — il dit qu\'il n\'y a rien de COMMUN', async ({ page }) => {
    const liste = page.locator('#variableChargesList');
    await expect(liste.locator('.empty-state')).toBeVisible();
    await expect(liste).not.toContainText('Aucune charge variable pour cette période');
    await expect(liste).toContainText(/commune/i);

    // Et le renvoi dit où elle est, sur la liste vide comme sur une liste
    // peuplée : c'est le même chemin de rendu.
    const renvoi = page.locator('#variableChargesRenvoi');
    await expect(renvoi).toBeVisible();
    await expect(renvoi).toContainText('1 dépense perso');
  });

  test('le TÉMOIN — le mois porte bien quelque chose', async ({ page }) => {
    // Sans lui, « il ne dit pas qu'il est vide » serait satisfait par un écran
    // qui ne dit rien du tout, et par un semis jamais écrit.
    await page.locator('.panneau--actif [data-portee="solo"]').click();
    await page.waitForTimeout(600);
    await expect(page.locator('#variableChargesList')).toContainText('Coiffeur à moi');
  });
});
