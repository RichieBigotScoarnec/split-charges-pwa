import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Où va le mois, mesuré sur la page réelle — et un jour choisi
 *
 * **Ce contrôle FIGE l'horloge, et ce n'est pas une commodité.** La projection
 * se tait avant le 5 du mois (une seule grosse course y projetterait un
 * dépassement qui n'en est pas un) et le dernier jour (il n'y a plus rien à
 * projeter). Un contrôle qui la cherche sans figer la date serait donc rouge
 * cinq jours sur trente — et le job de bout en bout conditionne la publication.
 *
 * Ce dépôt a payé cette leçon deux fois : un contrôle qui dépendait de l'heure
 * qu'il était, puis le même piège élargi au mois de décembre. La troisième fois
 * aurait été le jour même de l'écriture : la suite complète a tourné un 31, et
 * n'a donc exercé la ligne dans AUCUN de ses 547 contrôles.
 *
 * `setFixedTime` plutôt que `install` : elle fige ce que `Date` répond sans
 * arrêter les minuteurs, dont l'application dépend pour s'initialiser.
 */

test.use({ viewport: { width: 390, height: 844 } });

/** Le 12 août 2026, 10 h : douze jours écoulés sur trente et un */
const LE_12_AOUT = new Date('2026-08-12T10:00:00');

/**
 * Sept mois révolus STRICTEMENT CROISSANTS, et un août qui part vite
 *
 * **La série ne peut pas être plate, et c'est la moitié du contrôle.** Sur cinq
 * mois tous à 1 000 €, une médiane sur cinq mois et une médiane sur six donnent
 * le même nombre : le mutant qui rétablit l'ancienne fenêtre y survit sans
 * qu'un seul contrôle bouge. C'est très exactement ce qui a permis à la
 * divergence de vivre si longtemps — et ce qui est arrivé à la première version
 * de ce fichier, mesuré.
 *
 * 600 · 700 · 800 · 900 · 1 000 · 1 100 · 1 200 : la fenêtre juste (les cinq
 * mois qui précèdent) rend 1 000 €, l'ancienne (six mois) 950 €.
 *
 * Les clés sont ABSOLUES, et c'est cohérent avec l'horloge figée : pour
 * l'application, nous sommes le 12 août 2026 pour toujours.
 */
async function semerHuitMois(page) {
  await page.evaluate(async () => {
    const { dbUpdate, dbSet } = await import('/js/db.js');
    await dbSet('salaries', { vous: 2600, conjointe: 1900 });

    const ecritures = {};
    for (const [mois, montant] of [
      ['2026-01', 600], ['2026-02', 700], ['2026-03', 800], ['2026-04', 900],
      ['2026-05', 1000], ['2026-06', 1100], ['2026-07', 1200]
    ]) {
      ecritures[`periods/${mois}/salaries`] = { vous: 2600, conjointe: 1900 };
      ecritures[`periods/${mois}/variableCharges/v0`] = {
        description: 'Un mois ordinaire', amount: montant, category: 'Courses',
        paidBy: 'vous', date: `${mois}-10`, deleted: false
      };
    }

    // Le mois en cours : 600 € en douze jours → 1 550 € sur trente et un.
    ecritures['periods/2026-08/salaries'] = { vous: 2600, conjointe: 1900 };
    ecritures['periods/2026-08/variableCharges/v0'] = {
      description: 'Un début de mois rapide', amount: 600, category: 'Courses',
      paidBy: 'vous', date: '2026-08-04', deleted: false
    };

    await dbUpdate(undefined, ecritures);

    const select = document.getElementById('periodSelect');
    if (![...select.options].some(o => o.value === '2026-08')) {
      select.add(new Option('2026-08', '2026-08'));
    }
    select.value = '2026-08';
    await window.changePeriod();
  });
  await page.waitForTimeout(2500);
}

