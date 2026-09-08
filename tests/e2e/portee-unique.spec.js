import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * L'écran ne montre jamais deux portées différentes en même temps
 *
 * ─────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MESURÉ SUR `main` AVANT TOUTE CORRECTION — ✅ corrigé le
 * 2026-09-08 par la fusion des deux commandes, ce fichier reste pour empêcher
 * qu'on en recrée une seconde
 *
 * L'application porte DEUX sélecteurs de portée, et ils se contredisent :
 *
 *   - le segment du lot 5 — « À deux » / « Moi » / « Privé » — qui écrit
 *     `porteeCourante` dans `state.js` ;
 *   - la bascule du résumé — « À deux » / « Moi ce mois-ci » — qui écrit
 *     `ongletDuResume`, une variable de module de `summary.js`.
 *
 * Relevé le 2026-09-08, à 390 px, salaires semés :
 *
 *   moment                              segment   onglet   accord
 *   au départ                           deux      duo      oui
 *   après le segment « Moi »            solo      duo      NON
 *   après l'onglet « Moi ce mois-ci »   solo      solo     oui
 *   après retour au segment « À deux »  deux      solo     NON
 *
 * C'est le défaut `normalizePair` : deux fabriques d'une même grandeur. Le
 * lot 5 l'a créé — il a mesuré ce que le sélecteur COÛTAIT, jamais ce qu'il
 * DOUBLAIT.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LA PROPRIÉTÉ, ET POURQUOI ELLE NE NOMME NI L'UN NI L'AUTRE
 *
 * « L'écran ne montre jamais deux portées différentes en même temps. »
 *
 * Elle ne parle ni de `porteeCourante` ni d'`ongletDuResume` : le lot qui vient
 * en supprimera un, et un contrôle écrit sur les deux variables mourrait avec
 * celle qu'on retire. Il cherche donc, dans l'écran rendu, **tout ce qui
 * s'annonce actif et porte le vocabulaire d'une portée**, et exige que ces
 * annonces s'accordent.
 *
 * Conséquence voulue : le jour où il ne reste qu'un sélecteur, il en trouve un
 * seul, ne trouve aucune contradiction, et reste vert. Il aura protégé la
 * fusion sans avoir à la connaître.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE QUI SE PASSE MAINTENANT QUE LA FUSION EST FAITE
 *
 * Les quatre cas restent, et aucun n'est devenu un contrôle qui ne mesure
 * rien :
 *
 *   - les deux premiers relèvent une portée annoncée et exigent qu'elle soit
 *     seule. Leur prémisse — au moins une annonce — les empêche d'être
 *     satisfaits par un écran muet ;
 *   - le troisième tient qu'un aller-retour ne laisse pas d'annonce en
 *     arrière ;
 *   - le quatrième **parcourt toutes les commandes de portée de l'écran, quelles
 *     qu'elles soient**, et vérifie l'accord après chacune. C'est lui qui
 *     retombe si l'on rebranche une seconde source : il n'a pas besoin de
 *     savoir qu'elle existe pour la trouver.
 */

/**
 * Le vocabulaire que l'écran emploie pour dire une portée
 *
 * ── PAS DE `\b` CONTRE UNE LETTRE ACCENTUÉE ──
 *
 * Première rédaction : `/\bà deux\b/i` et `/\bprivé\b/i`. Aucune des deux ne
 * correspondait jamais. En JavaScript, `\b` se définit sur `[A-Za-z0-9_]` : « à »
 * et « é » n'en sont pas, il n'y a donc aucune frontière de mot à cet endroit.
 *
 * Le coût n'était pas une erreur visible mais un FAUX VERT : « À deux » n'étant
 * jamais reconnu, le cas « après avoir choisi Moi » ne trouvait qu'une seule
 * annonce — celle du segment — et concluait à l'accord. Il passait sur la
 * divergence même qu'il devait montrer.
 *
 * `moi` reste borné : il est en ASCII, et sans borne il correspondrait à
 * « mois ».
 */
const VOCABULAIRE = [
  { motif: /à deux/i, portee: 'deux' },
  { motif: /\bmoi\b/i, portee: 'solo' },
  { motif: /privé/i, portee: 'prive' }
];

function moisCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Deux salaires et deux charges : sans eux, la bascule du résumé n'est pas rendue */
function semence() {
  const p = moisCourant();
  return {
    'household/salaries': { vous: 2500, conjointe: 1800 },
    [`household/periods/${p}/salaries`]: { vous: 2500, conjointe: 1800 },
    [`household/periods/${p}/variableCharges/v1`]: {
      description: 'Courses', amount: 120, category: 'Courses',
      paidBy: 'vous', date: `${p}-03`, deleted: false
    },
    [`household/periods/${p}/variableCharges/v2`]: {
      description: 'Massage', amount: 60, category: 'Perso',
      paidBy: 'vous', date: `${p}-05`, deleted: false, perimetre: 'solo'
    }
  };
}

/**
 * Les portées que l'écran annonce ACTIVES, à cet instant
 *
 * Cherchées par ce qu'elles annoncent — `aria-checked` ou `aria-selected` à
 * vrai — et par le mot qu'elles portent, jamais par une classe, un identifiant
 * ou un `data-action`. C'est ce qui permet à ce cas de survivre au sélecteur
 * qui disparaîtra.
 */
const porteesAnnoncees = (page) => page.evaluate((vocabulaire) => {
  const visible = (el) => Boolean(el.checkVisibility && el.checkVisibility())
    && el.getBoundingClientRect().height > 0;

  const actif = (el) => el.getAttribute('aria-checked') === 'true'
    || el.getAttribute('aria-selected') === 'true'
    || el.getAttribute('aria-current') === 'true';

  const trouvees = [];
  for (const el of document.querySelectorAll('[aria-checked], [aria-selected], [aria-current]')) {
    if (!visible(el) || !actif(el)) continue;
    const texte = (el.innerText || '').replace(/\s+/g, ' ').trim();
    for (const { source, flags, portee } of vocabulaire) {
      if (new RegExp(source, flags).test(texte)) {
        trouvees.push({ portee, texte: texte.slice(0, 40) });
        break;
      }
    }
  }
  return trouvees;
}, VOCABULAIRE.map((v) => ({ source: v.motif.source, flags: v.motif.flags, portee: v.portee })));

/**
 * Tout ce qui OFFRE une portée, actif ou non
 *
 * Le pendant de `porteesAnnoncees`, qui ne relève que l'annonce en cours. Ici
 * on cherche les commandes : mêmes attributs d'état, quelle que soit leur
 * valeur, même vocabulaire.
 *
 * L'`index` renvoyé porte sur la liste ENTIÈRE des porteurs d'attribut, panneaux
 * masqués compris, pour qu'un `.nth(index)` côté Playwright désigne le même
 * nœud. Seuls les visibles sont rendus — on ne touche pas ce qu'on ne voit pas.
 */
const commandesDePortee = (page) => page.evaluate((vocabulaire) => {
  const visible = (el) => Boolean(el.checkVisibility && el.checkVisibility())
    && el.getBoundingClientRect().height > 0;

  const trouvees = [];
  const tous = document.querySelectorAll('[aria-checked], [aria-selected], [aria-current]');

  tous.forEach((el, index) => {
    if (!visible(el)) return;
    const texte = (el.innerText || '').replace(/\s+/g, ' ').trim();
    for (const { source, flags, portee } of vocabulaire) {
      if (new RegExp(source, flags).test(texte)) {
        trouvees.push({ index, portee, texte: texte.slice(0, 40) });
        break;
      }
    }
  });

  return trouvees;
}, VOCABULAIRE.map((v) => ({ source: v.motif.source, flags: v.motif.flags, portee: v.portee })));

async function ouvrir(page) {
  await setupFirebaseMock(page);
  await page.addInitScript(`window.__db = ${JSON.stringify(semence())};`);
  await waitForApp(page);
  await page.waitForTimeout(1200);
  await allerAuPanneau(page, 'panneauBilan');
}

/** Toutes les annonces disent-elles la même portée ? */
function accord(annonces) {
  return [...new Set(annonces.map((a) => a.portee))];
}

