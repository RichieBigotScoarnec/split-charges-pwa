/**
 * FairSplit — LE RELEVÉ DE MISE EN PAGE
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE N'EST PAS UN CONTRÔLE. IL NE ROUGIT PAS SUR UN DÉFAUT.
 *
 * Le foyer faisait cette passe à la main, en collant des sondes dans la console,
 * écran par écran, largeur par largeur — dix allers-retours pour établir un
 * fait. Ce que ces sondes mesurent est mécanique et se rejoue : c'est du
 * ressort de la suite qui tourne déjà sous émulateurs.
 *
 * Mais un débordement n'est pas toujours un défaut à corriger — le débord de
 * `.summary-row` est délibéré, et c'est lui qui laisse le fond de survol
 * dépasser le rembourrage. C'est au foyer d'en juger, pas à la CI. Ce fichier
 * MESURE et ÉCRIT ; il ne condamne pas.
 *
 * Il vit donc dans son propre projet Playwright, hors de `chromium` :
 *   npm run releve
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QU'IL NE VOIT PAS — à lire avant de le prendre pour un filet complet
 *
 *   1. LES CONTRASTES. Rien ici ne lit une couleur. `tests/contraste.test.js`
 *      tient les jetons, `tests/e2e/lisibilite.spec.js` les couples réellement
 *      peints.
 *   2. LE TEXTE QUI DÉBORDE À L'INTÉRIEUR d'un élément qui, lui, tient dans
 *      l'écran — le montant d'une carte d'enveloppe écrit un mot par ligne.
 *      Les quatre mesures portent sur des BOÎTES, pas sur du texte dans une
 *      boîte.
 *
 * Ces deux familles restent à l'œil. Le relevé le redit en tête de son rapport.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PRÉMISSE, ET POURQUOI ELLE EST LA SEULE CHOSE QUI PUISSE FAIRE ÉCHOUER
 *
 * Un rapport qui dit « rien à signaler » parce que le balayage n'a visité aucun
 * élément se lit exactement comme un rapport sur un écran sain. C'est la
 * première réponse condamnante de la règle 1, et c'est très exactement ce qui
 * est arrivé à la garde d'atteignabilité : elle ne voyait pas les cinq portes
 * construites en JavaScript, et son silence passait pour une absence de défaut.
 *
 * Le relevé compte donc ce qu'il a MESURÉ — écrans visités, éléments
 * examinés, commandes sondées — et n'échoue que si ces comptes sont dégénérés.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ÉPROUVÉ PAR MUTATION — et le premier mutant était INERTE, pas le relevé
 *
 * Posé sur `public/css/modals.css` :
 *
 *   #modalTrash .modal { width: 900px; max-width: none; }
 *
 * Le rapport n'a rien dit, et la lecture immédiate est que le relevé est
 * aveugle. Mesuré plutôt que supposé : la règle était bien chargée
 * (`document.styleSheets` la rend telle quelle), et la boîte mesurait
 * **390 px**. `.modal-overlay.active` est `display: flex` ; `.modal` en est un
 * élément, et un élément flexible se RÉTRÉCIT — `width: 900px` n'est qu'une
 * base, `max-width: none` n'y change rien. Le mutant ne produisait aucun
 * débordement.
 *
 * `flex-shrink: 0` ajouté, la boîte rend −255 → 645 pour 390, et le relevé
 * nomme **7 éléments en DÉBORDE sous « Corbeille — 390 px »**, à 390 seulement
 * (900 px tient dans 1280). C'est le mécanisme exact que le dépôt a déjà payé
 * sur le grand-livre : `flex-shrink: 0` fait GRANDIR une boîte au-delà de son
 * parent.
 *
 * La leçon est celle de la règle 1 : un mutant qui ne tombe pas interroge le
 * CONTRÔLE d'abord — et ici la réponse a été que le contrôle avait raison.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE SONDE COLLÉE DANS LA CONSOLE MENT — le cas de la barre de solde
 *
 * Le foyer a rapporté qu'en mode sélection, à 427 px, la ligne « Conjointe vous
 * doit 58,06 € » DISPARAÎT. Mesuré le 2026-09-18, aux trois largeurs, avant,
 * pendant et après le mode sélection : **elle ne disparaît pas.** À 427 comme à
 * 390, `#balanceBar` est visible, à la même place (118..162, 45 px de haut), et
 * porte le même texte dans les trois états.
 *
 * Le mécanisme du faux rapport est dans le balisage :
 *
 *   <span>Conjointe vous doit <strong>76,80 €</strong></span>
 *
 * La seule FEUILLE de cette barre est le `<strong>`, qui ne porte que le
 * montant. Une sonde qui parcourt les feuilles en cherchant « doit » — la forme
 * naturelle quand on colle trois lignes dans une console — ne trouve RIEN, sur
 * une barre parfaitement à l'écran. Et elle trouve quelque chose à 1280 px,
 * où le bilan est rendu à côté des charges et où son propre
 * « Conjointe te doit » EST une feuille. D'où « ça marche au bureau, ça
 * disparaît au téléphone ».
 *
 * C'est exactement ce que ce fichier existe pour supprimer : le balayage porte
 * sur des BOÎTES et sur `checkVisibility()`, jamais sur la présence d'un mot
 * dans un nœud terminal.
 */
