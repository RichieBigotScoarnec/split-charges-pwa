import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Le sélecteur de portée — sur quel argent l'écran porte
 *
 * Trois segments sous le bandeau : « À deux », « Moi », « Privé ». Ils vivent
 * dans `panneauBilan` et `panneauCharges`, et **nulle part sur Réglages**.
 *
 * ## Ce que ces contrôles tiennent, et ce qu'ils ne tiennent pas
 *
 * Ils tiennent des PROPRIÉTÉS, pas des surfaces. « L'écran de Réglages ne
 * porte nulle part de quoi changer de portée » se cherche dans tout le
 * document pendant que Réglages est le panneau rendu — pas dans un
 * identifiant, qu'un remaniement renommerait sans rien casser d'observable.
 *
 * Le seul contrat de balisage qu'ils imposent est un **attribut propre**,
 * `data-portee`, porté par chaque segment et valant l'une des trois portées de
 * `utils/portee.js`. Un contrat est nécessaire — sans lui il n'y a rien à
 * chercher — et celui-ci est le plus petit possible : il survit au renommage
 * du conteneur, de la classe et du module.
 *
 * ## Pourquoi un attribut propre, et non `data-action`
 *
 * `utils/onglets.js` a tranché exactement ce cas, et son raisonnement est
 * écrit en tête de fichier : la délégation d'`init.js` « résout un nom de
 * fonction sur `window` depuis un attribut du DOM, surface qu'une liste
 * blanche de 43 actions borne précisément », et un onglet « n'a pas besoin de
 * cette puissance ». Un segment de portée non plus : il désigne une valeur
 * d'énumération, que `porteeValide` vérifie avant d'agir. Rien à ajouter à la
 * liste blanche, donc rien de plus à atteindre par une injection HTML.
 *
 * Ce raisonnement n'est pas recopié ici — il est cité, et il vit là-bas.
 *
 * ## La portée est un FILTRE, pas une destination
 *
 * C'est la décision que le lot doit écrire, et elle a un frère : « dix
 * allers-retours d'onglet ne coûtent qu'UN retour » (`retour-arriere.spec.js`).
 * La barre d'onglets empile une couche parce qu'un onglet est une
 * **destination** — on y va, on en revient. Une portée ne se quitte pas : elle
 * change ce que l'écran montre, comme un mois. Changer de mois n'empile rien
 * non plus.
 *
 * Sans cette décision écrite, la phrase des onglets se retrouverait avec un
 * frère que personne n'a énoncé, et le premier qui ajoutera `empilerCouche`
 * dans le sélecteur aura l'air d'avoir raison.
 */

const PORTEES = ['deux', 'solo', 'prive'];

const TELEPHONE = { width: 390, height: 844 };

/** Les segments de portée RENDUS, où qu'ils soient dans le document */
const segmentsRendus = (page) => page.evaluate(() =>
  [...document.querySelectorAll('[data-portee]')]
    .filter((el) => el.checkVisibility && el.checkVisibility())
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })
    .map((el) => ({
      portee: el.getAttribute('data-portee'),
      texte: el.innerText.trim(),
      actif: el.getAttribute('aria-checked') === 'true'
        || el.getAttribute('aria-current') === 'true'
        || el.getAttribute('aria-selected') === 'true',
      panneau: el.closest('.panneau')?.id || null
    })));

/** Ce que l'état retient */
const porteeDeLEtat = (page) => page.evaluate(async () => {
  const { getState } = await import('/js/state.js');
  return getState('porteeCourante');
});

async function ouvrir(page) {
  await setupFirebaseMock(page);
  await waitForApp(page);
}