const nombre = (texte) => {
  // Les séparateurs sont ÉCHAPPÉS, jamais tapés en clair : `formatCurrency`
  // sépare les milliers par une espace fine insécable (U+202F) et pose une
  // insécable (U+00A0) devant l'euro. Une classe à espaces littéraux ne les
  // contient pas, et « 1 550,00 » s'y lit « 550,00 » — mesuré, une fois.
  const trouve = String(texte).match(/-?[\d    ]+,\d{2}/);
  return trouve
    ? Number(trouve[0].replace(/[    ]/g, '').replace(',', '.'))
    : null;
};

test('la ligne annonce où va le mois, et sur quoi elle se fonde', async ({ page }) => {
  test.setTimeout(180000);
  await page.clock.setFixedTime(LE_12_AOUT);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerHuitMois(page);

  const ligne = page.locator('.summary-projection');
  await expect(ligne).toBeVisible();

  const texte = await ligne.innerText();

  // Le 12 d'un mois de 31 jours, le jour même compris : 20.
  expect(texte).toContain('Il reste 20 jours');

  // 600 × 31/12 = 1 550 €, contre 1 000 € d'ordinaire.
  expect(nombre(texte)).toBeCloseTo(1550, 0);
  expect(texte).toContain('mois ordinaire');

  // Le repère est celui des CINQ mois qui précèdent — 800 · 900 · 1 000 ·
  // 1 100 · 1 200 — et non des six, qui donneraient 950.
  expect(nombre(await page.locator('.projection-ordinaire').innerText()))
    .toBeCloseTo(1000, 2);
});

test('elle hausse le ton quand le rythme dépasse, sans changer de place', async ({ page }) => {
  test.setTimeout(180000);
  await page.clock.setFixedTime(LE_12_AOUT);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerHuitMois(page);

  await expect(page.locator('.summary-projection')).toHaveClass(/summary-projection--attention/);
});

/**
 * LA PROPRIÉTÉ QUI FERME LE DÉFAUT MESURÉ
 *
 * « Un mois ordinaire » valait 950,00 € sur le bilan et 1 000,00 € dans la
 * modale du rapport, à un bouton de distance. Ici les deux chiffres sont lus
 * SUR LA MÊME PAGE, et aucune valeur n'est écrite à la main : c'est l'égalité
 * qui est la propriété.
 */
test('le mois ordinaire du bilan est celui du rapport, sur la même page', async ({ page }) => {
  test.setTimeout(180000);
  await page.clock.setFixedTime(LE_12_AOUT);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerHuitMois(page);

  // Le repère porte sa propre classe. Lire la phrase entière attraperait le
  // SURCOÛT, qui la précède — et le contrôle passerait pour la mauvaise raison
  // ou tomberait pour une autre.
  const surLeBilan = await page.locator('.summary-projection .projection-ordinaire').innerText();

  await page.locator('[data-action="ouvrirRapportDuMois"]').click();
  const modale = page.locator('#modalRapportMensuel');
  await expect(modale).toBeVisible();
  const dansLeRapport = await modale.innerText();

  const repere = nombre(surLeBilan);
  expect(repere).not.toBeNull();

  // Le rapport écrit « un mois ordinaire coûte X € ». On compare des NOMBRES
  // relevés sur les deux surfaces, et non une chaîne : c'est l'égalité qui est
  // la propriété, et elle survivrait à un changement de format.
  const tousLesMontants = [...dansLeRapport.matchAll(/-?[\d    ]+,\d{2}/g)]
    .map(m => Number(m[0].replace(/[    ]/g, '').replace(',', '.')));

  expect(tousLesMontants, `montants du rapport : ${tousLesMontants}`)
    .toContainEqual(expect.closeTo(repere, 2));
});

test('elle se tait sur un mois révolu, qui n\'a plus rien à projeter', async ({ page }) => {
  test.setTimeout(180000);
  await page.clock.setFixedTime(LE_12_AOUT);
  await setupFirebaseMock(page);
  await waitForApp(page);
  await semerHuitMois(page);

  await page.evaluate(async () => {
    const select = document.getElementById('periodSelect');
    if (![...select.options].some(o => o.value === '2026-07')) {
      select.add(new Option('2026-07', '2026-07'));
    }
    select.value = '2026-07';
    await window.changePeriod();
  });
  await page.waitForTimeout(2000);

  await expect(page.locator('.summary-projection')).toHaveCount(0);
});
