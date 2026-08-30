/**
 * Les CHAMPS d'une enveloppe sont ceux que les règles déclarent
 *
 * `tests/regles-couvrent-les-ecritures.test.js` compare les CHEMINS écrits aux
 * chemins déclarés. Il s'arrête au nœud : `envelopes` est déclaré, donc il est
 * vert — quel que soit le contenu des objets qu'on y pousse.
 *
 * Or c'est le contenu qui est refusé. `$rang` ferme sa liste de champs par
 * `"$autre": { ".validate": false }`, et `fusionnerListe` écrit le tableau
 * ENTIER par une transaction : un champ inconnu sur UNE enveloppe fait refuser
 * l'écriture COMPLÈTE — toutes les enveloppes du foyer, pas seulement la neuve.
 * L'écran dirait « créée », `enregistrer` attraperait l'erreur et afficherait
 * « Erreur de sauvegarde », et rien n'expliquerait pourquoi les anciennes ont
 * disparu de l'écran suivant.
 *
 * Mesuré avant ce fichier : ajouter `couleur: '#f00'` au littéral de création
 * laissait les 2 331 contrôles verts.
 *
 * Ce test ne parle à aucun serveur. Il compare deux listes, DANS LES DEUX SENS,
 * pour la même raison que `sauvegarde-noeuds-declares.test.js` : une comparaison
 * à sens unique laisse passer la moitié des divergences, et c'est par là que la
 * panne du précache et celle de la CSP sont passées.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normaliserEnveloppe, NATURES, RANGS } from '../public/js/utils/enveloppes.js';

const RACINE = new URL('..', import.meta.url).pathname;
const REGLES = JSON.parse(readFileSync(join(RACINE, 'database.rules.json'), 'utf-8')).rules;

/** Le module qui écrit les enveloppes */
const SOURCE = readFileSync(join(RACINE, 'public/js/modules/envelopes.js'), 'utf-8');

/**
 * Une enveloppe dont TOUS les champs facultatifs sont renseignés
 *
 * Un brouillon partiel ne prouverait rien : `normaliserEnveloppe` rend toujours
 * la forme complète, mais un champ qu'on oublierait de peupler ici sortirait
 * quand même — c'est bien l'ensemble des CLÉS qu'on compare, pas les valeurs.
 */
const COMPLETE = Object.freeze({
  id: 'vacances-2027',
  label: 'Vacances 2027',
  icon: '🏖️',
  budget: 1200,
  debut: '2026-09-01',
  fin: '2027-08-01',
  cloturee: true,
  nature: NATURES.MENSUELLE,
  report: true,
  rang: RANGS.PROVISION,
  perimetre: 'solo',
  proprietaire: 'vous',
  creePar: 'conjointe',
  creeLe: 1756400000000
});

/** Les champs qu'une enveloppe écrite porte réellement */
const ECRITS = Object.keys(normaliserEnveloppe(COMPLETE)).sort();

/** Les champs nommément déclarés par les règles d'un espace */
function declares(espace) {
  return Object.keys(REGLES[espace].envelopes.$rang)
    .filter(cle => !cle.startsWith('.') && !cle.startsWith('$'))
    .sort();
}

describe('Les champs écrits d\'une enveloppe et ceux des règles se correspondent', () => {
  it('le relevé n\'est pas vide', () => {
    // Sans cette garde, une fabrique qui rendrait `{}` ferait passer tout le
    // fichier : deux listes vides se correspondent parfaitement.
    expect(ECRITS.length).toBeGreaterThan(10);
  });

  it.each(['household', 'sandbox'])('espace %s — aucun champ écrit n\'est refusé', (espace) => {
    // Le sens qui coûte : un champ ajouté au code et oublié dans les règles
    // fait refuser TOUTES les enveloppes.
    expect(ECRITS.filter(champ => !declares(espace).includes(champ))).toEqual([]);
  });

  it.each(['household', 'sandbox'])('espace %s — aucun champ déclaré n\'est mort', (espace) => {
    // L'autre sens, celui qu'on oublie : une règle pour un champ que plus rien
    // n'écrit. Elle ne casse rien aujourd'hui, et c'est le problème — elle
    // survit à un renommage et laisse croire que le champ est couvert.
    expect(declares(espace).filter(champ => !ECRITS.includes(champ))).toEqual([]);
  });

  it('les deux espaces déclarent exactement les mêmes champs', () => {
    // Le bac à sable sert à éprouver l'application avant la production : des
    // règles plus permissives d'un côté en feraient un témoin qui ment.
    expect(declares('sandbox')).toEqual(declares('household'));
  });

  it('un champ inconnu serait bien détecté', () => {
    // Le test doit savoir échouer. `couleur` est exactement ce qu'un futur
    // écran ajouterait sans y penser.
    expect(declares('household')).not.toContain('couleur');
    expect(ECRITS).not.toContain('couleur');
    expect(Object.keys(normaliserEnveloppe({ ...COMPLETE, couleur: '#f00' })))
      .not.toContain('couleur');
  });
});

