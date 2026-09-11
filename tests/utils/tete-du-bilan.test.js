import { describe, it, expect } from 'vitest';
import { teteDuBilan, libelleDeTete, gabaritDeTete } from '../../public/js/utils/tete-du-bilan.js';
import { describeBalance } from '../../public/js/utils/members.js';
import { PORTEES } from '../../public/js/utils/portee.js';

/**
 * La tête du bilan, portée par portée
 *
 * La propriété que ce fichier tient : **chaque portée porte sa tête, par une
 * seule fabrique et un seul gabarit.** Le bilan (`summary.js`) et l'espace
 * privé (`prive.js`) ne rédigent aucune tête ; ils lisent ce que rend
 * `teteDuBilan` et le dessinent par `gabaritDeTete`. La preuve de câblage — que
 * l'écran suit bien la portée — est dans `tests/e2e/tete-du-bilan.spec.js`.
 */

const MEMBRES = { vous: 'Richard', conjointe: 'Cindy' };

/** Le mois de la planche 12 : 3 050,88 − 152,45 − 10,00 = 2 888,43 */
const MOIS_PERSONNEL = {
  disponible: true, revenus: 3050.88, partDue: 152.45, solo: 10, resteAVivre: 2888.43, tauxEffort: 0.053
};

/** La tête pour une portée, vue depuis un compte donné */
function tete(portee, {
  montant = -66.94, moi = 'vous', moisPersonnel = MOIS_PERSONNEL, etat = 'en-cours', posture = 'total'
} = {}) {
  return teteDuBilan({
    portee,
    solde: describeBalance(montant, MEMBRES),
    montant,
    moi,
    moisPersonnel,
    etat,
    moisNomme: 'septembre 2026',
    posture,
    autre: moi === 'vous' ? 'Cindy' : 'Richard'
  });
}

const TOUTES = Object.values(PORTEES);
const phraseDe = (t) => `${t.avant} ${t.apres}`;

describe('Chaque portée porte sa tête', () => {
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
    expect(libelleDeTete(PORTEES.SOLO)).toBe('Moi ce mois');
    expect(libelleDeTete(PORTEES.PRIVE)).toBe('Mon espace privé');
  });

  it('une portée inconnue retombe sur « À deux », jamais sur « Privé »', () => {
    expect(tete('inconnue').portee).toBe(PORTEES.DEUX);
    expect(tete(undefined).libelle).toBe('Solde du mois');
  });
});

describe('À deux : la créance, dite à celui qui tient le téléphone', () => {
  it('« Tu dois 66,94 € à Cindy » quand le compte connecté est débiteur', () => {
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
  });

  it('LA MÊME DETTE, lue sur les deux téléphones, se retourne — et garde son montant', () => {
    const chezRichard = tete(PORTEES.DEUX, { montant: -66.94, moi: 'vous' });
    const chezCindy = tete(PORTEES.DEUX, { montant: -66.94, moi: 'conjointe' });

    expect(chezRichard.avant).toBe('Tu dois');
    expect(chezCindy.avant).toBe('Richard te doit');
    expect(chezCindy.montant).toBe(chezRichard.montant);
  });

  it('à zéro : « Comptes équilibrés », sans montant ni ambre', () => {
    const t = tete(PORTEES.DEUX, { montant: 0 });
    expect(t.avant).toBe('Comptes équilibrés');
    expect(t.montant).toBeNull();
    expect(t.ton).toBe('equilibre');
  });
});

