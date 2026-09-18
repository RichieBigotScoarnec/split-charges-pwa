import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Régler un solde à MONTANT LIBRE
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE QUE LE LOT CHANGE
 *
 * « Régler ce solde » écrivait le montant EXACT du solde après une question
 * fermée. On rembourse pourtant rarement au centime : on arrondit — 70 € pour
 * 66,94 € —, on paie en deux fois, ou on verse ce que la banque a débité. Un
 * paiement partiel obligeait à retrouver la carte « Remboursements » et son
 * bouton « + Ajouter », et rien depuis « Régler » n'y menait : on en concluait
 * que ce n'était pas possible.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AUX DEUX LARGEURS, ET C'EST MESURÉ PLUTÔT QUE SUPPOSÉ
 *
 * Le viewport par défaut de Playwright est 1280 × 720 et s'applique EN SILENCE
 * à tout fichier sans `test.use`. Trois contrôles de ce dépôt ont mesuré un
 * écran que personne n'affiche. Chaque cas est donc joué à 390 px et à 320 px,
 * la largeur où la modale est le plus à l'étroit.
 */

const LARGEURS = [
  { nom: '390 px', viewport: { width: 390, height: 844 } },
  { nom: '320 px', viewport: { width: 320, height: 640 } }
];

/** Ce que `formatCurrency` écrit : espaces fines insécables comprises */
const chiffres = (texte) => texte.replace(/[\s\u202f\u00a0]/g, '');

/**
 * Sème un déséquilibre connu : salaires égaux, une charge avancée par une seule
 * personne. Le solde vaut donc la moitié de la charge.
 *
 * Passe par la BASE et non par les formulaires : ces cas éprouvent la modale de
 * règlement, pas la saisie d'une charge, et un semis par l'écran ferait tomber
 * ce fichier pour une raison qui ne le concerne pas.
 */
async function semerUnSolde(page, { montant, payeur }) {
  await page.evaluate(async ({ montant, payeur }) => {
    const { dbUpdate, dbSet } = await import('/js/db.js');
    const mois = document.getElementById('periodSelect').value;
    const salaires = { vous: 2000, conjointe: 2000 };
    await dbSet('salaries', salaires);
    await dbUpdate(undefined, {
      [`periods/${mois}/salaries`]: salaires,
      [`periods/${mois}/variableCharges/semee`]: {
        description: 'Charge semée', amount: montant, category: 'Courses',
        paidBy: payeur, deleted: false
      }
    });
    await window.changePeriod();
  }, { montant, payeur });
  await page.waitForTimeout(1200);
}

/**
 * L'autre personne saisit une dépense pendant que la modale est à l'écran
 *
 * Écrit directement en base, sans toucher l'état local : c'est exactement ce
 * que voit cet appareil-ci — rien, jusqu'à la relecture.
 */
async function uneDepenseArriveEnFace(page, { montant, payeur }) {
  await page.evaluate(async ({ montant, payeur }) => {
    const { dbUpdate } = await import('/js/db.js');
    const mois = document.getElementById('periodSelect').value;
    await dbUpdate(undefined, {
      [`periods/${mois}/variableCharges/intruse`]: {
        description: 'Arrivée en face', amount: montant, category: 'Courses',
        paidBy: payeur, deleted: false
      }
    });
  }, { montant, payeur });
}

/**
 * Les remboursements RÉELLEMENT écrits dans le mois affiché
 *
 * ⚠️ `window.__db` porte DEUX représentations du même nœud — l'objet parent
 * `…/reimbursements` ET une clé plate par enfant —, c'est écrit dans
 * `_harness.js` et c'est ce que fait Realtime Database vu d'un seul arbre.
 * Un filtre par `includes('…/reimbursements')` compte donc chaque écriture
 * DEUX fois : mesuré, un seul appui rendait « 150, 150 ».
 *
 * Un contrôle qui exige `[150]` rougit alors sur un dépôt sain, et un contrôle
 * qui exige `0` reste vert quoi qu'il arrive. On ne retient que les FEUILLES —
 * un segment après `reimbursements` —, ce que `push().set()` écrit.
 */
