// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Deux messages simultanés doivent se suivre, jamais se recouvrir
 *
 * `toast.js` crée un conteneur en colonne, précisément pour les empiler. Mais
 * `.toast` déclarait `position: fixed; bottom: 20px; right: 20px` : chaque
 * message sortait du flux du conteneur et se posait au même point. Mesuré dans
 * un vrai navigateur, les deux atterrissaient à trois pixels l'un de l'autre —
 * un tas illisible.
 *
 * Le cas n'a rien de théorique : ouvrir la carte sans réseau et créer une
 * enveloppe dans la foulée suffit à le produire, et c'est ce qu'a montré la
 * capture d'écran de la revue.
 *
 * jsdom ne met rien en page — il ne peut donc pas mesurer la superposition. Ce
 * contrôle porte sur sa cause : la règle qui sortait le message du flux.
 */

const RACINE = process.cwd();
const feuille = readFileSync(resolve(RACINE, 'public/css/components.css'), 'utf8');

/** Le bloc de déclarations d'un sélecteur, sans ses commentaires */
function bloc(css, selecteur) {
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const debut = sansCommentaires.indexOf(`\n${selecteur} {`);
  if (debut === -1) return null;
  const ouvrante = sansCommentaires.indexOf('{', debut);
  const fermante = sansCommentaires.indexOf('}', ouvrante);
  return sansCommentaires.slice(ouvrante + 1, fermante);
}

describe('Un message ne se pose pas tout seul', () => {
  it('`.toast` ne se retire pas du flux de son conteneur', () => {
    const regles = bloc(feuille, '.toast');
    expect(regles, 'le sélecteur .toast a disparu').not.toBeNull();

    expect(regles, 'position: fixed remet tous les messages au même point')
      .not.toMatch(/position:\s*fixed/);
    expect(regles, 'une ancre basse replace le message hors de la pile')
      .not.toMatch(/\bbottom:/);
  });
});

describe('Le conteneur, lui, porte le positionnement', () => {
  let source;

  beforeEach(async () => {
    source = readFileSync(resolve(RACINE, 'public/js/components/toast.js'), 'utf8');
  });

  it('empile en colonne', () => {
    expect(source).toMatch(/flex-direction:\s*column/);
  });

  it('garde la marge de sécurité du bas, au lieu de l\'écraser', () => {
    // `.toast` déclarait `bottom: env(safe-area-inset-bottom, 20px)` puis
    // `bottom: 20px` juste après : le repli passait pour la valeur, et les
    // messages finissaient sous la barre de navigation du téléphone.
    expect(source, 'la garde du bas d\'écran a été perdue')
      .toMatch(/env\(safe-area-inset-bottom/);
  });
});

describe('À l\'usage', () => {
  let toast;

  beforeEach(async () => {
    document.body.innerHTML = '';
    // Le module retient son conteneur d'un appel à l'autre : sans remise à
    // zéro, le second cas travaillerait sur le conteneur détaché du premier.
    vi.resetModules();
    toast = (await import('../public/js/components/toast.js')).toast;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('deux messages vivent côte à côte dans un seul conteneur', () => {
    toast.error('Carte indisponible');
    toast.success('Enveloppe créée');

    const conteneurs = document.querySelectorAll('#toast-container');
    expect(conteneurs, 'chaque message s\'est fabriqué son propre conteneur').toHaveLength(1);
    expect(conteneurs[0].querySelectorAll('.toast')).toHaveLength(2);
  });

  it('les messages restent touchables, pour que « Annuler » réponde', () => {
    const conteneur = () => document.getElementById('toast-container');
    toast.success('Charge supprimée', { onUndo: () => {} });

    expect(conteneur().style.pointerEvents, 'le conteneur volerait les appuis alentour').toBe('none');
    expect(feuille).toMatch(/pointer-events:\s*auto/);
  });
});
