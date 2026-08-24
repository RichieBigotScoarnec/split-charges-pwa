import { describe, it, expect } from 'vitest';

import {
  segmentsDeLaPhrase,
  libellePayeur,
  libelleRepartition,
  libelleCategorie,
  libelleDate
} from '../../public/js/utils/phrase-saisie.js';

/**
 * Ce qui sera enregistré, dit en une phrase
 *
 * La saisie rapide empilait quatre choix : une grille de neuf catégories, une
 * ligne de raccourcis qui en répétait certaines, un payeur, une répartition.
 * Le bloc catégorie occupait la majeure partie de la modale, et le payeur — le
 * champ qui décide qui doit combien — se trouvait dessous. On y arrivait en
 * faisant défiler neuf tuiles, donc en pratique on ne le vérifiait pas.
 *
 * La phrase ne se contente pas d'épargner des gestes : elle **montre** ce qui
 * sera écrit. Quatre blocs empilés obligeaient à reconstituer de tête l'état de
 * quatre contrôles. Ces contrôles portent donc sur ce qu'elle dit — c'est la
 * seule chose que l'utilisateur lira avant d'enregistrer.
 */

const MEMBRES = { vous: 'Richard', conjointe: 'Cindy' };

describe('Qui a payé', () => {
  it('nomme la personne, prénoms du foyer compris', () => {
    // « Vous » désigne un compte différent selon qui regarde : la phrase disait
    // le contraire à l'une des deux personnes du couple.
    expect(libellePayeur('vous', MEMBRES)).toBe('Payé par Richard');
    expect(libellePayeur('conjointe', MEMBRES)).toBe('Payé par Cindy');
  });

  it('sans prénoms choisis, retombe sur les libellés d\'origine', () => {
    expect(libellePayeur('vous', null)).toBe('Payé par Vous');
    expect(libellePayeur('conjointe', null)).toBe('Payé par Conjointe');
  });

  it('« Payé à deux » plutôt que « Payé par Partagé », qui ne se dit pas', () => {
    expect(libellePayeur('partage', MEMBRES)).toBe('Payé à deux');
  });

  it('garde le verbe dans le libellé, pour qui n\'a que le bouton', () => {
    // Les segments sont des boutons. À la synthèse vocale ils sont annoncés
    // seuls, sans la phrase autour : « Richard » ne dirait rien.
    for (const payeur of ['vous', 'conjointe', 'partage']) {
      expect(libellePayeur(payeur, MEMBRES)).toMatch(/^Payé /);
    }
  });
});

describe('La répartition', () => {
  it('dit le prorata et le 50-50', () => {
    expect(libelleRepartition('prorata')).toBe('Au prorata');
    expect(libelleRepartition('50-50')).toBe('Partagé 50-50');
  });

  it('un mode inconnu retombe sur le prorata, qui est le défaut du foyer', () => {
    expect(libelleRepartition(undefined)).toBe('Au prorata');
  });
});

describe('La catégorie', () => {
  it('porte son emoji, qui se reconnaît plus vite que le mot', () => {
    expect(libelleCategorie({ icon: '🍕', label: 'Restaurant' })).toBe('🍕 Restaurant');
  });

  it('absente, elle invite au lieu de constater', () => {
    // C'est le seul champ que la soumission exige. Un segment qui dit « aucune »
    // décrit un état ; celui-ci nomme le geste qui débloque.
    expect(libelleCategorie(null)).toBe('Choisir une catégorie');
    expect(libelleCategorie({})).toBe('Choisir une catégorie');
  });

  it('sans emoji, n\'ajoute pas d\'espace parasite', () => {
    expect(libelleCategorie({ label: 'Bricolage' })).toBe('Bricolage');
  });
});

describe('La date', () => {
  it('« Aujourd\'hui » pour le jour courant, qui est le cas ordinaire', () => {
    // Le mot se lit sans être déchiffré, là où « 24 août 2026 » demande de le
    // comparer à la date du jour pour conclure qu'il n'y a rien à vérifier.
    expect(libelleDate('2026-08-24', '2026-08-24')).toBe("Aujourd'hui");
    expect(libelleDate('', '2026-08-24')).toBe("Aujourd'hui");
  });

  it('une autre date s\'écrit en entier, puisque c\'est elle qu\'on vérifie', () => {
    expect(libelleDate('2026-08-21', '2026-08-24')).toMatch(/21/);
    expect(libelleDate('2026-08-21', '2026-08-24')).toMatch(/août/);
  });

  it('une date illisible ne fabrique pas un libellé faux', () => {
    expect(libelleDate('pas une date', '2026-08-24')).toBe("Aujourd'hui");
  });
});

describe('La phrase entière', () => {
  it('met le payeur en premier : c\'est lui qui change la réponse', () => {
    // Une dépense attribuée à la mauvaise personne est comptée à l'envers dans
    // le bilan. La date vient en dernier, juste neuf fois sur dix.
    const segments = segmentsDeLaPhrase({}, { members: MEMBRES, aujourdhui: '2026-08-24' });

    expect(segments.map(s => s.cle)).toEqual(['payeur', 'repartition', 'categorie', 'date']);
  });

  it('chaque segment désigne le panneau qu\'il ouvre', () => {
    // Sans cette correspondance, un segment ouvrirait le mauvais choix — et
    // rien à l'écran ne dirait lequel.
    const segments = segmentsDeLaPhrase({}, { members: MEMBRES });

    for (const segment of segments) {
      expect(segment.panneau, `${segment.cle} sans panneau`).toMatch(/^quickAddPanneau/);
    }
    expect(new Set(segments.map(s => s.panneau)).size).toBe(4);
  });

  it('dit l\'état complet d\'une saisie renseignée', () => {
    const segments = segmentsDeLaPhrase(
      { paidBy: 'conjointe', splitMode: '50-50', selectedCategory: { icon: '🍕', label: 'Restaurant' } },
      { members: MEMBRES, date: '2026-08-24', aujourdhui: '2026-08-24' }
    );

    expect(segments.map(s => s.texte)).toEqual([
      'Payé par Cindy',
      'Partagé 50-50',
      '🍕 Restaurant',
      "Aujourd'hui"
    ]);
  });

  it('ne lève pas sur un état vide, qui est celui de l\'ouverture', () => {
    expect(() => segmentsDeLaPhrase()).not.toThrow();
    expect(segmentsDeLaPhrase()).toHaveLength(4);
  });
});
