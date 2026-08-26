// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  uneSeuleFois,
  ecritureEnCours,
  relacher,
  occuperLeBouton
} from '../../public/js/utils/soumission.js';

/**
 * Un appui, une écriture
 *
 * Sur une connexion lente, `dbPush` met le temps qu'il met : la modale reste
 * ouverte, rien ne bouge, et le second appui est le réflexe naturel. Deux
 * charges identiques partaient alors en base, et le bilan comptait la dépense
 * deux fois.
 */
describe('Le verrou d\'écriture', () => {

  /** Une écriture qu'on relâche à la demande, comme une connexion lente */
  function ecritureLente() {
    let terminer;
    const promesse = new Promise(resolve => { terminer = resolve; });
    const action = vi.fn(() => promesse);
    return { action, terminer };
  }

  beforeEach(() => {
    relacher('essai');
    relacher('autre');
  });

  it('laisse passer le premier appui', async () => {
    const action = vi.fn();

    expect(await uneSeuleFois('essai', action)).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('ignore le second appui tant que le premier écrit', async () => {
    const { action, terminer } = ecritureLente();

    const premier = uneSeuleFois('essai', action);
    const second = await uneSeuleFois('essai', action);

    expect(second).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);

    terminer();
    await premier;
  });

  it('rouvre le passage une fois l\'écriture rendue', async () => {
    const { action, terminer } = ecritureLente();

    const premier = uneSeuleFois('essai', action);
    terminer();
    await premier;

    expect(await uneSeuleFois('essai', vi.fn())).toBe(true);
  });

  it('rouvre le passage même quand l\'écriture échoue', async () => {
    // `dbPush` passe par `borner()`, qui rejette au bout du délai : un verrou
    // qui ne se relâcherait qu'au succès laisserait le formulaire mort pour le
    // reste de la session.
    await expect(uneSeuleFois('essai', () => Promise.reject(new Error('réseau'))))
      .rejects.toThrow('réseau');

    expect(ecritureEnCours('essai')).toBe(false);
    expect(await uneSeuleFois('essai', vi.fn())).toBe(true);
  });

  it('ne verrouille qu\'un formulaire à la fois', async () => {
    // La saisie rapide ouverte pendant qu'une charge fixe part en base doit
    // rester utilisable : deux modales n'ont pas à s'attendre l'une l'autre.
    const { action, terminer } = ecritureLente();

    const premier = uneSeuleFois('essai', action);
    const ailleurs = vi.fn();

    expect(await uneSeuleFois('autre', ailleurs)).toBe(true);
    expect(ailleurs).toHaveBeenCalledTimes(1);

    terminer();
    await premier;
  });

  it('dit ce qu\'il tient', async () => {
    const { action, terminer } = ecritureLente();
    expect(ecritureEnCours('essai')).toBe(false);

    const premier = uneSeuleFois('essai', action);
    expect(ecritureEnCours('essai')).toBe(true);

    terminer();
    await premier;
    expect(ecritureEnCours('essai')).toBe(false);
  });

  it('`relacher` rouvre un verrou resté fermé', async () => {
    // Au nettoyage d'un module : une écriture interrompue par une déconnexion
    // ne doit pas condamner le formulaire pour la session suivante.
    const { action } = ecritureLente();
    uneSeuleFois('essai', action);
    expect(ecritureEnCours('essai')).toBe(true);

    relacher('essai');

    expect(ecritureEnCours('essai')).toBe(false);
    expect(await uneSeuleFois('essai', vi.fn())).toBe(true);
  });
});

describe('Le bouton pendant l\'écriture', () => {

  it('se désactive et dit ce qui se passe', () => {
    // Le verrou seul empêche la charge en double sans rien montrer : l'appui
    // ne produit rien, et ce silence est indiscernable d'une panne. C'est
    // d'ailleurs lui qui faisait appuyer une seconde fois.
    const bouton = document.createElement('button');
    bouton.textContent = 'Ajouter';

    occuperLeBouton(bouton);

    expect(bouton.disabled).toBe(true);
    expect(bouton.textContent).toBe('Enregistrement…');
  });

  it('rend le bouton à son état d\'origine, libellé compris', () => {
    const bouton = document.createElement('button');
    bouton.textContent = 'Ajouter';

    occuperLeBouton(bouton)();

    expect(bouton.disabled).toBe(false);
    expect(bouton.textContent).toBe('Ajouter');
  });

  it('rend « Modifier » à une édition, pas « Ajouter »', () => {
    // Les trois formulaires accordent leur bouton au geste depuis qu'éditer
    // n'affiche plus « Ajouter » : un libellé remis en dur le déferait.
    const bouton = document.createElement('button');
    bouton.textContent = 'Modifier';

    occuperLeBouton(bouton)();

    expect(bouton.textContent).toBe('Modifier');
  });

  it('accepte un libellé d\'attente choisi', () => {
    const bouton = document.createElement('button');
    bouton.textContent = 'Restaurer';

    occuperLeBouton(bouton, 'Restauration…');

    expect(bouton.textContent).toBe('Restauration…');
  });

  it('ne lève pas sur un bouton absent', () => {
    // Le balisage d'un test peut ne pas le porter, et une garde qui tombe
    // emporterait l'écriture qu'elle protège.
    expect(() => occuperLeBouton(null)()).not.toThrow();
  });
});
