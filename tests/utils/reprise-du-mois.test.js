import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Ce que le mois affiché attend du retour du réseau
 *
 * Deux propriétés, et chacune a son défaut mesuré sous émulateur :
 *   - un chargeur qui échoue ne laisse RIEN d'un autre mois à l'écran — la
 *     liste gardait les charges d'octobre sous le nom de novembre ;
 *   - le mois à relire se rend UNE fois — deux portes de reprise se suivent de
 *     près, et chacune relirait tout.
 */

const etat = vi.hoisted(() => ({ valeurs: {} }));
vi.mock('../../public/js/state.js', () => ({
  getState: (cle) => etat.valeurs[cle],
  setState: (cle, valeur) => { etat.valeurs[cle] = valeur; }
}));

const toast = { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() };
vi.mock('../../public/js/components/toast.js', () => ({ toast }));

const annoncer = vi.fn();
vi.mock('../../public/js/utils/connection-banner.js', () => ({
  annoncerReconductionEnAttente: (...a) => annoncer(...a)
}));

vi.mock('../../public/js/utils/debug.js', () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }));

const reprise = await import('../../public/js/utils/reprise-du-mois.js');

beforeEach(() => {
  vi.clearAllMocks();
  reprise.prendreLeMoisARelire();
  vi.clearAllMocks();
  etat.valeurs = {
    currentPeriod: '2026-11',
    fixedCharges: [{ id: 'loyer', description: 'Loyer', amount: 900 }],
    'deleted.fixedCharges': [{ id: 'ancien' }]
  };
});

describe('UN CHARGEUR QUI ÉCHOUE NE LAISSE RIEN D\'UN AUTRE MOIS', () => {
  it('vide la collection et sa corbeille, puis rend', () => {
    const rendre = vi.fn(() => {
      // Le rendu voit l'état DÉJÀ vidé : c'est ce qu'il peindra.
      expect(etat.valeurs.fixedCharges).toEqual([]);
    });

    reprise.viderApresEchec({ mois: '2026-11', collection: 'fixedCharges', rendre });

    expect(etat.valeurs.fixedCharges).toEqual([]);
    expect(etat.valeurs['deleted.fixedCharges']).toEqual([]);
    expect(rendre).toHaveBeenCalledTimes(1);
  });

  it('témoin : sans échec, l\'état du mois reste celui qu\'on a semé', () => {
    // Sans ce témoin, « vide » se lirait aussi bien sur un état jamais rempli.
    expect(etat.valeurs.fixedCharges).toHaveLength(1);
  });

  it('dit que le mois n\'est pas disponible, une seule fois pour trois chargeurs', () => {
    for (const collection of ['variableCharges', 'fixedCharges', 'reimbursements']) {
      reprise.viderApresEchec({ mois: '2026-11', collection, rendre: () => {} });
    }

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.mock.calls[0][0]).toMatch(/novembre 2026 n'est pas disponible/);
    expect(reprise.estIllisible('2026-11')).toBe(true);
    expect(reprise.estIllisible('2026-10')).toBe(false);
  });

  it('un rendu qui lève ne remonte pas : l\'appelant reprend la main', () => {
    expect(() => reprise.viderApresEchec({
      mois: '2026-11', collection: 'fixedCharges', rendre: () => { throw new Error('rendu cassé'); }
    })).not.toThrow();
  });

  it('un échec arrivé après un changement de mois ne touche pas au mois affiché', () => {
    etat.valeurs.currentPeriod = '2026-12';
    reprise.viderApresEchec({ mois: '2026-11', collection: 'fixedCharges', rendre: vi.fn() });

    expect(etat.valeurs.fixedCharges).toHaveLength(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('un nouveau chargement rejuge le mois', () => {
    reprise.viderApresEchec({ mois: '2026-11', collection: 'fixedCharges', rendre: () => {} });
    reprise.oublierLIllisible();
    expect(reprise.estIllisible('2026-11')).toBe(false);
  });
});

describe('LE MOIS À RELIRE SE REND UNE FOIS', () => {
  it('une reconduction en attente est annoncée, puis rendue et effacée', () => {
    reprise.mettreEnAttente('2026-11');
    expect(annoncer).toHaveBeenLastCalledWith('novembre 2026');

    expect(reprise.prendreLeMoisARelire()).toBe('2026-11');
    expect(annoncer).toHaveBeenLastCalledWith(null);
    // La seconde porte de reprise ne trouve plus rien à relire.
    expect(reprise.prendreLeMoisARelire()).toBeNull();
  });

  it('un mois illisible est relu lui aussi', () => {
    reprise.viderApresEchec({ mois: '2026-11', collection: 'fixedCharges', rendre: () => {} });
    expect(reprise.prendreLeMoisARelire()).toBe('2026-11');
    expect(reprise.estIllisible('2026-11')).toBe(false);
  });

  it('lever l\'attente fait taire le bandeau, et il n\'y a plus rien à relire', () => {
    reprise.mettreEnAttente('2026-11');
    reprise.leverLAttente();
    expect(annoncer).toHaveBeenLastCalledWith(null);
    expect(reprise.prendreLeMoisARelire()).toBeNull();
  });

  it('une relecture tombée dans une coupure se reprend, sans rien annoncer', () => {
    reprise.relireAuRetour('2026-11');
    expect(reprise.prendreLeMoisARelire()).toBe('2026-11');
    expect(annoncer).not.toHaveBeenCalled();
    expect(reprise.prendreLeMoisARelire()).toBeNull();
  });

  it('sans rien en suspens, le bandeau n\'est pas touché', () => {
    expect(reprise.prendreLeMoisARelire()).toBeNull();
    expect(annoncer).not.toHaveBeenCalled();
  });
});
