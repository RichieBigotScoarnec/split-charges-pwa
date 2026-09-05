import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Le contraste de TOUT le texte réellement peint.
 *
 * `tests/encre-sur-surface.test.js` lit les feuilles de style : il nomme le
 * `fichier:ligne` de chaque encre et couvre les états qu'aucun jeu d'essai ne
 * rend. Il a trois angles morts, structurels et non corrigeables en statique :
 *
 *   1. L'OPACITÉ HÉRITÉE. `.envelope-close { opacity: 0.6 }` atténue tout le
 *      texte de ses descendants sans déclarer une seule couleur. Le contrôle
 *      statique n'y voit rien — et c'était le pire site du dépôt, neuf
 *      combinaisons sur dix sous le seuil, `--text-primary` compris.
 *   2. LA SURFACE HÉRITÉE. `color: #FFFFFF` sans `background` dans la même
 *      règle : le fond vient d'un ancêtre. Le statique doit s'abstenir, sous
 *      peine de rapporter 1,05:1 sur un site parfaitement lisible.
 *   3. LA CASCADE. Deux règles qui se recouvrent donnent une couleur que ni
 *      l'une ni l'autre ne déclare.
 *
 * Ici, rien n'est supposé : on lit `getComputedStyle` sur la page vivante et
 * on remonte la chaîne des ancêtres.
 *
 * Les deux contrôles sont complémentaires, pas redondants. Celui-ci ne voit
 * que ce que le jeu d'essai fait paraître ; l'autre voit tout le fichier mais
 * ignore l'héritage. Supprimer l'un rouvre ce que l'autre ne couvre pas.
 */

test.use({ viewport: { width: 390, height: 844 } });

const PANNEAUX = ['panneauBilan', 'panneauCharges', 'panneauReglages'];

/**
 * Le foyer d'essai — et l'enveloppe CLOSE qui a motivé ce fichier.
 *
 * Ma première sonde d'audit avait manqué `.envelope-close` pour une seule
 * raison : son état semé n'en comportait aucune. Un contrôle de rendu ne vaut
 * que ce que son jeu d'essai fait paraître, et c'est sa limite structurelle —
 * assumée ici en la nommant, plutôt que découverte plus tard.
 */
async function semer(page) {
  await page.evaluate(async () => {
    const { dbUpdate, dbSet } = await import('/js/db.js');
    const now = new Date();
    const mois = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    await dbSet('salaries', { vous: 3000, conjointe: 2000 });
    await dbSet('envelopes', [
      {
        id: 'vacances-2026', label: 'Vacances 2026', icon: '🏖️',
        budget: 1200, debut: null, fin: null, cloturee: true,
        nature: 'cagnotte', report: false, rang: 'provision',
        theme: 'Vacances', perimetre: 'commun', proprietaire: null,
        creePar: null, creeLe: null
      },
      {
        id: 'travaux', label: 'Travaux', icon: '🔨',
        budget: 800, debut: null, fin: null, cloturee: false,
        nature: 'cagnotte', report: false, rang: 'provision',
        theme: 'Maison', perimetre: 'commun', proprietaire: null,
        creePar: null, creeLe: null
      }
    ]);
    await dbUpdate(undefined, {
      [`periods/${mois}/salaries`]: { vous: 3000, conjointe: 2000 },
      [`periods/${mois}/variableCharges/v1`]: {
        description: 'Intermarché', amount: 132.4, category: 'Courses',
        paidBy: 'vous', deleted: false, date: `${mois}-03`
      },
      [`periods/${mois}/variableCharges/v2`]: {
        description: 'Cinéma', amount: 24, category: 'Loisirs',
        paidBy: 'conjointe', deleted: false, date: `${mois}-05`
      },
      [`periods/${mois}/fixedCharges/f1`]: {
        description: 'Loyer', amount: 900, category: 'Maison',
        paidBy: 'vous', deleted: false, recurring: true
      }
    });
    await window.changePeriod(mois);

    // La liste des enveloppes est lue UNE fois, à l'initialisation : écrire en
    // base après coup ne suffit pas, l'écran rend l'état. Sans cette relecture,
    // la modale s'ouvre vide et le cas de l'enveloppe close passe au vert sans
    // rien mesurer — ce qui est arrivé à la première version de ce fichier.
    const enveloppes = await import('/js/modules/envelopes.js');
    await enveloppes.loadEnvelopes();
  });
  await page.waitForTimeout(2500);
}

/**
 * Le balayage, injecté dans la page.
 *
 * Modèle d'opacité : un élément à `opacity: α` compose TOUT son sous-arbre —
 * son fond comme son texte — contre ce qui est derrière. L'alpha effectif
 * d'une couche est donc son alpha propre multiplié par les opacités de tous
 * ses ancêtres. C'est ce produit qu'on applique, aux fonds comme à l'encre.
 */
