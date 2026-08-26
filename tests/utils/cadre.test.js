// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { dansUnCadre, refuserLEncadrement } from '../../public/js/utils/cadre.js';

/**
 * L'application ne s'affiche pas dans le cadre d'un autre site
 *
 * La production est servie par GitHub Pages, qui ne pose aucun en-tête.
 * `frame-ancestors` est ignorée en `<meta>`, et `X-Frame-Options` n'existe
 * qu'en en-tête : rien n'empêchait un site tiers d'encadrer FairSplit et de
 * faire cliquer une session ouverte sur « Régler ce solde » ou « Supprimer ».
 */

/** Une fenêtre encadrée, telle que le navigateur la présente */
const encadree = () => {
  const dedans = {};
  dedans.self = dedans;
  dedans.top = { autre: true };
  return dedans;
};

/** Une fenêtre de premier plan */
const auPremierPlan = () => {
  const seule = {};
  seule.self = seule;
  seule.top = seule;
  return seule;
};

describe('Reconnaître un cadre', () => {

  it('dit non au premier plan', () => {
    expect(dansUnCadre(auPremierPlan())).toBe(false);
  });

  it('dit oui dans un cadre', () => {
    expect(dansUnCadre(encadree())).toBe(true);
  });

  it('dit oui quand l\'accès lève', () => {
    // Un environnement où lire `top` jette : on est presque sûrement encadré
    // par une autre origine, et le doute vaut mieux qu'un affichage.
    const hostile = {};
    hostile.self = hostile;
    Object.defineProperty(hostile, 'top', {
      get() { throw new Error('accès refusé'); }
    });

    expect(dansUnCadre(hostile)).toBe(true);
  });

  it('ne lève pas sans fenêtre', () => {
    expect(dansUnCadre(undefined)).toBe(false);
    expect(dansUnCadre(null)).toBe(false);
  });
});

describe('Refuser l\'affichage', () => {

  beforeEach(() => {
    document.body.innerHTML = '<main id="mainApp">Les comptes du foyer</main>';
  });

  /** Un document dont la fenêtre est celle qu'on lui donne */
  function documentDans(fenetre) {
    return {
      defaultView: fenetre,
      body: document.body,
      location: { href: 'https://exemple.test/FairSplit.html' },
      createElement: (balise) => document.createElement(balise)
    };
  }

  it('laisse la page intacte au premier plan', () => {
    const refuse = refuserLEncadrement(documentDans(auPremierPlan()));

    expect(refuse).toBe(false);
    expect(document.getElementById('mainApp')).not.toBeNull();
  });

  it('vide la page quand elle est encadrée', () => {
    const refuse = refuserLEncadrement(documentDans(encadree()));

    expect(refuse).toBe(true);
    expect(document.getElementById('mainApp'), 'les comptes sont restés à l\'écran').toBeNull();
    expect(document.body.textContent).not.toContain('Les comptes du foyer');
  });

  it('dit pourquoi, plutôt que de rendre une page blanche', () => {
    // Une page vide sans explication se lit comme une panne, et fait
    // recharger — dans le cadre, indéfiniment.
    refuserLEncadrement(documentDans(encadree()));

    expect(document.body.textContent).toContain('ne s\'affiche pas à l\'intérieur d\'un autre site');
  });

  it('offre d\'ouvrir l\'application pour de bon', () => {
    refuserLEncadrement(documentDans(encadree()));

    const lien = document.querySelector('a');
    expect(lien).not.toBeNull();
    expect(lien.getAttribute('href')).toBe('https://exemple.test/FairSplit.html');
    expect(lien.getAttribute('target')).toBe('_blank');
    // `noopener` : sans lui, la page ouverte garde une poignée sur celle du
    // cadre, ce qui rendrait le lien lui-même exploitable.
    expect(lien.getAttribute('rel')).toContain('noopener');
  });

  it('n\'écrit pas de HTML dans la page', () => {
    // Rien de ce qui s'affiche ici ne vient de l'extérieur, mais la règle vaut
    // aussi pour les pages de refus — ce sont celles qu'on relit le moins.
    const doc = documentDans(encadree());
    doc.location = { href: '"><img src=x onerror=alert(1)>' };

    refuserLEncadrement(doc);

    expect(document.querySelector('img'), 'un lien hostile a produit une balise').toBeNull();
  });

  it('ne lève pas sans document', () => {
    expect(refuserLEncadrement(undefined)).toBe(false);
    expect(refuserLEncadrement(null)).toBe(false);
  });
});
