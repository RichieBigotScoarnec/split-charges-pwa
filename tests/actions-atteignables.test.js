import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Chaque commande de l'interface mène-t-elle quelque part, et réciproquement ?
 *
 * Deux défauts de la même famille, trouvés à l'usage plutôt que par un test.
 *
 * L'écran de gestion des catégories existait, complet — liste, sélecteur
 * d'emoji, ajout, suppression, écriture en base. Aucun bouton ne l'ouvrait :
 * `window.showManageCategoriesModal` était exposé « pour compatibilité » et
 * personne ne l'appelait. La seule façon d'y accéder était la console du
 * navigateur, c'est-à-dire pas depuis un téléphone.
 *
 * Avant lui, la carte : son unique accès se trouvait dans un panneau en
 * `display: none`.
 *
 * Rien ne signalait ni l'un ni l'autre. La délégation de `init.js` ignore
 * silencieusement une action absente de `window` — commentaire à l'appui — et
 * une fonction exposée que personne n'appelle ne dérange personne.
 *
 * Ces deux contrôles ferment les deux sens.
 */

const RACINE = process.cwd();
const html = readFileSync(resolve(RACINE, 'public/FairSplit.html'), 'utf8');

/** Tout le JavaScript publié, concaténé */
function sourcesPubliees(repertoire = resolve(RACINE, 'public/js')) {
  let texte = '';
  for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
    const chemin = join(repertoire, entree.name);
    if (entree.isDirectory()) texte += sourcesPubliees(chemin);
    else if (entree.name.endsWith('.js')) texte += readFileSync(chemin, 'utf8');
  }
  return texte;
}

const js = sourcesPubliees();

/** Noms d'actions référencés par le balisage livré */
const actionsDuBalisage = [...new Set(
  [...html.matchAll(/data-action="([^"]+)"/g)].map(m => m[1])
)];

/** Noms exposés sur `window`, seule surface que la délégation sait joindre */
const exposesSurWindow = new Set(
  [...js.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map(m => m[1])
);

describe('Toute commande de l\'interface mène quelque part', () => {
  it('le balisage référence au moins les actions attendues', () => {
    // Garde-fou du test lui-même : une expression qui ne trouverait plus rien
    // passerait tous les contrôles suivants sans rien vérifier.
    expect(actionsDuBalisage.length).toBeGreaterThan(10);
  });

  it('chaque data-action correspond à une fonction exposée', () => {
    // `init.js` appelle `window[action]` et, si rien n'y répond, ne fait rien —
    // sans un mot. Un bouton mort est indiscernable d'un bouton lent.
    const orphelines = actionsDuBalisage.filter(action => !exposesSurWindow.has(action));

    expect(orphelines, `boutons sans destination : ${orphelines.join(', ')}`).toEqual([]);
  });
});

describe('Tout écran a une porte', () => {
  /**
   * Les fonctions qui ouvrent quelque chose et que le balisage doit pouvoir
   * atteindre. La liste est explicite : `window` porte aussi des fonctions
   * appelées depuis le code lui-même, qui n'ont pas à figurer dans le HTML.
   */
  const OUVERTURES = [
    'showManageCategoriesModal',
    'showManageDestinationsModal',
    'showQuickAddModal',
    'showTrash',
    'showBackup',
    'showMapModal'
  ];

  it('chaque écran exposé est joignable depuis le balisage', () => {
    const sansPorte = OUVERTURES
      .filter(nom => exposesSurWindow.has(nom))
      .filter(nom => !actionsDuBalisage.includes(nom));

    expect(sansPorte, `écrans sans accès dans l'interface : ${sansPorte.join(', ')}`).toEqual([]);
  });

  it('la gestion des catégories est accessible : c\'est là qu\'on crée « Bar »', () => {
    // Le cas signalé. La détection par le lieu vise des catégories que le foyer
    // doit pouvoir créer ; sans cet accès, la moitié de la fonctionnalité est
    // hors d'atteinte.
    expect(exposesSurWindow.has('showManageCategoriesModal')).toBe(true);
    expect(actionsDuBalisage).toContain('showManageCategoriesModal');
  });
});
