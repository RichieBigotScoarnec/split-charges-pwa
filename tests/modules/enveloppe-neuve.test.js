// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(), showConfirmModal: vi.fn()
}));

import { setState, resetState } from '../../public/js/state.js';
import { enveloppeNeuve } from '../../public/js/modules/envelopes.js';
import { NATURES, RANGS } from '../../public/js/utils/enveloppes.js';

/**
 * La fabrique laisse tomber ce qu'elle ne connaît pas — mesuré, pas supposé
 *
 * `fusionnerListe` écrit le tableau ENTIER des enveloppes par une transaction.
 * Les règles ferment la liste des champs par `$autre: { ".validate": false }` :
 * un champ inconnu sur UNE enveloppe fait donc refuser TOUTES celles du foyer.
 * L'écran dirait « créée », et les anciennes disparaîtraient de la vue suivante.
 *
 * La garde est que les deux chemins de création passent par `enveloppeNeuve`,
 * qui n'écrit que ce que `normaliserEnveloppe` connaît. Le contrôle censé la
 * tenir lisait la SOURCE — « le fichier contient `enveloppeNeuve({` deux fois »,
 * « `provenance()` n'est appelée qu'une fois ». Mesuré : remplacer le corps de
 * la fabrique par
 *
 *     return { ...brouillon, ...provenance() };
 *
 * laissait les 2 378 contrôles verts. Les deux appels sont toujours là, la
 * provenance aussi — et la garde entière avait disparu.
 *
 * Ce fichier appelle la fabrique et regarde ce qu'elle rend.
 */

/** L'auteur est déduit du compte connecté ; sans lui, la provenance est nulle */
const COMPTE = 'bigot.richard@gmail.com';

/** Un brouillon complet, tel que le formulaire le compose */
const BROUILLON = Object.freeze({
  id: 'vacances-2027',
  label: 'Vacances 2027',
  icon: '🏖️',
  budget: 1200,
  debut: '2026-09-01',
  fin: '2027-08-01',
  cloturee: false,
  nature: NATURES.CAGNOTTE,
  report: false,
  rang: RANGS.PROVISION,
  perimetre: 'commun',
  proprietaire: null
});

beforeEach(() => {
  resetState();
  setState('userEmail', COMPTE);
});

describe('CE QUE LA FABRIQUE ÉCARTE', () => {
  it('un champ inconnu ne ressort pas', () => {
    // LE contrôle. `couleur` est exactement ce qu'un futur écran ajouterait
    // sans y penser — et qui ferait refuser toutes les enveloppes du foyer.
    const sortie = enveloppeNeuve({ ...BROUILLON, couleur: '#f00' });

    expect(sortie).not.toBeNull();
    expect(Object.keys(sortie)).not.toContain('couleur');
  });

  it('et plusieurs champs inconnus non plus', () => {
    const sortie = enveloppeNeuve({ ...BROUILLON, couleur: '#f00', note: 'x', archive: true });

    expect(Object.keys(sortie).sort()).toEqual(Object.keys(enveloppeNeuve(BROUILLON)).sort());
  });

  it('un libellé plus long que ce que les règles acceptent est tronqué', () => {
    // Les règles plafonnent à 100 caractères. Sans la troncature, l'écriture
    // part et le serveur la refuse — après un toast de succès.
    const sortie = enveloppeNeuve({ ...BROUILLON, label: 'x'.repeat(250) });

    expect(sortie.label.length).toBe(100);
  });

  it('un propriétaire posé sur une enveloppe COMMUNE est écarté', () => {
    // L'invariant croisé des règles : `proprietaire` n'a de sens que sur une
    // solo. Une commune qui en porte un est refusée côté serveur.
    const sortie = enveloppeNeuve({ ...BROUILLON, perimetre: 'commun', proprietaire: 'vous' });

    expect(sortie.proprietaire).toBeNull();
  });

  it('une nature inconnue retombe sur « cagnotte »', () => {
    expect(enveloppeNeuve({ ...BROUILLON, nature: 'hebdomadaire' }).nature).toBe(NATURES.CAGNOTTE);
  });

  it('un rang inconnu retombe sur « à classer »', () => {
    expect(enveloppeNeuve({ ...BROUILLON, rang: 'urgent' }).rang).toBeNull();
  });
});

describe('CE QUE LA FABRIQUE GARDE', () => {
  it('tous les champs du brouillon, à l\'identique', () => {
    const sortie = enveloppeNeuve(BROUILLON);

    for (const [cle, valeur] of Object.entries(BROUILLON)) {
      expect(sortie[cle], `champ ${cle}`).toEqual(valeur);
    }
  });

  it('et l\'estampille de provenance, que le brouillon ne porte pas', () => {
    // `creePar` et `creeLe` répondent à « qui a créé cette enveloppe ? » — une
    // question que le foyer a posée et à laquelle l'application n'avait aucune
    // réponse possible.
    const sortie = enveloppeNeuve(BROUILLON);

    expect(sortie.creePar).toBe('vous');
    expect(sortie.creeLe).toBeGreaterThan(0);
  });

  it('une provenance que le brouillon prétendrait porter est écrasée', () => {
    // Sans quoi n'importe quel chemin pourrait attribuer une enveloppe à l'autre.
    const sortie = enveloppeNeuve({ ...BROUILLON, creePar: 'conjointe', creeLe: 1 });

    expect(sortie.creePar).toBe('vous');
    expect(sortie.creeLe).toBeGreaterThan(1);
  });
});

describe('CE QU\'ELLE REFUSE ENTIÈREMENT', () => {
  it.each([
    ['sans libellé', { label: '' }],
    ['libellé fait d\'espaces', { label: '   ' }],
    ['sans identifiant', { id: '' }]
  ])('%s → null, plutôt qu\'une enveloppe à moitié valide', (_, ecart) => {
    // Une entrée à moitié valide se propage ensuite dans les listes déroulantes
    // et les totaux. Les deux appelants traitent ce `null` et le disent.
    expect(enveloppeNeuve({ ...BROUILLON, ...ecart })).toBeNull();
  });
});