describe('CE QUI TIENT LA PROPRIÉTÉ : une seule fabrique de la forme écrite', () => {
  /**
   * La comparaison ci-dessus ne vaut que si `normaliserEnveloppe` est bien la
   * seule forme qui parte en base. Les deux chemins de création écrivaient
   * chacun son littéral, tenu à la main en parallèle des règles ET l'un de
   * l'autre : ils pouvaient donc porter un champ que la fabrique ignore, et la
   * comparaison des clés serait restée verte pendant que le serveur refusait.
   *
   * Les chemins d'édition et de clôture, eux, étalent une enveloppe déjà
   * normalisée (`{ ...enveloppe, label, icon, … }`) : leur forme est celle-ci
   * par construction.
   *
   * Ce qui tient les DEUX créations tient à une seule chose : toute enveloppe
   * neuve doit porter son auteur et son instant, et `provenance()` est le seul
   * endroit qui les fabrique. S'il n'est appelé que dans `enveloppeNeuve`,
   * aucun troisième chemin ne peut créer une enveloppe estampillée sans passer
   * par la fabrique.
   */
  const corpsDeLaFabrique = () => {
    const debut = SOURCE.indexOf('function enveloppeNeuve(');
    expect(debut, 'la fabrique a disparu').toBeGreaterThan(-1);
    return SOURCE.slice(debut, SOURCE.indexOf('\n}', debut));
  };

  it('`provenance()` n\'est appelée qu\'une fois, et c\'est dans la fabrique', () => {
    // Deux occurrences en tout : sa déclaration, et son unique appel.
    expect((SOURCE.match(/provenance\(\)/g) || []).length).toBe(2);
    expect(corpsDeLaFabrique()).toContain('...provenance()');
  });

  it('et les deux chemins de création l\'empruntent', () => {
    expect((SOURCE.match(/enveloppeNeuve\(\{/g) || []).length).toBe(2);
  });

  it('TOUT chemin d\'écriture passe par une fabrique de forme', () => {
    // Créer n'est pas le seul geste qui écrit : éditer et clore réécrivent le
    // tableau ENTIER par la même transaction. Un champ de plus posé sur l'un
    // d'eux — un `modifieLe`, une couleur — fait refuser TOUTES les enveloppes
    // du foyer. Mesuré : l'ajouter au chemin d'édition laissait les 2 378
    // contrôles verts, la comparaison de champs ci-dessus ne regardant que la
    // création.
    //
    // Les quatre appels à `enregistrer` : deux créations (`enveloppeNeuve`),
    // une édition et une clôture (`normaliserEnveloppe`), et une suppression,
    // qui ne fait que filtrer et n'invente aucun champ.
    const etalements = SOURCE.match(/\{\s*\.\.\.enveloppe,/g) || [];
    const normalises = SOURCE.match(/normaliserEnveloppe\(\{\s*\.\.\.enveloppe,/g) || [];

    expect(etalements.length).toBeGreaterThan(1);
    expect(normalises.length, 'un étalement d\'enveloppe échappe à la fabrique')
      .toBe(etalements.length);
  });

  it('la fabrique laisse tomber ce qu\'elle ne connaît pas', () => {
    // Le témoin : c'est CE comportement qui rend un champ oublié inoffensif.
    // Sans lui, `couleur` partirait en base et le serveur refuserait tout.
    const sortie = normaliserEnveloppe({ ...COMPLETE, couleur: '#f00', note: 'x' });

    expect(Object.keys(sortie).sort()).toEqual(ECRITS);
  });
});
