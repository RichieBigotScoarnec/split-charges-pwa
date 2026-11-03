import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Écouler la file : ce que le foyer VOIT, et non ce que le code a l'air de faire
 *
 * Ce fichier existe parce que le précédent mentait par omission.
 *
 * Le commit d'avant annonçait un correctif : « `app.js` écartait des saisies
 * sans un mot ». Une saisie que le serveur refusera **toujours** est retirée de
 * la file, mais le miroir la porte encore — elle reste donc à l'écran. Sans un
 * message, le foyer la voit, la croit enregistrée, et elle n'existe nulle part.
 *
 * Le contrôle écrit pour tenir ce correctif lisait la SOURCE d'`app.js` :
 * « contient `annoncesDuRejeu(bilan)` », « contient `refusees` ». Mesuré :
 * supprimer purement et simplement le bloc
 *
 *     if (refus) { toast.error(refus); logError(…); }
 *
 * laissait les 2 378 contrôles verts. Les deux chaînes cherchées restent dans
 * le fichier — `refusees` est encore déstructuré et passé à `noter()` — et le
 * correctif entier disparaissait sans que rien ne bronche.
 *
 * Une lecture de source mesure la FORME du câblage, jamais son EFFET. C'est
 * exactement le défaut que ce fil de travail poursuit depuis le début, commis
 * dans le contrôle censé le refermer. Le comportement vit désormais dans
 * `utils/reprise.js`, et ce fichier-ci le monte pour de vrai.
 */

const rejouerFileDAttente = vi.fn();
const saisiesEnAttente = vi.fn(() => 0);
const liaisonRompue = vi.fn(() => false);
vi.mock('../../public/js/db.js', () => ({
  rejouerFileDAttente: (...a) => rejouerFileDAttente(...a),
  saisiesEnAttente: (...a) => saisiesEnAttente(...a),
  liaisonRompue: (...a) => liaisonRompue(...a)
}));

const loadPeriodData = vi.fn(async () => {});
vi.mock('../../public/js/modules/period.js', () => ({
  loadPeriodData: (...a) => loadPeriodData(...a)
}));

// Le VRAI module des marques : c'est son effet sur la reprise qu'on mesure.
// Seul le bandeau, qu'il appelle, est doublé ci-dessous.

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
vi.mock('../../public/js/components/toast.js', () => ({ toast }));

const refreshConnectionBanner = vi.fn();
vi.mock('../../public/js/utils/connection-banner.js', () => ({
  refreshConnectionBanner: (...a) => refreshConnectionBanner(...a),
  annoncerReconductionEnAttente: vi.fn()
}));

const noter = vi.fn();
vi.mock('../../public/js/utils/diagnostics.js', () => ({ noter: (...a) => noter(...a) }));

const warn = vi.fn();
const logError = vi.fn();
vi.mock('../../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: (...a) => warn(...a), error: (...a) => logError(...a)
}));

const { synchroniserLesSaisies, surRepriseDeLiaison, ecoulerLesSaisiesGardees } =
  await import('../../public/js/utils/reprise.js');
const marques = await import('../../public/js/utils/reprise-du-mois.js');

/** Un bilan de rejeu, tel que `rejouerFileDAttente` le rend */
const bilan = (parts) => ({ envoyees: 0, restantes: 0, erreur: null, refusees: [], ...parts });

/** Tous les messages d'erreur affichés, mis bout à bout */
const erreursAffichees = () => toast.error.mock.calls.map(([texte]) => texte).join(' | ');

beforeEach(() => {
  vi.clearAllMocks();
  saisiesEnAttente.mockReturnValue(0);
  liaisonRompue.mockReturnValue(false);
  rejouerFileDAttente.mockResolvedValue(bilan({}));
  marques.prendreLeMoisARelire();
});

