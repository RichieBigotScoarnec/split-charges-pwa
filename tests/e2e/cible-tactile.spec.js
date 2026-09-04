import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Toute commande visée au doigt mesure au moins 44 × 44.
 *
 * Ce contrôle ÉNUMÈRE les éléments interactifs de la page et mesure leur boîte.
 * Il remplace une liste de sélecteurs tenue à la main dans le bloc
 * `@media (pointer: coarse)` de `responsive.css` — laquelle ne couvrait que ce
 * dont quelqu'un s'était souvenu. Mesuré au moment de l'écrire : dix-neuf
 * commandes sous le seuil, dont quatre `<select>` à **19 px** dans la modale
 * des enveloppes, qu'aucune ligne de cette liste ne visait.
 *
 * C'est la même cause que le défaut d'encre du 31 août : une règle appliquée là
 * où on l'a regardée. Une liste ne se dégrade pas d'un coup, elle se dégrade au
 * champ suivant que personne n'y ajoute.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LE SEUIL : 44, ET NON 24
 *
 * Les WCAG en offrent deux : 2.5.8 « Target Size (Minimum) », niveau AA, à
 * 24 px ; 2.5.5 « Target Size (Enhanced) », niveau AAA, à 44 px.
 *
 * 44 est retenu parce que c'est la règle que ce dépôt s'est DÉJÀ donnée —
 * `CLAUDE.md` écrit « Cibles tactiles minimum 44×44px », et le commentaire du
 * bloc `pointer: coarse` invoque nommément 2.5.5. Retenir 24 abaisserait en
 * silence une barre existante, sous couvert de conformité.
 *
 * Et 24 coûterait PLUS cher : le critère 2.5.8 est assorti d'une exception
 * d'espacement — une cible de 24 px passe si les disques de 24 px de ses
 * voisines ne se recouvrent pas — qui oblige à mesurer le voisinage de chaque
 * commande. C'est une liste de cas déguisée en critère. 44 n'en demande
 * aucune, et le satisfaire satisfait AA mécaniquement.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE QUI EST ÉCARTÉ, ET POURQUOI C'EST UNE RÈGLE
 *
 * Trois exceptions, toutes définies par les WCAG et de forme RÈGLE, jamais
 * de forme SITE — aucune n'est un sélecteur nommé :
 *
 *   - une commande désactivée : les WCAG les dispensent explicitement ;
 *   - un lien EN LIGNE dans du texte courant : exception « inline » ;
 *   - une case à cocher enveloppée d'un `<label>` : la zone visée est le
 *     label, et c'est lui qu'on mesure. Le dépôt avait déjà consigné cette
 *     décision dans `responsive.css`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE QU'IL NE MESURE PAS
 *
 * Une commande non rendue — `checkVisibility()` faux, ou boîte nulle — est
 * écartée : on ne mesure pas ce qui n'a pas de mise en page, et le deviner
 * serait pire. Une commande rendue mais sortie du défilement EST mesurée : sa
 * boîte est réelle, la position de défilement n'a rien à voir avec la taille
 * d'une cible.
 *
 * Ce que le balayage n'ouvre pas est donc hors de sa portée. C'est la limite
 * structurelle de tout contrôle de rendu — la même que `encre-rendue.spec.js` —
 * et le remède est le même : visiter plus de surfaces, en gardant un cas qui
 * vérifie qu'on a bien trouvé un nombre plausible de commandes.
 *
 * ─────────────────────────────────────────────────────────────────────
 * POURQUOI IL N'Y A PAS DE PENDANT STATIQUE
 *
 * Une cible tactile est `padding + line-height + font-size + box-sizing +
 * viewport + media query` : rien de tout cela ne se résout en pixels sans
 * moteur de rendu. Un contrôle statique ne pourrait que vérifier que la liste
 * de sélecteurs existe — mesurer la FORME du correctif et non son effet, ce
 * que ce dépôt a déjà payé deux fois.
 */

const SEUIL = 44;

/** Le doigt, et non la souris : c'est la condition où la règle s'applique. */
const TACTILE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

async function semer(page) {
  await page.evaluate(async () => {
    const { dbUpdate, dbSet } = await import('/js/db.js');
    const now = new Date();
    const mois = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    await dbSet('salaries', { vous: 3000, conjointe: 2000 });
    await dbSet('envelopes', [{
      id: 'travaux', label: 'Travaux', icon: '🔨', budget: 800,
      debut: null, fin: null, cloturee: false, nature: 'cagnotte',
      report: false, rang: 'provision', theme: 'Maison',
      perimetre: 'commun', proprietaire: null, creePar: null, creeLe: null
    }]);
    await dbUpdate(undefined, {
      [`periods/${mois}/salaries`]: { vous: 3000, conjointe: 2000 },
      [`periods/${mois}/variableCharges/v1`]: {
        description: 'Intermarché', amount: 132.4, category: 'Courses',
        paidBy: 'vous', deleted: false, date: `${mois}-03`
      },
      [`periods/${mois}/fixedCharges/f1`]: {
        description: 'Loyer', amount: 900, category: 'Maison',
        paidBy: 'vous', deleted: false, recurring: true
      }
    });
    await window.changePeriod(mois);

    // Les enveloppes sont lues une fois, à l'initialisation : sans cette
    // relecture la modale s'ouvre vide et ses neuf commandes ne sont pas
    // mesurées. `encre-rendue.spec.js` a payé exactement ce piège.
    const enveloppes = await import('/js/modules/envelopes.js');
    await enveloppes.loadEnvelopes();
  });
  await page.waitForTimeout(2500);
}

