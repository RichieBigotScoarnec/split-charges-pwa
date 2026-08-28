import { describe, it, expect } from 'vitest';
import {
  identifiantDepuisLibelle,
  identifiantEnveloppe,
  racineDepuisLibelle
} from '../../public/js/utils/identifiant.js';
import { CATEGORIES, DESTINATIONS } from '../../public/js/config.js';
import { chargesDeLEnveloppeTousMois, totalEnveloppe } from '../../public/js/utils/enveloppes.js';
import { bilanCagnotte, normaliserVersements } from '../../public/js/utils/versements.js';

/**
 * Une enveloppe neuve est vide, même si elle porte un nom déjà utilisé
 *
 * L'identifiant d'une enveloppe était entièrement dérivé de son libellé :
 * « Vacances » donnait toujours `vacances`. Supprimer la cagnotte de l'été
 * 2025 puis en créer une du même nom l'été suivant faisait donc hériter la
 * nouvelle de tout ce qui renvoyait à l'ancienne — ses versements sous
 * `versements/vacances`, et toutes les charges portant `envelope: 'vacances'`.
 *
 * Mesuré : une enveloppe qu'on venait de créer annonçait « 300,00 € dans le
 * pot », une jauge à 15 %, et une provision calculée sur un objectif déjà
 * entamé.
 *
 * Le contrôle porte sur la PROPRIÉTÉ — deux enveloppes ne partagent jamais un
 * identifiant — et jamais sur la forme de celui-ci, qui n'engage personne.
 */

/** Une estampille figée : les identifiants deviennent prévisibles pour le test */
const FIGEE = () => 'fige';

describe('Le refactor ne change aucun identifiant existant', () => {
  // La racine a été extraite pour être partagée. Si elle avait dérivé d'un
  // caractère, toutes les charges déjà en base auraient été détachées de leur
  // catégorie — le défaut le plus cher qu'on puisse introduire ici.
  const LIBELLES = [...(CATEGORIES || []), ...(DESTINATIONS || [])]
    .map(x => (typeof x === 'string' ? x : x && x.label))
    .filter(Boolean);

  it('les libellés livrés avec l\'application produisent les mêmes identifiants', () => {
    expect(LIBELLES.length).toBeGreaterThan(10);
    for (const libelle of LIBELLES) {
      expect(identifiantDepuisLibelle(libelle)).toBe(racineDepuisLibelle(libelle, 'categorie'));
    }
  });

  it('les cas limites historiques sont inchangés', () => {
    expect(identifiantDepuisLibelle('Café')).toBe('cafe');
    expect(identifiantDepuisLibelle('Péage')).toBe('peage');
    expect(identifiantDepuisLibelle('Crèche')).toBe('creche');
    // Un libellé entièrement écarté garde son repli historique.
    expect(identifiantDepuisLibelle('???')).toBe('categorie');
    // Et la boucle de collision aussi.
    expect(identifiantDepuisLibelle('Courses', [{ id: 'courses' }])).toBe('courses-2');
  });
});

