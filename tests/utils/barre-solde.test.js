// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  suivreLeBilan,
  arreterDeSuivre,
  bilanVisible,
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
    /** Rapporte comme le ferait le navigateur */
    rapporter(visible) { this.rappel([{ isIntersecting: visible }]); }
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
  it('le bilan est visible dès qu\'une entrée le dit', () => {
    expect(bilanVisible([{ isIntersecting: true }])).toBe(true);
  });

  it('il ne l\'est pas quand aucune ne le dit', () => {
    expect(bilanVisible([{ isIntersecting: false }])).toBe(false);
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
    instances[0].rapporter(true);

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
