// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Ce que le balisage livré doit garantir à qui ne voit pas l'écran.
 *
 * Deux listes de mode de partage étaient annoncées « liste déroulante » et
 * rien d'autre : ni étiquette, ni `aria-label`. Le libellé était porté par la
 * mise en page, que la synthèse vocale ne lit pas. Les tests d'interface
 * n'auraient rien vu — les champs fonctionnaient.
 *
 * Ces vérifications lisent le HTML réellement publié, seul endroit où ce genre
 * d'oubli se constate.
 */
// `import.meta.url` vaut une URL http sous l'environnement jsdom : le chemin
// est résolu depuis la racine du dépôt, d'où vitest est lancé.
const html = readFileSync(resolve(process.cwd(), 'public/FairSplit.html'), 'utf8');

/** @returns {Document} le document tel que le navigateur le construit */
function documentLivre() {
  const doc = document.implementation.createHTMLDocument('');
  doc.documentElement.innerHTML = html
    .replace(/<!DOCTYPE[^>]*>/i, '')
    .replace(/<\/?html[^>]*>/gi, '');
  return doc;
}

/**
 * Nom accessible d'un champ, dans l'ordre où la plateforme le résout.
 * @param {Element} champ
 * @param {Document} doc
 * @returns {string} nom trouvé, chaîne vide sinon
 */
function nomAccessible(champ, doc) {
  const aria = champ.getAttribute('aria-label');
  if (aria && aria.trim()) return aria.trim();

  const parId = champ.id && doc.querySelector(`label[for="${champ.id}"]`);
  if (parId && parId.textContent.trim()) return parId.textContent.trim();

  const englobant = champ.closest('label');
  if (englobant && englobant.textContent.trim()) return englobant.textContent.trim();

  return '';
}

describe('Le balisage livré', () => {
  const doc = documentLivre();

  it('nomme chacun de ses champs de saisie', () => {
    // Les champs masqués sont déclenchés par un bouton, lui-même nommé.
    const champs = [...doc.querySelectorAll('input, select, textarea')]
      .filter((c) => c.type !== 'hidden' && !c.hasAttribute('hidden'));

    const muets = champs
      .filter((c) => !nomAccessible(c, doc))
      .map((c) => c.id || c.name || c.tagName.toLowerCase());

    expect(muets, `champs sans nom accessible : ${muets.join(' | ')}`).toEqual([]);
    expect(champs.length).toBeGreaterThan(10);
  });

  it('nomme chacun de ses boutons', () => {
    const muets = [...doc.querySelectorAll('button')]
      .filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title'))
      .map((b) => b.id || b.className);

    expect(muets, `boutons sans nom accessible : ${muets.join(' | ')}`).toEqual([]);
  });

  it('n\'attribue jamais deux fois le même identifiant', () => {
    // Un doublon fait pointer `getElementById` et `label[for]` sur le premier
    // venu : le second champ devient inatteignable sans que rien ne le signale.
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    const doublons = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];

    expect(doublons, `identifiants dupliqués : ${doublons.join(' | ')}`).toEqual([]);
  });

  it('ne pointe aucune étiquette vers un champ absent', () => {
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const perdues = [...html.matchAll(/\bfor="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((cible) => !ids.has(cible));

    expect(perdues, `étiquettes sans champ : ${perdues.join(' | ')}`).toEqual([]);
  });
});

describe('La grille de catégories', () => {
  const doc = documentLivre();

  it('est le seul chemin vers une catégorie dans la saisie rapide', () => {
    // Une ligne « Souvent » doublait la grille en répétant ses libellés. La
    // grille classe désormais elle-même par usage : deux propositions pour le
    // même geste faisaient hésiter au lieu d'aider, et la synthèse vocale
    // annonçait deux fois « Courses » sans distinguer l'une de l'autre.
    expect(doc.getElementById('categoryGrid'), 'la grille est absente du balisage').not.toBeNull();
    expect(doc.getElementById('categoryFrequentes')).toBeNull();
    expect(doc.getElementById('categoryFrequentesListe')).toBeNull();
  });
});
