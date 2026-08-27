// @vitest-environment jsdom
/**
 * Une confirmation écartée d'un clic ne déclenche pas l'action suivante
 *
 * `showConfirmModal` rendait une promesse dont le nettoyage — retrait des
 * écouteurs, résolution — ne vivait que dans `onOk`, `onCancel` et `onEscape`.
 * Or la boîte se ferme aussi par `closeModal`, que le clic hors de la boîte
 * déclenche : `#modalConfirm` porte `.modal-overlay`, et
 * `setupModalOverlayClose` y pose ce clic comme sur toutes les autres modales.
 *
 * Ce chemin retirait la classe `active` sans jamais nettoyer. L'écouteur
 * `onOk` restait attaché au bouton, la promesse pendante pour toujours, et
 * chaque hésitation en ajoutait un.
 *
 * Le prix se payait plus tard, et ailleurs : on écarte d'un clic la
 * confirmation « Remplacer toutes vos données par cette sauvegarde ? », puis
 * on supprime une charge de 3,50 € une heure après — les deux `onOk` se
 * déclenchent, et `dbSet(undefined, enveloppe.data)` écrase l'espace entier du
 * foyer. Aucun attaquant n'est nécessaire ; le geste déclencheur est celui de
 * l'hésitation, précisément devant les confirmations qui inquiètent.
 *
 * La couverture ne pouvait pas le voir : les deux chemins sont exercés, et à
 * 100 % des instructions. C'est leur rencontre qui manquait — d'où ce fichier,
 * qui n'exerce que des enchaînements.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../public/js/utils/debug.js', () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }));

import { initModals, closeModal, showConfirmModal } from '../../public/js/components/modal.js';

const BALISAGE = `
  <div id="modalConfirm" class="modal-overlay" role="dialog" aria-modal="true">
    <div class="modal modal-confirm">
      <p id="modalConfirmMessage"></p>
      <button type="button" id="modalConfirmCancel">Annuler</button>
      <button type="button" id="modalConfirmOk">Supprimer</button>
    </div>
  </div>`;

/** Le clic hors de la boîte, tel que `setupModalOverlayClose` l'écoute */
function clicHorsDeLaBoite() {
  const overlay = document.getElementById('modalConfirm');
  overlay.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

const clicSur = (id) => document.getElementById(id).click();

describe('Une confirmation abandonnée ne survit pas à la suivante', () => {
  beforeEach(() => {
    document.body.innerHTML = BALISAGE;
    initModals();
  });

  it('le clic hors de la boîte répond « non » au lieu de laisser la question ouverte', async () => {
    const premiere = showConfirmModal('Remplacer toutes vos données ?');
    clicHorsDeLaBoite();

    await expect(premiere).resolves.toBe(false);
  });

  it('confirmer une suppression ne déclenche pas la restauration abandonnée', async () => {
    // 1. La confirmation qui fait peur, écartée d'un clic à côté.
    const restauration = showConfirmModal('Remplacer toutes vos données ?');
    clicHorsDeLaBoite();

    // 2. Plus tard, une suppression de 3,50 €, confirmée franchement.
    const suppression = showConfirmModal('Supprimer "Café" (3,50 €) ?');
    clicSur('modalConfirmOk');

    expect(await suppression).toBe(true);
    // Le cœur du défaut : la première rendait `true` elle aussi.
    expect(await restauration).toBe(false);
  });

  it('dix abandons n\'arment pas dix actions', async () => {
    const abandonnees = [];
    for (let rang = 0; rang < 10; rang++) {
      abandonnees.push(showConfirmModal(`Question ${rang}`));
      clicHorsDeLaBoite();
    }

    const derniere = showConfirmModal('Supprimer cette charge ?');
    clicSur('modalConfirmOk');

    expect(await derniere).toBe(true);
    expect(await Promise.all(abandonnees)).toEqual(Array(10).fill(false));
  });

  it('Échap répond « non » et ne laisse rien d\'armé', async () => {
    const premiere = showConfirmModal('Remplacer toutes vos données ?');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await premiere).toBe(false);

    const seconde = showConfirmModal('Supprimer cette charge ?');
    clicSur('modalConfirmOk');
    expect(await seconde).toBe(true);
  });

  it('`closeModal` appelée directement dénoue aussi la question', async () => {
    const question = showConfirmModal('Remplacer toutes vos données ?');
    closeModal('modalConfirm');

    await expect(question).resolves.toBe(false);
  });

  it('les deux réponses franches restent intactes', async () => {
    const oui = showConfirmModal('Confirmer ?');
    clicSur('modalConfirmOk');
    expect(await oui).toBe(true);

    const non = showConfirmModal('Confirmer ?');
    clicSur('modalConfirmCancel');
    expect(await non).toBe(false);
  });

  it('la boîte est bien refermée après un abandon', async () => {
    const question = showConfirmModal('Remplacer toutes vos données ?');
    expect(document.getElementById('modalConfirm').classList.contains('active')).toBe(true);

    clicHorsDeLaBoite();
    await question;

    expect(document.getElementById('modalConfirm').classList.contains('active')).toBe(false);
  });
});