test.describe('Où la portée est offerte', () => {
  test.use({ viewport: TELEPHONE });

  test.beforeEach(async ({ page }) => {
    await ouvrir(page);
  });

  for (const panneau of ['panneauBilan', 'panneauCharges']) {
    test(`${panneau} offre les trois portées, et elles sont annoncées`, async ({ page }) => {
      await allerAuPanneau(page, panneau);
      const segments = await segmentsRendus(page);

      expect(segments.map((s) => s.portee).sort(), 'les trois portées, et rien d\'autre')
        .toEqual([...PORTEES].sort());
      expect(segments.every((s) => s.panneau === panneau),
        `un segment est rendu hors de ${panneau}`).toBe(true);

      // La couleur seule ne suffit pas — WCAG 1.4.1, le même raisonnement que
      // `aria-current` sur la barre d'onglets. Exactement un segment actif :
      // zéro ne dirait pas où l'on est, deux se contrediraient.
      expect(segments.filter((s) => s.actif),
        'l\'état actif n\'est pas annoncé, ou il l\'est deux fois').toHaveLength(1);
    });
  }

  test('l\'écran de RÉGLAGES ne porte nulle part de quoi changer de portée', async ({ page }) => {
    // ── LA PRÉMISSE FAIT TOUT LE TRAVAIL ──
    //
    // « Réglages n'a pas de sélecteur » est satisfait par une application qui
    // n'en a nulle part — c'est-à-dire par l'état d'avant ce lot. Sans la
    // prémisse, ce cas passerait au vert aujourd'hui et resterait vert le jour
    // où le sélecteur disparaîtrait de partout : la règle 1, appliquée à une
    // absence.
    await allerAuPanneau(page, 'panneauBilan');
    expect(await segmentsRendus(page),
      'prémisse : sans sélecteur sur le bilan, ce cas ne mesure rien')
      .toHaveLength(3);

    await allerAuPanneau(page, 'panneauReglages');

    // La recherche porte sur TOUT le document, pas sur le sous-arbre du
    // panneau : un sélecteur rendu ailleurs mais visible depuis Réglages
    // gouvernerait quand même une portée que cet écran n'a pas.
    expect(await segmentsRendus(page),
      'Réglages laisse une commande de portée à l\'écran').toEqual([]);
  });

  test('le sélecteur n\'est ni un panneau ni une destination', async ({ page }) => {
    // Les trois identifiants, leurs `data-panneau` et la classe `.onglet` ne
    // bougent pas : `allerAuPanneau` lève si une destination disparaît, et
    // c'est lui qu'on vient d'employer. Ce cas tient l'autre sens — le
    // sélecteur ne s'ajoute pas à la navigation.
    const compte = await page.evaluate(() => ({
      panneaux: document.querySelectorAll('.panneau').length,
      onglets: document.querySelectorAll('.onglet').length,
      segmentsQuiSontDesOnglets:
        document.querySelectorAll('[data-portee].onglet, [data-portee][data-panneau]').length
    }));

    expect(compte.panneaux, 'un panneau est apparu ou a disparu').toBe(3);
    expect(compte.onglets, 'une destination est apparue ou a disparu').toBe(3);
    expect(compte.segmentsQuiSontDesOnglets,
      'un segment de portée se fait passer pour une destination').toBe(0);
  });
});

