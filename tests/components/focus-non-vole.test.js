// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showModal } from '../../public/js/components/modal.js';

/**
 * Une modale ne vole pas le focus qu'on lui a retiré
 *
 * Le premier champ le reçoit cent millisecondes après l'ouverture, le temps
 * que la modale soit affichée. Ce report devient un vol dès que la personne a
 * touché un autre champ entre-temps : sa frappe part alors dans le premier.
 *
 * Constaté sur la saisie rapide ouverte par le raccourci : « 12,50 » dans le
 * montant, « Cafe » dans la description, et le montant valant « 12,50Cafe ».
 * Une charge de 1 250 € au lieu de 12,50, sans que rien ne le signale.
 *
 * Le raccourci n'a pas créé ce défaut — il vise toute modale de l'application —
 * il l'a rendu atteignable : la modale s'ouvre maintenant pendant que le pouce
 * est en mouvement, au lieu d'attendre la fin de l'initialisation.
 */
describe('Le focus différé d\'une modale', () => {

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="maModale" class="modal-overlay">
        <div class="modal">
          <input type="text" id="premier" />
          <input type="text" id="second" />
          <button type="button" id="bouton">Ajouter</button>
        </div>
      </div>
    `;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Avance jusqu'après le report de cent millisecondes */
  function laisserPasserLeReport() {
    vi.advanceTimersByTime(200);
  }

  it('se pose sur le premier champ quand personne n\'a rien touché', () => {
    showModal('maModale');
    laisserPasserLeReport();

    expect(document.activeElement.id).toBe('premier');
  });

  it('ne reprend pas le focus posé ailleurs entre-temps', () => {
    showModal('maModale');
    document.getElementById('second').focus();

    laisserPasserLeReport();

    expect(document.activeElement.id).toBe('second');
  });

  it('ne reprend pas le focus posé sur un bouton', () => {
    // Choisir une catégorie puis se voir renvoyer au montant est le même vol,
    // sous une autre forme.
    showModal('maModale');
    document.getElementById('bouton').focus();

    laisserPasserLeReport();

    expect(document.activeElement.id).toBe('bouton');
  });

  it('la frappe suivante va où la personne l\'a mise', () => {
    // Le vol ne se voit pas à l'ouverture : il se voit à la frappe d'après,
    // qui part dans le champ repris. C'est ainsi que « Cafe » s'est retrouvé
    // collé au montant.
    showModal('maModale');

    const second = document.getElementById('second');
    second.focus();
    second.value = '12,50';

    laisserPasserLeReport();

    // Le clavier écrit là où est le focus, et nulle part ailleurs.
    document.activeElement.value += 'Cafe';

    expect(document.getElementById('premier').value).toBe('');
    expect(second.value).toBe('12,50Cafe');
  });
});