const reglementsEcrits = (page) => page.evaluate(() => {
  const mois = document.getElementById('periodSelect').value;
  const feuille = new RegExp(`periods/${mois}/reimbursements/[^/]+$`);
  return Object.entries(window.__db)
    .filter(([cle]) => feuille.test(cle))
    .map(([, valeur]) => valeur)
    .filter(r => r && !r.deleted)
    .map(r => r.amount);
});

const modale = (page) => page.locator('#modalReglerSolde');
const champ = (page) => page.locator('#reglerSoldeMontant');
const phrase = (page) => page.locator('#reglerSoldeConsequence');
const valider = (page) => page.locator('#reglerSoldeValider');

async function ouvrirLeReglement(page) {
  await allerAuPanneau(page, 'panneauBilan');
  await page.locator('.btn-settle').click();
  await expect(modale(page)).toHaveClass(/active/, { timeout: 10000 });
}

for (const largeur of LARGEURS) {
  test.describe(`Règlement à montant libre — ${largeur.nom}`, () => {
    test.use({ viewport: largeur.viewport });

    test.beforeEach(async ({ page }) => {
      await setupFirebaseMock(page);
      await waitForApp(page);
    });

    test('un paiement EXACT ramène le solde à zéro, en deux gestes', async ({ page }) => {
      // Le cas au centime reste à un appui : ouvrir, valider. Le champ porte
      // déjà le montant.
      await semerUnSolde(page, { montant: 300, payeur: 'vous' });
      await ouvrirLeReglement(page);

      await expect(champ(page)).toHaveValue('150,00');
      await expect(phrase(page)).toHaveText('Le solde du mois reviendra à zéro.');

      await valider(page).click();

      await expect(page.locator('#balanceBar')).toContainText('quilibr', { timeout: 10000 });
      await expect(page.locator('.btn-settle')).toHaveCount(0);
    });

    test('UN PAIEMENT PARTIEL : le reste annoncé est le pré-remplissage du geste suivant', async ({ page }) => {
      // La propriété qui compte, et elle enjambe deux gestes : ce que la phrase
      // promet est ce que l'application proposera ensuite. Si les deux
      // divergeaient, le second règlement écrirait un montant que personne n'a
      // annoncé — et le mois ne tomberait jamais à zéro.
      await semerUnSolde(page, { montant: 300, payeur: 'vous' });
      await ouvrirLeReglement(page);

      await champ(page).fill('40');
      await expect(phrase(page)).toContainText('Il restera');
      const annonce = chiffres(await phrase(page).innerText());
      expect(annonce, `la phrase n'annonce pas le reste : ${annonce}`).toContain('110,00€');

      await valider(page).click();
      await expect(modale(page)).not.toHaveClass(/active/, { timeout: 10000 });

      // Le geste suivant, sur le solde qui reste.
      await expect(page.locator('.btn-settle')).toBeVisible({ timeout: 10000 });
      await ouvrirLeReglement(page);
      await expect(champ(page)).toHaveValue('110,00');
      await expect(phrase(page)).toHaveText('Le solde du mois reviendra à zéro.');

      // Et le second règlement solde bien le mois : payer en deux fois, c'est
      // faire deux règlements — il n'y a pas d'échéancier à tenir.
      await valider(page).click();
      await expect(page.locator('#balanceBar')).toContainText('quilibr', { timeout: 10000 });
    });

    test('UN TROP-VERSÉ est accepté, et le héros change de sens', async ({ page }) => {
      // Aucun plafond : la protection contre la faute de frappe est la phrase.
      await semerUnSolde(page, { montant: 300, payeur: 'vous' });
      await ouvrirLeReglement(page);

      const heros = page.locator('#panneauBilan .bilan-heros-phrase');
      // Prémisse : le sens de départ est bien celui qu'on croit, sinon
      // « il a changé » ne dirait rien.
      await expect(heros).toContainText(/te doit/);

      await champ(page).fill('200');
      await expect(phrase(page)).toContainText(/devras|devra/);
      expect(chiffres(await phrase(page).innerText())).toContain('50,00€');

      await valider(page).click();

      await expect(heros).toContainText(/Tu dois/, { timeout: 10000 });
      expect(chiffres(await heros.innerText())).toContain('50,00€');
    });

    test('LE SOLDE MODIFIÉ ENTRE OUVERTURE ET VALIDATION : rien n\'est écrit', async ({ page }) => {
      await semerUnSolde(page, { montant: 300, payeur: 'vous' });
      await ouvrirLeReglement(page);

      await champ(page).fill('100');
      await expect(phrase(page)).toContainText('Il restera');

      // 200 € de plus avancés par l'autre : le solde passe de 150 à 50.
      await uneDepenseArriveEnFace(page, { montant: 200, payeur: 'conjointe' });

      await valider(page).click();

      // La modale RESTE ouverte, et le montant saisi est conservé : personne ne
      // l'a contesté, c'est sa conséquence qui a changé. La fermer ferait
      // retaper.
      await expect(modale(page)).toHaveClass(/active/);
      await expect(champ(page)).toHaveValue('100');
      await expect(page.locator('#reglerSoldeAvertissement')).toBeVisible({ timeout: 10000 });

      // Et la phrase est à jour : 100 sur un solde de 50, c'est un trop-versé.
      await expect(phrase(page)).toContainText(/devras|devra/);
      expect(chiffres(await phrase(page).innerText())).toContain('50,00€');

      // Rien n'a été écrit.
      const regles = await reglementsEcrits(page);
      expect(regles, `un règlement a été écrit sur un solde périmé : ${regles.join(', ')}`)
        .toEqual([]);

      // Un SECOND appui, lui, écrit — sur le solde frais.
      await valider(page).click();
      await expect(modale(page)).not.toHaveClass(/active/, { timeout: 10000 });
    });

    test('HORS LIGNE, le règlement est refusé', async ({ page }) => {
      // `dbGet` ne lève pas hors ligne : il sert le miroir. Une phrase calculée
      // dessus serait une promesse faite sur un solde périmé, et `dbPush`
      // mettrait l'écriture en file en annonçant un versement enregistré.
      await semerUnSolde(page, { montant: 300, payeur: 'vous' });
      await page.evaluate(async () => {
        const { signalerLiaison } = await import('/js/db.js');
        signalerLiaison(true);   // la liaison a été jointe une fois…
        signalerLiaison(false);  // … puis elle est rompue : c'est une panne
      });

      await allerAuPanneau(page, 'panneauBilan');
      await page.locator('.btn-settle').click();

      // Rien ne s'ouvre, et l'écran dit pourquoi.
      await expect(modale(page)).not.toHaveClass(/active/);
      await expect(page.locator('.toast, #toastContainer'))
        .toContainText(/hors ligne/i, { timeout: 10000 });
    });

    test('LE BOUTON DE VALIDATION N\'EST NI « SUPPRIMER » NI ROUGE', async ({ page }) => {
      // Le geste passait par la confirmation générique, dont le bouton porte
      // « Supprimer » en `--danger` — le mot et la couleur d'une destruction,
      // pour un paiement.
      await semerUnSolde(page, { montant: 300, payeur: 'vous' });
      await ouvrirLeReglement(page);

      await expect(valider(page)).not.toHaveText(/supprimer/i);
      await expect(valider(page)).toContainText(/enregistrer/i);

      // La couleur se lit sur le JETON rendu, pas sur un hexadécimal : un
      // recalibrage de `--danger-color` ne fait pas tomber ce contrôle, un
      // bouton repeint en danger si.
      const [fond, danger, temoinPrimaire] = await page.evaluate(() => {
        const bouton = document.getElementById('reglerSoldeValider');
        const mesurer = (jeton) => {
          const t = document.createElement('span');
          t.style.background = `var(${jeton})`;
          bouton.parentElement.appendChild(t);
          const c = getComputedStyle(t).backgroundColor;
          t.remove();
          return c;
        };
        return [getComputedStyle(bouton).backgroundColor,
          mesurer('--danger-color'), mesurer('--primary-color')];
      });

      // Témoin : les deux jetons rendent des couleurs DISTINCTES. Confondus,
      // « ce n'est pas du danger » serait vrai d'un bouton peint en danger.
      expect(danger, 'témoin : danger et primaire rendent la même couleur')
        .not.toBe(temoinPrimaire);
      expect(fond, 'le bouton de paiement est peint en danger').not.toBe(danger);
    });

    test('UN DOUBLE APPUI SUR LE BOUTON N\'ÉCRIT QU\'UNE LIGNE', async ({ page }) => {
      // Le verrou `reglementEnCours` a suivi l'écriture au lot du montant
      // libre : il gardait l'ouverture, qui allait jusqu'au `dbPush`, et il
      // garde désormais la validation. Un contrôle unitaire tient déjà la
      // propriété en appelant deux fois la fonction ; celui-ci tient le
      // BOUTON, c'est-à-dire ce que la personne touche.
      //
      // Deux `click()` dans la MÊME tâche, et non deux gestes espacés : c'est
      // la seule forme déterministe de la course. Le second entre pendant que
      // la relecture du premier est en vol — la fenêtre que le verrou ferme.
      await semerUnSolde(page, { montant: 300, payeur: 'vous' });
      await ouvrirLeReglement(page);
      await expect(champ(page)).toHaveValue('150,00');

      await page.evaluate(() => {
        const bouton = document.getElementById('reglerSoldeValider');
        bouton.click();
        bouton.click();
      });

      // On attend la FERMETURE, pas le solde soldé : attendre « équilibré »
      // ferait accuser la barre de solde par un mutant dont la faute est
      // d'avoir écrit deux lignes. Un contrôle doit nommer ce qu'il a vu.
      await expect(modale(page)).not.toHaveClass(/active/, { timeout: 10000 });
      await page.waitForTimeout(1500);

      const montants = await reglementsEcrits(page);
      expect(montants, `montants écrits : ${montants.join(', ')}`).toEqual([150]);

      // Et la conséquence, une fois la cause nommée : deux lignes de 150
      // feraient basculer le solde de 150 dans l'autre sens.
      await expect(page.locator('#balanceBar')).toContainText('quilibr', { timeout: 10000 });
    });

    test('la modale tient dans l\'écran, et son champ est prêt à recevoir', async ({ page }) => {
      await semerUnSolde(page, { montant: 300, payeur: 'vous' });
      await ouvrirLeReglement(page);

      // Le focus arrive sur le montant, et son contenu est SÉLECTIONNÉ : sans
      // cela, taper « 70 » sur « 150.00 » donnerait « 150.0070 ».
      await expect.poll(async () => page.evaluate(() => {
        const actif = document.activeElement;
        if (!actif || actif.id !== 'reglerSoldeMontant') return 'focus absent';
        return actif.selectionEnd - actif.selectionStart === actif.value.length
          ? 'prêt' : 'non sélectionné';
      }), { timeout: 5000 }).toBe('prêt');

      // Une frappe REMPLACE le pré-remplissage.
      await page.keyboard.type('70');
      await expect(champ(page)).toHaveValue('70');

      // Aucun défilement latéral : on BORNE, on n'égale pas — une géométrie
      // rendue est fractionnaire.
      const debord = await page.evaluate(() =>
        document.documentElement.scrollWidth - window.innerWidth);
      expect(debord, `la page déborde de ${debord} px`).toBeLessThanOrEqual(0);

      // Les commandes de la modale restent atteignables au doigt.
      const trop = await page.evaluate(() => {
        const dehors = [];
        for (const el of document.querySelectorAll('#modalReglerSolde button, #modalReglerSolde input')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          if (r.right > window.innerWidth + 0.5 || r.left < -0.5) {
            dehors.push(`${el.id || el.className} : ${Math.round(r.left)}→${Math.round(r.right)}`);
          }
        }
        return dehors;
      });
      expect(trop, `commandes hors de l'écran : ${trop.join(', ')}`).toEqual([]);
    });
  });
}

