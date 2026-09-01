/**
 * FairSplit — Compter les sites d'injection, et eux seuls
 *
 * Le plafond d'avertissements eslint gardait un budget COMMUN à deux règles
 * qui n'ont rien à voir. `eslint public/js --max-warnings 26` comptait :
 *
 *   — 24 avertissements `no-unsanitized/*`, les sites d'`innerHTML` et le
 *     `document.write` de l'export, tous relus un par un lors de l'audit ;
 *   —  2 avertissements `no-console`, dans `utils/debug.js`.
 *
 * Les deux sont `warn` dans le même bloc de `eslint.config.mjs`, donc
 * indiscernables pour `--max-warnings`. Retirer les deux `console.log` de
 * `debug.js` aurait fait tomber le compte à 24 et libéré, en silence, deux
 * places pour un `innerHTML` non relu. Le garde-fou annonçait une protection
 * qu'il n'exerçait pas.
 *
 * C'est le raisonnement que le workflow tenait déjà en restreignant le plafond
 * à `public/js` « pour qu'un avertissement de test ne déplace pas le seuil ».
 * Il valait aussi entre deux règles du même dossier.
 *
 * Le compte porte donc sur `no-unsanitized/*` et rien d'autre. Un avertissement
 * d'une autre règle ne peut plus ni ouvrir ni fermer de place.
 *
 * Hors de `public/`, donc jamais publié.
 */

import { pathToFileURL } from 'node:url';

/**
 * Les sites d'injection potentiels d'un rapport eslint
 *
 * @param {Array} rapport - Sortie de `eslint --format json`
 * @returns {Array<{fichier: string, ligne: number, regle: string, message: string}>}
 */
export function sitesDInjection(rapport) {
  return rapport.flatMap((fichier) =>
    (fichier.messages ?? [])
      .filter((m) => typeof m.ruleId === 'string' && m.ruleId.startsWith('no-unsanitized/'))
      .map((m) => ({
        fichier: fichier.filePath,
        ligne: m.line,
        regle: m.ruleId,
        message: m.message
      }))
  );
}

/**
 * Le verdict, séparé de l'affichage pour être éprouvable
 *
 * Dépasser le plafond échoue. L'égaler passe. Rester dessous passe AUSSI, mais
 * le signale : un plafond qui ne descend jamais finit par ne plus rien retenir,
 * et l'abaisser fait partie du correctif qui a retiré le site.
 *
 * @param {number} compte - Nombre de sites mesurés
 * @param {number} plafond - Nombre de sites admis
 * @returns {{depasse: boolean, marge: number}}
 */
export function verdict(compte, plafond) {
  return { depasse: compte > plafond, marge: plafond - compte };
}

/** Le plafond en vigueur. À déplacer avec le correctif, jamais après. */
export const PLAFOND = 24;

/* c8 ignore start — orchestration, éprouvée par la CI elle-même */

// `pathToFileURL` et non une concaténation : sous Windows, `process.argv[1]`
// vaut `C:\...` quand `import.meta.url` vaut `file:///C:/...`. Le test collé à
// la main échouait donc toujours, le script sortait 0 sans rien lire, et le
// contrôle passait au vert sans avoir tourné — le défaut même qu'il surveille.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const entree = await new Promise((resoudre, rejeter) => {
    let brut = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (bloc) => (brut += bloc));
    process.stdin.on('end', () => resoudre(brut));
    process.stdin.on('error', rejeter);
  });

  let rapport;
  try {
    rapport = JSON.parse(entree);
  } catch {
    console.error("Rapport eslint illisible — l'analyse a-t-elle abouti ?");
    process.exit(1);
  }

  const sites = sitesDInjection(rapport);
  for (const site of sites) {
    console.log(`  ${site.fichier}:${site.ligne}  ${site.regle}`);
  }

  const { depasse, marge } = verdict(sites.length, PLAFOND);
  console.log(`\nSites d'injection potentiels : ${sites.length} (plafond ${PLAFOND})`);

  if (depasse) {
    console.error(
      `\nUn site d'injection de plus que le plafond.\n` +
        `Relire l'ajout : toute donnée interpolée atteint-elle le DOM échappée ?\n` +
        `Si oui, déplacer PLAFOND dans tools/plafond-innerhtml.mjs en disant pourquoi.`
    );
    process.exit(1);
  }

  if (marge > 0) {
    console.log(
      `${marge} site(s) de moins que le plafond — l'abaisser à ${sites.length} ` +
        `fait partie du correctif qui les a retirés.`
    );
  }
}
/* c8 ignore stop */
