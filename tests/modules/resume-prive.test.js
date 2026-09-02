// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const lectures = vi.hoisted(() => ({ table: new Map() }));

vi.mock('../../public/js/db.js', () => ({
  dbGetAbsolu: vi.fn(async (chemin) => {
    if (!lectures.table.has(chemin)) throw new Error(`chemin non simulé : ${chemin}`);
    return lectures.table.get(chemin);
  })
}));

import { setState, resetState } from '../../public/js/state.js';
import {
  blocPriveDuResume, devoilerPrive, masquerLePrive
} from '../../public/js/modules/resume-prive.js';

/**
 * Le montant privé n'est pas caché : il est ABSENT
 *
 * Le suivi personnel s'ouvre en public — dans le train, au bureau, posé sur la
 * table. Le masquage couvre le coup d'œil : téléphone posé, aperçu
 * d'application, capture, épaule qui passe. Il ne couvre pas la personne assise
 * à côté ; c'est une politesse, pas une serrure, et le mur reste dans les
 * règles Firebase.
 *
 * Ce que ces contrôles tiennent :
 *
 *   1. Rien n'est lu tant qu'on n'a pas appuyé. Le premier rendu ne demande
 *      RIEN à la base : il n'y a donc aucun montant à surprendre, ni dans le
 *      document, ni dans la mémoire de l'application.
 *   2. Masqué veut dire vide : pas de texte flouté, pas d'attribut qui le
 *      porte. Rien à sélectionner, à copier, ni à faire lire.
 *   3. Le bloc ne porte QUE mes dépenses. Ce que l'autre publie n'a aucune
 *      fonction sur mon résumé — c'est financé sur sa part, ça ne bouge aucun
 *      chiffre dont je sois comptable. L'écran privé le montre, lui, et c'est
 *      sa place : on y va délibérément.
 *   4. Une lecture périmée n'écrit pas. Refermer pendant que la base répond
 *      doit rester refermé.
 */

const MOI = 'prive/vous/periods/2026-08/depenses';

function ecran({ mesDepenses = null } = {}) {
  resetState();
  setState('currentPeriod', '2026-08');
  setState('emplacementCourant', 'vous');
  setState('members', { vous: 'Richard', conjointe: 'Cindy' });

  lectures.table.clear();
  lectures.table.set(MOI, mesDepenses);

  document.body.innerHTML = `<div id="hote">${blocPriveDuResume()}</div>`;
}

const ligne = () => document.querySelector('.resume-prive-ligne[data-prive="mien"]');
const valeur = () => ligne().querySelector('.resume-prive-valeur');
const bouton = () => ligne().querySelector('.resume-prive-bouton');

describe('Le bloc privé du résumé', () => {
  beforeEach(() => { ecran(); });

  describe('au premier rendu', () => {
    it('ne demande rien à la base', async () => {
      const { dbGetAbsolu } = await import('../../public/js/db.js');
      dbGetAbsolu.mockClear();

      document.body.innerHTML = blocPriveDuResume();

      expect(dbGetAbsolu).not.toHaveBeenCalled();
    });

    it('rend la ligne masquée, sans aucune valeur dans le document', () => {
      expect(valeur().textContent).toBe('');
      expect(valeur().classList.contains('resume-prive-valeur--masque')).toBe(true);
      expect(bouton().getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('ce que le résumé ne porte pas', () => {
    it('ne montre pas ce que l\'autre publie', () => {
      // Décision du 2026-09-02. Une dépense privée est financée sur la part de
      // son propriétaire : son total ne bouge aucun chiffre dont je sois
      // comptable. Sur mon résumé, ce n'était qu'un bulletin mensuel sur
      // quelqu'un d'autre, remis sans avoir été demandé.
      expect(document.querySelectorAll('.resume-prive-ligne')).toHaveLength(1);
      expect(document.body.textContent).not.toContain('Cindy');
      expect(document.body.textContent).not.toContain('Publié par');
    });

    it('renvoie vers l\'écran privé, où la réciprocité est le sujet', () => {
      expect(document.querySelector('[data-action="showPrivateExpensesModal"]')).not.toBeNull();
    });
  });

  describe('le dévoilement', () => {
    it('affiche mon total et le nombre de dépenses', async () => {
      ecran({ mesDepenses: { a: { montant: 200, date: '2026-08-02' }, b: { montant: 140, date: '2026-08-09' } } });

      await devoilerPrive('mien');

      expect(valeur().textContent).toContain('2 dépenses');
      expect(valeur().classList.contains('resume-prive-valeur--masque')).toBe(false);
      expect(bouton().getAttribute('aria-expanded')).toBe('true');
      expect(bouton().textContent).toBe('Masquer');
    });

    it('un second appui referme, et la valeur quitte le document', async () => {
      ecran({ mesDepenses: { a: { montant: 200, date: '2026-08-02' } } });

      await devoilerPrive('mien');
      await devoilerPrive('mien');

      expect(valeur().textContent).toBe('');
      expect(valeur().classList.contains('resume-prive-valeur--masque')).toBe(true);
      expect(bouton().getAttribute('aria-expanded')).toBe('false');
    });

    it('dit « aucune » quand je n\'ai rien saisi — c\'est mon espace, je le sais', async () => {
      ecran({ mesDepenses: null });
      await devoilerPrive('mien');
      expect(valeur().textContent).toContain('aucune');
    });

    it('une lecture qui échoue ne ressemble pas à une absence de dépenses', async () => {
      ecran();
      lectures.table.delete(MOI); // provoque le rejet du faux `dbGetAbsolu`

      await devoilerPrive('mien');

      expect(valeur().textContent).toBe('lecture impossible');
    });
  });

  describe('la refermeture', () => {
    it('referme la ligne dévoilée', async () => {
      ecran({ mesDepenses: { a: { montant: 200, date: '2026-08-02' } } });

      await devoilerPrive('mien');
      masquerLePrive();

      expect(valeur().textContent).toBe('');
      expect(bouton().getAttribute('aria-expanded')).toBe('false');
    });

    it('une ligne refermée pendant la lecture ne s\'ouvre pas après coup', async () => {
      ecran({ mesDepenses: { a: { montant: 200, date: '2026-08-02' } } });

      // L'application passe en arrière-plan pendant que la base répond.
      const enCours = devoilerPrive('mien');
      masquerLePrive();
      await enCours;

      expect(valeur().textContent).toBe('');
      expect(bouton().getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('une ligne inconnue', () => {
    it('ne fait rien plutôt que de deviner', async () => {
      await expect(devoilerPrive('sien')).resolves.toBeUndefined();
      await expect(devoilerPrive('__proto__')).resolves.toBeUndefined();
      expect(valeur().textContent).toBe('');
    });
  });
});
