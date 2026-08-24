import { describe, it, expect } from 'vitest';
import {
  listePeriodes, decalerPeriode, clePeriodeValide, MOIS_GLISSANTS
} from '../../public/js/utils/periodes.js';

/**
 * Le sélecteur de mois est le seul moyen de naviguer
 *
 * Il fabriquait douze mois glissants et rien d'autre, et les flèches ne font
 * que se déplacer dans ses options. Passé un an, les données d'un mois
 * restaient donc en base sans qu'aucun chemin de l'application ne puisse les
 * afficher — pour une application dont l'objet est l'historique financier d'un
 * couple, une perte qui arrive toute seule, sans alerte.
 *
 * Symétriquement, aucun mois futur : impossible de saisir le loyer du mois
 * prochain ou de préparer une enveloppe de vacances en juin.
 */

describe('Décalage d\'un mois', () => {
  it('recule et avance dans l\'année', () => {
    expect(decalerPeriode('2026-08', -1)).toBe('2026-07');
    expect(decalerPeriode('2026-08', 1)).toBe('2026-09');
  });

  it('franchit les années', () => {
    expect(decalerPeriode('2026-01', -1)).toBe('2025-12');
    expect(decalerPeriode('2025-12', 1)).toBe('2026-01');
    expect(decalerPeriode('2026-06', -18)).toBe('2024-12');
  });

  it('ne dépend pas du quantième', () => {
    // `setMonth` conservait le jour : le 31 mars, `setMonth(1)` donne le
    // 31 février, que JavaScript reporte au 3 mars. La liste affichait alors
    // deux fois le même mois et en omettait un — visible du 29 au 31 seulement.
    expect(decalerPeriode('2026-03', -1)).toBe('2026-02');
  });

  it('refuse ce qui n\'est pas une période', () => {
    expect(decalerPeriode('2026-13', -1)).toBeNull();
    expect(decalerPeriode('bidon', -1)).toBeNull();
    expect(decalerPeriode('2026-08', 1.5)).toBeNull();
  });
});

describe('Validité d\'une clé', () => {
  it('accepte AAAA-MM', () => {
    expect(clePeriodeValide('2026-08')).toBe(true);
  });

  it('écarte les écritures accidentelles', () => {
    // Le nœud `periods` a hébergé un `periods/undefined`.
    expect(clePeriodeValide('undefined')).toBe(false);
    expect(clePeriodeValide('2026-00')).toBe(false);
    expect(clePeriodeValide('2026-13')).toBe(false);
    expect(clePeriodeValide(null)).toBe(false);
  });
});

describe('La liste proposée', () => {
  it('couvre les douze derniers mois, même vides', () => {
    // Ouvrir un mois neuf doit rester possible avant d'y avoir rien saisi.
    const liste = listePeriodes({ moisCourant: '2026-08' });

    expect(liste).toContain('2026-08');
    expect(liste).toContain('2025-09');
    expect(liste.filter(p => p <= '2026-08')).toHaveLength(MOIS_GLISSANTS);
  });

  it('propose un mois d\'avance', () => {
    // Le loyer du mois prochain se saisit quand on a l'information en main.
    expect(listePeriodes({ moisCourant: '2026-08' })).toContain('2026-09');
  });

  it('garde les mois anciens que la base contient', () => {
    // C'est le défaut corrigé : au-delà d'un an, plus rien n'y menait.
    const liste = listePeriodes({
      moisCourant: '2026-08',
      enBase: ['2024-03', '2023-11', '2026-08']
    });

    expect(liste, 'un mois de 2024 reste introuvable').toContain('2024-03');
    expect(liste).toContain('2023-11');
  });

  it('accepte le nœud `periods` tel qu\'il est lu', () => {
    const liste = listePeriodes({
      moisCourant: '2026-08',
      enBase: { '2024-03': { fixedCharges: {} }, undefined: {} }
    });

    expect(liste).toContain('2024-03');
    expect(liste, 'une écriture accidentelle est entrée dans le sélecteur')
      .not.toContain('undefined');
  });

  it('ne fait jamais disparaître le mois consulté', () => {
    const liste = listePeriodes({ moisCourant: '2026-08', consultee: '2019-04' });
    expect(liste).toContain('2019-04');
  });

  it('rend une liste sans doublon, du plus récent au plus ancien', () => {
    const liste = listePeriodes({
      moisCourant: '2026-08',
      enBase: ['2026-08', '2026-07', '2024-03'],
      consultee: '2026-08'
    });

    expect(new Set(liste).size).toBe(liste.length);
    expect([...liste].sort().reverse()).toEqual(liste);
  });

  it('ne rend rien si le mois courant n\'en est pas un', () => {
    expect(listePeriodes({ moisCourant: 'bidon' })).toEqual([]);
    expect(listePeriodes({})).toEqual([]);
  });
});