const BALAYAGE = `
  function lum(c){const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};
    return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])}
  function rgb(s){const m=String(s).match(/rgba?\\(([^)]+)\\)/);if(!m)return null;
    const p=m[1].split(',').map(x=>parseFloat(x.trim()));
    return {c:[p[0],p[1],p[2]],a:p.length>3?p[3]:1}}
  function melange(d,b){return d.c.map((x,i)=>x*d.a+b[i]*(1-d.a))}
  function ratio(a,b){const x=lum(a),y=lum(b);
    return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)}

  function chaine(el){const out=[];let n=el;
    while(n&&n.nodeType===1){out.push(n);n=n.parentElement}return out}

  function mesurer(el){
    const ch = chaine(el);
    // Produit des opacités, de chaque niveau jusqu'à la racine.
    const opac = new Array(ch.length);
    let p = 1;
    for (let i = ch.length - 1; i >= 0; i--) {
      p *= parseFloat(getComputedStyle(ch[i]).opacity || '1');
      opac[i] = p;
    }
    // Les fonds, du plus lointain au plus proche, chacun affaibli par les
    // opacités qui le surplombent.
    let fond = [255, 255, 255];
    for (let i = ch.length - 1; i >= 0; i--) {
      const b = rgb(getComputedStyle(ch[i]).backgroundColor);
      if (!b || b.a === 0) continue;
      fond = melange({ c: b.c, a: b.a * opac[i] }, fond);
    }
    const e = rgb(getComputedStyle(el).color);
    if (!e) return null;
    const encre = melange({ c: e.c, a: e.a * opac[0] }, fond);
    return { ratio: ratio(encre, fond), opacite: opac[0] };
  }

  function estDesactive(el){
    for (const n of chaine(el)) {
      if (n.disabled) return true;
      if (n.getAttribute && n.getAttribute('aria-disabled') === 'true') return true;
    }
    return false;
  }

  /**
   * Un contenu déclaré décoratif n'est pas du texte à lire.
   *
   * Les WCAG dispensent le texte purement décoratif du seuil de contraste.
   * Encore faut-il qu'il soit DÉCLARÉ tel : le contrôle honore
   * \`aria-hidden="true"\`, il ne devine pas. Un emoji décoratif qui ne le porte
   * pas est signalé — et le remède est de le marquer, ce qui répare du même
   * geste ce qu'un lecteur d'écran annonce à tort.
   *
   * C'est une règle, pas une liste d'exceptions : elle vaut pour tout élément
   * ajouté demain, sans qu'on ait à y penser.
   */
  function estDecoratif(el){
    for (const n of chaine(el)) {
      if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return true;
    }
    return false;
  }

  function balayer(etiquette){
    const out = [], vus = new Set();
    const marche = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = marche.nextNode())) {
      const txt = n.textContent.trim();
      if (!txt) continue;
      const el = n.parentElement;
      if (!el || !el.checkVisibility || !el.checkVisibility()) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Les WCAG dispensent explicitement les commandes inactives.
      if (estDesactive(el)) continue;
      // Et le contenu déclaré décoratif — déclaré, pas deviné.
      if (estDecoratif(el)) continue;

      // Un emoji COULEUR est peint par la police, pas par \`color\` : lui
      // appliquer un rapport de contraste ne mesure rien. Cette application
      // s'en sert comme système d'icônes entier, il fallait donc trancher.
      //
      // Le critère est la PRÉSENTATION, pas la catégorie : \`\\p{Emoji_Presentation}\`
      // et les pictogrammes suivis de U+FE0F rendent en couleur ; « ◀ », « ▶ »,
      // « ✕ », « • » et « ✓ » rendent en texte et restent mesurés.
      if (/^(?:\\p{Emoji_Presentation}|\\p{Extended_Pictographic}\\uFE0F|[\\u200D\\s])+$/u.test(txt)) continue;

      const s = getComputedStyle(el);
      const taille = parseFloat(s.fontSize);
      const gras = parseInt(s.fontWeight, 10) >= 700;
      // 1.4.3 pour du texte ; 1.4.11 — 3:1 — pour un glyphe sans lettre ni
      // chiffre, qui est un objet graphique et non du texte.
      const glyphe = !/[\\p{L}\\p{N}]/u.test(txt);
      const seuil = glyphe || taille >= 24 || (gras && taille >= 18.66) ? 3 : 4.5;

      const m = mesurer(el);
      if (!m) continue;

      const cle = etiquette + '|' + (el.className || el.tagName) + '|' + Math.round(m.ratio * 100);
      if (vus.has(cle)) continue;
      vus.add(cle);

      if (m.ratio < seuil) {
        out.push({
          surface: etiquette,
          texte: txt.slice(0, 34),
          classe: String(el.className || el.tagName).slice(0, 44),
          px: taille,
          opacite: Math.round(m.opacite * 100) / 100,
          ratio: Math.round(m.ratio * 100) / 100,
          seuil
        });
      }
    }
    return out;
  }
`;

