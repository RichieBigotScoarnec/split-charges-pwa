// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  attestationAEviter,
  noterEchecAttestation,
  noterSuccesAttestation,
  etatAttestation
} from '../../public/js/utils/attestation.js';

/**
 * Ne pas payer tous les jours une attestation qui n'aboutit jamais
 *
 * Mesuré sur l'appareil, journal à l'appui : l'authentification restait bloquée
 * 6 621 ms avec l'attestation active, 1 146 ms sans — et repartait à la
 * milliseconde où l'attestation rendait son échec. Six secondes à chaque
 * ouverture, pour un jeton refusé en « 400 » et jamais validé une seule fois.
 *
 * L'équilibre à tenir a deux côtés, et le second est le plus facile à perdre de
 * vue : écarter une attestation qui échoue, mais jamais au point de ne plus
 * jamais la retenter — sans quoi une configuration réparée dans la console
 * resterait ignorée pour toujours, et l'on aurait troqué une lenteur permanente
 * contre un abandon permanent.
 */

const JOUR_MS = 24 * 60 * 60 * 1000;
const T0 = 1_700_000_000_000;

beforeEach(() => {
  window.localStorage.clear();
});

describe('Après un échec', () => {
  it('écarte l\'attestation des ouvertures suivantes', () => {
    noterEchecAttestation(T0);

    expect(attestationAEviter(T0 + 1000)).toBe(true);
    expect(attestationAEviter(T0 + 6 * 60 * 60 * 1000)).toBe(true);
  });

  it('la retente le lendemain, faute de quoi l\'abandon serait définitif', () => {
    // Le côté qu'on perd de vue : une configuration réparée dans la console ne
    // serait jamais reprise, le compteur de requêtes validées resterait à zéro,
    // et l'on conclurait que la réparation n'a rien changé.
    noterEchecAttestation(T0);

    expect(attestationAEviter(T0 + JOUR_MS - 1000)).toBe(true);
    expect(attestationAEviter(T0 + JOUR_MS), 'l\'attestation doit être retentée').toBe(false);
    expect(attestationAEviter(T0 + 3 * JOUR_MS)).toBe(false);
  });

  it('compte les échecs consécutifs, pour que le journal le dise', () => {
    expect(noterEchecAttestation(T0)).toBe(1);
    expect(noterEchecAttestation(T0 + JOUR_MS)).toBe(2);
    expect(etatAttestation(T0 + JOUR_MS).essais).toBe(2);
  });
});

describe('Au premier succès', () => {
  it('efface la mémoire : tout revient à la normale sans intervention', () => {
    noterEchecAttestation(T0);
    expect(attestationAEviter(T0 + 1000)).toBe(true);

    noterSuccesAttestation();

    expect(attestationAEviter(T0 + 1000)).toBe(false);
    expect(etatAttestation(T0 + 1000)).toBeNull();
  });
});

describe('Sans rien en mémoire', () => {
  it('n\'écarte rien : le défaut est d\'attester', () => {
    expect(attestationAEviter(T0)).toBe(false);
    expect(etatAttestation(T0)).toBeNull();
  });
});

describe('Quand le stockage ment ou se dérobe', () => {
  it('un enregistrement illisible vaut absence d\'enregistrement', () => {
    window.localStorage.setItem('fairsplit.attestation', 'ceci n\'est pas du JSON');

    // Le défaut sûr est de retenter : cela coûte une lenteur, jamais un abandon.
    expect(attestationAEviter(T0)).toBe(false);
  });

  it('une date absurde ne condamne pas l\'attestation', () => {
    window.localStorage.setItem('fairsplit.attestation', JSON.stringify({ dernierEssai: 'hier' }));

    expect(attestationAEviter(T0)).toBe(false);
  });

  it('une horloge qui recule ne l\'écarte pas pour toujours', () => {
    // Changement de fuseau, correction de l'heure : l'écart devient négatif.
    // Sans garde, la comparaison « moins d'une journée » resterait vraie
    // indéfiniment et l'attestation ne serait plus jamais tentée.
    noterEchecAttestation(T0);

    expect(attestationAEviter(T0 - 3 * JOUR_MS)).toBe(false);
  });

  it('un stockage refusé ne fait pas échouer le démarrage', () => {
    // Navigation privée, quota atteint : `setItem` lève. Rien ne dépend de cet
    // enregistrement — on repaiera la lenteur, sans plus.
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => noterEchecAttestation(T0)).not.toThrow();

    setItem.mockRestore();
  });
});
