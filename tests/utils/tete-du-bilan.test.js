import { describe, it, expect } from 'vitest';
import { teteDuBilan, libelleDeTete } from '../../public/js/utils/tete-du-bilan.js';
import { describeBalance } from '../../public/js/utils/members.js';
import { PORTEES } from '../../public/js/utils/portee.js';

/**
 * La tête du bilan, portée par portée
 *
 * La propriété que ce fichier tient : **la tête porte le libellé de la portée
 * courante, par une seule fabrique.** Le rendu (`summary.js`) ne rédige aucune
 * tête ; il lit ce que rend `teteDuBilan`. La preuve de câblage — que l'écran
 * suit bien la portée — est dans `tests/e2e/tete-du-bilan.spec.js`.
 */

const MEMBRES = { vous: 'Richard', conjointe: 'Cindy' };

/** La tête pour une portée, vue depuis un compte donné */
function tete(portee, { montant = -66.94, moi = 'vous', totalSolo = 10 } = {}) {
  return teteDuBilan({
    portee,
    solde: describeBalance(montant, MEMBRES),
    montant,
    moi,
    totalSolo,
    autre: moi === 'vous' ? 'Cindy' : 'Richard'
  });
}

const TOUTES = Object.values(PORTEES);

describe('La tête porte le libellé de la portée courante', () => {
  it('trois portées, trois libellés distincts — et chacun est celui de sa portée', () => {
    const libelles = TOUTES.map((p) => tete(p).libelle);
    expect(new Set(libelles).size).toBe(3);

    for (const p of TOUTES) {
      expect(tete(p).portee).toBe(p);
      expect(tete(p).libelle).toBe(libelleDeTete(p));
    }
  });

  it('les libellés sont ceux des planches', () => {
    expect(libelleDeTete(PORTEES.DEUX)).toBe('Solde du mois');
    expect(libelleDeTete(PORTEES.SOLO)).toBe('Mes dépenses solo');
    expect(libelleDeTete(PORTEES.PRIVE)).toBe('Mon espace privé');
  });

  it('une portée inconnue retombe sur « À deux », jamais sur « Privé »', () => {
    // Ouvrir le privé par accident afficherait ce que le foyer a rangé hors de
    // la vue de l'autre : le repli va vers la portée la moins révélatrice.
    expect(tete('inconnue').portee).toBe(PORTEES.DEUX);
    expect(tete(undefined).libelle).toBe('Solde du mois');
  });
});

describe('À deux : la créance, dite à celui qui tient le téléphone', () => {
  it('« Tu dois 66,94 € à Cindy » quand le compte connecté est débiteur', () => {
    // -66,94 : c'est `vous` qui doit (convention de `describeBalance`).
    const t = tete(PORTEES.DEUX, { montant: -66.94, moi: 'vous' });
    expect(t.avant).toBe('Tu dois');
    expect(t.montant).toBe(66.94);
    expect(t.apres).toBe('à Cindy');
    expect(t.ton).toBe('creance');
  });

  it('« Cindy te doit » quand il est créancier', () => {
    const t = tete(PORTEES.DEUX, { montant: 66.94, moi: 'vous' });
    expect(t.avant).toBe('Cindy te doit');
    expect(t.apres).toBe('');
    expect(t.ton).toBe('creance');
  });

  it('LA MÊME DETTE, lue sur les deux téléphones, se retourne — et garde son montant', () => {
    // Le cas qui a motivé `emplacementDebiteur` : sans lui, le téléphone de
    // Cindy aurait affiché « Tu dois 66,94 € à Cindy ».
    const chezRichard = tete(PORTEES.DEUX, { montant: -66.94, moi: 'vous' });
    const chezCindy = tete(PORTEES.DEUX, { montant: -66.94, moi: 'conjointe' });

    expect(chezRichard.avant).toBe('Tu dois');
    expect(chezCindy.avant).toBe('Richard te doit');
    expect(chezCindy.montant).toBe(chezRichard.montant);
  });

  it('le montant est toujours positif : le sens est dans les mots', () => {
    expect(tete(PORTEES.DEUX, { montant: -1234.56 }).montant).toBe(1234.56);
    expect(tete(PORTEES.DEUX, { montant: 1234.56 }).montant).toBe(1234.56);
  });

  it('à zéro : « Comptes équilibrés », sans montant ni ambre', () => {
    // La tête le dit quand même : sans cela `barre-solde.js`, qui se tait tant
    // que cette carte est à l'écran, laisserait l'équilibre dit nulle part.
    const t = tete(PORTEES.DEUX, { montant: 0 });
    expect(t.avant).toBe('Comptes équilibrés');
    expect(t.montant).toBeNull();
    expect(t.ton).toBe('equilibre');
  });
});

describe('Solo : un total, en encre neutre', () => {
  it('porte le total solo, jamais le solde du foyer', () => {
    const t = tete(PORTEES.SOLO, { montant: -66.94, totalSolo: 10 });
    expect(t.montant).toBe(10);
    expect(t.ton).toBe('neutre');
  });

  it('sa PHRASE ne dit jamais que quelqu\'un doit', () => {
    // La phrase seule — avant et après le montant — et pas la note : celle-ci
    // dit, mot pour mot comme la planche, « personne ne doit rien à personne
    // dessus ». Chercher le verbe dans tout le texte confondait « quelqu'un
    // doit » et « personne ne doit » ; la première version de ce contrôle est
    // tombée exactement là, sur un code juste.
    const t = tete(PORTEES.SOLO);
    expect(`${t.avant} ${t.apres}`).not.toMatch(/\bdoi[st]\b/);
    // Témoin : la même recherche, sur À deux, trouve bien le verbe.
    const temoin = tete(PORTEES.DEUX);
    expect(`${temoin.avant} ${temoin.apres}`).toMatch(/\bdoi[st]\b/);
  });

  it('dit que personne ne doit rien à personne dessus, et qui voit la liste', () => {
    const { note } = tete(PORTEES.SOLO);
    expect(note).toContain('personne ne doit rien à personne');
    expect(note).toContain('visible de Cindy');
  });
});

describe('Privé : aucun chiffre', () => {
  const chiffresDe = (t) => `${t.libelle} ${t.avant} ${t.apres} ${t.note}`.match(/\d/g) || [];

  it('aucun montant, et aucun chiffre dans aucun de ses textes', () => {
    const t = tete(PORTEES.PRIVE, { montant: -66.94, totalSolo: 10 });
    expect(t.montant).toBeNull();
    expect(t.ton).toBe('aucun-chiffre');
    expect(chiffresDe(t)).toEqual([]);

    // Témoin : `toEqual([])` est satisfait par un relevé vide, et un relevé
    // qui ne lit rien en rend un. La même sonde, sur un texte qui porte un
    // chiffre, doit en trouver.
    expect(chiffresDe({ libelle: 'x', avant: '66,94', apres: '', note: '' }).length).toBeGreaterThan(0);
  });

  it('nomme l\'autre, et dit qui décide de ce qu\'il voit', () => {
    expect(tete(PORTEES.PRIVE, { moi: 'vous' }).avant).toContain('Cindy');
    expect(tete(PORTEES.PRIVE, { moi: 'conjointe' }).avant).toContain('Richard');
  });
});
