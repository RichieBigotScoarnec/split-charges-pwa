// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setState, resetState } from '../../public/js/state.js';
import {
  getEnveloppes,
  etiquetteEnveloppe,
  populateEnvelopeSelect,
  populateAllEnvelopeSelects
} from '../../public/js/modules/envelopes.js';

/**
 * L'écran et les listes déroulantes des enveloppes
 *
 * Les fonctions pures sont couvertes par `tests/utils/enveloppes.test.js`.
 * Ici, ce qui touche au balisage : ce qui s'affiche sur une charge, ce qui est
 * proposé au moment de la saisie, et ce qui arrive quand une enveloppe a
 * disparu entre-temps.
 *
 * Trois cas de cette famille ont déjà coûté cher dans cette application : un
 * écran sans porte, une étiquette non échappée, et une valeur silencieusement
 * effacée à la réouverture d'un formulaire.
 */

beforeEach(() => {
  resetState();
  document.body.innerHTML = '';
});

const VACANCES = {
  id: 'vacances-ete',
  label: 'Vacances été',
  icon: '🏖️',
  budget: 1200,
  debut: null,
  fin: null,
  cloturee: false
};

const ANCIENNES = {
  id: 'vacances-2025',
  label: 'Vacances 2025',
  icon: '🏖️',
  budget: null,
  debut: null,
  fin: null,
  cloturee: true
};