describe('LE MESSAGE DE REFUS ATTEINT L\'ÉCRAN', () => {
  it('une saisie définitivement refusée est annoncée au foyer', async () => {
    // LE contrôle. Il ne lit aucune source : il regarde ce qui est affiché.
    rejouerFileDAttente.mockResolvedValue(bilan({
      refusees: [{ chemin: 'periods/2026-08/variableCharges/c1', motif: 'PERMISSION_DENIED' }]
    }));

    await synchroniserLesSaisies();

    expect(erreursAffichees()).toContain('refusée par la base');
  });

  it('et le chemin fautif part au journal, pas à l\'écran', async () => {
    // Le foyer n'a que faire de `periods/2026-08/variableCharges/c1` ; le
    // journal de diagnostic, si.
    const refusees = [{ chemin: 'periods/2026-08/variableCharges/c1', motif: 'PERMISSION_DENIED' }];
    rejouerFileDAttente.mockResolvedValue(bilan({ refusees }));

    await synchroniserLesSaisies();

    expect(logError).toHaveBeenCalledWith(expect.stringContaining('refusées'), refusees);
    expect(erreursAffichees()).not.toContain('periods/');
  });

  it('l\'autre chemin l\'annonce aussi — c\'est là qu\'ils avaient divergé', async () => {
    // `ecoulerLesSaisiesGardees` le disait déjà, `synchroniserLesSaisies` non.
    // Les deux sont tenus, pour qu'aucun ne puisse repartir seul.
    saisiesEnAttente.mockReturnValue(1);
    rejouerFileDAttente.mockResolvedValue(bilan({ refusees: [{ chemin: 'x', motif: 'y' }] }));

    await ecoulerLesSaisiesGardees();

    expect(erreursAffichees()).toContain('refusée par la base');
  });
});

