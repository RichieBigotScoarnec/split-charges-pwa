/**
 * La liste blanche des actions colle au balisage, dans les deux sens
 *
 * `init.js` résolvait un nom de fonction directement sur `window` à partir
 * d'un attribut du DOM. Quarante-sept fonctions étaient joignables par leur
 * nom — dont `settleBalance`, qui inscrit un remboursement sans confirmation,
 * `pickBackupFile`, dont la restauration écrase toute la base, et les trois
 * suppressions.
 *
 * La page se passe de `'unsafe-inline'` sur `script-src` précisément pour
 * qu'un balisage injecté ne puisse pas exécuter de code. Mais `data-action`
 * est un gestionnaire inline que la CSP ne voit pas : toute injection HTML
 * redevenait un appel de fonction arbitraire, à un clic près — et
 * `data-on-input` n'exige même pas le clic.
 *
 * Une liste blanche ne vaut que tenue à jour. Ce test la compare au balisage
 * réel dans les deux sens : un `data-action` qu'elle ne couvre pas est un
 * bouton mort, un nom qu'elle garde en trop est une porte laissée ouverte
 * pour rien.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = new URL('..', import.meta.url).pathname;

function fichiers(dossier, suffixe, trouves = []) {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) fichiers(chemin, suffixe, trouves);
    else if (entree.endsWith(suffixe)) trouves.push(chemin);
  }
  return trouves;
}

/** Ce que la délégation accepte, tel que déclaré dans init.js */
function listeBlanche() {
  const source = readFileSync(join(RACINE, 'public/js/init.js'), 'utf-8');
  const bloc = source.match(/const ACTIONS_AUTORISEES = new Set\(\[([\s\S]*?)\]\);/);
  if (!bloc) throw new Error('ACTIONS_AUTORISEES introuvable dans init.js');
  return new Set([...bloc[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
}

/**
 * Ce que le balisage déclenche réellement
 *
 * Le HTML de la page, et les gabarits que les modules posent en `innerHTML` —
 * c'est là que vivent les boutons de suppression et de règlement.
 */
function actionsDuBalisage() {
  const sources = [
    readFileSync(join(RACINE, 'public/FairSplit.html'), 'utf-8'),
    ...fichiers(join(RACINE, 'public/js'), '.js').map(f => readFileSync(f, 'utf-8'))
  ];

  const trouvees = new Set();
  for (const source of sources) {
    // Attributs écrits en toutes lettres. Ceux dont la valeur est interpolée
    // (`data-action="${…}"`) sont écartés : on ne peut rien en dire ici.
    for (const [, , valeur] of source.matchAll(/data-(action|on-change|on-input)="([^"$]*)"/g)) {
      for (const nom of valeur.split(',')) if (nom.trim()) trouvees.add(nom.trim());
    }
    // Attributs posés par `dataset`.
    for (const [, , nom] of source.matchAll(/dataset\.(action|onChange|onInput) = '([^']+)'/g)) {
      trouvees.add(nom);
    }
  }
  return trouvees;
}

describe('La délégation n\'accepte que ce que le balisage déclenche', () => {
  const blanche = listeBlanche();
  const balisage = actionsDuBalisage();

  it('le relevé n\'est pas vide', () => {
    // Sans cette garde, une expression régulière cassée rendrait tout vert.
    expect(blanche.size).toBeGreaterThan(30);
    expect(balisage.size).toBeGreaterThan(30);
  });

  it('aucun bouton mort : tout data-action est dans la liste blanche', () => {
    const absentes = [...balisage].filter(nom => !blanche.has(nom)).sort();
    expect(absentes).toEqual([]);
  });

  it('aucune porte inutile : la liste blanche ne garde rien en trop', () => {
    const superflues = [...blanche].filter(nom => !balisage.has(nom)).sort();
    expect(superflues).toEqual([]);
  });

  it('les fonctions destructrices ne sont joignables que parce qu\'un bouton les vise', () => {
    // Elles doivent y être — des boutons les portent — mais leur présence est
    // un choix qu'on relit, pas un effet de bord de l'espace de noms global.
    for (const nom of ['settleBalance', 'pickBackupFile', 'deleteVariableCharge',
      'deleteFixedCharge', 'deleteReimbursement', 'restoreFromTrash']) {
      expect(blanche.has(nom)).toBe(true);
      expect(balisage.has(nom)).toBe(true);
    }
  });

  it('le journal de diagnostic n\'est pas déclenchable par un attribut', () => {
    // `window.__diag` reste une commodité de console. Un `data-action` ne doit
    // pas pouvoir déverser l'historique de session dans la page.
    expect(blanche.has('__diag')).toBe(false);
  });

  it('la délégation passe bien par le filtre, et non plus par window directement', () => {
    const source = readFileSync(join(RACINE, 'public/js/init.js'), 'utf-8');
    expect(source).not.toMatch(/window\[\s*(action|fn|fnName)\s*\]\s*\(/);
    expect(source.match(/actionAutorisee\(/g).length).toBeGreaterThanOrEqual(3);
  });
});
