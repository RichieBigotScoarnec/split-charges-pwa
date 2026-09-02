import { describe, it, expect } from 'vitest';
import {
  cheminsDesRegles, restrictions, acquittements, verdict
} from '../tools/regles-restrictives.mjs';

/**
 * Une règle qui restreint ne se publie pas comme les autres
 *
 * Le pipeline publie les règles AVANT le site : c'est le bon ordre pour une
 * règle qui élargit, et l'inverse de celui qu'il faut pour une règle qui
 * restreint. Publiée d'abord, celle-ci casse le client en production — celui
 * qui écrit encore le champ qu'on vient d'interdire — jusqu'à ce que le site
 * suive.
 *
 * Ce cas ne se détectait par rien : il vivait dans un commentaire de workflow,
 * c'est-à-dire nulle part le jour où quelqu'un retire un champ sans l'avoir lu.
 *
 * Ce que ces contrôles tiennent :
 *
 *   1. Un chemin retiré est une restriction — `$autre/.validate` valant
 *      `false`, tout champ absent de l'arbre devient un champ refusé.
 *   2. Un accès qui devient `false` en est une aussi.
 *   3. Élargir ne déclenche rien : le cas courant doit rester silencieux, sinon
 *      le contrôle crie toujours et on cesse de le lire.
 *   4. `false` n'est un refus que sur les trois clés qui gouvernent un accès.
 */

/** L'arbre réel, réduit à ce qui compte ici */
const AVANT = {
  rules: {
    aval: {
      vous: {
        '.read': 'auth != null',
        '.write': "auth.token.email === 'r@x'",
        actif: { '.validate': 'newData.isBoolean()' },
        publieLeTotal: { '.validate': 'newData.isBoolean()' },
        $autre: { '.validate': false }
      }
    }
  }
};

const clone = (o) => JSON.parse(JSON.stringify(o));

describe('cheminsDesRegles', () => {
  it('aplatit l\'arbre en chemins terminaux', () => {
    const chemins = cheminsDesRegles(AVANT);

    expect(chemins.get('rules/aval/vous/actif/.validate')).toBe('newData.isBoolean()');
    expect(chemins.get('rules/aval/vous/$autre/.validate')).toBe(false);
    expect(chemins.get('rules/aval/vous/.read')).toBe('auth != null');
  });

  it('ne lève pas sur un arbre vide ou absent', () => {
    expect(cheminsDesRegles(null).size).toBe(0);
    expect(cheminsDesRegles({}).size).toBe(0);
  });
});

describe('restrictions', () => {
  it('ne dit rien quand un champ est AJOUTÉ — c\'est le cas courant', () => {
    const apres = clone(AVANT);
    apres.rules.aval.vous.nouveauChamp = { '.validate': 'newData.isBoolean()' };

    expect(restrictions(AVANT, apres)).toEqual([]);
  });

  it('signale un champ retiré', () => {
    // Exactement la forme inverse de `publieLeTotal` : ce qui a ete ajoute un
    // jour peut etre retire un autre, et c'est ce jour-la que l'ordre compte.
    const apres = clone(AVANT);
    delete apres.rules.aval.vous.publieLeTotal;

    expect(restrictions(AVANT, apres)).toEqual([
      { chemin: 'rules/aval/vous/publieLeTotal/.validate', forme: 'retire' }
    ]);
  });

  it('signale un accès qui devient `false`', () => {
    const apres = clone(AVANT);
    apres.rules.aval.vous['.read'] = false;

    expect(restrictions(AVANT, apres)).toEqual([
      { chemin: 'rules/aval/vous/.read', forme: 'refuse' }
    ]);
  });

  it('ne compte pas un `false` deja present', () => {
    // `$autre/.validate` vaut false des le depart : le laisser tel quel n'est
    // pas un durcissement.
    expect(restrictions(AVANT, clone(AVANT))).toEqual([]);
  });

  it('ne prend `false` pour un refus que sur les cles d\'acces', () => {
    const avant = { rules: { a: { drapeau: true } } };
    const apres = { rules: { a: { drapeau: false } } };

    expect(restrictions(avant, apres)).toEqual([]);
  });

  it('ne juge PAS les expressions booleennes, et l\'assume', () => {
    // Passer de `a` a `a && b` restreint. Le detecter demanderait un solveur ;
    // un controle qui pretend tout attraper est pire que celui qui dit ou il
    // s'arrete, parce qu'on cesse de relire.
    const apres = clone(AVANT);
    apres.rules.aval.vous['.read'] = "auth != null && auth.token.email === 'r@x'";

    expect(restrictions(AVANT, apres)).toEqual([]);
  });

  it('rend un ordre stable', () => {
    const apres = clone(AVANT);
    delete apres.rules.aval.vous.publieLeTotal;
    delete apres.rules.aval.vous.actif;

    expect(restrictions(AVANT, apres).map((r) => r.chemin))
      .toEqual([
        'rules/aval/vous/actif/.validate',
        'rules/aval/vous/publieLeTotal/.validate'
      ]);
  });
});

describe('acquittements', () => {
  it('lit un chemin par ligne, commentaires et vides ecartes', () => {
    const fichier = [
      '# Retire le 2026-09-02 : le client ne l\'ecrit plus depuis la 4.2',
      'rules/aval/vous/publieLeTotal/.validate',
      '',
      'rules/aval/conjointe/publieLeTotal/.validate  # meme raison'
    ].join('\n');

    expect(acquittements(fichier)).toEqual(new Set([
      'rules/aval/vous/publieLeTotal/.validate',
      'rules/aval/conjointe/publieLeTotal/.validate'
    ]));
  });

  it('un fichier absent vaut aucun acquittement, pas une panne', () => {
    expect(acquittements(undefined).size).toBe(0);
    expect(acquittements('').size).toBe(0);
  });
});

describe('verdict', () => {
  it('bloque sur une restriction non acquittee', () => {
    const trouvees = [{ chemin: 'rules/a/.read', forme: 'refuse' }];
    expect(verdict(trouvees, new Set()).bloque).toBe(true);
  });

  it('laisse passer ce qui est acquitte', () => {
    const trouvees = [{ chemin: 'rules/a/.read', forme: 'refuse' }];
    const rendu = verdict(trouvees, new Set(['rules/a/.read']));

    expect(rendu.bloque).toBe(false);
    expect(rendu.nonAcquittes).toEqual([]);
  });

  it('un acquittement ne couvre QUE son chemin', () => {
    const trouvees = [
      { chemin: 'rules/a/.read', forme: 'refuse' },
      { chemin: 'rules/b/.read', forme: 'refuse' }
    ];
    const rendu = verdict(trouvees, new Set(['rules/a/.read']));

    expect(rendu.bloque).toBe(true);
    expect(rendu.nonAcquittes).toEqual([{ chemin: 'rules/b/.read', forme: 'refuse' }]);
  });

  it('ne bloque pas quand il n\'y a rien a bloquer', () => {
    expect(verdict([], new Set()).bloque).toBe(false);
  });
});
