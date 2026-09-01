import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Le bilan d'un cycle de thème, sur la page réelle
 *
 * C'est la question du foyer : « si j'ai plusieurs budgets vacances ou
 * week-ends, combien j'ai dépensé en tout, et combien mensualiser — ou, si une
 * mensualisation existe déjà, combien ajouter ou baisser ? »
 *
 * `tests/utils/veille.test.js` verrouille l'arithmétique. Ce fichier établit
 * trois choses qu'aucun contrôle unitaire ne peut établir :
 *
 * 1. L'observation **atteint l'écran**, avec son total de cycle et sa part
 *    mensuelle — elle est la dernière du tableau, donc rangée sous « N autres »
 *    dès que trois autres cartes paraissent.
 * 2. Elle **ne porte aucun bouton**. C'est une garde, pas une omission :
 *    `anticiper` additionne les montants de toutes les cartes qui portent une
 *    proposition pour juger la capacité d'épargne, et une proposition ici
 *    ferait compter deux fois le même argent — mesuré ailleurs à 432 €/mois au
 *    lieu de 225.
 * 3. Une seule enveloppe à terme n'en produit pas : `provisionARenouveler` dit
 *    déjà tout, et un total d'un seul terme n'ajoute rien.
 */

/** Le mois affiché par l'application au moment du test */
function moisCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Le mois situé `n` mois après `p` */
function moisPlus(p, n) {
  const rang = (Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1) + n;
  return `${Math.floor(rang / 12)}-${String((rang % 12) + 1).padStart(2, '0')}`;
}

/**
 * Deux cagnottes « Vacances » arrivées à terme, et une troisième qui court
 *
 * Les chiffres sont choisis pour être exacts au centime, et le total de cycle
 * est réparti sur DEUX mois : `depense` est le cumul de tous les mois, et un
 * total pris sur le seul mois affiché est le piège que ce champ existe pour
 * éviter.
 *
 *   Vacances été   — 900 € le mois dernier + 300 € ce mois = 1 200 → 100 €/mois
 *   Vacances hiver — 600 € ce mois                                 →  50 €/mois
 *   ────────────────────────────────────────────────────────────────────────
 *   Cycle : 1 800 €, à mensualiser à 150 €.
 *
 * La troisième, « Vacances 2028 », n'est pas à terme : elle est la
 * mensualisation DÉJÀ EN PLACE, à laquelle l'écart se compare. Son objectif
 * divisé par ses sept mois restants donne un compte rond.
 *
 * @param {number} objectifEnCours - 700 → 100 €/mois, 1 400 → 200 €/mois
 */
function semer(objectifEnCours) {
  const p = moisCourant();
  const precedent = moisPlus(p, -1);
  const loin = moisPlus(p, 6);

  const db = {
    'household/salaries': { vous: 2600, conjointe: 2100 },
    // Un TABLEAU : ce que `normaliserEnveloppes` attend, et ce que Realtime
    // Database rend sur des clés numériques consécutives.
    'household/envelopes': [
      {
        id: 'vac-ete', label: 'Vacances été', icon: '🏖️', nature: 'cagnotte',
        rang: 'provision', budget: 800, fin: `${p}-28`, theme: 'Vacances'
      },
      {
        id: 'vac-hiver', label: 'Vacances hiver', icon: '⛷️', nature: 'cagnotte',
        rang: 'provision', budget: 400, fin: `${p}-28`, theme: 'Vacances'
      },
      {
        id: 'vac-2028', label: 'Vacances 2028', icon: '🧳', nature: 'cagnotte',
        rang: 'provision', budget: objectifEnCours, fin: `${loin}-28`, theme: 'Vacances'
      }
    ],
    [`household/periods/${precedent}/salaries`]: { vous: 2600, conjointe: 2100 },
    [`household/periods/${p}/salaries`]: { vous: 2600, conjointe: 2100 }
  };

  db[`household/periods/${precedent}/variableCharges/e1`] = {
    description: 'Camping', amount: 900, category: 'Loisirs',
    paidBy: 'vous', envelope: 'vac-ete', date: `${precedent}-14`, deleted: false
  };
  db[`household/periods/${p}/variableCharges/e2`] = {
    description: 'Restaurant', amount: 300, category: 'Restos',
    paidBy: 'conjointe', envelope: 'vac-ete', date: `${p}-03`, deleted: false
  };
  db[`household/periods/${p}/variableCharges/h1`] = {
    description: 'Forfait ski', amount: 600, category: 'Loisirs',
    paidBy: 'vous', envelope: 'vac-hiver', date: `${p}-05`, deleted: false
  };

  return db;
}