test.describe('Une seule portée à l\'écran', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await ouvrir(page);
  });

  test('au départ, l\'écran n\'annonce qu\'une portée', async ({ page }) => {
    const annonces = await porteesAnnoncees(page);

    // La prémisse : sans annonce, ce cas est satisfait par un écran muet.
    expect(annonces.length,
      'aucune portée annoncée : l\'écran ne dit nulle part sur quoi il porte')
      .toBeGreaterThan(0);

    expect(accord(annonces),
      `l'écran annonce ${accord(annonces).length} portées à la fois — `
      + annonces.map((a) => `« ${a.texte} » → ${a.portee}`).join(' | '))
      .toHaveLength(1);
  });

  test('après avoir choisi « Moi », l\'écran n\'annonce toujours qu\'une portée', async ({ page }) => {
    await page.locator('.panneau--actif [data-portee="solo"]').click();
    await page.waitForTimeout(600);

    const annonces = await porteesAnnoncees(page);
    expect(annonces.length, 'aucune portée annoncée').toBeGreaterThan(0);

    expect(accord(annonces),
      `l'écran annonce ${accord(annonces).length} portées à la fois — `
      + annonces.map((a) => `« ${a.texte} » → ${a.portee}`).join(' | '))
      .toHaveLength(1);
  });

  test('un aller-retour sur le segment laisse l\'écran d\'accord avec lui-même', async ({ page }) => {
    // Le témoin du cas précédent : le segment seul est cohérent. Sans lui, on
    // pourrait croire que toute manipulation produit une contradiction, et
    // chercher le défaut dans le segment plutôt qu'entre les deux sélecteurs.
    await page.locator('.panneau--actif [data-portee="solo"]').click();
    await page.waitForTimeout(600);
    await page.locator('.panneau--actif [data-portee="deux"]').click();
    await page.waitForTimeout(600);

    const annonces = await porteesAnnoncees(page);
    expect(annonces.length, 'aucune portée annoncée').toBeGreaterThan(0);

    expect(accord(annonces),
      `l'écran annonce ${accord(annonces).length} portées à la fois — `
      + annonces.map((a) => `« ${a.texte} » → ${a.portee}`).join(' | '))
      .toHaveLength(1);
  });

  test('TOUTE commande de portée laisse l\'écran d\'accord avec lui-même', async ({ page }) => {
    /**
     * ── LE CAS QUI RETOMBE SI L'ON REBRANCHE UNE SECONDE SOURCE ──
     *
     * Il ne connaît aucune commande par son nom. Il relève **tout ce qui offre
     * une portée** — un élément qui porte l'un des trois attributs d'état ARIA,
     * quelle qu'en soit la valeur, et dont le texte nomme une portée — puis
     * touche chacun et exige l'accord après chaque geste.
     *
     * L'attribut d'état est ce qui sépare une commande de portée d'un bouton
     * qui parle de la même chose : l'accès rapide « Privé » de la carte du mois
     * ouvre une modale, il n'annonce pas un état, et il n'a rien à faire ici.
     *
     * Le retour compte autant que l'aller — une seconde source peut s'accorder
     * dans un sens et rester en arrière dans l'autre — et c'est pour cela que
     * la boucle passe sur toutes les commandes plutôt que sur une seule.
     */
    const commandes = await commandesDePortee(page);

    // Sans cette prémisse, une page sans aucune commande parcourrait zéro tour
    // de boucle et rendrait vert. Trois segments aujourd'hui ; le seuil dit
    // « il y a de quoi éprouver », pas « il y en a exactement trois ».
    expect(commandes.length, 'aucune commande de portée : ce cas ne mesure rien')
      .toBeGreaterThan(1);

    for (const { index, texte } of commandes) {
      await page.locator('[aria-checked], [aria-selected], [aria-current]')
        .nth(index).click();
      await page.waitForTimeout(600);

      const annonces = await porteesAnnoncees(page);
      expect(annonces.length, `après « ${texte} » : aucune portée annoncée`)
        .toBeGreaterThan(0);

      expect(accord(annonces),
        `après « ${texte} », l'écran annonce ${accord(annonces).length} portées `
        + 'à la fois — '
        + annonces.map((a) => `« ${a.texte} » → ${a.portee}`).join(' | '))
        .toHaveLength(1);
    }
  });
});