// ───────────────────────────────────────────────────────────────────────────
// LE CAS QUE LE CONTRÔLE VOISIN NE VISITE PAS — et il a SA MISE EN PLACE.
//
// Le voisin (« la modale tient dans l'écran ») mesure la BONNE propriété, et
// son mutant tombe : retirer la sélection le fait rougir. Il ne visite
// simplement pas la condition où le geste échoue — un `focus()` différé qui
// n'aboutit pas. Safari iOS ignore un `focus()` programmatique hors de la
// tâche du geste, et `showModal` pose le sien dans un `setTimeout(…, 100)`.
//
// On ne simule pas Safari : on neutralise le seul maillon dont le soupçon
// porte — tout `focus()` appelé depuis un minuteur — et on vérifie que le
// champ est prêt QUAND MÊME. Mesuré avant le correctif : `selection 6..6`,
// curseur en fin, champ non focalisé, c'est-à-dire le symptôme rapporté.
//
// ⚠️ POURQUOI CE BLOC A SA PROPRE MISE EN PLACE, et pas un `reload()` dans le
// test. La première rédaction posait la surcharge APRÈS le démarrage du
// `beforeEach` commun, puis rechargeait pour la faire prendre — donc DEUX
// démarrages complets de l'application. Le second n'est pas venu en 30 s sous
// la CI, aux deux largeurs (run 35342446934). C'était bien le second
// démarrage et non la surcharge : chronométré sous émulateurs,
// `reload` → `data-app-ready` rend **601 ms sans** la surcharge et **579 ms
// avec**. Posée avant la PREMIÈRE navigation, elle ne coûte aucun
// démarrage — et elle décrit mieux ce qu'on modélise, puisqu'un appareil qui
// ignore le focus différé l'ignore dès l'ouverture, pas seulement après un
// rechargement.
for (const largeur of LARGEURS) {
  test.describe(`Le focus différé n'aboutit pas — ${largeur.nom}`, () => {
    test.use({ viewport: largeur.viewport });

    test.beforeEach(async ({ page }) => {
      await setupFirebaseMock(page);
      await page.addInitScript(() => {
        const vraiFocus = HTMLElement.prototype.focus;
        let dansUnMinuteur = false;
        const vraiSetTimeout = window.setTimeout;
        window.setTimeout = function (fn, ...reste) {
          return vraiSetTimeout(function (...args) {
            dansUnMinuteur = true;
            try { return fn.apply(this, args); } finally { dansUnMinuteur = false; }
          }, ...reste);
        };
        HTMLElement.prototype.focus = function (...args) {
          if (dansUnMinuteur) return;
          return vraiFocus.apply(this, args);
        };
      });
      await waitForApp(page);
    });

    test('LE CHAMP EST PRÊT MÊME SI LE FOCUS DIFFÉRÉ N\'ABOUTIT PAS', async ({ page }) => {
      await semerUnSolde(page, { montant: 300, payeur: 'vous' });
      await ouvrirLeReglement(page);

      // TÉMOIN DE LA NEUTRALISATION : sans lui, ce cas serait vert sur un
      // navigateur où le focus différé aboutit — donc sur celui-ci —, et il
      // ne mesurerait rien de ce qu'il prétend tenir.
      const differeNeutralise = await page.evaluate(() => new Promise((resoudre) => {
        const temoin = document.createElement('input');
        document.body.appendChild(temoin);
        setTimeout(() => {
          temoin.focus();
          const pris = document.activeElement === temoin;
          temoin.remove();
          resoudre(!pris);
        }, 0);
      }));
      expect(differeNeutralise, 'témoin : le focus différé aboutit encore').toBe(true);

      // La propriété : le champ est focalisé ET son contenu sélectionné.
      const etat = await page.evaluate(() => {
        const actif = document.activeElement;
        const c = document.getElementById('reglerSoldeMontant');
        return { focalise: actif === c, debut: c.selectionStart, fin: c.selectionEnd,
          longueur: c.value.length };
      });
      expect(etat.focalise, 'le champ n\'a pas le focus').toBe(true);
      expect(etat.debut, 'la sélection ne part pas du début').toBe(0);
      expect(etat.fin, 'la sélection ne va pas jusqu\'au bout').toBe(etat.longueur);

      // Et le COMPORTEMENT OBSERVABLE, qui est ce qui compte : taper « 100 »
      // sans toucher le champ remplace le pré-remplissage.
      await page.keyboard.type('100');
      await expect(champ(page)).toHaveValue('100');
    });
  });
}