describe('Le reste de ce que le rejeu annonce', () => {
  it('confirme ce qui est parti, et le journalise', async () => {
    rejouerFileDAttente.mockResolvedValue(bilan({ envoyees: 3 }));

    await synchroniserLesSaisies();

    expect(toast.success).toHaveBeenCalledWith('3 saisies hors ligne enregistrées');
    expect(noter).toHaveBeenCalledWith('hors-ligne', 'file rejouée', expect.objectContaining({ envoyees: 3 }));
  });

  it('NE CONFIRME RIEN quand rien n\'est parti', async () => {
    // Une reconnexion se produit à chaque sortie de veille. Un message à chacune
    // ferait de la confirmation un bruit de fond, et c'est justement le cas où
    // elle compte qu'on cesserait de voir.
    await synchroniserLesSaisies();

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('dit ce qui reste à quai, mais seulement si l\'envoi a résisté', async () => {
    rejouerFileDAttente.mockResolvedValue(bilan({ restantes: 2, erreur: null }));
    await synchroniserLesSaisies();
    expect(toast.error).not.toHaveBeenCalled();

    rejouerFileDAttente.mockResolvedValue(bilan({ restantes: 2, erreur: 'réseau' }));
    await synchroniserLesSaisies();
    expect(erreursAffichees()).toContain('2 saisies restent sur cet appareil');
  });

  it('rafraîchit le bandeau avec ce qui RESTE, jamais avec ce qui est parti', async () => {
    rejouerFileDAttente.mockResolvedValue(bilan({ envoyees: 5, restantes: 2, erreur: 'réseau' }));

    await synchroniserLesSaisies();

    expect(refreshConnectionBanner).toHaveBeenCalledWith(true, 2);
  });
});

describe('LA REPRISE AUTONOME — le seul moyen de sortir d\'une panne qui a duré des heures', () => {
  /**
   * `.info/connected` de Firebase peut rester FAUX alors que la base répond
   * parfaitement. C'est arrivé, et l'application est restée bloquée hors ligne
   * pendant des heures : aucun événement de connexion ne venait, donc rien ne
   * refermait le bandeau ni ne vidait la file. `db.js` sonde donc la base de
   * lui-même et appelle ce rappel quand une lecture aboutit enfin.
   *
   * Ce rappel était une fermeture anonyme dans `app.js` — inatteignable, donc
   * jamais éprouvée. En retirer l'un des deux gestes laissait tout vert.
   */
  it('referme le bandeau', async () => {
    saisiesEnAttente.mockReturnValue(4);

    await surRepriseDeLiaison();

    expect(refreshConnectionBanner).toHaveBeenCalledWith(true, 4);
  });

  it('ET écoule la file — les deux, pas l\'un des deux', async () => {
    // N'en faire qu'un laisserait soit un bandeau qui ment, soit des saisies
    // qui n'existent que sur l'appareil.
    saisiesEnAttente.mockReturnValue(1);
    rejouerFileDAttente.mockResolvedValue(bilan({ envoyees: 1 }));

    await surRepriseDeLiaison();

    expect(rejouerFileDAttente).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('1 saisie hors ligne enregistrée');
  });

  it('et le bandeau finit sur le compte d\'APRÈS le rejeu', async () => {
    // Il est rafraîchi deux fois : d'abord avec la file telle qu'elle est, puis
    // par `synchroniserLesSaisies` avec ce qui reste. C'est le second qui doit
    // avoir le dernier mot — sinon le bandeau annonce des saisies déjà parties.
    saisiesEnAttente.mockReturnValue(3);
    rejouerFileDAttente.mockResolvedValue(bilan({ envoyees: 3, restantes: 0 }));

    await surRepriseDeLiaison();

    expect(refreshConnectionBanner).toHaveBeenLastCalledWith(true, 0);
  });
});

describe('Écouler au chargement : les trois différences, toutes voulues', () => {
  it('la file vide ne déclenche AUCUN rejeu', async () => {
    // L'immense majorité des ouvertures. `synchroniserLesSaisies`, lui, appelle
    // toujours — c'est `annoncesDuRejeu` qui décide de son silence.
    saisiesEnAttente.mockReturnValue(0);

    await ecoulerLesSaisiesGardees();

    expect(rejouerFileDAttente).not.toHaveBeenCalled();
  });

  it('ne touche jamais au bandeau', async () => {
    // À cet instant la liaison vient d'être établie par Firebase lui-même, qui
    // l'a déjà rafraîchi.
    saisiesEnAttente.mockReturnValue(2);
    rejouerFileDAttente.mockResolvedValue(bilan({ envoyees: 2 }));

    await ecoulerLesSaisiesGardees();

    expect(refreshConnectionBanner).not.toHaveBeenCalled();
  });

  it('journalise en `warn`, ce chemin n\'étant pas une panne', async () => {
    saisiesEnAttente.mockReturnValue(1);
    rejouerFileDAttente.mockResolvedValue(bilan({ restantes: 1, erreur: 'réseau' }));

    await ecoulerLesSaisiesGardees();

    expect(warn).toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });
});

describe('AU RETOUR DU RÉSEAU, LE MOIS EN SUSPENS EST RELU — sur une lecture fraîche', () => {
  // Point ouvert 14. Hors ligne, la reconduction n'est pas tentée : son plan
  // viendrait du miroir. C'est ici, et seulement ici, qu'elle reprend.

  it('une reconduction en attente relit le mois, une fois, après le rejeu', async () => {
    const ordre = [];
    rejouerFileDAttente.mockImplementation(async () => { ordre.push('rejeu'); return bilan({}); });
    loadPeriodData.mockImplementation(async () => { ordre.push('relecture'); });
    marques.mettreEnAttente('2026-11');

    await synchroniserLesSaisies();
    await surRepriseDeLiaison();

    // Après le rejeu : ce qui a été saisi pendant la coupure compte dans le plan.
    expect(ordre).toEqual(['rejeu', 'relecture', 'rejeu']);
    // Sans argument : un instantané passé serait celui du miroir.
    expect(loadPeriodData).toHaveBeenCalledWith();
  });

  it('LE TÉMOIN — rien en suspens, rien n\'est relu', async () => {
    await synchroniserLesSaisies();
    expect(loadPeriodData).not.toHaveBeenCalled();
  });

  it('un mois illisible est relu de la même façon', async () => {
    marques.viderApresEchec({ mois: '2026-11', collection: 'fixedCharges', rendre: () => {} });
    await synchroniserLesSaisies();
    expect(loadPeriodData).toHaveBeenCalledTimes(1);
  });

  it('la liaison retombée pendant le rejeu : la marque reste pour la prochaine fois', async () => {
    marques.mettreEnAttente('2026-11');
    liaisonRompue.mockReturnValue(true);
    await synchroniserLesSaisies();
    expect(loadPeriodData).not.toHaveBeenCalled();

    liaisonRompue.mockReturnValue(false);
    await synchroniserLesSaisies();
    expect(loadPeriodData).toHaveBeenCalledTimes(1);
  });

  it('retombée PENDANT la relecture, elle n\'a rien relu : la suivante recommence', async () => {
    marques.mettreEnAttente('2026-11');
    loadPeriodData.mockImplementationOnce(async () => { liaisonRompue.mockReturnValue(true); });
    await synchroniserLesSaisies();

    liaisonRompue.mockReturnValue(false);
    await synchroniserLesSaisies();
    expect(loadPeriodData).toHaveBeenCalledTimes(2);
  });
});
