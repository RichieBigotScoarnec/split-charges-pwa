/**
 * FairSplit — La couverture des tests de bout en bout
 *
 * Le projet mesurait 59 % de couverture, et ce chiffre était faux dans les deux
 * sens : il ne comptait que Vitest. Les 300 tests Playwright pilotent un vrai
 * navigateur et exercent tout ce que Vitest ne peut pas — l'authentification,
 * la carte, la corbeille, la reconduction, le rendu du bilan. Rien de tout cela
 * n'entrait dans la mesure.
 *
 * Deux mesures partielles ne font pas une mesure. Les tests d'ici collectent
 * donc la couverture V8 du navigateur, que `tools/fusionner-couverture.mjs`
 * convertit ensuite au format Istanbul et fusionne avec celle de Vitest.
 *
 * La collecte ne s'active qu'avec `COUVERTURE=1` : elle coûte quelques
 * pourcents de temps d'exécution, et la CI n'en a pas besoin à chaque passage.
 *
 * Les suites importent `test` et `expect` d'ici plutôt que de `@playwright/test` :
 * c'est le seul moyen d'attacher une fixture automatique sans la répéter dans
 * chacune des dix-huit suites.
 */

import { test as base, expect, devices } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const ACTIVE = process.env.COUVERTURE === '1';

/** Où les relevés bruts s'accumulent, un fichier par test */
export const DOSSIER_COUVERTURE = resolve(process.cwd(), '.couverture-e2e');

export const test = base.extend({
  // Fixture automatique : elle s'applique sans que les suites la nomment.
  releveDeCouverture: [async ({ page }, use, testInfo) => {
    if (!ACTIVE) {
      await use();
      return;
    }

    // `resetOnNavigation: false` : l'application recharge la page dans
    // plusieurs scénarios, et le relevé serait remis à zéro à chaque fois —
    // on ne mesurerait que la dernière navigation.
    await page.coverage.startJSCoverage({ resetOnNavigation: false });

    await use();

    let entrees;
    try {
      entrees = await page.coverage.stopJSCoverage();
    } catch {
      // Une page déjà fermée n'a plus de relevé à rendre. Un test qui ferme
      // sa page est légitime ; le faire échouer pour cela ne le serait pas.
      return;
    }

    // Seuls les modules de l'application nous intéressent : ni le double de
    // Firebase, ni Leaflet, ni les scripts injectés par le banc d'essai.
    const utiles = entrees.filter(e => e.url.includes('/js/') && e.url.endsWith('.js'));
    if (utiles.length === 0) return;

    mkdirSync(DOSSIER_COUVERTURE, { recursive: true });

    // Le titre ne suffit pas à nommer le fichier : deux suites peuvent porter
    // le même, et les caractères accentués ou les barres obliques n'ont rien à
    // faire dans un nom de fichier. Une empreinte tranche.
    const nom = createHash('sha1')
      .update(`${testInfo.titlePath.join(' > ')}#${testInfo.repeatEachIndex}`)
      .digest('hex')
      .slice(0, 16);

    writeFileSync(resolve(DOSSIER_COUVERTURE, `${nom}.json`), JSON.stringify(utiles));
  }, { auto: true }]
});

export { expect, devices };
