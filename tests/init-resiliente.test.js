// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initDatabase, setAuthenticatedUser, dbGet } from '../public/js/db.js';

/**
 * Deux garanties contre un même symptôme : une application qui s'affiche vide,
 * sans salaires ni sélecteur de mois, et sans le moindre message d'erreur.
 *
 * Realtime Database ne rejette pas une lecture émise alors que le client n'est
 * pas connecté : il la met en file d'attente. La promesse reste en attente,
 * aucun `catch` ne se déclenche, et un `await` placé sur cette lecture gèle
 * définitivement la séquence d'initialisation — en silence. Le sélecteur de
 * mois, qui ne dépend d'aucune donnée, était initialisé derrière une de ces
 * lectures : il disparaissait avec elle.
 */

describe('Une lecture sans réponse ne peut pas geler l\'initialisation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setAuthenticatedUser('uid-test');
  });

  afterEach(() => {
    vi.useRealTimers();
    setAuthenticatedUser(null);
  });

  it('dbGet échoue après le délai au lieu d\'attendre indéfiniment', async () => {
    // Reproduit une base injoignable : once() ne rejette jamais, il attend.
    initDatabase({ ref: () => ({ once: () => new Promise(() => {}) }) });

    const lecture = dbGet('customCategories');
    const verdict = expect(lecture).rejects.toThrow(/sans réponse/);
    await vi.advanceTimersByTimeAsync(10000);
    await verdict;
  });

  it('le message d\'échec nomme le chemin, pour rester exploitable', async () => {
    initDatabase({ ref: () => ({ once: () => new Promise(() => {}) }) });

    const lecture = dbGet('periods/2026-08/salaries');
    const verdict = expect(lecture).rejects.toThrow(/periods\/2026-08\/salaries/);
    await vi.advanceTimersByTimeAsync(10000);
    await verdict;
  });

  it('une lecture qui aboutit n\'est pas pénalisée', async () => {
    initDatabase({
      ref: () => ({ once: () => Promise.resolve({ val: () => ({ salaireVous: 2000 }) }) })
    });

    await expect(dbGet('periods/2026-08/salaries')).resolves.toEqual({ salaireVous: 2000 });
  });
});

describe('Ordre d\'initialisation', () => {
  // En environnement jsdom, import.meta.url est une URL http : on résout
  // depuis la racine du projet, que Vitest fixe comme répertoire courant.
  const source = readFileSync(
    resolve(process.cwd(), 'public/js/modules/auth.js'),
    'utf8'
  );

  /**
   * Le sélecteur de mois se déduit de la date courante : aucune lecture requise.
   * Le placer après une étape réseau revient à faire dépendre la navigation de
   * la disponibilité de la base. Cet ordre est une garantie, pas une préférence.
   */
  it('le sélecteur de période précède toute étape lisant en base', () => {
    const selecteur = source.indexOf("runStep('sélecteur de période'");
    expect(selecteur).toBeGreaterThan(-1);

    const etapesReseau = [
      "runStep('listes personnalisées'",
      "runStep('salaires de la période'",
      "runStep('mode de partage'",
      "runStep('charges variables'",
      "runStep('charges fixes'"
    ];

    etapesReseau.forEach(etape => {
      const position = source.indexOf(etape);
      expect(position, `${etape} introuvable`).toBeGreaterThan(-1);
      expect(selecteur, `le sélecteur doit précéder ${etape}`).toBeLessThan(position);
    });
  });

  it('chaque étape est isolée par runStep, aucune n\'échappe au filet', () => {
    // Un appel direct hors runStep propagerait son échec et interromprait
    // toutes les étapes suivantes.
    const appelsDirects = source.match(/^\s+await (initCustomLists|loadPeriodData|loadShareMode|loadVariableCharges|loadFixedCharges)\(/gm) || [];
    appelsDirects.forEach(appel => {
      expect(source.indexOf(appel.trim())).toBeGreaterThan(source.indexOf('runStep('));
    });
    expect(source).toContain('async function runStep(');
  });
});