describe('identifiantEnveloppe — la propriété', () => {
  it('cent créations sous le même libellé donnent cent identifiants distincts', () => {
    const vus = new Set();
    for (let i = 0; i < 100; i++) vus.add(identifiantEnveloppe('Vacances'));
    expect(vus.size).toBe(100);
  });

  it('TÉMOIN NÉGATIF : l\'ancienne fabrique n\'en donnait qu\'un', () => {
    // Affirmé positivement, et non par un `not.toBe` : sans ce contrôle, le
    // test précédent passerait aussi sur une fabrique qui se contenterait
    // d'être aléatoire sans raison.
    const vus = new Set();
    for (let i = 0; i < 100; i++) vus.add(identifiantDepuisLibelle('Vacances'));
    expect(vus.size).toBe(1);
    expect([...vus][0]).toBe('vacances');
  });

  it('la racine lisible est conservée : on reconnaît l\'enveloppe dans la base', () => {
    expect(identifiantEnveloppe('Vacances', [], FIGEE)).toBe('vacances-fige');
    expect(identifiantEnveloppe('Vacances d\'été', [], FIGEE)).toBe('vacances-dete-fige');
  });

  it('une collision malgré l\'estampille est encore écartée', () => {
    // L'unicité devient probabiliste ; on ne fonde pas de l'argent sur une
    // probabilité seule.
    expect(identifiantEnveloppe('Vacances', [{ id: 'vacances-fige' }], FIGEE))
      .toBe('vacances-fige-2');
  });

  it('un libellé entièrement écarté ne produit pas un identifiant nu', () => {
    expect(identifiantEnveloppe('???', [], FIGEE)).toBe('enveloppe-fige');
    expect(identifiantEnveloppe('', [], FIGEE)).toBe('enveloppe-fige');
  });

  it('un libellé démesuré reste sous la borne des règles', () => {
    const long = 'a'.repeat(300);
    const id = identifiantEnveloppe(long, [], FIGEE);
    expect(id.length).toBeLessThanOrEqual(100);
    expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('une troncature ne laisse pas de tiret pendant', () => {
    // 40 « a » puis un espace : la coupe tombe juste avant le tiret de l'espace.
    const id = identifiantEnveloppe(`${'a'.repeat(40)} b`, [], FIGEE);
    expect(id).not.toContain('--');
    expect(id.startsWith(`${'a'.repeat(40)}-fige`)).toBe(true);
  });
});

describe('Une enveloppe recréée est vide pour CHACUN des lecteurs d\'argent', () => {
  /**
   * L'ancienne enveloppe : des charges et des versements, sous `vacances`.
   * C'est l'héritage dont la nouvelle ne doit rien voir.
   */
  const HISTORIQUE = {
    '2025-07': {
      variableCharges: {
        a: { description: 'Camping', amount: 500, envelope: 'vacances', deleted: false }
      }
    }
  };
  const VERSEMENTS_ANCIENS = normaliserVersements({
    v1: { montant: 800, auteur: 'vous', date: '2025-06-01', deleted: false }
  });

  /**
   * Chaque lecture d'argent qui interroge une enveloppe par son identifiant.
   * En tableau, pour qu'un huitième lecteur se branche en une ligne plutôt que
   * d'être oublié — c'est le patron de `perimetre-transversal.test.js`.
   */
  const LECTEURS = [
    {
      nom: 'charges rattachées',
      lire: (id) => chargesDeLEnveloppeTousMois(HISTORIQUE, id).length
    },
    {
      nom: 'total dépensé',
      lire: (id) => totalEnveloppe(chargesDeLEnveloppeTousMois(HISTORIQUE, id), id)
    },
    {
      nom: 'contenu du pot',
      lire: (id) => bilanCagnotte(
        id === 'vacances' ? VERSEMENTS_ANCIENS : [],
        totalEnveloppe(chargesDeLEnveloppeTousMois(HISTORIQUE, id), id),
        2000
      ).dansLePot
    }
  ];

  it('TÉMOIN NÉGATIF : avec l\'ancien identifiant, elle héritait de tout', () => {
    const idHerite = identifiantDepuisLibelle('Vacances');
    expect(idHerite).toBe('vacances');

    expect(LECTEURS[0].lire(idHerite)).toBe(1);
    expect(LECTEURS[1].lire(idHerite)).toBeCloseTo(500, 6);
    expect(LECTEURS[2].lire(idHerite)).toBeCloseTo(300, 6);   // 800 versés − 500 dépensés
  });

  it('avec le nouvel identifiant, chaque lecteur la voit vide', () => {
    const idNeuf = identifiantEnveloppe('Vacances', [], FIGEE);

    for (const lecteur of LECTEURS) {
      expect(lecteur.lire(idNeuf), `« ${lecteur.nom} » doit être nul sur une enveloppe neuve`)
        .toBe(0);
    }
  });
});
