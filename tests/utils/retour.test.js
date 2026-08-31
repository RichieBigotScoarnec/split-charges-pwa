// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  empilerCouche,
  depilerCouche,
  initRetour,
  viderCouches,
  couchesOuvertes,
  coucheOuverte
} from '../../public/js/utils/retour.js';

/**
 * Le geste « retour » referme, il ne quitte pas.
 *
 * Mesuré avant correction : après trois changements d'onglet et plusieurs
 * modales ouvertes, `history.length` valait toujours 2 et un `goBack()`
 * sortait de l'application.
 *
 * Ces contrôles jouent le vrai enchaînement — `pushState`, `back`, `popstate` —
 * sur un double d'historique, parce que jsdom n'émet pas `popstate` de
 * lui-même. Ce qu'ils tiennent, c'est l'INVARIANT qui fait qu'une pile
 * d'historique reste juste : autant d'entrées poussées que de couches ouvertes,
 * et pas une de plus.
 */

/**
 * Les écouteurs `popstate` réellement posés
 *
 * Partagé entre tous les montages, et non recréé à chaque `beforeEach` :
 * `initRetour` ne pose son écouteur QU'UNE FOIS — c'est ce que la production
 * exige, `initializeAppData()` rejouant à chaque reconnexion sans
 * rechargement. Un tableau neuf par test déconnecterait l'écouteur du premier,
 * et les contrôles suivants mesureraient un module muet en croyant mesurer un
 * défaut.
 */
const auditeurs = [];

window.addEventListener = (type, fn) => {
  if (type === 'popstate') auditeurs.push(fn);
};

/** Un historique qui se comporte comme celui d'un navigateur */
function monterHistorique() {
  const pile = [{ state: null }];

  global.history = {
    get length() { return pile.length; },
    get state() { return pile[pile.length - 1].state; },
    pushState(state) { pile.push({ state }); },
    back() {
      if (pile.length <= 1) return;
      pile.pop();
      // Le navigateur émet `popstate` de façon asynchrone ; ici on le fait
      // tout de suite, ce qui est plus dur pour le code testé.
      auditeurs.forEach(fn => fn({ state: global.history.state }));
    }
  };

  return { pile, retourNavigateur: () => global.history.back() };
}