import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

const SORTIE = 'releve-mise-en-page.md';
/**
 * Chaque largeur porte SON POINTEUR, et ce n'est pas un détail de confort
 *
 * `responsive.css` porte quatre groupes de règles sous `pointer: coarse`, tous
 * géométriques — dont `min-height: 44px` sur TOUTE commande. Mesurer un
 * téléphone à la souris, c'est mesurer un écran que personne n'affiche : les
 * commandes y sont plus petites que ce qu'un doigt verra, et le relevé rend
 * alors des dizaines de « PETIT » qui n'existent nulle part.
 *
 * `hasTouch: true` suffit à déclencher `pointer: coarse` ; `isMobile` non.
 */
const LARGEURS = [
  { px: 390, doigt: true },
  { px: 1280, doigt: false }
];
const PORTEES = [
  { cle: 'deux', nom: 'À deux' },
  { cle: 'solo', nom: 'Moi ce mois' },
  { cle: 'prive', nom: 'Privé' }
];

/** Tolérance sous le pixel : une géométrie rendue est fractionnaire. */
const EPS = 0.5;
/** La cible tactile du dépôt — `CLAUDE.md`, « Cibles tactiles minimum 44×44px ». */
const CIBLE = 44;

// ═══════════════════════════════════════════════════════════════════════════
// LE SEMIS
// ═══════════════════════════════════════════════════════════════════════════

function moisCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Deux salaires et deux charges partagées — de quoi faire exister un solde
 *
 * Le solde doit être NON NUL : « Régler ce solde » n'est pas rendu à zéro
 * (`summary.js`), donc un semis équilibré retirerait un écran du relevé sans
 * le dire. Les deux charges sont avancées par la même personne pour cela.
 */
