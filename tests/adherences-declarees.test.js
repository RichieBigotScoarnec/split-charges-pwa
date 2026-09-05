import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { releverLesAdherences, classement, SEUIL, RACINE } from '../tools/adherences.mjs';

/**
 * Le tableau des adhérences critiques nomme tout ce qu'il doit nommer
 *
 * `CLAUDE.md` porte un tableau des modules très importés. Il existe pour qu'on
 * sache ce qu'on risque avant de toucher l'un d'eux, et `## Contraintes` comme
 * l'étape 2 de `## Workflow` s'y adossent explicitement.
 *
 * Il était tenu à la main, et il avait dérivé DANS LE SENS DANGEREUX : 13
 * dépendants annoncés pour `toast.js` là où il y en a 26, 8 pour `db.js` là où
 * il y en a 25. Et `utils/debug.js`, le module le plus importé du dépôt avec 35
 * dépendants, n'y figurait pas du tout. Une garde à laquelle on se fie et qui
 * minimise d'un facteur deux est pire qu'une garde absente.
 *
 * CE CONTRÔLE NE TIENT PAS LES CHIFFRES, IL TIENT L'APPARTENANCE.
 *
 * Exiger `toast.js === 26` serait rouge au premier commit qui ajoute un import,
 * et ce dépôt en fait beaucoup. Le correcteur apprendrait à mettre le nombre à
 * jour sans le regarder — l'état d'avant, avec une étape de plus. Ce qui doit
 * être vrai, c'est que tout module au-dessus du seuil FIGURE au tableau. Le
 * contrôle ne tombe donc qu'au FRANCHISSEMENT du seuil : un événement rare, qui
 * mérite précisément qu'on le regarde.
 *
 * Dans les deux sens, comme `sauvegarde-noeuds-declares`, `actions-declarees` et
 * `enveloppe-champs-declares` : un module qui cesse d'être critique et reste
 * listé encombre la garde autant qu'un absent la troue.
 */

const REFERENTIEL = 'CLAUDE.md';

/**
 * Les deux points de passage que leur seul compte de dépendants ne décrit pas
 *
 * `auth.js` est le cas inverse des autres : presque personne ne l'importe, il
 * importe presque tout et initialise 26 modules. `firebase-init.js` est sous le
 * seuil mais porte la connexion à la base. Les exclure du sens « le tableau ne
 * liste que des modules au-dessus du seuil » est une décision, pas un oubli —
 * elle est donc écrite ici plutôt que subie.
 */
const EXCEPTIONS_DECLAREES = ['firebase-init.js', 'modules/auth.js'];

/** Les modules nommés dans la première colonne du tableau de `CLAUDE.md` */
function modulesDuTableau(texte = fs.readFileSync(REFERENTIEL, 'utf8')) {
  const debut = texte.indexOf('## Adhérences critiques');
  expect(debut, `${REFERENTIEL} ne porte plus de section « Adhérences critiques »`).toBeGreaterThan(-1);

  // La section s'arrête au titre suivant de même niveau.
  const suite = texte.indexOf('\n## ', debut + 1);
  const section = texte.slice(debut, suite === -1 ? undefined : suite);

  return section
    .split('\n')
    .map((l) => l.match(/^\|\s*`([^`]+)`\s*\|/))
    .filter(Boolean)
    .map((m) => m[1]);
}

/** Ce que le dépôt contient réellement, au-dessus du seuil */
function modulesAuDessusDuSeuil() {
  return classement(releverLesAdherences())
    .filter((l) => l.total >= SEUIL)
    .map((l) => ({ ...l, court: l.cible.replace(`${RACINE}/`, '') }));
}

describe('Le tableau des adhérences critiques', () => {
  it('nomme TOUT module à ' + SEUIL + ' dépendants ou plus', () => {
    const declares = modulesDuTableau();
    const manquants = modulesAuDessusDuSeuil().filter((m) => !declares.includes(m.court));

    expect(
      manquants.map((m) => `${m.court} (${m.total} dépendants, dont ${m.dynamiques} dynamiques)`),
      `Ces modules ont franchi le seuil de ${SEUIL} dépendants et ne figurent pas au tableau ` +
        `des adhérences critiques de ${REFERENTIEL}. Relever les chiffres : ` +
        `\`node tools/adherences.mjs\`.`,
    ).toEqual([]);
  });

  it('ne nomme AUCUN module retombé sous le seuil, hors les exceptions déclarées', () => {
    const auDessus = modulesAuDessusDuSeuil().map((m) => m.court);
    const encombrants = modulesDuTableau().filter(
      (m) => !auDessus.includes(m) && !EXCEPTIONS_DECLAREES.includes(m),
    );

    expect(
      encombrants,
      `Ces modules sont listés au tableau des adhérences critiques mais sont retombés ` +
        `sous ${SEUIL} dépendants. Les retirer, ou les inscrire à EXCEPTIONS_DECLAREES ` +
        `avec la raison — une garde qui liste ce qui ne risque plus rien se lit moins bien.`,
    ).toEqual([]);
  });

  it('porte ses deux exceptions, qui sont une décision et non un oubli', () => {
    const declares = modulesDuTableau();

    for (const exception of EXCEPTIONS_DECLAREES) {
      expect(declares, `${exception} doit rester au tableau : voir EXCEPTIONS_DECLAREES`).toContain(
        exception,
      );
    }
  });

  it('TÉMOIN POSITIF — le relevé trouve bien des modules au-dessus du seuil', () => {
    // Sans lui, un relevé qui rendrait une liste vide satisferait les deux
    // contrôles d'appartenance ci-dessus sans rien mesurer.
    const auDessus = modulesAuDessusDuSeuil();

    expect(auDessus.length).toBeGreaterThanOrEqual(10);
    expect(auDessus[0].total).toBeGreaterThan(SEUIL);
  });

  it('TÉMOIN POSITIF — le tableau est lu, et il porte des lignes', () => {
    // Un motif de lecture qui cesserait de reconnaître les lignes rendrait une
    // liste vide, et « aucun encombrant » serait vrai pour la mauvaise raison.
    expect(modulesDuTableau().length).toBeGreaterThanOrEqual(10);
  });

  it('lit la première colonne, et pas une autre section du fichier', () => {
    const declares = modulesDuTableau();

    // `state.js` est au tableau ; `veille.js` est cité par le journal, jamais ici.
    expect(declares).toContain('state.js');
    expect(declares).not.toContain('utils/veille.js');
  });
});
