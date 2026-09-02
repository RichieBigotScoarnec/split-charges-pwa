import { describe, it, expect } from 'vitest';
import {
  POSTURES, normaliserAval, posturePartage, ecrituresDeLaPosture
} from '../../public/js/utils/confidentialite.js';

/**
 * Ce que je partage : deux drapeaux en base, une seule échelle à l'écran
 *
 * `actif` ouvre le détail, `publieLeTotal` ouvre le chiffre. Les deux sont
 * indépendants dans la base, mais ouvrir le détail sans publier le total n'a
 * aucun sens — le détail CONTIENT le total. L'écran ne montre donc que les
 * trois combinaisons qui veulent dire quelque chose.
 *
 * Ce que ces contrôles tiennent :
 *
 *   1. Une base incohérente se lit vers le HAUT. Pour un réglage de
 *      confidentialité, le défaut sûr n'est pas le plus rassurant : il est le
 *      plus fidèle à ce que l'autre peut réellement lire.
 *   2. Les deux défauts d'absence vont dans des directions OPPOSÉES, et chacun
 *      préserve ce qui existait avant lui.
 *   3. La posture est un réglage, pas un état des lieux : elle ne dépend
 *      d'aucun total déjà publié.
 *   4. Écrire puis relire rend la même posture.
 */

describe('normaliserAval', () => {
  it('sans aval, rien n\'est accordé — l\'absence vaut refus', () => {
    expect(normaliserAval(null).actif).toBe(false);
    expect(normaliserAval(undefined).actif).toBe(false);
  });

  it('sans `publieLeTotal`, le total EST publié — l\'absence vaut le contrat d\'avant', () => {
    // Les nœuds écrits avant ce champ n'en portent pas. Les lire comme « ne
    // publie pas » effacerait en silence le seul repère dont l'autre dispose.
    expect(normaliserAval({ actif: false }).publieLeTotal).toBe(true);
    expect(normaliserAval(null).publieLeTotal).toBe(true);
  });

  it('ne retient `publieLeTotal: false` que sur un faux explicite', () => {
    expect(normaliserAval({ actif: false, publieLeTotal: false }).publieLeTotal).toBe(false);
    expect(normaliserAval({ actif: false, publieLeTotal: true }).publieLeTotal).toBe(true);
    // Une valeur abîmée n'est pas un refus de publier.
    expect(normaliserAval({ actif: false, publieLeTotal: 'non' }).publieLeTotal).toBe(true);
  });
});

describe('posturePartage', () => {
  it('rend « detail » quand l\'accord est actif', () => {
    expect(posturePartage({ actif: true, publieLeTotal: true })).toBe('detail');
  });

  it('rend « total » quand seul le chiffre est publié', () => {
    expect(posturePartage({ actif: false, publieLeTotal: true })).toBe('total');
  });

  it('rend « rien » quand les deux sont fermés', () => {
    expect(posturePartage({ actif: false, publieLeTotal: false })).toBe('rien');
  });

  it('une base incohérente se lit vers le HAUT, jamais vers le bas', () => {
    // `actif` vrai et `publieLeTotal` faux est atteignable : deux appareils,
    // deux écritures. Tant que `aval/{qui}/actif` vaut vrai, la règle serveur
    // laisse passer la lecture du détail — afficher « Rien » annoncerait une
    // fermeture qui n'existe pas, et c'est le mensonge le plus coûteux ici.
    expect(posturePartage({ actif: true, publieLeTotal: false })).toBe('detail');
  });

  it('sans aval du tout, la posture est celle qui préserve l\'existant', () => {
    expect(posturePartage(null)).toBe('total');
  });

  it('ne dépend d\'aucun total déjà publié — c\'est un réglage, pas un état des lieux', () => {
    // La déduire de la présence d'un total la rendrait instable : « rien
    // publié » se confondrait avec « rien à publier », et la première dépense
    // du mois ferait basculer le réglage toute seule.
    const aval = { actif: false, publieLeTotal: false };
    expect(posturePartage(aval)).toBe('rien');
    expect(posturePartage({ ...aval })).toBe('rien');
  });
});

describe('ecrituresDeLaPosture', () => {
  it.each([
    ['rien', false, false],
    ['total', false, true],
    ['detail', true, true]
  ])('« %s » pose les deux drapeaux ensemble', (posture, actif, publieLeTotal) => {
    const ecritures = ecrituresDeLaPosture(posture, 'vous', 1000);

    expect(ecritures.aval.actif).toBe(actif);
    expect(ecritures.aval.publieLeTotal).toBe(publieLeTotal);
    expect(ecritures.publieLeTotal).toBe(publieLeTotal);
  });

  it('enregistre toujours le propriétaire comme auteur', () => {
    // La règle serveur l'exige, et c'est ce qui interdit de s'accorder l'accès
    // aux données de l'autre.
    expect(ecrituresDeLaPosture('detail', 'vous', 1000).aval.accordePar).toBe('vous');
    expect(ecrituresDeLaPosture('detail', 'conjointe', 1000).aval.accordePar).toBe('conjointe');
  });

  it('refuse une posture ou un emplacement inconnus plutôt que d\'en choisir un', () => {
    expect(ecrituresDeLaPosture('ouvert', 'vous')).toBeNull();
    expect(ecrituresDeLaPosture('__proto__', 'vous')).toBeNull();
    expect(ecrituresDeLaPosture('detail', 'quelquun')).toBeNull();
    expect(ecrituresDeLaPosture('detail', null)).toBeNull();
  });

  it('n\'écrit aucun champ que les règles refuseraient', () => {
    // `aval/{qui}/$autre/.validate` vaut `false` : un nom non prévu fait
    // échouer l'écriture entière, en silence côté écran.
    const permis = ['actif', 'publieLeTotal', 'accordeLe', 'accordePar'];
    for (const posture of POSTURES) {
      expect(Object.keys(ecrituresDeLaPosture(posture, 'vous', 1000).aval).sort())
        .toEqual([...permis].sort());
    }
  });
});

describe('l\'aller-retour', () => {
  it.each(POSTURES)('écrire « %s » puis relire rend « %s »', (posture) => {
    const { aval } = ecrituresDeLaPosture(posture, 'vous', 1000);
    expect(posturePartage(aval)).toBe(posture);
  });
});
