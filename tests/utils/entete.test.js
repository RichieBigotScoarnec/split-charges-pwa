// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ATTRIBUT,
  enteteSorti,
  marquerLeDefilement,
  suivreLEntete,
  arreterDeSuivre
} from '../../public/js/utils/entete.js';

/**
 * L'en-tête se compacte quand il a quitté l'écran
 *
 * Mesuré sur un écran de 390 × 844 : 294 px avant le premier contenu, soit
 * 35 % de l'écran — et rien d'épinglé au défilement, donc plus moyen de savoir
 * quel mois on lisait. Le découpage en onglets avait alourdi ce coût : changer
 * d'onglet remonte en haut, donc ces 294 px se repayaient à chaque fois.
 *
 * Le module ne fait qu'une chose — poser un attribut — et c'est pour cela
 * qu'il mérite d'être verrouillé : l'inverser compacterait l'en-tête
 * exactement quand on le regarde, et le laisserait entier quand on ne le
 * regarde plus.
 */

/** Observateur simulé : on garde la main sur ce qu'il rapporte, et quand */
function ObservateurSimule(rappel) {
  ObservateurSimule.dernier = {
    rappel,
    observes: [],
    deconnecte: false
  };
  return {
    observe(cible) { ObservateurSimule.dernier.observes.push(cible); },
    disconnect() { ObservateurSimule.dernier.deconnecte = true; }
  };
}

/** Fait rapporter l'observateur simulé */
const rapporter = (...entrees) => ObservateurSimule.dernier.rappel(entrees);

beforeEach(() => {
  arreterDeSuivre();
  ObservateurSimule.dernier = null;
  document.body.innerHTML = '<main id="mainApp"><header>FairSplit</header></main>';
  delete document.body.dataset[ATTRIBUT];
});

describe('enteteSorti — la seule décision du module', () => {
  it('l\'en-tête encore visible ne compacte rien', () => {
    expect(enteteSorti([{ isIntersecting: true }])).toBe(false);
  });

  it('l\'en-tête entièrement sorti compacte', () => {
    expect(enteteSorti([{ isIntersecting: false }])).toBe(true);
  });

  it.each([[[]], [null], [undefined], ['sorti'], [[null]], [[{}]]])(
    'une entrée illisible (%s) vaut « visible », jamais « sorti »',
    (entrees) => {
      // Le défaut sûr est l'état de repos : il n'escamote rien. Compacter sur
      // une lecture ratée escamoterait le badge et resserrerait l'écran sans
      // qu'aucun défilement l'ait demandé.
      expect(enteteSorti(entrees)).toBe(false);
    }
  );

  it('un seul rapport « visible » suffit à ne pas compacter', () => {
    expect(enteteSorti([{ isIntersecting: false }, { isIntersecting: true }])).toBe(false);
  });
});

describe('marquerLeDefilement — poser et retirer l\'attribut', () => {
  it('pose `data-defile` quand c\'est compact', () => {
    marquerLeDefilement(true);
    expect(document.body.dataset[ATTRIBUT]).toBe('true');
  });

  it('retire l\'attribut plutôt que de l\'écrire à « false »', () => {
    // La feuille de style interroge `[data-defile="true"]`. Un attribut laissé
    // à « false » ne changerait rien à l'affichage, mais rendrait l'état
    // illisible dans l'inspecteur — et un sélecteur écrit `[data-defile]` un
    // jour se mettrait à correspondre en permanence.
    marquerLeDefilement(true);
    marquerLeDefilement(false);
    expect(document.body.hasAttribute('data-defile')).toBe(false);
  });

  it('ne lève pas quand il n\'y a pas de corps de document', () => {
    expect(() => marquerLeDefilement(true, {})).not.toThrow();
  });
});

describe('suivreLEntete — l\'observation', () => {
  it('observe l\'en-tête de l\'application, et lui seul', () => {
    expect(suivreLEntete({ Observateur: ObservateurSimule })).toBe(true);
    expect(ObservateurSimule.dernier.observes).toHaveLength(1);
    expect(ObservateurSimule.dernier.observes[0].tagName).toBe('HEADER');
  });

  it('part de l\'état de repos : on ouvre l\'application en haut de page', () => {
    document.body.dataset[ATTRIBUT] = 'true';
    suivreLEntete({ Observateur: ObservateurSimule });
    expect(document.body.hasAttribute('data-defile')).toBe(false);
  });

  it('compacte quand l\'en-tête sort, et défait quand il revient', () => {
    suivreLEntete({ Observateur: ObservateurSimule });

    rapporter({ isIntersecting: false });
    expect(document.body.dataset[ATTRIBUT]).toBe('true');

    rapporter({ isIntersecting: true });
    expect(document.body.hasAttribute('data-defile')).toBe(false);
  });

  it('sans en-tête, ne fait rien et le dit', () => {
    document.body.innerHTML = '<main id="mainApp"></main>';
    expect(suivreLEntete({ Observateur: ObservateurSimule })).toBe(false);
  });

  it('n\'observe pas un `<header>` extérieur à l\'application', () => {
    // L'écran d'authentification en porte un. Le compacter n'aurait aucun
    // sens, et l'observer laisserait l'état suspendu à un élément masqué.
    document.body.innerHTML = '<header>connexion</header><main id="mainApp"></main>';
    expect(suivreLEntete({ Observateur: ObservateurSimule })).toBe(false);
  });

  it('sans IntersectionObserver, rend l\'écran à son état de repos', () => {
    // Navigateur ancien, banc d'essai sans DOM complet : un en-tête trop grand
    // se lit, un mois disparu ne se retrouve pas.
    document.body.dataset[ATTRIBUT] = 'true';
    expect(suivreLEntete({ Observateur: null })).toBe(false);
    expect(document.body.hasAttribute('data-defile')).toBe(false);
  });

  it('ne laisse jamais deux observateurs derrière soi', () => {
    suivreLEntete({ Observateur: ObservateurSimule });
    const premier = ObservateurSimule.dernier;
    suivreLEntete({ Observateur: ObservateurSimule });
    expect(premier.deconnecte, 'le premier observateur court toujours').toBe(true);
  });

  it('arreterDeSuivre déconnecte, et se rappelle sans dommage', () => {
    suivreLEntete({ Observateur: ObservateurSimule });
    arreterDeSuivre();
    expect(ObservateurSimule.dernier.deconnecte).toBe(true);
    expect(() => arreterDeSuivre()).not.toThrow();
  });
});

describe('Ce que le module ne fait PAS', () => {
  it('il ne lit aucune requête média : la largeur est l\'affaire du CSS', () => {
    // L'état est juste quelle que soit la largeur, et une rotation d'écran ne
    // demande rien. C'est `onglets.css` qui décide que la compaction ne vaut
    // qu'en dessous de 900 px — le même partage que pour les onglets.
    const source = readFileSync(
      resolve(process.cwd(), 'public/js/utils/entete.js'), 'utf8');
    expect(source).not.toContain('matchMedia');
    expect(source).not.toContain('innerWidth');
  });

  it('il n\'écoute pas le défilement : un écouteur par image demanderait un frein', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'public/js/utils/entete.js'), 'utf8');
    expect(source).not.toContain("'scroll'");
  });
});
