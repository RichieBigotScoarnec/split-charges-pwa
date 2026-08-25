// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  showModal,
  closeModal,
  initModals,
  showConfirmModal,
  cleanupModals
} from '../../public/js/components/modal.js';

/**
 * Les modales, éprouvées ailleurs que par le bout en bout
 *
 * `components/modal.js` est appelé par neuf modules et affichait 29,5 % de
 * couverture. C'est là qu'a vécu, des mois durant, le report de focus qui
 * envoyait la description dans le champ du montant — un défaut de montant, donc
 * de solde, dans le module le plus partagé de l'application.
 *
 * Le vol de focus a sa propre suite, `focus-non-vole.test.js`. Celle-ci couvre
 * le reste : le piège à focus, la fermeture, la remise à zéro des champs,
 * l'accumulation d'écouteurs et la modale de confirmation.
 */

/** Balisage de deux modales et de la confirmation */
const BALISAGE = `
  <div id="modaleA" class="modal-overlay">
    <div class="modal">
      <input type="text" id="champA" />
      <input type="checkbox" id="caseA" />
      <select id="listeA">
        <option value="un">Un</option>
        <option value="deux">Deux</option>
      </select>
      <textarea id="noteA"></textarea>
      <button type="button" id="boutonA">Valider</button>
    </div>
  </div>

  <div id="modaleB" class="modal-overlay">
    <div class="modal">
      <button type="button" id="boutonB">Fermer</button>
    </div>
  </div>

  <div id="modaleVide" class="modal-overlay">
    <div class="modal"><p>Rien de focusable</p></div>
  </div>

  <div id="modalConfirm" class="modal-overlay">
    <div class="modal">
      <p id="modalConfirmMessage"></p>
      <button type="button" id="modalConfirmCancel">Annuler</button>
      <button type="button" id="modalConfirmOk">Confirmer</button>
    </div>
  </div>
`;

/** Appuie sur une touche, depuis l'élément qui a le focus */
function touche(cible, key, options = {}) {
  cible.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }));
}

beforeEach(() => {
  document.body.innerHTML = BALISAGE;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanupModals();
});

describe('Ouvrir et fermer', () => {

  it('ouvre la modale demandée, et elle seule', () => {
    showModal('modaleA');

    expect(document.getElementById('modaleA').classList.contains('active')).toBe(true);
    expect(document.getElementById('modaleB').classList.contains('active')).toBe(false);
  });

  it('la fermeture retire la marque d\'ouverture', () => {
    showModal('modaleA');
    closeModal('modaleA');

    expect(document.getElementById('modaleA').classList.contains('active')).toBe(false);
  });

  it('un identifiant inconnu ne fait rien plutôt que de lever', () => {
    // Le balisage évolue ; un appel resté sur un ancien identifiant ne doit pas
    // emporter le module qui l'appelle.
    expect(() => showModal('inexistante')).not.toThrow();
    expect(() => closeModal('inexistante')).not.toThrow();
  });
});

describe('La remise à zéro des champs', () => {

  /** Remplit tous les champs de la modale A */
  function remplir() {
    document.getElementById('champA').value = 'Courses';
    document.getElementById('caseA').checked = true;
    document.getElementById('listeA').selectedIndex = 1;
    document.getElementById('noteA').value = 'Une note';
  }

  it('vide les champs texte, décoche, et revient à la première option', () => {
    showModal('modaleA');
    remplir();

    closeModal('modaleA');

    expect(document.getElementById('champA').value).toBe('');
    expect(document.getElementById('caseA').checked).toBe(false);
    expect(document.getElementById('listeA').selectedIndex).toBe(0);
    expect(document.getElementById('noteA').value).toBe('');
  });

  it('conserve la saisie quand on le demande', () => {
    // Le second paramètre existe pour les formulaires d'édition : fermer pour
    // rouvrir ne doit pas effacer ce qu'on était en train de corriger.
    showModal('modaleA');
    remplir();

    closeModal('modaleA', false);

    expect(document.getElementById('champA').value).toBe('Courses');
    expect(document.getElementById('caseA').checked).toBe(true);
  });
});

describe('Le piège à focus', () => {
  // WCAG 2.1.2 : au clavier, on doit pouvoir parcourir la modale sans en
  // sortir, et sans s'y trouver enfermé.

  it('ramène au premier élément quand on tabule depuis le dernier', () => {
    showModal('modaleA');
    const dernier = document.getElementById('boutonA');
    dernier.focus();

    touche(dernier, 'Tab');

    expect(document.activeElement.id).toBe('champA');
  });

  it('renvoie au dernier quand on remonte depuis le premier', () => {
    showModal('modaleA');
    const premier = document.getElementById('champA');
    premier.focus();

    touche(premier, 'Tab', { shiftKey: true });

    expect(document.activeElement.id).toBe('boutonA');
  });

  it('ne se mêle pas d\'une tabulation au milieu', () => {
    showModal('modaleA');
    const milieu = document.getElementById('caseA');
    milieu.focus();

    touche(milieu, 'Tab');

    // Le navigateur fait son travail : le piège n'intervient qu'aux extrémités.
    expect(document.activeElement.id).toBe('caseA');
  });

  it('ignore les touches qui ne sont pas Tab', () => {
    showModal('modaleA');
    const dernier = document.getElementById('boutonA');
    dernier.focus();

    touche(dernier, 'a');

    expect(document.activeElement.id).toBe('boutonA');
  });

  it('une modale sans rien de focusable ne lève pas', () => {
    expect(() => {
      showModal('modaleVide');
      touche(document.getElementById('modaleVide'), 'Tab');
    }).not.toThrow();
  });

  it('se retire à la fermeture', () => {
    showModal('modaleA');
    closeModal('modaleA');

    const dernier = document.getElementById('boutonA');
    dernier.focus();
    touche(dernier, 'Tab');

    // Plus de piège : le focus reste où le navigateur l'a laissé.
    expect(document.activeElement.id).toBe('boutonA');
  });

  it('rouvrir n\'empile pas les écouteurs', () => {
    // Constaté : rouvrir une modale écrasait la fonction de nettoyage sans
    // l'appeler, et l'écouteur précédent restait attaché. `showManageModal` se
    // re-rend après chaque ajout ou suppression — ils s'accumulaient.
    const modale = document.getElementById('modaleA');
    const poses = vi.spyOn(modale, 'addEventListener');
    const retires = vi.spyOn(modale, 'removeEventListener');

    showModal('modaleA');
    showModal('modaleA');
    showModal('modaleA');

    const compte = type => (appels) =>
      appels.filter(([evenement]) => evenement === type).length;

    const posesKeydown = compte('keydown')(poses.mock.calls);
    const retiresKeydown = compte('keydown')(retires.mock.calls);

    // Trois ouvertures, trois poses, deux retraits : un seul écouteur survit.
    expect(posesKeydown - retiresKeydown).toBe(1);
  });
});

