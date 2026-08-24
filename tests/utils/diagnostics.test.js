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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

  it('la nouvelle session n\'efface pas celle qui a échoué', async () => {
    // Le contrôle précédent n'écrivait rien après le rechargement : il lisait
    // donc un stockage encore intact. La vraie application, elle, note dès la
    // cinquième milliseconde — et écrasait la seule trace de la panne avec le
    // rechargement même qui servait à aller la lire.
    noter('init', 'étape ÉCHOUÉE : charges variables', { motif: 'sans réponse' });
    noter('liaison', 'base injoignable');

    vi.resetModules();
    const rechargé = await import('../../public/js/utils/diagnostics.js');

    // Ce que fait l'application à l'ouverture, avant qu'on lise quoi que ce soit.
    rechargé.noter('demarrage', 'journal ouvert');
    rechargé.noter('demarrage', 'FairSplit 4.0.0');

    const dit = rechargé.rapport();
    expect(dit, 'la panne de la session précédente doit survivre')
      .toContain('étape ÉCHOUÉE : charges variables');
    expect(dit).toContain('session précédente (2 entrées)');
    expect(dit).toContain('session courante (2 entrées)');
  });

  it('montre la session précédente même quand elle a autant d\'entrées que la courante', async () => {
    // Elles étaient départagées en comparant leurs longueurs : à nombre égal,
    // la session précédente disparaissait purement et simplement du rapport.
    noter('init', 'étape ÉCHOUÉE : salaires');

    vi.resetModules();
    const rechargé = await import('../../public/js/utils/diagnostics.js');
    rechargé.noter('demarrage', 'journal ouvert');

    expect(rechargé.rapport()).toContain('étape ÉCHOUÉE : salaires');
  });
});

describe('Le panneau de diagnostic', () => {
  let noter, initDiagnostics;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/?diag=1');
    ({ noter, initDiagnostics } = await import('../../public/js/utils/diagnostics.js'));
    initDiagnostics();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('se relit à la demande, sans quoi il s\'arrête avant les symptômes', () => {
    // Le contenu était figé à la peinture, quatre secondes après l'ouverture.
    // Or le bandeau hors ligne paraît à huit secondes, une lecture abandonne à
    // dix, une écriture à quinze : le journal rapporté s'arrêtait avant le
    // premier symptôme. Trois lignes, et rien de ce qu'on cherchait.
    vi.advanceTimersByTime(4000);

    const zone = document.getElementById('diagText');
    expect(zone, 'le panneau doit être peint').not.toBeNull();
    expect(zone.value).not.toContain('étape ÉCHOUÉE : charges variables');

    // Ce qui arrive après la peinture — exactement le cas qu'on vient chercher.
    noter('init', 'étape ÉCHOUÉE : charges variables', { motif: 'sans réponse' });

    expect(zone.value, 'le contenu peint ne se met pas à jour tout seul')
      .not.toContain('charges variables');

    document.getElementById('diagRefresh').click();
    expect(zone.value).toContain('étape ÉCHOUÉE : charges variables');
  });

  it('relit avant de copier, pour ne pas envoyer un instantané périmé', async () => {
    vi.advanceTimersByTime(4000);
    const zone = document.getElementById('diagText');

    noter('liaison', 'base joignable');

    const boutons = [...document.querySelectorAll('#diagPanel button')];
    const copier = boutons.find(bouton => bouton.textContent === 'Copier');
    copier.click();

    expect(zone.value).toContain('base joignable');
  });
});
