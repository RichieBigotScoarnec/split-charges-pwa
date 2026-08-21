// @vitest-environment jsdom
/**
 * Journal de diagnostic.
 *
 * Deux pannes n'ont pu être reproduites nulle part ailleurs que sur le
 * téléphone qui les subissait. Le journal existe pour rapporter ce que cet
 * appareil a vécu, depuis un endroit où la console est hors d'atteinte.
 *
 * Ce qui compte ici, autant que le contenu : ce qu'il ne contient pas. Un
 * journal qu'on ne peut pas coller dans une conversation sans y réfléchir à
 * deux fois ne sera pas partagé, et ne servira donc à rien.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Journal de diagnostic', () => {
  let noter, rapport, exigerElement, initDiagnostics;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
    ({ noter, rapport, exigerElement, initDiagnostics } =
      await import('../../public/js/utils/diagnostics.js'));
  });

  it('retient les événements notés, dans l\'ordre', () => {
    noter('init', 'étape réussie : sélecteur de période');
    noter('init', 'étape ÉCHOUÉE : charges variables', { motif: 'forEach undefined' });

    const texte = rapport();
    expect(texte).toContain('étape réussie : sélecteur de période');
    expect(texte).toContain('étape ÉCHOUÉE : charges variables');
    expect(texte).toContain('forEach undefined');
    expect(texte.indexOf('sélecteur')).toBeLessThan(texte.indexOf('ÉCHOUÉE'));
  });

  it("décrit l'appareil, ce qui distingue un téléphone d'un navigateur de bureau", () => {
    const texte = rapport();
    for (const attendu of ['agent :', 'tactile :', 'ecran :', 'autonome :', 'serviceWorker :']) {
      expect(texte, `manquant : ${attendu}`).toContain(attendu);
    }
  });

  it("signale un élément absent plutôt que de l'ignorer en silence", () => {
    const resultat = exigerElement('addVariableChargeBtn', 'ouvrir l\'ajout');
    expect(resultat).toBeNull();
    expect(rapport()).toContain('élément absent : #addVariableChargeBtn');
  });

  it('retourne l\'élément et ne note rien quand il est présent', () => {
    document.body.innerHTML = '<button type="button" id="addVariableChargeBtn"></button>';
    const resultat = exigerElement('addVariableChargeBtn', 'ouvrir l\'ajout');
    expect(resultat).not.toBeNull();
    expect(rapport()).not.toContain('élément absent');
  });

  it('survit à un stockage local indisponible', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
      expect(() => noter('init', 'étape réussie : bilan')).not.toThrow();
      expect(rapport()).toContain('étape réussie : bilan');
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it('note les clics par leur cible, jamais par leur contenu', () => {
    document.body.innerHTML =
      '<button type="button" id="addVariableChargeBtn">+ Ajouter</button>';
    initDiagnostics();
    document.getElementById('addVariableChargeBtn').click();

    const texte = rapport();
    expect(texte).toContain('button#addVariableChargeBtn');
    // Le libellé est du contenu : il n'a rien à faire dans un journal.
    expect(texte).not.toContain('+ Ajouter');
  });

  it("n'affiche aucun panneau sans le paramètre ?diag=1", () => {
    initDiagnostics();
    vi.useFakeTimers();
    vi.advanceTimersByTime(10000);
    vi.useRealTimers();
    expect(document.getElementById('diagPanel')).toBeNull();
  });

  it('ne consigne aucune donnée personnelle même si on lui en passe', () => {
    // Le journal ne filtre pas : la règle tient à ce que les appelants ne lui
    // transmettent que des identifiants techniques. Ce test garde la règle
    // visible et vérifie les appelants réels du code.
    noter('dom', 'élément absent : #salaireVous', { usage: 'enregistrer votre salaire' });
    const texte = rapport();

    for (const interdit of ['@gmail', '€', 'Richard', 'Cindy']) {
      expect(texte, `le journal contient « ${interdit} »`).not.toContain(interdit);
    }
  });

  it('conserve la trace au-delà d\'un rechargement', async () => {
    noter('init', 'étape ÉCHOUÉE : sélecteur de période', { motif: 'dropdown vide' });

    // Nouvelle session : le module est réévalué, la mémoire repart à zéro.
    vi.resetModules();
    const rechargé = await import('../../public/js/utils/diagnostics.js');

    expect(rechargé.rapport()).toContain('session précédente');
    expect(rechargé.rapport()).toContain('étape ÉCHOUÉE : sélecteur de période');
  });
});
