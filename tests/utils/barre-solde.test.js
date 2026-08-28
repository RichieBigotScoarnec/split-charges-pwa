// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

import {
  suivreLeBilan,
  arreterDeSuivre,
  bilanVisible,
  partVisible,
  doitSeTaire,
  empreinteDeLaBarre,
  CLASSE_REDONDANTE
} from '../../public/js/utils/barre-solde.js';

/**
 * La barre de solde ne dit rien que le bilan ne dise mieux
 *
 * Elle garde la réponse à l'écran pendant qu'on fait défiler les charges —
 * bonne idée. Mais au repos elle se pose juste au-dessus du « Résumé du Mois »,
 * qui énonce le même solde en plus gros et avec son explication. Sur un écran
 * de 448 px, le premier écran était presque entièrement consacré à dire une
 * chose deux fois.
 *
 * Ces contrôles portent sur les deux moitiés : elle se replie quand le bilan
 * parle, et elle reparaît quand il sort de l'écran. Se tromper de sens la
 * rendrait visible exactement quand elle est inutile.
 */

/** Observateur simulé : on garde la main sur ce qu'il rapporte, et quand */
function observateurSimule() {
  const instances = [];

  class Simule {
    constructor(rappel) {
      this.rappel = rappel;
      this.observes = [];
      this.deconnecte = false;
      instances.push(this);
    }
    observe(element) { this.observes.push(element); }
    disconnect() { this.deconnecte = true; }
    /**
     * Rapporte comme le ferait le navigateur
     * @param {boolean} visible
     * @param {number} [part] - Part du bilan réellement à l'écran
     */
    rapporter(visible, part = 1) {
      this.rappel([{ isIntersecting: visible, intersectionRatio: visible ? part : 0 }]);
    }
  }

  return { Simule, instances };
}

/** Balisage réduit à ce que le module manipule */
function poser({ avecBilan = true } = {}) {
  document.body.innerHTML = `
    <div id="balanceBar" class="balance-bar"></div>
    ${avecBilan ? '<div class="summary-balance">Richard doit 7,49 € à Cindy</div>' : ''}
  `;
}

const barre = () => document.getElementById('balanceBar');

beforeEach(() => {
  arreterDeSuivre();
  document.body.innerHTML = '';
});

describe('La lecture de ce que rapporte le navigateur', () => {
  it('le bilan parle encore quand il est entièrement à l\'écran', () => {
    expect(bilanVisible([{ isIntersecting: true, intersectionRatio: 1 }])).toBe(true);
  });

  it('il ne parle plus quand il est sorti', () => {
    expect(bilanVisible([{ isIntersecting: false, intersectionRatio: 0 }])).toBe(false);
  });

  it('un liseré ne suffit pas', () => {
    // `isIntersecting` est vrai dès un seul pixel de recouvrement. La barre se
    // repliait donc alors qu'il ne restait qu'un bandeau du bilan en haut de
    // l'écran — c'est-à-dire au moment précis où elle devait prendre le relais.
    // Mesuré sur un iPhone 13 : 57 px visibles sur 198, et plus de solde nulle
    // part.
    expect(bilanVisible([{ isIntersecting: true, intersectionRatio: 0.29 }])).toBe(false);
  });

  it('une part manquante compte comme insuffisante', () => {
    // Le défaut sûr est de montrer la barre.
    expect(bilanVisible([{ isIntersecting: true }])).toBe(false);
  });

  it('rien de rapporté ne vaut pas « visible »', () => {
    // Le défaut sûr est de montrer la barre : une redondance vaut mieux qu'un
    // solde qu'on ne trouve plus.
    expect(bilanVisible([])).toBe(false);
    expect(bilanVisible(null)).toBe(false);
  });
});

describe('Quand le bilan est à l\'écran', () => {
  it('la barre se replie, plutôt que de répéter', () => {
    const { Simule, instances } = observateurSimule();
    poser();

    expect(suivreLeBilan({ Observateur: Simule })).toBe(true);
    instances[0].rapporter(true);

    expect(barre().classList.contains(CLASSE_REDONDANTE)).toBe(true);
  });

  it('elle part repliée, sans attendre le premier rapport', () => {
    // L'observateur ne rapporte qu'au prochain cycle d'affichage. D'ici là la
    // barre garderait l'état du rendu précédent, et clignoterait au changement
    // de mois. À l'ouverture, le bilan est en haut : c'est lui qui parle.
    const { Simule } = observateurSimule();
    poser();

    suivreLeBilan({ Observateur: Simule });

    expect(barre().classList.contains(CLASSE_REDONDANTE)).toBe(true);
  });
});