describe('Échap et clic hors de la carte', () => {

  it('Échap ferme la modale ouverte', () => {
    initModals();
    showModal('modaleA');

    touche(document, 'Escape');

    expect(document.getElementById('modaleA').classList.contains('active')).toBe(false);
  });

  it('Échap sans modale ouverte ne fait rien', () => {
    initModals();

    expect(() => touche(document, 'Escape')).not.toThrow();
  });

  it('un clic sur le voile ferme', () => {
    initModals();
    showModal('modaleA');

    document.getElementById('modaleA').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.getElementById('modaleA').classList.contains('active')).toBe(false);
  });

  it('un clic dans la carte ne ferme pas', () => {
    // Sans cette distinction, saisir un montant refermerait le formulaire.
    initModals();
    showModal('modaleA');

    document.getElementById('champA').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.getElementById('modaleA').classList.contains('active')).toBe(true);
  });

  it('le nettoyage retire l\'écouteur d\'Échap', () => {
    // Appelé à la déconnexion : sans cela l'écouteur survivrait à la session,
    // et se cumulerait à la reconnexion suivante.
    initModals();
    cleanupModals();
    showModal('modaleA');

    touche(document, 'Escape');

    expect(document.getElementById('modaleA').classList.contains('active')).toBe(true);
  });

  it('initialiser deux fois n\'empile pas les écouteurs d\'Échap', () => {
    const poses = vi.spyOn(document, 'addEventListener');
    const retires = vi.spyOn(document, 'removeEventListener');

    initModals();
    initModals();
    initModals();

    const keydown = appels => appels.filter(([evenement]) => evenement === 'keydown').length;

    expect(keydown(poses.mock.calls) - keydown(retires.mock.calls)).toBe(1);
  });
});

describe('La modale de confirmation', () => {

  it('rend true quand on confirme', async () => {
    const reponse = showConfirmModal('Supprimer cette charge ?');
    document.getElementById('modalConfirmOk').click();

    await expect(reponse).resolves.toBe(true);
  });

  it('rend false quand on annule', async () => {
    const reponse = showConfirmModal('Supprimer cette charge ?');
    document.getElementById('modalConfirmCancel').click();

    await expect(reponse).resolves.toBe(false);
  });

  it('Échap vaut annulation, jamais confirmation', async () => {
    // Le doute doit rendre la réponse la moins destructrice : ces
    // confirmations gardent des suppressions.
    const reponse = showConfirmModal('Supprimer cette charge ?');
    touche(document, 'Escape');

    await expect(reponse).resolves.toBe(false);
  });

  it('affiche le message en texte, jamais en HTML', async () => {
    // Les messages portent des libellés saisis par le foyer.
    const reponse = showConfirmModal('<img src=x onerror="window.__xss=1">');

    expect(document.getElementById('modalConfirmMessage').innerHTML)
      .toBe('&lt;img src=x onerror="window.__xss=1"&gt;');
    expect(window.__xss).toBeUndefined();

    document.getElementById('modalConfirmCancel').click();
    await reponse;
  });

  it('pose le focus sur Annuler, pas sur Confirmer', async () => {
    const reponse = showConfirmModal('Supprimer ?');

    expect(document.activeElement.id).toBe('modalConfirmCancel');

    document.getElementById('modalConfirmCancel').click();
    await reponse;
  });

  it('ne laisse aucun écouteur derrière elle', async () => {
    const reponse = showConfirmModal('Supprimer ?');
    document.getElementById('modalConfirmOk').click();
    await reponse;

    // Un second Échap ne doit plus rien résoudre ni rouvrir quoi que ce soit.
    touche(document, 'Escape');
    document.getElementById('modalConfirmOk').click();

    expect(document.getElementById('modalConfirm').classList.contains('active')).toBe(false);
  });

  it('se replie sur la confirmation du navigateur si le balisage manque', async () => {
    // Une confirmation qui disparaît laisserait supprimer sans demander.
    document.getElementById('modalConfirm').remove();
    const natif = vi.spyOn(window, 'confirm').mockReturnValue(true);

    await expect(showConfirmModal('Supprimer ?')).resolves.toBe(true);
    expect(natif).toHaveBeenCalledWith('Supprimer ?');

    natif.mockRestore();
  });
});