describe('Étiquette portée par une charge', () => {
  it('nomme l\'enveloppe rattachée', () => {
    setState('envelopes', [VACANCES]);
    const html = etiquetteEnveloppe({ amount: 40, envelope: 'vacances-ete' });

    expect(html).toContain('Vacances été');
    expect(html).toContain('🏖️');
    expect(html).toContain('charge-enveloppe');
  });

  it('ne rend rien pour une charge sans enveloppe', () => {
    setState('envelopes', [VACANCES]);
    expect(etiquetteEnveloppe({ amount: 40 })).toBe('');
    expect(etiquetteEnveloppe({ amount: 40, envelope: '' })).toBe('');
  });

  it('ne rend rien quand l\'enveloppe a été supprimée', () => {
    // Supprimer une enveloppe laisse `envelope: 'vacances'` sur les charges qui
    // la portaient. Elles restent intactes ; leur étiquette doit disparaître
    // plutôt qu'afficher un identifiant technique.
    setState('envelopes', []);
    expect(etiquetteEnveloppe({ amount: 40, envelope: 'vacances-ete' })).toBe('');
  });

  it('échappe le libellé et l\'image', () => {
    // Le libellé vient d'un champ de saisie et part dans `innerHTML`. Les deux
    // téléphones du foyer écrivent dans le même espace : ce n'est pas une
    // hypothèse d'attaque, c'est la règle de la maison.
    setState('envelopes', [{
      ...VACANCES,
      id: 'piege',
      label: '<img src=x onerror="alert(1)">'
    }]);

    const html = etiquetteEnveloppe({ envelope: 'piege' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('ne se laisse pas surprendre par une charge absente', () => {
    setState('envelopes', [VACANCES]);
    expect(etiquetteEnveloppe(null)).toBe('');
    expect(etiquetteEnveloppe(undefined)).toBe('');
  });
});

describe('Liste déroulante d\'enveloppes', () => {
  const poserSelect = (id) => {
    const select = document.createElement('select');
    select.id = id;
    document.body.appendChild(select);
    return select;
  };

  it('propose « Aucune » en tête', () => {
    setState('envelopes', [VACANCES]);
    const select = poserSelect('variableChargeEnvelope');
    populateEnvelopeSelect('variableChargeEnvelope');

    expect(select.options[0].value).toBe('');
    expect(select.options[0].textContent).toContain('Aucune');
  });

  it('ne propose pas les enveloppes closes', () => {
    setState('envelopes', [VACANCES, ANCIENNES]);
    const select = poserSelect('variableChargeEnvelope');
    populateEnvelopeSelect('variableChargeEnvelope');

    const valeurs = [...select.options].map(o => o.value);
    expect(valeurs).toEqual(['', 'vacances-ete']);
  });

  it('propose malgré tout celle que la charge porte déjà, même close', () => {
    // Rouvrir une charge de l'été dernier ne doit pas effacer son rattachement
    // sous prétexte que l'enveloppe a été close depuis. Sans ce cas, éditer le
    // montant d'une vieille charge la détachait en silence.
    setState('envelopes', [VACANCES, ANCIENNES]);
    const select = poserSelect('variableChargeEnvelope');
    populateEnvelopeSelect('variableChargeEnvelope', 'vacances-2025');

    expect([...select.options].map(o => o.value)).toContain('vacances-2025');
    expect(select.value).toBe('vacances-2025');
  });

  it('rétablit la valeur portée par la charge', () => {
    setState('envelopes', [VACANCES]);
    const select = poserSelect('fixedChargeEnvelope');
    populateEnvelopeSelect('fixedChargeEnvelope', 'vacances-ete');

    expect(select.value).toBe('vacances-ete');
  });

  it('retombe sur « Aucune » quand l\'enveloppe portée n\'existe plus', () => {
    setState('envelopes', [VACANCES]);
    const select = poserSelect('fixedChargeEnvelope');
    populateEnvelopeSelect('fixedChargeEnvelope', 'disparue');

    expect(select.value).toBe('');
  });

  it('ne double pas les options quand on repeuple', () => {
    // Le select est repeuplé à chaque ouverture de formulaire : sans le vidage,
    // la liste s'allongerait à chaque ajout de charge de la session.
    setState('envelopes', [VACANCES]);
    const select = poserSelect('variableChargeEnvelope');
    populateEnvelopeSelect('variableChargeEnvelope');
    populateEnvelopeSelect('variableChargeEnvelope');

    expect(select.options).toHaveLength(2);
  });

  it('ne se plaint pas d\'un select absent du balisage', () => {
    // Les deux formulaires ne sont pas toujours dans le DOM des tests, ni des
    // écrans partiels : l'absence ne doit pas interrompre l'initialisation.
    setState('envelopes', [VACANCES]);
    expect(() => populateAllEnvelopeSelects()).not.toThrow();
  });
});

describe('L\'écran de gestion', () => {
  it('est joignable depuis le balisage, par `window`', async () => {
    // Les écrans de gestion des catégories et des destinations sont restés
    // inatteignables des mois durant, exposés sur `window` sans qu'aucun bouton
    // ne les appelle. `tests/actions-atteignables.test.js` ferme désormais les
    // deux sens ; ce cas-ci vérifie que l'exposition a bien lieu.
    expect(typeof window.showManageEnvelopesModal).toBe('function');
  });

  it('s\'ouvre et se décrit, même sans aucune enveloppe', () => {
    setState('envelopes', []);
    window.showManageEnvelopesModal();

    const modal = document.getElementById('modalManageEnvelopes');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('Aucune enveloppe');
    // La notion est neuve : sans une phrase pour la distinguer d'une catégorie,
    // l'écran ressemble à celui des catégories et sera employé comme tel.
    expect(modal.textContent).toContain('étiquette de lecture');
  });

  it('liste les enveloppes avec leur total du mois', () => {
    setState('envelopes', [VACANCES]);
    setState('variableCharges', [
      { id: '1', amount: 120, envelope: 'vacances-ete' },
      { id: '2', amount: 80, envelope: 'vacances-ete' },
      { id: '3', amount: 500 }
    ]);
    setState('fixedCharges', [
      { id: '4', amount: 200, envelope: 'vacances-ete' }
    ]);

    window.showManageEnvelopesModal();
    const modal = document.getElementById('modalManageEnvelopes');

    // 120 + 80 + 200 : les charges fixes comptent aussi — une mensualité de
    // chèques vacances appartient bien au voyage.
    expect(modal.textContent).toMatch(/400/);
    // Le mois est nommé : une enveloppe traverse les mois, un total sans
    // période serait faux pour toutes celles qui durent.
    expect(modal.textContent).toContain('ce mois-ci');
  });

  it('écarte du total les charges supprimées', () => {
    setState('envelopes', [VACANCES]);
    setState('variableCharges', [
      { id: '1', amount: 120, envelope: 'vacances-ete' },
      { id: '2', amount: 999, envelope: 'vacances-ete', deleted: true }
    ]);

    window.showManageEnvelopesModal();
    const modal = document.getElementById('modalManageEnvelopes');

    expect(modal.textContent).not.toMatch(/999/);
  });

  it('échappe le libellé dans la liste', () => {
    setState('envelopes', [{ ...VACANCES, label: '<script>alert(1)</script>' }]);
    window.showManageEnvelopesModal();

    const modal = document.getElementById('modalManageEnvelopes');
    expect(modal.querySelector('script')).toBeNull();
  });

  it('offre de clore plutôt que de supprimer', () => {
    // Supprimer perd le rattachement des charges passées ; clore le conserve.
    // Les deux commandes se tiennent côte à côte pour que le choix se pose.
    setState('envelopes', [VACANCES]);
    window.showManageEnvelopesModal();

    const modal = document.getElementById('modalManageEnvelopes');
    expect(modal.querySelector('.envelope-toggle')).not.toBeNull();
    expect(modal.querySelector('.envelope-delete')).not.toBeNull();
  });

  it('refuse un nom vide', async () => {
    setState('envelopes', []);
    window.showManageEnvelopesModal();

    const modal = document.getElementById('modalManageEnvelopes');
    modal.querySelector('#envelopeAddBtn').click();
    await Promise.resolve();

    // Rien n'a été écrit : la liste reste vide.
    expect(getEnveloppes()).toEqual([]);
  });

  it('réutilise la planche d\'emoji des catégories', () => {
    // Une seconde planche aurait dérivé de la première : c'est exactement
    // ainsi que « Bar », « Café » et « Boulangerie » sont restés sans image.
    setState('envelopes', []);
    window.showManageEnvelopesModal();

    const planche = document.getElementById('envelopeEmojiPicker');
    expect(planche.querySelectorAll('.emoji-pick').length).toBeGreaterThan(40);
    expect(planche.textContent).toContain('🏖️');
  });

  it('n\'ouvre qu\'une seule modale, même appelé plusieurs fois', () => {
    // L'écran se redessine après chaque écriture : une modale par rendu aurait
    // empilé des couches invisibles au-dessus de l'application.
    setState('envelopes', [VACANCES]);
    window.showManageEnvelopesModal();
    window.showManageEnvelopesModal();
    window.showManageEnvelopesModal();

    expect(document.querySelectorAll('#modalManageEnvelopes')).toHaveLength(1);
  });
});

/**
 * `loadEnvelopes` importe `db.js` à l'exécution ; le mock doit donc être posé
 * avant, et il vaut pour tout le fichier. Le nœud rendu est piloté par
 * `noeudEnBase`, réglé dans chaque cas.
 */
let noeudEnBase = null;
vi.mock('../../public/js/db.js', () => ({
  dbGet: async () => noeudEnBase
}));

describe('Chargement depuis la base', () => {
  it('ne retient rien quand le nœud est vide — c\'est l\'état de départ', async () => {
    // Contrairement aux catégories, il n'existe aucune enveloppe par défaut :
    // une enveloppe qu'on n'a pas créée n'a pas de sens. Le repli du `catch`
    // rendrait exactement le même résultat : le cas suivant prouve donc que la
    // lecture aboutit réellement.
    noeudEnBase = null;
    const { loadEnvelopes } = await import('../../public/js/modules/envelopes.js');

    await loadEnvelopes();
    expect(getEnveloppes()).toEqual([]);
  });

  it('lit ce qui est en base et écarte les entrées inexploitables', async () => {
    noeudEnBase = [
      { id: 'vacances-ete', label: 'Vacances été', icon: '🏖️' },
      { label: 'sans identifiant' },
      { id: 'chantier', label: 'Chantier', cloturee: true }
    ];
    const { loadEnvelopes } = await import('../../public/js/modules/envelopes.js');

    await loadEnvelopes();

    expect(getEnveloppes().map(e => e.id)).toEqual(['vacances-ete', 'chantier']);
    expect(getEnveloppes()[1].cloturee).toBe(true);
  });
});