describe('Quand le bilan sort de l\'écran', () => {
  it('la barre reparaît : c\'est là qu\'elle sert', () => {
    const { Simule, instances } = observateurSimule();
    poser();
    suivreLeBilan({ Observateur: Simule });

    instances[0].rapporter(false);

    expect(barre().classList.contains(CLASSE_REDONDANTE)).toBe(false);
  });

  it('et se replie de nouveau si l\'on remonte', () => {
    const { Simule, instances } = observateurSimule();
    poser();
    suivreLeBilan({ Observateur: Simule });

    instances[0].rapporter(false);
    instances[0].rapporter(true, 1);

    expect(barre().classList.contains(CLASSE_REDONDANTE)).toBe(true);
  });
});

describe('À chaque rendu du bilan', () => {
  it('l\'ancien observateur est débranché, jamais laissé derrière', () => {
    // `summary.js` réécrit tout son contenu : l'élément observé n'est plus le
    // même. Un observateur laissé sur un nœud détaché ne lève pas d'erreur — il
    // cesse simplement de rapporter, et la barre se fige.
    const { Simule, instances } = observateurSimule();
    poser();
    suivreLeBilan({ Observateur: Simule });

    poser();
    suivreLeBilan({ Observateur: Simule });

    expect(instances).toHaveLength(2);
    expect(instances[0].deconnecte, 'le premier observateur court toujours').toBe(true);
  });

  it('observe le solde du bilan, et pas autre chose', () => {
    const { Simule, instances } = observateurSimule();
    poser();

    suivreLeBilan({ Observateur: Simule });

    expect(instances[0].observes[0]).toBe(document.querySelector('.summary-balance'));
  });
});

describe('Quand rien ne permet d\'observer', () => {
  it('sans bilan à l\'écran, la barre reste visible', () => {
    // Mois vide, salaires absents : la barre est alors le seul endroit qui
    // puisse porter le solde.
    const { Simule } = observateurSimule();
    poser({ avecBilan: false });
    barre().classList.add(CLASSE_REDONDANTE);

    expect(suivreLeBilan({ Observateur: Simule })).toBe(false);
    expect(barre().classList.contains(CLASSE_REDONDANTE)).toBe(false);
  });

  it('sans IntersectionObserver, on rend son comportement d\'avant à la barre', () => {
    // Navigateur ancien : une redondance vaut mieux qu'un solde introuvable.
    poser();
    barre().classList.add(CLASSE_REDONDANTE);
    const precedent = window.IntersectionObserver;
    delete window.IntersectionObserver;

    expect(suivreLeBilan()).toBe(false);
    expect(barre().classList.contains(CLASSE_REDONDANTE)).toBe(false);

    if (precedent) window.IntersectionObserver = precedent;
  });

  it('sans barre dans la page, rien ne lève', () => {
    const { Simule } = observateurSimule();
    document.body.innerHTML = '<div class="summary-balance">solde</div>';

    expect(() => suivreLeBilan({ Observateur: Simule })).not.toThrow();
    expect(suivreLeBilan({ Observateur: Simule })).toBe(false);
  });
});

/**
 * L'hystérésis, parce que la barre déplace ce qu'elle observe
 *
 * `#balanceBar` vit dans `.bandeau-colle`, qui est dans le flux ; le bilan est
 * **après** dans le document. Faire paraître la barre pousse donc le bilan vers
 * le bas de sa propre hauteur, et le faire disparaître le remonte d'autant. Or
 * c'est la part visible du bilan qui décide de la barre.
 *
 * Mesuré avant correction, sur 390 × 844 : le navigateur rapporte 0,62 barre
 * masquée et 0,93 barre affichée, de part et d'autre du seuil de 0,66 — un
 * aller-retour de défilement produisait **62 bascules réelles, une par image
 * d'affichage**. À l'œil, une bande qui scintille. Signalé à l'usage : aucune
 * capture ne le montrait, une image fige un état.
 *
 * Le remède est de n'accorder à un changement d'état que ce qui lui survit.
 */
describe('La part visible que rapporte le navigateur', () => {
  it('retient la plus grande part réellement croisée', () => {
    expect(partVisible([
      { isIntersecting: true, intersectionRatio: 0.3 },
      { isIntersecting: true, intersectionRatio: 0.8 }
    ])).toBe(0.8);
  });

  it('une entrée hors cadre ne compte pas, quelle que soit sa part', () => {
    // Le navigateur rapporte parfois une part résiduelle sur une sortie.
    expect(partVisible([{ isIntersecting: false, intersectionRatio: 0.9 }])).toBe(0);
  });

  it('rien de lisible vaut zéro — le défaut sûr montre la barre', () => {
    expect(partVisible([])).toBe(0);
    expect(partVisible(null)).toBe(0);
    expect(partVisible([{ isIntersecting: true }])).toBe(0);
  });
});

