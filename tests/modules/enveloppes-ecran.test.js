// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));

import { setState, resetState } from '../../public/js/state.js';
import { toast } from '../../public/js/components/toast.js';
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
  vi.clearAllMocks();
});

/**
 * Referme un formulaire d'édition laissé ouvert par un cas précédent
 *
 * `_enEdition` est un état de MODULE : il survit d'un cas à l'autre, et l'écran
 * rouvre alors le formulaire tout seul — la ligne éditée disparaît, avec son
 * bouton ✏️. Trouvé en écrivant le contrôle du thème à l'édition.
 */
function ecranPropre() {
  window.showManageEnvelopesModal();
  const annuler = document.getElementById('envelopeEditAnnuler');
  if (annuler) {
    annuler.click();
    window.showManageEnvelopesModal();
  }
}

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

/**
 * Le double de `fusionnerListe` rend la liste voulue telle quelle
 *
 * C'est une transaction Firebase en production. Ce qu'on mesure ici n'est pas
 * l'écriture — `tests/e2e/regles-donnees.spec.js` s'en charge contre le moteur
 * réel — mais ce que le formulaire COMPOSE avant de l'envoyer.
 */
vi.mock('../../public/js/modules/custom-lists.js', async (original) => ({
  ...(await original()),
  fusionnerListe: async (_chemin, voulue) => voulue
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

/**
 * LE THÈME À L'ÉCRAN
 *
 * Les fabriques pures sont couvertes par `tests/utils/enveloppes.test.js`. Ici,
 * le CÂBLAGE : ce que le sélecteur propose, ce que le formulaire écrit, et ce
 * que le foyer lit en retour.
 *
 * Le harnais est celui qui existe — `showManageEnvelopesModal` y est déjà monté
 * avec ses doubles. En écrire un second aurait dérivé du premier, ce qui est
 * exactement le défaut que ce fichier a déjà consigné pour la planche d'emoji.
 */
describe('Le thème, sur l\'écran de gestion', () => {
  const enveloppeAvecTheme = (id, label, theme) => ({
    id, label, icon: '🏖️', budget: null, debut: null, fin: null,
    cloturee: false, theme
  });

  it('propose les thèmes déjà en usage, plus une entrée pour en créer un', () => {
    setState('envelopes', [
      enveloppeAvecTheme('a', 'Vacances 2026', 'Vacances'),
      enveloppeAvecTheme('b', 'Week-end Bretagne', 'Week-ends'),
      enveloppeAvecTheme('c', 'Vacances 2027', 'vacances')
    ]);
    window.showManageEnvelopesModal();

    const select = document.getElementById('envelopeNewTheme');
    const valeurs = [...select.options].map(o => o.textContent.trim());

    // « Vacances » et « vacances » sont UN thème : trois enveloppes, deux
    // thèmes, plus « aucun » et « nouveau ».
    expect(valeurs).toEqual(['— aucun —', 'Vacances', 'Week-ends', '+ Nouveau thème…']);
  });

  it('porte des RANGS en valeur, jamais des libellés', () => {
    // Le sélecteur doit cohabiter avec la sentinelle « + ». Un foyer nommant
    // son thème « + » entrerait en collision avec elle si les valeurs
    // portaient les libellés.
    setState('envelopes', [enveloppeAvecTheme('a', 'Vacances 2026', '+')]);
    window.showManageEnvelopesModal();

    const select = document.getElementById('envelopeNewTheme');
    const valeurs = [...select.options].map(o => o.value);

    expect(valeurs).toEqual(['', '0', '+']);
    // Le thème « + » est bien proposé, et distinct de la sentinelle.
    expect([...select.options][1].textContent.trim()).toBe('+');
  });

  it('cache le champ de saisie tant que « nouveau thème » n\'est pas choisi', () => {
    setState('envelopes', []);
    window.showManageEnvelopesModal();

    const champ = document.getElementById('envelopeNewThemeNouveau');
    const select = document.getElementById('envelopeNewTheme');

    expect(champ.hidden).toBe(true);

    select.value = '+';
    select.dispatchEvent(new Event('change'));
    expect(champ.hidden).toBe(false);

    select.value = '';
    select.dispatchEvent(new Event('change'));
    expect(champ.hidden).toBe(true);
  });

  it('affiche le thème sur la ligne de l\'enveloppe', () => {
    // Sans cette marque, le thème serait une propriété qu'on pose et qu'on ne
    // relit jamais.
    setState('envelopes', [enveloppeAvecTheme('a', 'Vacances 2026', 'Vacances')]);
    window.showManageEnvelopesModal();

    const marque = document.querySelector('.envelope-theme');
    expect(marque).not.toBeNull();
    expect(marque.textContent.trim()).toBe('Vacances');
  });

  it('échappe le libellé d\'un thème : il vient du foyer', () => {
    setState('envelopes', [
      enveloppeAvecTheme('a', 'Vacances', '<img src=x onerror=alert(1)>')
    ]);
    window.showManageEnvelopesModal();

    expect(document.querySelector('#modalManageEnvelopes img')).toBeNull();
    expect(document.querySelector('.envelope-theme').textContent)
      .toContain('<img');
  });

  it('préselectionne le thème de l\'enveloppe qu\'on édite', () => {
    setState('envelopes', [
      enveloppeAvecTheme('a', 'Vacances 2026', 'Vacances'),
      enveloppeAvecTheme('b', 'Chantier', 'Travaux')
    ]);
    window.showManageEnvelopesModal();

    document.querySelectorAll('.envelope-editer')[1].click();

    const select = document.getElementById('envelopeEditTheme');
    const retenue = [...select.options].find(o => o.selected);
    expect(retenue.textContent.trim()).toBe('Travaux');
  });

  it('ouvre sur « aucun » quand l\'enveloppe n\'en porte pas', () => {
    setState('envelopes', [enveloppeAvecTheme('a', 'Vacances', null)]);
    window.showManageEnvelopesModal();

    document.querySelector('.envelope-editer').click();

    const select = document.getElementById('envelopeEditTheme');
    expect([...select.options].find(o => o.selected).value).toBe('');
  });
});

/**
 * CE QUE LE FORMULAIRE ÉCRIT RÉELLEMENT
 *
 * Les contrôles ci-dessus mesurent ce que l'écran PROPOSE. Ceux-ci mesurent ce
 * qu'il COMPOSE — la moitié qui manquait, et celle par laquelle un thème choisi
 * mais jamais écrit passerait inaperçu.
 */
describe('Le thème que le formulaire enregistre', () => {
  const remplir = (nom) => {
    document.getElementById('envelopeNewLabel').value = nom;
  };

  const ajouter = async () => {
    document.getElementById('envelopeAddBtn').click();
    // Deux tours : `ajouter` est asynchrone et attend `enregistrer`.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  it('écrit le thème choisi dans la liste', async () => {
    setState('envelopes', [{
      id: 'a', label: 'Vacances 2026', icon: '🏖️', budget: null,
      debut: null, fin: null, cloturee: false, theme: 'Vacances'
    }]);
    window.showManageEnvelopesModal();

    remplir('Vacances 2027');
    const select = document.getElementById('envelopeNewTheme');
    select.value = '0';

    await ajouter();

    const creee = getEnveloppes().find(e => e.label === 'Vacances 2027');
    expect(creee).toBeDefined();
    expect(creee.theme).toBe('Vacances');
  });

  it('crée un thème neuf quand on le tape', async () => {
    setState('envelopes', []);
    window.showManageEnvelopesModal();

    remplir('Chantier salle de bain');
    document.getElementById('envelopeNewTheme').value = '+';
    document.getElementById('envelopeNewThemeNouveau').value = 'Travaux';

    await ajouter();

    expect(getEnveloppes()[0].theme).toBe('Travaux');
  });

  it('ramène une variante au thème existant, et le DIT', async () => {
    // Sans ce mot, taper « vacances » quand « Vacances » existe donnerait le
    // sentiment d'avoir créé un thème qu'on ne retrouve nulle part.
    setState('envelopes', [{
      id: 'a', label: 'Vacances 2026', icon: '🏖️', budget: null,
      debut: null, fin: null, cloturee: false, theme: 'Vacances'
    }]);
    window.showManageEnvelopesModal();

    remplir('Vacances 2027');
    document.getElementById('envelopeNewTheme').value = '+';
    document.getElementById('envelopeNewThemeNouveau').value = 'VACANCES';

    await ajouter();

    const creee = getEnveloppes().find(e => e.label === 'Vacances 2027');
    expect(creee.theme).toBe('Vacances');
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Vacances'));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('rangée dans'));
  });

  it('« nouveau thème » laissé vide crée l\'enveloppe sans thème', async () => {
    // Un champ facultatif ne doit pas faire échouer tout le formulaire.
    setState('envelopes', []);
    window.showManageEnvelopesModal();

    remplir('Sans thème');
    document.getElementById('envelopeNewTheme').value = '+';
    document.getElementById('envelopeNewThemeNouveau').value = '   ';

    await ajouter();

    expect(getEnveloppes()).toHaveLength(1);
    expect(getEnveloppes()[0].theme).toBe(null);
  });

  it('l\'édition change le thème sans toucher à l\'identifiant', async () => {
    // L'identifiant porte les charges rattachées : le déplacer les détacherait.
    setState('envelopes', [{
      id: 'vacances-2026', label: 'Vacances 2026', icon: '🏖️', budget: null,
      debut: null, fin: null, cloturee: false, theme: null
    }]);
    ecranPropre();

    document.querySelector('.envelope-editer').click();
    document.getElementById('envelopeEditTheme').value = '+';
    document.getElementById('envelopeEditThemeNouveau').value = 'Vacances';
    document.getElementById('envelopeEditValider').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(getEnveloppes()[0].id).toBe('vacances-2026');
    expect(getEnveloppes()[0].theme).toBe('Vacances');
  });
});