const BALAYAGE = `
  function visible(el){
    if(!el.checkVisibility||!el.checkVisibility())return false;
    const r=el.getBoundingClientRect();
    return r.width>0&&r.height>0;
  }

  function balayer(etiquette){
    const sel='button,a[href],[role="button"],select,textarea,'
      + 'input:not([type=hidden])';
    const out=[];
    for(const el of document.querySelectorAll(sel)){
      if(!visible(el))continue;
      if(el.disabled)continue;
      if(el.getAttribute('aria-disabled')==='true')continue;

      const s=getComputedStyle(el);
      // Exception « inline » : un lien au fil du texte n'est pas une cible.
      if(el.tagName==='A'&&s.display==='inline')continue;

      // La cible EFFECTIVE : une case à cocher se vise par son label.
      const parLabel=el.tagName==='INPUT'
        && /^(checkbox|radio)$/.test(el.type)
        && el.closest('label');
      const boite=(parLabel||el).getBoundingClientRect();

      if(boite.width<${SEUIL}||boite.height<${SEUIL}){
        out.push({
          surface:etiquette,
          balise:el.tagName.toLowerCase()+(el.type?'['+el.type+']':''),
          classe:String(el.className||'(sans classe)').slice(0,42),
          id:el.id||'',
          vise:parLabel?'label':'élément',
          l:Math.round(boite.width),
          h:Math.round(boite.height)
        });
      }
    }
    return out;
  }

  function compter(){
    const sel='button,a[href],[role="button"],select,textarea,'
      + 'input:not([type=hidden])';
    return [...document.querySelectorAll(sel)].filter(visible).length;
  }
`;

/** Ouvre chaque surface et relève ce qui s'y trouve. */
async function releverTout(page) {
  const trouves = [];

  for (const panneau of ['panneauBilan', 'panneauCharges', 'panneauReglages']) {
    await allerAuPanneau(page, panneau);
    trouves.push(...await page.evaluate(
      ({ code, nom }) => eval(`${code}; balayer`)(nom),
      { code: BALAYAGE, nom: panneau }
    ));
  }

  await allerAuPanneau(page, 'panneauBilan');
  await page.locator('[data-action="showManageEnvelopesModal"]').first().click();
  await page.waitForTimeout(900);
  trouves.push(...await page.evaluate(
    ({ code, nom }) => eval(`${code}; balayer`)(nom),
    { code: BALAYAGE, nom: 'modaleEnveloppes' }
  ));

  return trouves;
}

test(`aucune commande sous ${SEUIL} × ${SEUIL} au doigt`, async ({ browser }) => {
  test.setTimeout(240000);
  const contexte = await browser.newContext(TACTILE);
  const page = await contexte.newPage();
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semer(page);

  const petites = await releverTout(page);
  await contexte.close();

  const detail = petites
    .map((p) => `    ${p.surface.padEnd(18)} ${String(p.l).padStart(3)} × ${String(p.h).padStart(3)}`
      + `   ${p.balise.padEnd(20)} ${p.id ? '#' + p.id : '.' + p.classe}`
      + `${p.vise === 'label' ? '  (visée : son label)' : ''}`)
    .join('\n');

  expect(
    petites,
    `\n\n  ${petites.length} commande(s) sous ${SEUIL} px au doigt :\n${detail}\n`
  ).toEqual([]);
});

test('le balayage voit vraiment des commandes', async ({ browser }) => {
  /**
   * Un balayage qui n'énumère rien rendrait le cas ci-dessus vert sans mesurer
   * quoi que ce soit — le mode de panne que ce dépôt a consigné quatre fois.
   * Ce cas compte ce que le sélecteur ramène, et tombe si l'énumération se
   * vide, quelle qu'en soit la raison.
   */
  test.setTimeout(240000);
  const contexte = await browser.newContext(TACTILE);
  const page = await contexte.newPage();
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semer(page);

  const comptes = [];
  for (const panneau of ['panneauBilan', 'panneauCharges', 'panneauReglages']) {
    await allerAuPanneau(page, panneau);
    comptes.push(await page.evaluate(({ code }) => eval(`${code}; compter`)(), { code: BALAYAGE }));
  }
  await contexte.close();

  expect(Math.min(...comptes), 'chaque panneau porte des commandes').toBeGreaterThan(3);
  expect(comptes.reduce((a, b) => a + b, 0), 'et l\'application en porte beaucoup')
    .toBeGreaterThan(25);
});

test('la mesure suit bien la règle du doigt, et non celle de la souris', async ({ browser }) => {
  /**
   * Le seuil ne s'applique que sous `pointer: coarse`. Si le contexte de test
   * cessait d'émuler le tactile — un `hasTouch` perdu dans un remaniement — la
   * règle CSS ne s'appliquerait plus et le contrôle deviendrait bien plus
   * sévère, sans que rien ne dise pourquoi. Ce cas ancre la prémisse.
   */
  test.setTimeout(240000);
  const contexte = await browser.newContext(TACTILE);
  const page = await contexte.newPage();
  await setupFirebaseMock(page);
  await waitForApp(page);

  const grossier = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  await contexte.close();

  expect(grossier, 'le contexte doit être tactile').toBe(true);
});
