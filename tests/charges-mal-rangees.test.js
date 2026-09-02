import { describe, it, expect } from 'vitest';
import {
  noeudDesPeriodes,
  chargesMalRangees,
  ecartParMois
} from '../tools/charges-mal-rangees.mjs';

/**
 * L'inventaire des charges rangées hors du mois de leur date
 *
 * Un relevé qui se trompe est pire que pas de relevé : il envoie corriger ce
 * qui va bien, et rassure sur ce qui ne va pas. Les deux sens sont donc
 * éprouvés — ce qui doit être signalé l'est, ce qui va bien reste muet.
 */

/** Le cas réel du 2026-09-01, plus de quoi vérifier les silences */
const periodes = {
  '2026-07': {
    variableCharges: {
      a1: { description: 'Festival', amount: 45, date: '2026-09-01', deleted: false },
      a2: { description: 'Courses', amount: 82.3, date: '2026-07-12', deleted: false }
    }
  },
  '2026-08': {
    variableCharges: {
      b1: { description: 'Essence', amount: 60, date: '2026-08-03', deleted: false },
      b2: { description: 'Rendue', amount: 20, date: '2026-09-02', deleted: true }
    },
    fixedCharges: {
      c1: { description: 'Loyer', amount: 900, date: '2026-08-05', deleted: false }
    },
    reimbursements: {
      d1: { description: 'Virement', amount: 100, date: '2026-06-30', deleted: false }
    }
  },
  '2026-09': {
    variableCharges: {
      e1: { description: 'Sans date', amount: 12, deleted: false },
      e2: { description: 'Date illisible', amount: 12, date: '01/09/2026', deleted: false }
    }
  }
};

describe('noeudDesPeriodes', () => {
  it('accepte une sauvegarde de l\'application, sous son enveloppe', () => {
    expect(noeudDesPeriodes({ version: 1, data: { periods: periodes } })).toBe(periodes);
  });

  it('accepte aussi un vidage brut de la CLI', () => {
    expect(noeudDesPeriodes({ periods: periodes })).toBe(periodes);
    expect(noeudDesPeriodes({ household: { periods: periodes } })).toBe(periodes);
  });

  it('rend null sur un fichier qui n\'en porte pas', () => {
    for (const entree of [null, undefined, 42, 'texte', {}, { data: {} }]) {
      expect(noeudDesPeriodes(entree)).toBeNull();
    }
  });
});

describe('chargesMalRangees', () => {
  const trouvees = chargesMalRangees(periodes);

  it('signale la charge du cas réel, et la nomme', () => {
    const festival = trouvees.find(t => t.description === 'Festival');
    expect(festival).toMatchObject({
      periode: '2026-07',
      mois: '2026-09',
      date: '2026-09-01',
      montant: 45,
      collection: 'variableCharges'
    });
  });

  it('couvre les trois collections datées, pas seulement les charges variables', () => {
    const virement = trouvees.find(t => t.description === 'Virement');
    expect(virement).toMatchObject({ periode: '2026-08', mois: '2026-06', collection: 'reimbursements' });
  });

  it('reste muet sur ce qui va bien', () => {
    for (const bonne of ['Courses', 'Essence', 'Loyer']) {
      expect(trouvees.some(t => t.description === bonne), bonne).toBe(false);
    }
  });

  it('ignore une entrée supprimée — elle ne compte dans aucun total', () => {
    expect(trouvees.some(t => t.description === 'Rendue')).toBe(false);
  });

  it('ignore une date absente ou illisible, plutôt que de crier au loup', () => {
    // Elles ne prouvent pas un mauvais rangement, seulement une donnée
    // incomplète. Les signaler noierait les vraies.
    expect(trouvees.some(t => t.description === 'Sans date')).toBe(false);
    expect(trouvees.some(t => t.description === 'Date illisible')).toBe(false);
  });

  it('n\'en trouve que deux, en tout', () => {
    expect(trouvees).toHaveLength(2);
  });

  it('supporte un nœud vide, absent ou malformé', () => {
    for (const entree of [null, undefined, {}, { 'pas-un-mois': {} }, { '2026-07': null }]) {
      expect(chargesMalRangees(entree)).toEqual([]);
    }
  });
});

describe('ecartParMois', () => {
  it('dit de combien chaque mois est faux', () => {
    const ecarts = ecartParMois(chargesMalRangees(periodes));

    // Juillet porte 45 € de septembre ; août porte 100 € de juin.
    expect(ecarts.get('2026-07')).toBe(-45);
    expect(ecarts.get('2026-09')).toBe(45);
    expect(ecarts.get('2026-08')).toBe(-100);
    expect(ecarts.get('2026-06')).toBe(100);
  });

  it('la somme des écarts est nulle — rien ne se crée ni ne se perd', () => {
    const total = [...ecartParMois(chargesMalRangees(periodes)).values()]
      .reduce((somme, v) => somme + v, 0);
    expect(total).toBe(0);
  });

  it('ne rapporte aucun mois quand rien n\'est mal rangé', () => {
    expect(ecartParMois([]).size).toBe(0);
  });
});
