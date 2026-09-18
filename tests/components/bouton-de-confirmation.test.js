// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { showConfirmModal, TON } from '../../public/js/components/modal.js';

/**
 * Le bouton de confirmation nomme l'action, et le rouge n'avertit que d'une
 * destruction
 *
 * Le bouton est UNIQUE dans le balisage et sert les onze confirmations du
 * dépôt. Son libellé et sa couleur vivaient en dur — « Supprimer », en rouge —
 * et mesuré le 2026-09-18, **6 des 11 appels ne supprimaient rien** : créer une
 * cagnotte, se déconnecter, reconduire des charges fixes, déplacer une charge
 * entre poches, restaurer une sauvegarde.
 *
 * Le rouge et le mot sont le seul avertissement que porte cette modale.
 * Employés pour une création, ils cessent d'avertir le jour où il le faudrait.
 */

/** Le balisage réel, avec son défaut NEUTRE */
const BALISAGE = `
  <div id="modalConfirm" class="modal-overlay">
    <div class="modal modal-confirm">
      <p id="modalConfirmMessage"></p>
      <button type="button" class="btn btn-secondary" id="modalConfirmCancel">Annuler</button>
      <button type="button" class="btn btn-primary" id="modalConfirmOk">Confirmer</button>
    </div>
  </div>`;

const bouton = () => document.getElementById('modalConfirmOk');

/** Ouvre, lit le bouton, puis répond pour ne rien laisser en suspens */
async function ouvrirEtLire(message, options) {
  const reponse = showConfirmModal(message, options);
  const etat = { libelle: bouton().textContent, classes: [...bouton().classList] };
  document.getElementById('modalConfirmCancel').click();
  await reponse;
  return etat;
}

describe('Le bouton de la confirmation générique', () => {
  beforeEach(() => { document.body.innerHTML = BALISAGE; });

  it('porte le libellé de l\'ACTION, pas « Supprimer »', async () => {
    const etat = await ouvrirEtLire('Créer la cagnotte « Vacances » ?',
      { libelle: 'Créer la cagnotte', ton: TON.NORMAL });

    expect(etat.libelle).toBe('Créer la cagnotte');
    expect(etat.libelle).not.toMatch(/supprimer/i);
  });

  it('peint le ton DESTRUCTIF en danger', async () => {
    const etat = await ouvrirEtLire('Supprimer « Loyer » ?',
      { libelle: 'Supprimer', ton: TON.DESTRUCTIF });

    expect(etat.classes).toContain('btn-danger');
    expect(etat.classes).not.toContain('btn-primary');
  });

  it('peint le ton NORMAL en primaire', async () => {
    const etat = await ouvrirEtLire('Se déconnecter ?',
      { libelle: 'Se déconnecter', ton: TON.NORMAL });

    expect(etat.classes).toContain('btn-primary');
    expect(etat.classes).not.toContain('btn-danger');
  });

  it('garde toujours la classe de base `btn`', async () => {
    const destructif = await ouvrirEtLire('X ?', { libelle: 'Supprimer', ton: TON.DESTRUCTIF });
    const normal = await ouvrirEtLire('Y ?', { libelle: 'Créer', ton: TON.NORMAL });

    expect(destructif.classes).toContain('btn');
    expect(normal.classes).toContain('btn');
  });

  describe('LE DÉFAUT EST NEUTRE — c\'est la décision du lot', () => {
    it('sans options, le bouton n\'avertit pas et ne ment pas', async () => {
      const etat = await ouvrirEtLire('Une question sans options ?');

      // Une information MANQUANTE plutôt qu'une information FAUSSE : un appel
      // distrait produit un bouton qui n'avertit pas, jamais un bouton rouge
      // qui avertit à tort.
      expect(etat.classes).toContain('btn-primary');
      expect(etat.classes).not.toContain('btn-danger');
      expect(etat.libelle).not.toMatch(/supprimer/i);
    });

    it('un ton inconnu retombe sur le neutre, il ne laisse pas le bouton nu', async () => {
      const etat = await ouvrirEtLire('Et ça ?', { libelle: 'Aller', ton: 'ambre' });

      expect(etat.classes).toContain('btn-primary');
      expect(etat.classes).not.toContain('btn-danger');
    });

    it('TÉMOIN : les deux tons rendent des classes DISTINCTES', async () => {
      // Sans lui, « ce n'est pas du danger » serait vrai d'un bouton peint en
      // danger si les deux tons rendaient la même chose.
      const destructif = await ouvrirEtLire('A ?', { libelle: 'Supprimer', ton: TON.DESTRUCTIF });
      const normal = await ouvrirEtLire('B ?', { libelle: 'Créer', ton: TON.NORMAL });

      expect(destructif.classes.join(' ')).not.toBe(normal.classes.join(' '));
    });
  });

  describe('LE BOUTON EST REPEINT, jamais accumulé', () => {
    it('le rouge d\'une suppression ne reste pas collé sur la création suivante', async () => {
      await ouvrirEtLire('Supprimer « Loyer » ?', { libelle: 'Supprimer', ton: TON.DESTRUCTIF });
      const apres = await ouvrirEtLire('Créer la cagnotte « Vacances » ?',
        { libelle: 'Créer la cagnotte', ton: TON.NORMAL });

      expect(apres.classes, `classes restées : ${apres.classes.join(' ')}`)
        .not.toContain('btn-danger');
      expect(apres.libelle).toBe('Créer la cagnotte');
    });

    it('et dans l\'autre sens, le primaire ne survit pas à une suppression', async () => {
      await ouvrirEtLire('Créer ?', { libelle: 'Créer', ton: TON.NORMAL });
      const apres = await ouvrirEtLire('Supprimer ?', { libelle: 'Supprimer', ton: TON.DESTRUCTIF });

      expect(apres.classes).not.toContain('btn-primary');
      expect(apres.classes).toContain('btn-danger');
    });

    it('les classes ne s\'empilent pas au fil des ouvertures', async () => {
      let etat;
      for (let i = 0; i < 5; i++) {
        etat = await ouvrirEtLire(`Question ${i} ?`, {
          libelle: 'Supprimer',
          ton: i % 2 === 0 ? TON.DESTRUCTIF : TON.NORMAL
        });
      }

      // `btn` + une seule classe de ton, quelle que soit l'histoire.
      expect(etat.classes, etat.classes.join(' ')).toHaveLength(2);
    });
  });

  it('le bouton « Annuler » n\'est pas touché', async () => {
    const avant = document.getElementById('modalConfirmCancel').outerHTML;
    await ouvrirEtLire('Supprimer ?', { libelle: 'Supprimer', ton: TON.DESTRUCTIF });

    expect(document.getElementById('modalConfirmCancel').outerHTML).toBe(avant);
  });
});