describe('Moi : « Il te reste », un plafond en encre neutre', () => {
  it('« Il te reste 2 888,43 € à vivre en septembre 2026 »', () => {
    const t = tete(PORTEES.SOLO);
    expect(t.avant).toBe('Il te reste');
    expect(t.montant).toBe(2888.43);
    expect(t.apres).toBe('à vivre en septembre 2026');
    expect(t.ton).toBe('neutre');
  });

  it('jamais le solde du foyer : la dette de 66,94 € n\'y paraît pas', () => {
    expect(tete(PORTEES.SOLO, { montant: -66.94 }).montant).toBe(2888.43);
  });

  it('le verbe suit l\'état du mois — même raison que « Dépensé à deux »', () => {
    expect(tete(PORTEES.SOLO, { etat: 'revolu' }).avant).toBe('Il t\'est resté');
    expect(tete(PORTEES.SOLO, { etat: 'a-venir' }).avant).toBe('Il te restera');
    expect(tete(PORTEES.SOLO, { etat: null }).avant).toBe('Il te reste');
  });

  it('un reste négatif est un dépassement, et la phrase le nomme', () => {
    const t = tete(PORTEES.SOLO, { moisPersonnel: { ...MOIS_PERSONNEL, resteAVivre: -120 } });
    expect(t.avant).toBe('Tu dépasses tes revenus de');
    expect(t.montant).toBe(120);
  });

  it('sans revenus, la tête le dit plutôt que d\'inventer un reste', () => {
    const t = tete(PORTEES.SOLO, { moisPersonnel: { disponible: false } });
    expect(t.montant).toBeNull();
    expect(t.avant).toContain('revenus');
  });

  it('sa PHRASE ne dit jamais que quelqu\'un doit', () => {
    expect(phraseDe(tete(PORTEES.SOLO))).not.toMatch(/\bdoi[st]\b/);
    // Témoin : la même recherche, sur À deux, trouve bien le verbe.
    expect(phraseDe(tete(PORTEES.DEUX))).toMatch(/\bdoi[st]\b/);
  });
});

describe('Privé : aucun chiffre en tête, une phrase qui dit la règle', () => {
  const chiffresDe = (t) => `${t.libelle} ${t.avant} ${t.apres} ${t.note}`.match(/\d/g) || [];

  it('la règle dite est celle que l\'autre peut RÉELLEMENT lire — trois réglages, trois phrases', () => {
    const phrases = ['rien', 'total', 'detail'].map((posture) => tete(PORTEES.PRIVE, { posture }).avant);
    expect(new Set(phrases).size).toBe(3);
    expect(tete(PORTEES.PRIVE, { posture: 'total' }).avant)
      .toBe('Cindy voit un total. Jamais ce que tu as acheté.');
  });

  it('sans réglage lu, elle se limite à ce qui est vrai des trois', () => {
    // `null` et non `undefined` : ce dernier déclencherait la valeur par défaut
    // de l'assistant — « total » —, et le cas mesurerait la mauvaise branche.
    // C'est exactement ce que sa première version faisait, en rouge.
    expect(tete(PORTEES.PRIVE, { posture: null }).avant).toContain('c\'est toi qui le décides');
  });

  it('aucun montant, et aucun chiffre dans aucun de ses textes', () => {
    for (const posture of ['rien', 'total', 'detail', null]) {
      const t = tete(PORTEES.PRIVE, { posture, montant: -66.94 });
      expect(t.montant).toBeNull();
      expect(chiffresDe(t)).toEqual([]);
    }
    // Témoin : `toEqual([])` est satisfait par un relevé vide. La même sonde,
    // sur un texte qui porte un chiffre, doit en trouver.
    expect(chiffresDe({ libelle: 'x', avant: '66,94', apres: '', note: '' }).length).toBeGreaterThan(0);
  });

  it('ne promet pas que « quitter l\'onglet referme les montants » — ce n\'est pas vrai de cet écran', () => {
    expect(tete(PORTEES.PRIVE).note).not.toMatch(/onglet/i);
  });
});

describe('Un seul gabarit', () => {
  it('échappe tout ce qu\'il reçoit — un prénom est une saisie', () => {
    const t = teteDuBilan({
      portee: PORTEES.DEUX,
      solde: describeBalance(50, { vous: 'Richard', conjointe: '<img src=x onerror=alert(1)>' }),
      montant: 50,
      moi: 'vous'
    });
    const html = gabaritDeTete(t);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('pose le témoin sur ce que la tête DIT, pas sur la carte entière', () => {
    const html = gabaritDeTete(tete(PORTEES.DEUX), { temoin: 'summary-balance', suite: '<details></details>' });
    expect(html).toMatch(/class="bilan-heros-dit summary-balance/);
    expect(html).not.toMatch(/<section[^>]*summary-balance/);
    // La suite vient APRÈS le témoin, hors de lui.
    expect(html.indexOf('<details>')).toBeGreaterThan(html.indexOf('bilan-heros-dit'));
  });

  it('ne rend un montant que s\'il y en a un', () => {
    expect(gabaritDeTete(tete(PORTEES.PRIVE))).not.toContain('bilan-heros-montant');
    expect(gabaritDeTete(tete(PORTEES.SOLO))).toContain('bilan-heros-montant');
  });
});