test.describe('Une seule source : porteeCourante', () => {
  test.use({ viewport: TELEPHONE });

  test.beforeEach(async ({ page }) => {
    await ouvrir(page);
    await allerAuPanneau(page, 'panneauBilan');
  });

  test('toucher un segment écrit la portée dans l\'état', async ({ page }) => {
    expect(await porteeDeLEtat(page), 'prémisse : l\'application ouvre « à deux »')
      .toBe('deux');

    await page.locator('[data-portee="solo"]').click();
    await page.waitForTimeout(400);

    expect(await porteeDeLEtat(page)).toBe('solo');
  });

  test('le segment annoncé actif est celui que l\'état retient', async ({ page }) => {
    // La seconde source est le défaut que ce lot doit ne pas créer : un
    // segment peint depuis un clic, et un état écrit à côté, finissent par se
    // contredire. On lit les deux, et on exige qu'ils disent la même chose.
    for (const portee of PORTEES) {
      await page.locator(`[data-portee="${portee}"]`).click();
      await page.waitForTimeout(400);

      const segments = await segmentsRendus(page);
      const actifs = segments.filter((s) => s.actif).map((s) => s.portee);

      expect(actifs, `portée « ${portee} » : l'écran n'annonce pas un actif unique`)
        .toEqual([portee]);
      expect(await porteeDeLEtat(page),
        `portée « ${portee} » : l'état dit autre chose que l'écran`).toBe(portee);
    }
  });

  test('la portée suit d\'un panneau à l\'autre', async ({ page }) => {
    // Une portée par panneau serait une seconde source déguisée : le bilan
    // montrerait le solo pendant que les charges montrent le commun, et le
    // total ne correspondrait plus à la liste.
    await page.locator('[data-portee="solo"]').click();
    await page.waitForTimeout(400);

    await allerAuPanneau(page, 'panneauCharges');
    const segments = await segmentsRendus(page);

    expect(segments.filter((s) => s.actif).map((s) => s.portee)).toEqual(['solo']);
    expect(await porteeDeLEtat(page)).toBe('solo');
  });

  test('la portée survit au changement de mois', async ({ page }) => {
    // La décision est écrite dans `utils/portee.js`
    // (`porteeApresChangementDeMois`) : elle PERSISTE, parce que comparer son
    // solo d'un mois à l'autre est un seul geste. Ce cas la rend observable.
    await page.locator('[data-portee="solo"]').click();
    await page.waitForTimeout(400);

    await page.locator('[data-action="navigatePeriod"][data-arg="-1"]').click();
    await page.waitForTimeout(900);

    expect(await porteeDeLEtat(page), 'changer de mois a ramené la portée').toBe('solo');
    expect((await segmentsRendus(page)).filter((s) => s.actif).map((s) => s.portee))
      .toEqual(['solo']);
  });
});

test.describe('La portée est un filtre, pas une destination', () => {
  test.use({ viewport: TELEPHONE });

  test.beforeEach(async ({ page }) => {
    await ouvrir(page);
  });

  test('dix changements de portée ne coûtent AUCUN retour', async ({ page }) => {
    /**
     * Le frère de « dix allers-retours d'onglet ne coûtent qu'UN retour ».
     *
     * La barre d'onglets empile une couche parce qu'un onglet est une
     * DESTINATION : on y va, et le geste retour doit ramener d'où l'on vient.
     * Une portée ne se quitte pas — elle change ce que l'écran montre, comme
     * un mois, et changer de mois n'empile rien.
     *
     * Empiler ici rendrait le geste retour inerte pendant autant d'appuis
     * qu'on a comparé de portées : exactement la punition que le lot des
     * onglets a supprimée.
     */
    await allerAuPanneau(page, 'panneauBilan');
    const avant = await page.evaluate(() => history.length);

    for (let i = 0; i < 5; i++) {
      await page.locator('[data-portee="solo"]').click();
      await page.waitForTimeout(150);
      await page.locator('[data-portee="deux"]').click();
      await page.waitForTimeout(150);
    }

    expect(await page.evaluate(() => history.length) - avant,
      'changer de portée empile une couche : le retour deviendra inerte').toBe(0);
  });

  test('TÉMOIN — l\'instrument voit bien une couche quand il y en a une', async ({ page }) => {
    // Sans lui, « aucun retour » serait satisfait par un `history.length` qui
    // ne bouge jamais, quelle que soit la cause — un contrôle vert sur une
    // mesure morte. La barre d'onglets, elle, DOIT coûter une entrée.
    const avant = await page.evaluate(() => history.length);
    await allerAuPanneau(page, 'panneauCharges');
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => history.length) - avant,
      'la mesure ne voit plus les couches : le cas voisin ne prouve rien')
      .toBe(1);
  });
});

