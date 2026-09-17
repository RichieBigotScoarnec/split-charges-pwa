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
      const regles = await page.evaluate(() => {
        const mois = document.getElementById('periodSelect').value;
        const noeud = Object.entries(window.__db)
          .filter(([k]) => k.includes(`periods/${mois}/reimbursements`))
          .map(([, v]) => v);
        return noeud.flatMap(v => (v && typeof v === 'object' && !('amount' in v)
          ? Object.values(v) : [v])).filter(r => r && !r.deleted).length;
      });
      expect(regles, 'un règlement a été écrit sur un solde périmé').toBe(0);

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