async function ouvrir(page, db) {
  await setupFirebaseMock(page);
  await page.addInitScript(`window.__db = ${JSON.stringify(db)};`);
  await waitForApp(page);
  await page.waitForTimeout(1200);
}

/**
 * La carte de cycle, dépliée si le premier écran l'a reléguée
 *
 * Le tableau est trié par urgence puis par clé, et `theme-a-renouveler` vient
 * après `provision-a-renouveler` : dès que trois cartes paraissent, celle-ci
 * tombe sous « N autres ». Ce n'est pas un défaut — le premier écran appartient
 * au solde — mais un contrôle qui l'ignorerait mesurerait le classement plutôt
 * que la carte.
 */
async function carteDeCycle(page) {
  const reste = page.locator('.veille-reste');
  if (await reste.count() > 0) {
    await reste.locator('summary').click();
    await page.waitForTimeout(250);
  }
  return page.locator('.veille-item', { hasText: 'sur ce cycle' });
}

test.describe('Le cycle d\'un thème sur le bilan', () => {
  test('elle additionne le cycle, et dit ce qu\'il faudrait mensualiser', async ({ page }) => {
    await ouvrir(page, semer(700));

    const carte = await carteDeCycle(page);
    await expect(carte).toHaveCount(1);
    // `checkVisibility` et non `toBeVisible` : un `<details>` replié garde sa
    // géométrie sous Chromium, et Playwright tient donc son contenu pour
    // visible. Dix contrôles de ce dépôt sont déjà passés au vert sur un champ
    // que personne ne voyait.
    expect(await carte.evaluate(el => el.checkVisibility())).toBe(true);

    const texte = await carte.innerText();

    // 1 200 + 600, cumulés sur tous les mois : un total pris sur le seul mois
    // affiché aurait donné 900 €.
    expect(texte).toMatch(/1\s?800,00/);
    expect(texte).toContain('Vacances');

    // 1 200/12 + 600/12 : la SOMME des parts que les cartes individuelles
    // affichent juste au-dessus, sur le même écran.
    expect(texte).toMatch(/150,00/);

    // Et elle dit sur quoi elle se fonde, en nommant les enveloppes du cycle.
    const fonde = await carte.locator('.veille-fonde').innerText();
    expect(fonde).toContain('Vacances été');
    expect(fonde).toContain('Vacances hiver');
  });

  test('LE TOTAL EST CELUI DES CARTES QUI LE COMPOSENT, sur la même page', async ({ page }) => {
    // La propriété, et non une valeur écrite à la main : la part mensuelle du
    // thème doit être la somme de celles que `provisionARenouveler` affiche
    // au-dessus. Un second calcul — c'est le défaut `normalizePair`, huit fois
    // dans ce dépôt — divergerait sans que rien ne le dise.
    await ouvrir(page, semer(700));

    const reste = page.locator('.veille-reste');
    if (await reste.count() > 0) {
      await reste.locator('summary').click();
      await page.waitForTimeout(250);
    }

    const montant = (texte) => {
      // Les séparateurs sont ÉCHAPPÉS, jamais tapés en clair : `formatCurrency`
      // sépare les milliers par une espace fine insécable (U+202F). Une classe
      // à espaces littéraux lit « 1 550,00 » comme « 550,00 » — mesuré, deux
      // fois dans ce dépôt.
      const trouve = String(texte).match(/(-?[\d\u00A0\u202F\u2009 ]+,\d{2})\s*€ par mois/);
      return trouve
        ? Number(trouve[1].replace(/[\u00A0\u202F\u2009 ]/g, '').replace(',', '.'))
        : null;
    };

    const parts = [];
    for (const nom of ['Vacances été', 'Vacances hiver']) {
      const individuelle = page.locator('.veille-item', { hasText: `« ${nom} »` });
      const valeur = montant(await individuelle.locator('.veille-detail').innerText());
      expect(valeur, `part mensuelle de ${nom}`).not.toBeNull();
      parts.push(valeur);
    }

    const carte = page.locator('.veille-item', { hasText: 'sur ce cycle' });
    const total = montant(await carte.locator('.veille-detail').innerText());

    expect(total).toBeCloseTo(parts[0] + parts[1], 2);
  });

  test('elle NE porte aucun bouton — c\'est la garde, pas un oubli', async ({ page }) => {
    await ouvrir(page, semer(700));

    const carte = await carteDeCycle(page);
    await expect(carte).toHaveCount(1);
    // Un bouton ici ferait compter son montant une seconde fois dans la
    // capacité d'épargne, par-dessus les cartes individuelles qui le
    // composent. Et « renouveler » n'aurait aucun sens sur un groupe : chaque
    // enveloppe a sa propre échéance.
    expect(await carte.locator('.veille-action').count()).toBe(0);

    // Le témoin positif : les cartes individuelles, elles, gardent le leur.
    // Sans lui, une page sans aucun bouton passerait le contrôle ci-dessus.
    const individuelle = page.locator('.veille-item', { hasText: '« Vacances été »' });
    expect(await individuelle.locator('[data-action="creerEnveloppeProposee"]').count()).toBe(1);
  });

  test('elle compare à la mensualisation déjà en place — ce qu\'il manque', async ({ page }) => {
    // 150 € souhaités contre 100 € déjà provisionnés.
    await ouvrir(page, semer(700));

    const carte = await carteDeCycle(page);
    const detail = await carte.locator('.veille-detail').innerText();

    // Le delta ne se lit pas sans son point de départ : « il manque 50 € » sans
    // dire ce qui est déjà mis de côté laisse croire que rien ne l'est.
    expect(detail).toMatch(/100,00/);
    expect(detail).toContain('il manque');
    expect(detail).toMatch(/50,00/);
  });

  test('et dans l\'autre sens, ce qu\'on peut baisser', async ({ page }) => {
    // 150 € souhaités contre 200 € déjà provisionnés. Sans ce second sens, une
    // implémentation qui ne dirait jamais que « il manque » passerait.
    await ouvrir(page, semer(1400));

    const carte = await carteDeCycle(page);
    const detail = await carte.locator('.veille-detail').innerText();

    expect(detail).toMatch(/200,00/);
    expect(detail).toContain('baisser');
    expect(detail).toMatch(/50,00/);
  });

  test('une seule enveloppe à terme ne produit pas de bilan de cycle', async ({ page }) => {
    // C'est à partir de DEUX que la question du foyer se pose. Une carte de
    // cycle sur un seul terme répéterait la carte individuelle juste au-dessus,
    // au mot près, et ferait passer les deux pour du décor.
    const db = semer(700);
    db['household/envelopes'] = db['household/envelopes'].filter(e => e.id !== 'vac-hiver');
    await ouvrir(page, db);

    // Le témoin positif : l'écran a bien de quoi parler, la carte individuelle
    // est là. Sans lui, un bilan resté vide passerait ce contrôle.
    await expect(page.locator('.summary-veille')).toContainText('Vacances été');

    const reste = page.locator('.veille-reste');
    if (await reste.count() > 0) {
      await reste.locator('summary').click();
      await page.waitForTimeout(250);
    }
    expect(await page.locator('.veille-item', { hasText: 'sur ce cycle' }).count()).toBe(0);
  });
});