/**
 * La largeur autant que la hauteur, aux deux largeurs
 *
 * `cible-tactile.spec.js` ne tourne qu'à 390 px. Ce lot lui doit une passe à
 * 320, et la voici — bornée à ce que le lot ajoute, parce que c'est ce que le
 * lot peut casser. Le balayage complet à 320 reste devant, et il coûterait
 * quatre minutes par panneau.
 *
 * Trois segments dans 270 px utiles font 99 px chacun d'après la simulation.
 * C'est mesuré ici plutôt que cru.
 */
for (const largeur of [320, 390]) {
  test.describe(`Les trois segments au doigt — ${largeur} px`, () => {
    test.use({
      viewport: { width: largeur, height: 720 },
      hasTouch: true,
      isMobile: true
    });

    test('ils tiennent la cible, sans rogner leur libellé ni pousser la page', async ({ page }) => {
      await ouvrir(page);
      await allerAuPanneau(page, 'panneauBilan');

      // La prémisse : la règle des 44 px ne s'applique que sous
      // `pointer: coarse`. Sans elle, un contexte qui cesserait d'émuler le
      // doigt rendrait ce cas plus sévère sans dire pourquoi — c'est l'ancrage
      // que `cible-tactile.spec.js` s'est déjà donné.
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
        'le contexte doit être tactile').toBe(true);

      const m = await page.evaluate(() => {
        const segments = [...document.querySelectorAll('[data-portee]')];
        return {
          nombre: segments.length,
          boites: segments.map((el) => {
            const r = el.getBoundingClientRect();
            return {
              portee: el.getAttribute('data-portee'),
              largeur: Math.round(r.width),
              hauteur: Math.round(r.height),
              rogne: el.scrollWidth > el.clientWidth + 1
            };
          }),
          pageDeborde: document.documentElement.scrollWidth > window.innerWidth,
          ecart: document.documentElement.scrollWidth - window.innerWidth
        };
      });

      expect(m.nombre, 'aucun segment rendu : il n\'y a rien à mesurer').toBe(3);

      for (const b of m.boites) {
        expect(b.hauteur, `« ${b.portee} » mesure ${b.hauteur} px de haut`)
          .toBeGreaterThanOrEqual(44);
        expect(b.largeur, `« ${b.portee} » mesure ${b.largeur} px de large`)
          .toBeGreaterThanOrEqual(44);
        expect(b.rogne, `le libellé de « ${b.portee} » est coupé`).toBe(false);
      }

      expect(m.pageDeborde, `la page défile latéralement de ${m.ecart} px`).toBe(false);
    });

    test('le premier contenu reste sous le quart de l\'écran', async ({ page }) => {
      // Le budget que tout le lot 5 sert. Mesuré avant ce lot : 122 px à
      // 320 px, pour un seuil strict de 179. Le sélecteur coûte 44 px de
      // cible plus sa marge haute — laquelle fusionne avec celle du bandeau
      // jusqu'à 8 px, donc gratuite.
      //
      // C'est le même seuil que `onglets:280`, et ce n'est pas une copie : là
      // il tient l'écran SANS sélecteur, ici AVEC. Les deux doivent valoir.
      await ouvrir(page);
      await allerAuPanneau(page, 'panneauBilan');

      const m = await page.evaluate(() => {
        const carte = document.querySelector('#panneauBilan .card');
        if (!carte) return null;
        return {
          avant: carte.getBoundingClientRect().top,
          fenetre: window.innerHeight
        };
      });

      expect(m, 'prémisse : aucune carte dans le bilan').not.toBeNull();
      const part = m.avant / m.fenetre;
      expect(part, `${Math.round(m.avant)} px sur ${m.fenetre}, soit ${Math.round(part * 100)} %`)
        .toBeLessThan(0.25);
    });
  });
}
