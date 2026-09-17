import { describe, it, expect } from 'vitest';
import {
  consequenceDuReglement, ISSUES
} from '../../public/js/utils/phrase-reglement.js';

/** Les deux prénoms du foyer, pour que rien ne soit écrit en dur */
const MEMBRES = { vous: 'Richard', conjointe: 'Cindy' };

/**
 * `formatCurrency` produit une espace FINE INSÉCABLE (U+202F) avant l'euro, et
 * un espace insécable ordinaire dans les milliers. Écrire « 66,94 € » en clair
 * a fait rougir la CI deux fois : on ne compare donc jamais à une chaîne
 * fabriquée à la main, on cherche le nombre.
 */
const chiffres = (phrase) => phrase.replace(/[\s\u202f\u00a0]/g, '');

describe('La phrase de conséquence d\'un règlement', () => {
  describe('montant = solde', () => {
    it('promet le retour à zéro', () => {
      const r = consequenceDuReglement({
        saisie: '66,94', solde: 66.94, members: MEMBRES, moi: 'vous'
      });

      expect(r.issue).toBe(ISSUES.EXACT);
      expect(r.valide).toBe(true);
      expect(r.phrase).toBe('Le solde du mois reviendra à zéro.');
      expect(r.resteCentimes).toBe(0);
    });

    it('le point décimal et la virgule disent la même chose', () => {
      const virgule = consequenceDuReglement({ saisie: '66,94', solde: 66.94, members: MEMBRES });
      const point = consequenceDuReglement({ saisie: '66.94', solde: 66.94, members: MEMBRES });

      expect(point).toEqual(virgule);
    });

    it('AU CENTIME, ET PAS EN FLOTTANT — un solde qui ne se soustrait pas rond', () => {
      // 0.1 + 0.2 vaut 0.30000000000000004. Une comparaison flottante rendrait
      // « il restera 0,00 € à régler » sur un paiement exact.
      const r = consequenceDuReglement({
        saisie: '0,30', solde: 0.1 + 0.2, members: MEMBRES
      });

      expect(r.issue).toBe(ISSUES.EXACT);
      expect(r.resteCentimes).toBe(0);
    });
  });

  describe('montant < solde', () => {
    it('dit ce qui reste', () => {
      const r = consequenceDuReglement({
        saisie: '40', solde: 66.94, members: MEMBRES, moi: 'vous'
      });

      expect(r.issue).toBe(ISSUES.PARTIEL);
      expect(r.valide).toBe(true);
      expect(chiffres(r.phrase)).toContain('26,94€');
      expect(r.resteCentimes).toBe(2694);
    });

    it('UN SEUL CENTIME de moins reste un paiement partiel', () => {
      // La borne du basculement, du côté où un flottant l'aurait manquée.
      const r = consequenceDuReglement({
        saisie: '66,93', solde: 66.94, members: MEMBRES
      });

      expect(r.issue).toBe(ISSUES.PARTIEL);
      expect(r.resteCentimes).toBe(1);
      expect(chiffres(r.phrase)).toContain('0,01€');
    });

    it('le sens du solde ne change pas ce qui reste', () => {
      // Je dois 66,94 et j'en verse 40 : il reste 26,94 à régler, comme dans
      // l'autre sens. Le reste est une distance, pas une créance.
      const r = consequenceDuReglement({
        saisie: '40', solde: -66.94, members: MEMBRES, moi: 'vous'
      });

      expect(r.issue).toBe(ISSUES.PARTIEL);
      expect(r.resteCentimes).toBe(2694);
    });
  });

  describe('montant > solde — le solde change de sens', () => {
    it('quand c\'est MOI qui verse trop, c\'est moi qui devrai', () => {
      // Solde négatif : je dois 66,94, je verse 70. Elle me doit 3,06.
      const r = consequenceDuReglement({
        saisie: '70', solde: -66.94, members: MEMBRES, moi: 'vous'
      });

      expect(r.issue).toBe(ISSUES.DEPASSEMENT);
      expect(r.valide).toBe(true);
      expect(r.phrase).toContain('Cindy');
      expect(r.phrase).toContain('te devra');
      expect(chiffres(r.phrase)).toContain('3,06€');
      expect(r.resteCentimes).toBe(-306);
    });

    it('quand c\'est L\'AUTRE qui verse trop, c\'est moi qui devrai', () => {
      // Solde positif : Cindy doit 66,94, elle verse 70. Je lui dois 3,06.
      //
      // LE MIROIR, ET IL COMPTE : une rédaction unique — « X te devra » —
      // rendrait « Richard te devra 3,06 € » sur le téléphone de Richard.
      const r = consequenceDuReglement({
        saisie: '70', solde: 66.94, members: MEMBRES, moi: 'vous'
      });

      expect(r.issue).toBe(ISSUES.DEPASSEMENT);
      expect(r.phrase).toContain('Tu devras');
      expect(r.phrase).toContain('Cindy');
      expect(chiffres(r.phrase)).toContain('3,06€');
    });

    it('LE MÊME TROP-VERSÉ, LU SUR L\'AUTRE TÉLÉPHONE, DIT L\'INVERSE', () => {
      // Le témoin du miroir : mêmes données, `moi` seul change.
      const entree = { saisie: '70', solde: 66.94, members: MEMBRES };

      const chezRichard = consequenceDuReglement({ ...entree, moi: 'vous' });
      const chezCindy = consequenceDuReglement({ ...entree, moi: 'conjointe' });

      expect(chezRichard.phrase).not.toBe(chezCindy.phrase);
      expect(chezRichard.phrase).toContain('Tu devras');
      expect(chezCindy.phrase).toContain('Richard');
      expect(chezCindy.phrase).toContain('te devra');
      // Le montant, lui, est le même des deux côtés.
      expect(chezCindy.resteCentimes).toBe(chezRichard.resteCentimes);
    });

    it('UN SEUL CENTIME de trop bascule déjà', () => {
      const r = consequenceDuReglement({
        saisie: '66,95', solde: 66.94, members: MEMBRES, moi: 'vous'
      });

      expect(r.issue).toBe(ISSUES.DEPASSEMENT);
      expect(r.resteCentimes).toBe(-1);
      expect(chiffres(r.phrase)).toContain('0,01€');
    });

    it('aucun plafond : un trop-versé énorme est ACCEPTÉ, et affiché', () => {
      // D3 — la protection contre la faute de frappe est la phrase, pas un refus.
      const r = consequenceDuReglement({
        saisie: '1000', solde: 66.94, members: MEMBRES, moi: 'vous'
      });

      expect(r.valide).toBe(true);
      expect(chiffres(r.phrase)).toContain('933,06€');
    });

    it('sans prénom saisi, la phrase reste lisible', () => {
      const r = consequenceDuReglement({
        saisie: '70', solde: -66.94, members: null, moi: 'vous'
      });

      expect(r.valide).toBe(true);
      expect(r.phrase).toContain('te devra');
      // Aucun prénom en dur : ce que rend `memberLabel` sans réglage.
      expect(r.phrase).not.toContain('undefined');
    });
  });

  describe('une saisie qu\'on ne peut pas régler', () => {
    it.each([
      ['illisible', 'abcd'],
      ['un nombre à moitié', '12abc'],
      ['vide', ''],
      ['zéro', '0'],
      ['zéro écrit long', '0,00'],
      ['négatif', '-5'],
      ['négatif à virgule', '-0,01']
    ])('refuse %s, et dit pourquoi', (_nom, saisie) => {
      const r = consequenceDuReglement({
        saisie, solde: 66.94, members: MEMBRES, moi: 'vous'
      });

      expect(r.issue).toBe(ISSUES.REFUS);
      expect(r.valide).toBe(false);
      // La phrase n'est pas vide, et elle nomme le champ en cause.
      expect(r.phrase.length).toBeGreaterThan(0);
      expect(r.phrase).toMatch(/[Mm]ontant/);
      expect(r.resteCentimes).toBeNull();
    });

    it('TÉMOIN POSITIF : les refus ne disent pas tous la même chose', () => {
      // Sans lui, un `error` constant — « saisie invalide » — passerait les
      // sept cas ci-dessus en vert sans rien apprendre à personne.
      const motifs = new Set(['abcd', '', '0', '-5'].map(saisie =>
        consequenceDuReglement({ saisie, solde: 66.94, members: MEMBRES }).phrase));

      expect(motifs.size).toBeGreaterThan(2);
    });

    it('un solde illisible se dit, il ne s\'affiche pas en NaN', () => {
      const r = consequenceDuReglement({
        saisie: '70', solde: NaN, members: MEMBRES, moi: 'vous'
      });

      expect(r.valide).toBe(false);
      expect(r.phrase).not.toContain('NaN');
    });

    it('appelée sans rien, elle refuse au lieu de lever', () => {
      expect(() => consequenceDuReglement()).not.toThrow();
      expect(consequenceDuReglement().valide).toBe(false);
    });
  });

  describe('TÉMOIN POSITIF DE L\'INSTRUMENT', () => {
    it('les trois issues valides sont bien séparées par le jeu d\'essai', () => {
      // Une assertion satisfaite par une valeur neutre ne mesure rien : on
      // vérifie que les entrées choisies produisent bien TROIS issues, sans
      // quoi les cas ci-dessus mesureraient tous la même branche.
      const issues = ['66,94', '40', '70'].map(saisie =>
        consequenceDuReglement({ saisie, solde: 66.94, members: MEMBRES, moi: 'vous' }).issue);

      expect(new Set(issues).size).toBe(3);
    });
  });
});