function semis() {
  const p = moisCourant();
  return {
    'household/salaries': { vous: 2500, conjointe: 1800 },
    [`household/periods/${p}/salaries`]: { vous: 2500, conjointe: 1800 },
    [`household/periods/${p}/variableCharges/v1`]: {
      description: 'Courses de la semaine', amount: 122.07, category: 'Courses',
      paidBy: 'vous', date: `${p}-02`, deleted: false, perimetre: 'partage'
    },
    [`household/periods/${p}/variableCharges/v2`]: {
      description: 'Essence', amount: 61.4, category: 'Transport',
      paidBy: 'vous', date: `${p}-05`, deleted: false, perimetre: 'partage'
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LES QUATRE MESURES — exécutées DANS la page
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Le balayage, tel qu'il tourne dans le navigateur
 *
 * Il rend des faits bruts. Le tri entre défaut et faux positif connu se fait
 * ensuite, côté Node, pour que la règle d'exclusion soit LISIBLE dans ce
 * fichier plutôt qu'enfouie dans une chaîne évaluée.
 */
function balayer({ eps, cible, doigt }) {
  const vu = (el) => el.checkVisibility() && el.getBoundingClientRect().width > 0;
  const nommer = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32);
    return `${el.tagName.toLowerCase()}${id}${cls}${txt ? ` « ${txt} »` : ''}`;
  };

  const deborde = [];
  const petit = [];
  const defileX = [];
  const recouvert = [];
  let examines = 0;
  let commandesSondees = 0;
  let rognes = 0;

  for (const el of document.querySelectorAll('body *')) {
    if (!vu(el)) continue;
    examines += 1;
    const r = el.getBoundingClientRect();

    // 1. DÉBORDE — la boîte sort de l'écran, à droite ou à gauche.
    if (r.right > window.innerWidth + eps || r.left < -eps) {
      deborde.push({
        quoi: nommer(el),
        detail: `${Math.round(r.left)} → ${Math.round(r.right)} pour ${window.innerWidth}`
      });
    }

    // 3. DÉFILE-X — le contenu est plus large que la boîte, et la boîte le
    //    contraint. `overflow-x: auto` ou `scroll` est un choix : le rapport
    //    les sépare au lieu de les confondre avec un rognage muet.
    if (el.scrollWidth > el.clientWidth + eps) {
      const ox = getComputedStyle(el).overflowX;
      if (ox !== 'visible') {
        defileX.push({
          quoi: nommer(el),
          detail: `${el.scrollWidth} de contenu dans ${el.clientWidth}`,
          overflowX: ox,
          delibere: ox === 'auto' || ox === 'scroll',
          // La recette du masquage pour lecteur d'écran : une boîte de 1 px,
          // `overflow: hidden`. Mesurée plutôt que nommée — voir la règle
          // d'écart correspondante.
          reduiteAUnPixel: r.width <= 1 + eps || r.height <= 1 + eps
        });
      }
    }
  }

  // 2. PETIT — une commande sous la cible tactile, dans une dimension.
  //    Ne vaut QUE sous le doigt : c'est `pointer: coarse` qui porte les
  //    commandes à 44 px, et une souris n'a pas de cible tactile.
  for (const el of doigt ? document.querySelectorAll('button, a, input, select') : []) {
    if (!vu(el)) continue;
    const r = el.getBoundingClientRect();

    if (r.width < cible - eps || r.height < cible - eps) {
      petit.push({
        quoi: nommer(el),
        detail: `${Math.round(r.width)} × ${Math.round(r.height)}`
      });
    }
  }

  // 4. RECOUVERT — trois points par commande, à mi-hauteur.
  for (const el of document.querySelectorAll('button, a')) {
    if (!vu(el)) continue;
    commandesSondees += 1;
    const r = el.getBoundingClientRect();
    const y = r.top + r.height / 2;
    if (y < 0 || y > window.innerHeight) continue;

    // Un conteneur défilant ROGNE ce qui sort de lui : une commande plus bas
    // que sa liste n'est pas « recouverte », elle n'est pas là. Sonder ses
    // coordonnées rend l'élément peint par-dessus, qui n'y est pour rien.
    const rogneur = (() => {
      let n = el.parentElement;
      while (n && n !== document.body) {
        const o = getComputedStyle(n);
        if (/auto|scroll|hidden|clip/.test(o.overflowY + o.overflowX)) return n.getBoundingClientRect();
        n = n.parentElement;
      }
      return null;
    })();
    if (rogneur && (y < rogneur.top - eps || y > rogneur.bottom + eps)) {
      rognes += 1;
      continue;
    }

    for (const part of [0.25, 0.5, 0.75]) {
      const x = r.left + r.width * part;
      if (x < 0 || x > window.innerWidth) continue;
      const dessus = document.elementFromPoint(x, y);
      if (!dessus) continue;
      if (dessus === el || el.contains(dessus)) continue;
      // Une modale ouverte recouvre par construction tout ce qui est derrière
      // elle : c'est ce qu'une modale EST. On le note pour l'écarter plus bas,
      // plutôt que de le taire ici.
      const voileOuvert = dessus.closest('.modal-overlay');
      recouvert.push({
        quoi: nommer(el),
        detail: `à ${Math.round(part * 100)} % de sa largeur, c'est ${nommer(dessus)} qui reçoit l'appui`,
        parQui: dessus.id ? `#${dessus.id}` : (dessus.closest('[id]')?.id ? `#${dessus.closest('[id]').id}` : ''),
        parQuiClasses: typeof dessus.className === 'string' ? dessus.className : '',
        derriereUneModale: Boolean(voileOuvert) && !voileOuvert.contains(el)
      });
    }
  }

  return { deborde, petit, defileX, recouvert, examines, commandesSondees, rognes };
}

// ═══════════════════════════════════════════════════════════════════════════
// LES FAUX POSITIFS CONNUS — nommés, pas masqués
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chacun porte SA raison. Un relevé qui écarte en silence ment dans le sens
 * rassurant, et personne ne peut vérifier ce qu'il a retiré : le rapport
 * compte ce qu'il a écarté et dit pourquoi.
 */
const FAUX_POSITIFS = [
  {
    nom: 'boîte réduite à 1 px en DÉFILE-X (masquage pour lecteur d\'écran)',
    raison: 'Un libellé pour lecteur d\'écran fait 1 px : son contenu le déborde par '
      + 'construction, et il n\'est visible de personne. ⚠️ La règle MESURE la boîte au '
      + 'lieu de nommer `.sr-only` — `#sectionResume` porte la même recette SANS cette '
      + 'classe (`onglets.css:374`), et une règle écrite sur le nom l\'aurait manqué.',
    mesure: 'defileX',
    couvre: (c) => c.reduiteAUnPixel === true
  },
  {
    nom: 'le bandeau du bac à sable recouvre une commande',
    raison: 'Il n\'existe qu\'avec `?sandbox=1`, donc jamais en production. Il recouvre les flèches de mois et « + Revenus complémentaires ».',
    mesure: 'recouvert',
    couvre: (c) => /sandbox/i.test(`${c.parQui} ${c.parQuiClasses} ${c.detail}`)
  }
];

const DERRIERE_UNE_MODALE = {
  nom: 'commande recouverte par une modale ouverte',
  raison: 'Une modale recouvre ce qui est derrière elle : c\'est ce qu\'elle EST. '
    + 'Sans cette règle, chaque modale rendait cinquante « RECOUVERT » décrivant '
    + 'l\'écran qu\'elle cache.',
  mesure: 'recouvert',
  couvre: (c) => c.derriereUneModale === true
};

/** Un bloc volontairement défilant n'est pas un défaut : il est mis à part. */
const DELIBERE = {
  nom: 'bloc volontairement défilant (`overflow-x: auto` ou `scroll`)',
  raison: 'Le contenu déborde sa boîte ET la boîte offre de le faire défiler. C\'est un choix, pas un rognage muet.',
  mesure: 'defileX',
  couvre: (c) => c.delibere === true
};

const ECARTS = [...FAUX_POSITIFS, DERRIERE_UNE_MODALE, DELIBERE];

/**
 * Sépare ce qui reste à regarder de ce qui est déjà expliqué
 * @param {Object} brut - La sortie de `balayer`
 * @returns {{retenus: Object, ecartes: Array}}
 */
function trier(brut) {
  const retenus = { deborde: [], petit: [], defileX: [], recouvert: [] };
  const ecartes = [];

  for (const mesure of Object.keys(retenus)) {
    for (const cas of brut[mesure]) {
      const regle = ECARTS.find(e => e.mesure === mesure && e.couvre(cas));
      if (regle) ecartes.push({ regle: regle.nom, mesure, cas });
      else retenus[mesure].push(cas);
    }
  }

  return { retenus, ecartes };
}

// ═══════════════════════════════════════════════════════════════════════════
// LE PARCOURS
// ═══════════════════════════════════════════════════════════════════════════

const releves = [];
let totalExamines = 0;
let totalCommandes = 0;
let totalRognes = 0;
const ecartesGlobaux = [];

/**
 * Mesure l'écran courant et l'ajoute au relevé
 * @param {import('@playwright/test').Page} page
 * @param {string} ecran
 * @param {number} largeur
 * @param {string} portee
 */
async function relever(page, ecran, largeur, portee, doigt) {
  const brut = await page.evaluate(balayer, { eps: EPS, cible: CIBLE, doigt });
  const { retenus, ecartes } = trier(brut);

  totalExamines += brut.examines;
  totalCommandes += brut.commandesSondees;
  totalRognes += brut.rognes;
  ecartesGlobaux.push(...ecartes);

  releves.push({ ecran, largeur, portee, doigt, retenus, examines: brut.examines });
}

/**
 * Choisit une portée sur le sélecteur VISIBLE
 *
 * ⚠️ Le sélecteur est rendu DEUX FOIS — un par panneau porteur
 * (`utils/portee.js`, `PANNEAUX_AVEC_PORTEE`). Sous 900 px un seul panneau est
 * à l'écran, donc `.first()` désigne une moitié du temps un segment caché, et
 * le clic expire au bout du temps imparti sans jamais dire pourquoi. Mesuré :
 * le premier jet de ce fichier y a passé ses 480 secondes.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} cle - deux | solo | prive
 */
async function choisirLaPortee(page, cle) {
  await page.locator(`[data-portee="${cle}"]`).filter({ visible: true }).first().click();
}

/** Ouvre une modale par son bouton, mesure, referme. */
async function parLaPorte(page, { ecran, ouvrir, cible, largeur, doigt, portee = '—', fermer }) {
  const bouton = page.locator(ouvrir).first();
  if (await bouton.count() === 0 || !(await bouton.isVisible())) {
    releves.push({ ecran, largeur, portee, absent: `la porte ${ouvrir} n'est pas à l'écran` });
    return;
  }
  await bouton.click();
  try {
    await page.waitForSelector(cible, { state: 'visible', timeout: 8000 });
  } catch {
    releves.push({ ecran, largeur, portee, absent: `${cible} ne s'est pas ouvert` });
    return;
  }
  await page.waitForTimeout(400);
  await relever(page, ecran, largeur, portee, doigt);
  await refermer(page, cible, ecran, largeur);
  await page.waitForTimeout(fermer ?? 300);
}

/**
 * Referme une modale, et le dit si elle résiste
 *
 * ⚠️ LES MODALES LIVRÉES DANS LE HTML SE FERMENT PAR ÉCHAP ; CELLES CONSTRUITES
 * EN JAVASCRIPT, NON. `#modalImport` se referme par son bouton « Annuler »
 * (`import.js:118`), `#modalManageLists` par « Fermer » (`custom-lists.js:750`),
 * et ainsi de suite. Mesuré : le premier jet envoyait Échap, la modale restait,
 * et le clic suivant expirait sur « modalImport intercepts pointer events » —
 * c'est-à-dire que le relevé s'arrêtait à mi-parcours en accusant la
 * navigation.
 *
 * Une modale qui ne se referme pas est un FAIT, pas un accident du banc
 * d'essai : le rapport le consigne plutôt que de l'avaler.
 */
async function refermer(page, cible, ecran, largeur) {
  const modale = page.locator(cible);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  if (await modale.count() === 0 || !(await modale.first().isVisible())) return;

  const sortie = page.locator(`${cible} button`).filter({ hasText: /Fermer|Annuler/i }).first();
  if (await sortie.count() > 0 && await sortie.isVisible()) {
    await sortie.click();
    await page.waitForTimeout(300);
  }
  if (await modale.count() === 0 || !(await modale.first().isVisible())) return;

  releves.push({
    ecran, largeur, portee: '—',
    absent: `${cible} ne s'est refermé ni par Échap ni par « Fermer » — les écrans suivants ont été mesurés par-dessus`
  });
}

test('relevé de mise en page', async ({ browser }) => {
  test.setTimeout(600000);

  for (const { px, doigt } of LARGEURS) {
    // Un CONTEXTE par largeur : `hasTouch` se déclare à la création et ne se
    // change pas sur une page déjà ouverte.
    const contexte = await browser.newContext({
      viewport: { width: px, height: 900 },
      hasTouch: doigt
    });
    const page = await contexte.newPage();

    await setupFirebaseMock(page);
    await page.addInitScript(`window.__db = ${JSON.stringify(semis())};`);
    await waitForApp(page);
    await page.waitForTimeout(1500);

    // ── Les panneaux, aux trois portées ────────────────────────────────────
    for (const panneau of ['panneauBilan', 'panneauCharges']) {
      for (const { cle, nom } of PORTEES) {
        await allerAuPanneau(page, panneau);
        await choisirLaPortee(page, cle);
        await page.waitForTimeout(700);
        await relever(page, panneau === 'panneauBilan' ? 'Bilan' : 'Charges', px, nom, doigt);
      }
    }
    // Réglages n'a pas de portée (`utils/portee.js`, `PANNEAUX_AVEC_PORTEE`).
    await allerAuPanneau(page, 'panneauReglages');
    await page.waitForTimeout(500);
    await relever(page, 'Réglages', px, '—', doigt);

    // ── Le mode sélection, AVANT et APRÈS ──────────────────────────────────
    await allerAuPanneau(page, 'panneauCharges');
    await choisirLaPortee(page, 'deux');
    await page.waitForTimeout(500);
    await relever(page, 'Charges — avant « Sélectionner »', px, 'À deux', doigt);
    await page.locator('#selectionBasculer').click();
    await page.waitForTimeout(700);
    await relever(page, 'Charges — mode sélection', px, 'À deux', doigt);
    await page.locator('#selectionBasculer').click();
    await page.waitForTimeout(500);

    // ── Les modales sans condition, depuis Réglages ────────────────────────
    await allerAuPanneau(page, 'panneauReglages');
    await page.waitForTimeout(400);
    for (const [ecran, ouvrir, cible] of [
      ['Corbeille', '[data-action="showTrash"]', '#modalTrash.active'],
      ['Sauvegarde', '[data-action="showBackup"]', '#modalBackup.active'],
      ['Importer CSV', '[data-action="showImportModal"]', '#modalImport'],
      ['Catégories', '[data-action="showManageCategoriesModal"]', '#modalManageLists'],
      ['Destinations', '[data-action="showManageDestinationsModal"]', '#modalManageLists']
    ]) {
      await parLaPorte(page, { ecran, ouvrir, cible, largeur: px, doigt });
      await allerAuPanneau(page, 'panneauReglages');
      await page.waitForTimeout(300);
    }

    // ── La saisie rapide, joignable partout ────────────────────────────────
    await parLaPorte(page, {
      ecran: 'Saisie Rapide', ouvrir: '.fab', cible: '#modalQuickAdd.active',
      largeur: px, doigt
    });

    // ── Le Bilan et ses écrans ─────────────────────────────────────────────
    await allerAuPanneau(page, 'panneauBilan');
    await choisirLaPortee(page, 'deux');
    await page.waitForTimeout(700);

    for (const [ecran, ouvrir, cible] of [
      ['Gérer les enveloppes', '[data-action="showManageEnvelopesModal"]', '#modalManageEnvelopes'],
      ['Régler le solde', '.btn-settle', '#modalReglerSolde.active'],
      ['Détail des dépenses', '[data-action="ouvrirDetailPayeur"]', '#modalDetailDepenses'],
      ['Budgets par catégorie', '[data-action="showBudgetEditor"]', '#modalBudgets.active'],
      ['Rapport mensuel', '[data-action="ouvrirRapportDuMois"]', '#modalRapportMensuel']
    ]) {
      await parLaPorte(page, { ecran, ouvrir, cible, largeur: px, doigt, portee: 'À deux' });
    }

    // ── Modifier une charge ────────────────────────────────────────────────
    await allerAuPanneau(page, 'panneauCharges');
    await page.waitForTimeout(400);
    await parLaPorte(page, {
      ecran: 'Modifier une charge', ouvrir: '[data-action="editVariableCharge"]',
      cible: '#modalAddVariableCharge.active', largeur: px, doigt, portee: 'À deux'
    });

    await contexte.close();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // LE RAPPORT
  // ═════════════════════════════════════════════════════════════════════════
  const md = composer();
  writeFileSync(SORTIE, md);

  const aSignaler = releves.filter(r => r.retenus && compte(r.retenus) > 0);
  console.log(resume(aSignaler));

  // ── LA PRÉMISSE, et elle seule peut faire échouer ce fichier ─────────────
  expect(releves.length, 'aucun écran visité').toBeGreaterThan(20);
  expect(totalExamines, 'aucun élément examiné').toBeGreaterThan(500);
  expect(totalCommandes, 'aucune commande sondée').toBeGreaterThan(50);
});

/** Combien de cas retenus, toutes mesures confondues */
function compte(retenus) {
  return Object.values(retenus).reduce((n, liste) => n + liste.length, 0);
}

const TITRES = {
  deborde: 'DÉBORDE — la boîte sort de l\'écran',
  petit: `PETIT — commande sous ${CIBLE} px`,
  defileX: 'DÉFILE-X — le contenu déborde une boîte qui le contraint',
  recouvert: 'RECOUVERT — un autre élément reçoit l\'appui'
};

/** Le résumé console, taillé pour tenir sur un écran quand tout va bien */
function resume(aSignaler) {
  const lignes = [
    '',
    `RELEVÉ DE MISE EN PAGE — ${releves.length} écrans, ${totalExamines} éléments, `
      + `${totalCommandes} commandes sondées`,
    `Faux positifs connus écartés : ${ecartesGlobaux.length}`
      + ` · commandes rognées par un conteneur défilant, non sondées : ${totalRognes}`,
    ''
  ];

  if (aSignaler.length === 0) {
    lignes.push('  Rien à signaler.', '');
  } else {
    for (const r of aSignaler) {
      const parts = Object.entries(r.retenus)
        .filter(([, liste]) => liste.length)
        .map(([mesure, liste]) => `${mesure} ×${liste.length}`)
        .join(', ');
      lignes.push(`  ${r.ecran} — ${r.largeur} px — ${r.portee} : ${parts}`);
    }
    lignes.push('');
  }

  lignes.push(`  Le détail est dans ${SORTIE}.`, '');
  return lignes.join('\n');
}

/** Le rapport complet, en Markdown */
function composer() {
  const commit = (() => {
    try { return execSync('git rev-parse --short HEAD').toString().trim(); }
    catch { return 'inconnu'; }
  })();

  const l = [];
  l.push('# Relevé de mise en page');
  l.push('');
  l.push(`**${new Date().toISOString().slice(0, 10)}, sur \`${commit}\`.** `
    + `${releves.length} écrans parcourus, ${totalExamines} éléments examinés, `
    + `${totalCommandes} commandes sondées.`);
  l.push('');
  l.push('> **Ce relevé n\'est PAS un filet complet, et deux familles lui échappent.**');
  l.push('>');
  l.push('> - **Les contrastes** — rien ici ne lit une couleur.');
  l.push('> - **Le texte qui déborde À L\'INTÉRIEUR d\'un élément qui, lui, tient dans');
  l.push('>   l\'écran** — le montant d\'une carte d\'enveloppe écrit un mot par ligne.');
  l.push('>   Les quatre mesures portent sur des BOÎTES, pas sur du texte dans une boîte.');
  l.push('>');
  l.push('> Elles restent à l\'œil. Et un débordement relevé ici n\'est pas forcément un');
  l.push('> défaut à corriger : le débord de `.summary-row` est délibéré.');
  l.push('');

  const aSignaler = releves.filter(r => r.retenus && compte(r.retenus) > 0);
  const muets = releves.filter(r => r.retenus && compte(r.retenus) === 0);
  const absents = releves.filter(r => r.absent);

  l.push('## Ce qu\'il y a à regarder');
  l.push('');
  if (aSignaler.length === 0) {
    l.push('Rien. Les ' + muets.length + ' écrans mesurés n\'ont rien rendu.');
    l.push('');
  } else {
    for (const r of aSignaler) {
      l.push(`### ${r.ecran} — ${r.largeur} px — ${r.portee}`);
      l.push('');
      for (const [mesure, liste] of Object.entries(r.retenus)) {
        if (!liste.length) continue;
        l.push(`**${TITRES[mesure]}** — ${liste.length}`);
        l.push('');
        for (const c of liste) l.push(`- \`${c.quoi}\` — ${c.detail}`);
        l.push('');
      }
    }
  }

  l.push('## Écrans muets');
  l.push('');
  l.push(muets.length
    ? muets.map(r => `${r.ecran} (${r.largeur}, ${r.portee})`).join(' · ')
    : 'aucun');
  l.push('');

  if (absents.length) {
    l.push('## Écrans NON mesurés');
    l.push('');
    l.push('Leur porte n\'était pas à l\'écran, ou l\'écran ne s\'est pas ouvert. '
      + 'Ce n\'est pas « rien à signaler » : c\'est « pas regardé ».');
    l.push('');
    for (const r of absents) l.push(`- **${r.ecran}** (${r.largeur} px) — ${r.absent}`);
    l.push('');
  }

  l.push('## Faux positifs connus, vus et écartés');
  l.push('');
  l.push('Ils sont comptés ici plutôt que retirés en silence : un relevé qui écarte '
    + 'sans le dire ment dans le sens rassurant.');
  l.push('');
  for (const regle of ECARTS) {
    const n = ecartesGlobaux.filter(e => e.regle === regle.nom).length;
    l.push(`- **${regle.nom}** — ${n} écarté${n > 1 ? 's' : ''}. ${regle.raison}`);
  }
  l.push('');
  l.push(`Total écarté : ${ecartesGlobaux.length}.`);
  l.push('');
  l.push(`Et ${totalRognes} commandes n'ont pas été sondées du tout : un conteneur `
    + 'défilant les rogne, donc leurs coordonnées rendent l\'élément peint par-dessus, '
    + 'qui n\'y est pour rien. Ce n\'est ni un défaut ni un faux positif — c\'est une '
    + 'surface que ce relevé ne sait pas mesurer, et le dire vaut mieux que de la compter.');
  l.push('');

  return l.join('\n');
}
