import { describe, it, expect } from 'vitest';
import {
  PORTEES,
  PORTEE_PAR_DEFAUT,
  porteeValide,
  porteeRetenue,
  panneauPorteLaPortee,
  porteeDuPanneau,
  porteeApresChangementDeMois
} from '../../public/js/utils/portee.js';

/**
 * La propriété centrale de ce module n'est pas « les trois portées existent ».
 *
 * C'est **« Réglages n'a pas de portée »** — la contrainte d'implémentation
 * écrite dans `design/github.md`, celle qui fait de la portée un état INTERNE à
 * deux panneaux plutôt qu'une quatrième destination. C'est elle qui doit tomber
 * si quelqu'un la défait, et c'est autour d'elle que ce fichier est construit.
 *
 * ─────────────────────────────────────────────────────────────────────
 * POURQUOI LES IDENTIFIANTS SONT ÉCRITS ICI, À LA MAIN
 *
 * `PANNEAUX_AVEC_PORTEE` n'est pas exportée, et ce fichier ne cherche pas à la
 * lire. Un test qui importerait la liste pour constater que `panneauReglages`
 * n'y figure pas relirait la SOURCE au lieu de mesurer l'EFFET : il survivrait
 * à la suppression du bloc qui s'en sert, et tomberait sur un renommage sans
 * conséquence. Les trois identifiants sont donc nommés ici, et le contrôle
 * passe par les fonctions.
 *
 * Ce qu'il ne couvre pas, et c'est dit plutôt que sous-entendu : que le DOM de
 * `panneauReglages` ne porte réellement aucun sélecteur. Ce module est pur, il
 * ne voit pas de DOM. Cette moitié-là appartient au lot qui rendra la surface.
 */

/** Les trois panneaux, nommés ici et non importés. */
const BILAN = 'panneauBilan';
const CHARGES = 'panneauCharges';
const REGLAGES = 'panneauReglages';

describe('Réglages n\'a pas de portée', () => {
  it('le dit par `panneauPorteLaPortee`', () => {
    expect(panneauPorteLaPortee(REGLAGES)).toBe(false);
  });

  it('et le tient même quand une portée est demandée pour lui', () => {
    // Le cas qui compte : quelqu'un a bien une portée en main et la présente à
    // Réglages. La réponse doit rester « ce panneau n'en a pas ».
    for (const portee of Object.values(PORTEES)) {
      expect(porteeDuPanneau(REGLAGES, portee), `portée ${portee}`).toBeNull();
    }
  });

  it('TÉMOIN POSITIF — les deux autres panneaux, eux, en portent une', () => {
    // Sans ce cas, un module qui rendrait `null` pour TOUT identifiant
    // satisferait les deux contrôles ci-dessus sans rien mesurer.
    expect(panneauPorteLaPortee(BILAN)).toBe(true);
    expect(panneauPorteLaPortee(CHARGES)).toBe(true);
    expect(porteeDuPanneau(BILAN, PORTEES.SOLO)).toBe(PORTEES.SOLO);
    expect(porteeDuPanneau(CHARGES, PORTEES.PRIVE)).toBe(PORTEES.PRIVE);
  });

  it('un panneau inconnu n\'en porte pas non plus', () => {
    // On n'invente pas une portée pour une surface qu'on ne connaît pas.
    expect(panneauPorteLaPortee('panneauInconnu')).toBe(false);
    expect(panneauPorteLaPortee('')).toBe(false);
    expect(panneauPorteLaPortee(undefined)).toBe(false);
    expect(porteeDuPanneau('panneauInconnu', PORTEES.SOLO)).toBeNull();
  });

  it('`null` et « à deux » ne se confondent pas', () => {
    // « ce panneau n'a pas de portée » et « ce panneau est en portée À deux »
    // sont deux états différents : les confondre ferait peindre un segment
    // actif sur un écran qui n'a pas de segments.
    expect(porteeDuPanneau(REGLAGES, PORTEES.DEUX)).toBeNull();
    expect(porteeDuPanneau(BILAN, PORTEES.DEUX)).toBe(PORTEES.DEUX);
  });
});

describe('Les trois portées', () => {
  it('sont exactement trois', () => {
    expect(Object.values(PORTEES)).toEqual(['deux', 'solo', 'prive']);
  });

  it('sont les seules valides', () => {
    for (const portee of Object.values(PORTEES)) {
      expect(porteeValide(portee), portee).toBe(true);
    }
    for (const autre of ['commun', 'Deux', 'DEUX', '', null, undefined, 0, {}, ['solo']]) {
      expect(porteeValide(autre), String(autre)).toBe(false);
    }
  });

  it('« commun » n\'en est pas une, et c\'est voulu', () => {
    // `utils/perimetre.js` classe une CHARGE en `commun` / `solo`. Ce module
    // choisit une VUE. Les deux vocabulaires sont séparés parce que les objets
    // le sont, et une valeur qui passerait de l'un à l'autre serait un pont
    // qu'on n'a pas voulu.
    expect(porteeValide('commun')).toBe(false);
    expect(porteeRetenue('commun')).toBe(PORTEES.DEUX);
  });
});

describe('Le repli', () => {
  it('va vers « à deux », jamais vers « privé »', () => {
    // La seule des trois dont l'ouverture par accident coûte quelque chose.
    for (const douteuse of [undefined, null, '', 'prive ', 'PRIVE', 'nimportequoi', 42]) {
      expect(porteeRetenue(douteuse), String(douteuse)).toBe(PORTEES.DEUX);
    }
  });

  it('laisse passer une portée valide sans la toucher', () => {
    // Le témoin du cas ci-dessus : une fonction qui rendrait TOUJOURS « deux »
    // le satisferait entièrement.
    expect(porteeRetenue(PORTEES.SOLO)).toBe(PORTEES.SOLO);
    expect(porteeRetenue(PORTEES.PRIVE)).toBe(PORTEES.PRIVE);
  });

  it('et le défaut est bien « à deux »', () => {
    expect(PORTEE_PAR_DEFAUT).toBe(PORTEES.DEUX);
  });
});

describe('Au changement de mois, la portée persiste', () => {
  /**
   * DÉCISION, pas comportement accidentel.
   *
   * Regarder son solo en septembre, reculer d'un mois pour le comparer à août,
   * revenir : c'est un seul geste. Le ramener trois fois à « À deux » ferait
   * payer la comparaison. Même raisonnement que la position de défilement
   * retenue d'un panneau à l'autre dans `onglets.js`.
   *
   * Ces cas existent pour qu'un futur « on réinitialise à chaque mois » soit un
   * ROUGE, et non un changement silencieux.
   */
  it('« solo » reste « solo » d\'un mois à l\'autre', () => {
    expect(porteeApresChangementDeMois(PORTEES.SOLO)).toBe(PORTEES.SOLO);
  });

  it('« privé » aussi — c\'est un point de vue, pas un dévoilement', () => {
    // La décision porte sur la PORTÉE. Le dévoilement des montants se referme
    // de son côté, et il n'a pas à suivre la même règle.
    expect(porteeApresChangementDeMois(PORTEES.PRIVE)).toBe(PORTEES.PRIVE);
  });

  it('mais une portée absente ou douteuse retombe sur « à deux »', () => {
    expect(porteeApresChangementDeMois(undefined)).toBe(PORTEES.DEUX);
    expect(porteeApresChangementDeMois('nimportequoi')).toBe(PORTEES.DEUX);
  });
});