describe('La décision à deux seuils', () => {
  const EMPREINTE = 0.3;   // la barre occupe 30 % de la hauteur du bilan

  it('la barre se tait dès que le bilan est assez visible', () => {
    expect(doitSeTaire({ part: 0.7, redondanteAvant: false, empreinte: EMPREINTE })).toBe(true);
  });

  it('elle ne reparaît qu\'une fois passée sous le seuil BAS', () => {
    // 0,50 est sous 0,66 : à seuil unique, elle reparaissait ici — et son
    // apparition remontait la part au-dessus de 0,66, qui la refermait.
    expect(doitSeTaire({ part: 0.5, redondanteAvant: true, empreinte: EMPREINTE })).toBe(true);
    expect(doitSeTaire({ part: 0.3, redondanteAvant: true, empreinte: EMPREINTE })).toBe(false);
  });

  it('LA PROPRIÉTÉ : aucune bascule ne provoque la suivante', () => {
    // C'est la seule chose qui compte, et elle se vérifie sans simuler le
    // navigateur : après chaque changement d'état, la part se déplace de
    // l'empreinte de la barre. La nouvelle décision doit CONFIRMER la
    // précédente, jamais l'annuler — sinon l'écran oscille à chaque image.
    for (let p = 0; p <= 1.0001; p += 0.01) {
      for (const avant of [true, false]) {
        const apres = doitSeTaire({ part: p, redondanteAvant: avant, empreinte: EMPREINTE });
        if (apres === avant) continue;             // pas de bascule, rien à prouver

        // La barre paraît → le bilan descend ; elle se tait → il remonte.
        const deplacee = apres ? p - EMPREINTE : p + EMPREINTE;
        const suivante = doitSeTaire({
          part: Math.min(1, Math.max(0, deplacee)),
          redondanteAvant: apres,
          empreinte: EMPREINTE
        });

        expect(suivante,
          `part ${p.toFixed(2)} : la bascule vers ${apres ? 'masquée' : 'affichée'} s'annule aussitôt`)
          .toBe(apres);
      }
    }
  });

  it('TÉMOIN NÉGATIF : à seuil unique, la bascule s\'annule bel et bien', () => {
    // Sans empreinte, les deux sens partagent le seuil : c'est le code d'avant.
    // 0,62 → on affiche la barre ; le bilan descend à 0,92 → on la masque ;
    // il remonte à 0,62 → on l'affiche. Une image sur deux.
    const sansJeu = { empreinte: 0 };
    expect(doitSeTaire({ part: 0.62, redondanteAvant: true, ...sansJeu })).toBe(false);
    expect(doitSeTaire({ part: 0.92, redondanteAvant: false, ...sansJeu })).toBe(true);
    expect(doitSeTaire({ part: 0.62, redondanteAvant: true, ...sansJeu })).toBe(false);
  });

  it('une empreinte démesurée ne bloque pas la barre, elle la rend patiente', () => {
    // Seuil bas ramené à zéro : la barre ne reparaît que le bilan tout à fait
    // sorti. Silencieux — jamais scintillant.
    expect(doitSeTaire({ part: 0.1, redondanteAvant: true, empreinte: 5 })).toBe(true);
    expect(doitSeTaire({ part: 0, redondanteAvant: true, empreinte: 5 })).toBe(false);
  });

  it('une empreinte illisible ramène au seuil unique', () => {
    expect(doitSeTaire({ part: 0.7, redondanteAvant: true, empreinte: NaN })).toBe(true);
    expect(doitSeTaire({ part: 0.5, redondanteAvant: true })).toBe(false);
  });
});

describe('La mesure de ce que la barre déplace', () => {
  it('rend zéro quand il n\'y a rien à mesurer', () => {
    // jsdom rend des hauteurs nulles : c'est exactement le cas de repli, et il
    // doit ramener au comportement d'un seul seuil plutôt que de fausser.
    poser();
    expect(empreinteDeLaBarre(barre(), document.querySelector('.summary-balance'))).toBe(0);
    expect(empreinteDeLaBarre(null, null)).toBe(0);
  });

  it('ne laisse pas la barre visible après l\'avoir mesurée', () => {
    // La mesure exige de la rendre visible un instant : l'oublier ferait
    // paraître la barre à chaque rendu du bilan.
    poser();
    barre().classList.add(CLASSE_REDONDANTE);
    empreinteDeLaBarre(barre(), document.querySelector('.summary-balance'));
    expect(barre().classList.contains(CLASSE_REDONDANTE)).toBe(true);
  });
});
