import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Le héros porte l'encre de son SENS
 *
 * ─────────────────────────────────────────────────────────────────────
 * DÉCISION DU FOYER, 2026-09-11
 *
 * Le héros était ambre dans les deux cas : « Tu dois 145,37 € » et « Cindy te
 * doit 145,37 € » se ressemblaient, alors que ce n'est pas la même nouvelle.
 * Deux encres, pas trois — un troisième palier demanderait un seuil arbitraire,
 * et jugerait un chiffre que l'application sait incomplet :
 *
 *   À deux — dette > 0 → danger ; sinon → succès. Soldé est l'état sain.
 *   Moi    — reste > 0 → succès ; sinon → danger. Zéro en plafond, c'est zéro
 *            au mieux et déjà négatif au pire.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LA PROPRIÉTÉ PORTE SUR LE SENS, JAMAIS SUR UN HEXADÉCIMAL
 *
 * L'encre attendue est celle que le moteur donne au JETON, lue sur un témoin
 * posé dans la carte du héros : un recalibrage de `--success-ink` ne fait pas
 * tomber ce contrôle, un sens inversé si.
 *
 * Et elle se lit sur ce qui PORTE le chiffre — le montant, ou la phrase quand
 * il n'y en a pas —, sans passer par une classe que le correctif poserait : le
 * contrôle était rouge avant lui pour la bonne raison, une mauvaise couleur, et
 * non un élément introuvable.
 */

test.use({ viewport: { width: 390, height: 844 } });

async function semer(page, { salaires, charges }) {
  await page.evaluate(async ({ salaires, charges }) => {
    const { dbUpdate, dbSet } = await import('/js/db.js');
    const mois = document.getElementById('periodSelect').value;
    await dbSet('salaries', salaires);
    const ecritures = { [`periods/${mois}/salaries`]: salaires };
    charges.forEach(([amount, paidBy], i) => {
      ecritures[`periods/${mois}/variableCharges/c${i}`] = {
        description: `Charge ${i}`, amount, category: 'Maison', paidBy, deleted: false
      };
    });
    await dbUpdate(undefined, ecritures);
    await window.changePeriod();
  }, { salaires, charges });
  await page.waitForTimeout(1500);
}

/** L'encre que le moteur donne à un jeton, lue sur un témoin DANS la carte du héros */
const encreDuJeton = (page, jeton) => page.evaluate((j) => {
  const heros = document.querySelector('#panneauBilan .bilan-heros');
  const temoin = document.createElement('span');
  temoin.style.color = `var(${j})`;
  heros.appendChild(temoin);
  const couleur = getComputedStyle(temoin).color;
  temoin.remove();
  return couleur;
}, jeton);

/** L'encre de ce qui PORTE le chiffre : le montant, ou la phrase sans montant */
const encreDuPorteur = (page) => page.evaluate(() => {
  const heros = document.querySelector('#panneauBilan .bilan-heros');
  const porteur = heros.querySelector('.bilan-heros-montant')
    || heros.querySelector('.bilan-heros-phrase .bilan-heros-mot');
  return getComputedStyle(porteur).color;
});

const CAS = [
  {
    nom: 'À deux — Cindy te doit : succès',
    portee: 'deux', salaires: { vous: 3000, conjointe: 1000 }, charges: [[1000, 'vous']],
    phrase: /te doit/, attendu: '--success-ink'
  },
  {
    nom: 'À deux — tu dois : danger',
    portee: 'deux', salaires: { vous: 3000, conjointe: 1000 }, charges: [[1000, 'conjointe']],
    phrase: /Tu dois/, attendu: '--danger-ink'
  },
  {
    nom: 'À deux — soldé : succès, l\'état sain de l\'application',
    portee: 'deux', salaires: { vous: 1000, conjointe: 1000 }, charges: [[500, 'vous'], [500, 'conjointe']],
    phrase: /Comptes équilibrés/, attendu: '--success-ink'
  },
  {
    nom: 'Moi — il reste : succès',
    portee: 'solo', salaires: { vous: 3000, conjointe: 1000 }, charges: [[1000, 'vous']],
    phrase: /Il te reste/, attendu: '--success-ink'
  },
  {
    // Part de Richard : 1 000 € sur des revenus de 1 000 € — il ne reste rien.
    nom: 'Moi — zéro : danger, un plafond à zéro est déjà négatif au pire',
    portee: 'solo', salaires: { vous: 1000, conjointe: 1000 }, charges: [[2000, 'conjointe']],
    phrase: /ne te reste rien/, attendu: '--danger-ink'
  },
  {
    nom: 'Moi — dépassement : danger',
    portee: 'solo', salaires: { vous: 1000, conjointe: 1000 }, charges: [[3000, 'conjointe']],
    phrase: /dépasses/, attendu: '--danger-ink'
  }
];

for (const cas of CAS) {
  test(cas.nom, async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await semer(page, cas);

    await page.locator(`#panneauBilan [data-portee="${cas.portee}"]`).click();
    const heros = page.locator('#panneauBilan .bilan-heros');
    await expect(heros).toHaveAttribute('data-tete', cas.portee);
    // Prémisse : le cas semé est bien celui rendu — sinon on mesurerait l'encre
    // d'un autre sens et on conclurait sur le mauvais.
    await expect(heros.locator('.bilan-heros-phrase')).toContainText(cas.phrase);

    // Témoin : les deux encres sont DISTINCTES. Confondues, « porte l'encre de
    // succès » serait vrai d'un héros peint en danger.
    const succes = await encreDuJeton(page, '--success-ink');
    const danger = await encreDuJeton(page, '--danger-ink');
    expect(succes, 'témoin : succès et danger rendent la même encre').not.toBe(danger);

    expect(await encreDuPorteur(page), `${cas.nom} — le héros ne porte pas ${cas.attendu}`)
      .toBe(await encreDuJeton(page, cas.attendu));
  });
}