/** Relève les manquements sur une page déjà chargée et semée. */
async function releverTout(page) {
  const trouves = [];

  for (const panneau of PANNEAUX) {
    await allerAuPanneau(page, panneau);
    trouves.push(...await page.evaluate(
      // La valeur de complétion de l'`eval` REND la fonction, plutôt que de la
      // laisser comme identifiant libre : eslint ne peut pas voir ce qui naît
      // d'une chaîne, et `no-undef` est une erreur — que la CI refuse.
      ({ code, nom }) => eval(`${code}; balayer`)(nom),
      { code: BALAYAGE, nom: panneau }
    ));
  }

  // La modale des enveloppes — la seule surface qui porte une enveloppe close,
  // et donc le seul endroit où l'opacité héritée se mesure.
  await allerAuPanneau(page, 'panneauBilan');
  await page.locator('[data-action="showManageEnvelopesModal"]').first().click();
  await page.waitForTimeout(900);
  trouves.push(...await page.evaluate(
    ({ code, nom }) => eval(`${code}; balayer`)(nom),
    { code: BALAYAGE, nom: 'modaleEnveloppes' }
  ));

  return trouves;
}

for (const theme of ['light', 'dark']) {
  test(`aucun texte rendu sous le seuil AA — thème ${theme}`, async ({ browser }) => {
    test.setTimeout(240000);
    const contexte = await browser.newContext({
      viewport: { width: 390, height: 844 }, colorScheme: theme
    });
    const page = await contexte.newPage();
    await setupFirebaseMock(page);
    await waitForApp(page);
    await semer(page);

    const manquements = await releverTout(page);
    await contexte.close();

    const detail = manquements
      .map((m) => `    ${m.surface.padEnd(18)} ${String(m.ratio).padEnd(6)} / ${m.seuil}`
        + `   ${m.px}px${m.opacite !== 1 ? ` opacity ${m.opacite}` : ''}`
        + `   « ${m.texte} »   .${m.classe}`)
      .join('\n');

    expect(
      manquements,
      `\n\n  ${manquements.length} texte(s) rendu(s) sous le seuil — thème ${theme} :\n${detail}\n`
    ).toEqual([]);
  });
}

test('le balayage voit vraiment quelque chose', async ({ page }) => {
  /**
   * La panne la plus dangereuse de ce fichier serait un balayage qui ne
   * trouve aucun texte : tous les cas passeraient au vert sans rien mesurer.
   * Ce dépôt a déjà consigné trois fois « un contrôle qui ne mesure rien est
   * pire qu'un contrôle absent ».
   */
  test.setTimeout(240000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semer(page);

  const compte = await page.evaluate(({ code }) => {
    eval(code);
    let n = 0;
    const marche = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let x;
    while ((x = marche.nextNode())) {
      if (x.textContent.trim() && x.parentElement?.checkVisibility?.()) n++;
    }
    return n;
  }, { code: BALAYAGE });

  expect(compte, 'le bilan doit porter du texte visible').toBeGreaterThan(40);
});

test('l\'enveloppe close est bien rendue, et son opacité héritée mesurée', async ({ page }) => {
  /**
   * Sans ce cas, le jeu d'essai pourrait cesser de produire une enveloppe
   * close — un identifiant qui change, une normalisation plus stricte — et
   * l'angle mort n°1 se rouvrirait en silence, tous les cas restant verts.
   */
  test.setTimeout(240000);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semer(page);

  await allerAuPanneau(page, 'panneauBilan');
  await page.locator('[data-action="showManageEnvelopesModal"]').first().click();
  await page.waitForTimeout(900);

  const close = page.locator('.envelope-close').first();
  await expect(close, 'une enveloppe close doit paraître dans la modale').toBeVisible();

  const opacite = await close.evaluate((el) => {
    let p = 1, n = el;
    while (n && n.nodeType === 1) { p *= parseFloat(getComputedStyle(n).opacity || '1'); n = n.parentElement; }
    return p;
  });

  // Ce que le cas garantit : quelle que soit la façon dont l'effacement est
  // obtenu, le texte qu'il porte reste mesuré par le balayage ci-dessus.
  expect(opacite, 'l\'opacité effective doit être lisible depuis la page').toBeGreaterThan(0);
});