describe('La pile des couches refermables', () => {
  let h;

  beforeEach(() => {
    viderCouches();
    h = monterHistorique();
    initRetour();
  });

  it('ouvrir une couche pousse exactement une entrée', () => {
    const fermer = vi.fn();
    empilerCouche('modalBudgets', fermer);

    expect(couchesOuvertes()).toEqual(['modalBudgets']);
    expect(h.pile.length).toBe(2);
    expect(fermer).not.toHaveBeenCalled();
  });

  it('le retour referme la couche du sommet', () => {
    const fermer = vi.fn();
    empilerCouche('modalBudgets', fermer);

    h.retourNavigateur();

    expect(fermer).toHaveBeenCalledTimes(1);
    expect(coucheOuverte()).toBe(false);
  });

  it('rouvrir la même couche ne pousse rien de plus', () => {
    // `showManageModal` se re-rend après chaque ajout : sans cette garde, la
    // pile grossirait à chaque rendu et le retour ne ferait plus rien de
    // visible pendant plusieurs appuis.
    const fermer = vi.fn();
    empilerCouche('modalManageLists', fermer);
    empilerCouche('modalManageLists', fermer);
    empilerCouche('modalManageLists', fermer);

    expect(couchesOuvertes()).toEqual(['modalManageLists']);
    expect(h.pile.length).toBe(2);
  });

  it('fermer par un bouton retire aussi l\'entrée d\'historique', () => {
    // C'EST LE PIÈGE. Sans cela, la pile grossit à chaque modale ouverte puis
    // fermée normalement, et le retour devient inerte pendant N appuis.
    const fermer = vi.fn();
    empilerCouche('modalBudgets', fermer);
    expect(h.pile.length).toBe(2);

    depilerCouche('modalBudgets');

    expect(coucheOuverte()).toBe(false);
    expect(h.pile.length, 'l\'entrée poussée doit être consommée').toBe(1);
  });

  it('fermer par un bouton ne referme PAS la couche du dessous', () => {
    // Le `popstate` de notre propre `history.back()` ne doit rien déclencher.
    // Sans le drapeau, fermer une modale ramènerait aussi à l'onglet Bilan.
    const fermerOnglet = vi.fn();
    const fermerModale = vi.fn();
    empilerCouche('onglet', fermerOnglet);
    empilerCouche('modalBudgets', fermerModale);

    depilerCouche('modalBudgets');

    expect(fermerModale, 'la fermeture est faite par l\'appelant').not.toHaveBeenCalled();
    expect(fermerOnglet, 'la couche du dessous doit rester').not.toHaveBeenCalled();
    expect(couchesOuvertes()).toEqual(['onglet']);
  });

  it('les couches se referment dans l\'ordre inverse de leur ouverture', () => {
    const ordre = [];
    empilerCouche('onglet', () => ordre.push('onglet'));
    empilerCouche('modalBudgets', () => ordre.push('modalBudgets'));

    h.retourNavigateur();
    h.retourNavigateur();

    expect(ordre).toEqual(['modalBudgets', 'onglet']);
  });

  it('un retour de plus que de couches ne casse rien', () => {
    // C'est le cas nominal de la SORTIE : plus rien à refermer, le navigateur
    // fait son travail.
    const fermer = vi.fn();
    empilerCouche('modalBudgets', fermer);

    h.retourNavigateur();
    expect(() => h.retourNavigateur()).not.toThrow();
    expect(fermer).toHaveBeenCalledTimes(1);
  });

  it('autant d\'entrées poussées que de couches ouvertes, toujours', () => {
    // L'invariant, joué sur un enchaînement quelconque.
    const base = h.pile.length;
    const gestes = [
      () => empilerCouche('onglet', () => {}),
      () => empilerCouche('modalA', () => {}),
      () => depilerCouche('modalA'),
      () => empilerCouche('modalB', () => {}),
      () => depilerCouche('modalB'),
      () => empilerCouche('modalC', () => {}),
      () => depilerCouche('modalC'),
      () => depilerCouche('onglet')
    ];
    for (const geste of gestes) {
      geste();
      expect(h.pile.length - base, `couches: ${couchesOuvertes()}`).toBe(couchesOuvertes().length);
    }
    expect(h.pile.length).toBe(base);
  });

  it('dépiler une couche jamais ouverte ne touche pas l\'historique', () => {
    empilerCouche('modalBudgets', () => {});
    const avant = h.pile.length;

    depilerCouche('modalInconnue');

    expect(h.pile.length).toBe(avant);
    expect(couchesOuvertes()).toEqual(['modalBudgets']);
  });

  it('fermer une couche enfouie ne consomme pas l\'entrée d\'une autre', () => {
    // Ce cas ne se produit pas aujourd'hui, mais rien ne l'interdit : une
    // couche fermée par un chemin détourné ne doit pas voler l'entrée du
    // sommet, sinon le retour suivant refermerait la mauvaise chose.
    empilerCouche('onglet', () => {});
    empilerCouche('modalBudgets', () => {});
    const avant = h.pile.length;

    depilerCouche('onglet');

    expect(couchesOuvertes()).toEqual(['modalBudgets']);
    expect(h.pile.length, 'l\'entrée du sommet reste au sommet').toBe(avant);
  });
});

describe('Les gardes', () => {
  beforeEach(() => {
    viderCouches();
    monterHistorique();
    initRetour();
  });

  it('une couche sans nom ou sans fermeture est ignorée', () => {
    empilerCouche('', () => {});
    empilerCouche('modalBudgets', null);
    empilerCouche(null, () => {});
    expect(couchesOuvertes()).toEqual([]);
  });

  it('un navigateur qui refuse pushState n\'empêche pas d\'ouvrir', () => {
    // Quota d'entrées atteint : la modale doit s'ouvrir quand même. La couche
    // n'est alors pas empilée — sans entrée d'historique, la fermeture
    // ordinaire ne doit surtout pas appeler `history.back()`, ce qui ferait
    // sortir de l'application.
    global.history.pushState = () => { throw new Error('quota'); };
    let recule = false;
    global.history.back = () => { recule = true; };

    expect(() => empilerCouche('modalBudgets', () => {})).not.toThrow();
    expect(couchesOuvertes()).toEqual([]);

    depilerCouche('modalBudgets');
    expect(recule, 'aucun retour ne doit être provoqué').toBe(false);
  });
});
