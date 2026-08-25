import { describe, it, expect } from 'vitest';
import {
  normalizeMembers, memberLabel, describeBalance, directionLabel,
  validateMemberName, MAX_LONGUEUR_PRENOM,
  emplacementDuCompte, normaliserEmplacement
} from '../../public/js/utils/members.js';
import { EMPLACEMENTS_PAR_COMPTE, ALLOWED_EMAILS } from '../../public/js/config.js';
import { REIMBURSEMENT_DIRECTIONS } from '../../public/js/config.js';

/**
 * Les données du foyer forment un enregistrement unique à emplacements fixes,
 * `vous` et `conjointe`, que les deux comptes lisent. L'écran affichait
 * pourtant « Votre salaire » : juste pour l'un, faux pour l'autre.
 *
 * Les prénoms lèvent l'ambiguïté sans toucher au stockage — `vous` et
 * `conjointe` restent des identifiants.
 */

const MEMBRES = { vous: 'Richard', conjointe: 'Cindy' };

describe('Normalisation des prénoms', () => {
  it('reprend les prénoms renseignés', () => {
    expect(normalizeMembers(MEMBRES)).toEqual({ vous: 'Richard', conjointe: 'Cindy' });
  });

  it('retombe sur les libellés d\'origine quand rien n\'est renseigné', () => {
    // Rétrocompatibilité : les données antérieures n'ont pas de prénoms.
    expect(normalizeMembers(null)).toEqual({ vous: 'Vous', conjointe: 'Conjointe' });
    expect(normalizeMembers({})).toEqual({ vous: 'Vous', conjointe: 'Conjointe' });
    expect(normalizeMembers('texte')).toEqual({ vous: 'Vous', conjointe: 'Conjointe' });
  });

  it('un prénom vide ou blanc rétablit le défaut', () => {
    expect(normalizeMembers({ vous: '', conjointe: '   ' }))
      .toEqual({ vous: 'Vous', conjointe: 'Conjointe' });
  });

  it('les espaces de bordure sont retirés', () => {
    expect(normalizeMembers({ vous: '  Richard  ', conjointe: 'Cindy ' }))
      .toEqual({ vous: 'Richard', conjointe: 'Cindy' });
  });

  it('un prénom trop long est tronqué plutôt que refusé à la lecture', () => {
    // La donnée est déjà en base : la refuser laisserait l'écran sans libellé.
    const long = 'a'.repeat(MAX_LONGUEUR_PRENOM + 20);
    expect(normalizeMembers({ vous: long }).vous).toHaveLength(MAX_LONGUEUR_PRENOM);
  });

  it('une valeur non textuelle retombe sur le défaut', () => {
    expect(normalizeMembers({ vous: 42, conjointe: null }))
      .toEqual({ vous: 'Vous', conjointe: 'Conjointe' });
  });
});

describe('Libellé d\'un emplacement', () => {
  it('rend le prénom correspondant', () => {
    expect(memberLabel('vous', MEMBRES)).toBe('Richard');
    expect(memberLabel('conjointe', MEMBRES)).toBe('Cindy');
  });

  it('« partagé » ne désigne personne et reste tel quel', () => {
    expect(memberLabel('partage', MEMBRES)).toBe('Partagé');
    expect(memberLabel('joint', MEMBRES)).toBe('Partagé');
  });

  it('sans prénoms, les libellés d\'origine sont conservés', () => {
    expect(memberLabel('vous', null)).toBe('Vous');
    expect(memberLabel('conjointe', null)).toBe('Conjointe');
  });

  it('une clé inconnue est rendue sans invention', () => {
    expect(memberLabel('autre', MEMBRES)).toBe('autre');
    expect(memberLabel('', MEMBRES)).toBe('Inconnu');
  });
});

describe('Phrase du solde', () => {
  it('nomme les deux personnes plutôt qu\'un « vous » relatif', () => {
    // « Conjointe vous doit » désignait un « vous » dépendant du compte
    // connecté : la phrase disait le contraire à l'une des deux personnes.
    expect(describeBalance(500, MEMBRES).texte).toBe('Cindy doit à Richard');
    expect(describeBalance(-500, MEMBRES).texte).toBe('Richard doit à Cindy');
  });

  it('désigne débiteur et créditeur', () => {
    const positif = describeBalance(500, MEMBRES);
    expect(positif.debiteur).toBe('Cindy');
    expect(positif.crediteur).toBe('Richard');

    const negatif = describeBalance(-500, MEMBRES);
    expect(negatif.debiteur).toBe('Richard');
    expect(negatif.crediteur).toBe('Cindy');
  });

  it('un solde nul ne désigne personne', () => {
    const nul = describeBalance(0, MEMBRES);
    expect(nul.texte).toBe('Comptes équilibrés');
    expect(nul.debiteur).toBeNull();
    expect(nul.crediteur).toBeNull();
  });

  it("sans prénoms, les formulations d'origine sont conservées", () => {
    // « Vous doit » serait agrammatical, et « Conjointe doit à Vous » plus
    // lourd que la tournure d'origine. La conjugaison suit le sujet.
    expect(describeBalance(500, null).texte).toBe('Conjointe vous doit');
    expect(describeBalance(-500, null).texte).toBe('Vous devez à Conjointe');
  });

  it("le montant s'insère entre préfixe et suffixe", () => {
    const nomme = describeBalance(500, MEMBRES);
    expect(nomme.prefixe).toBe('Cindy doit');
    expect(nomme.suffixe).toBe('à Richard');

    const defaut = describeBalance(500, null);
    expect(defaut.prefixe).toBe('Conjointe vous doit');
    expect(defaut.suffixe).toBe('');
  });

  it('un seul prénom renseigné suffit à basculer sur la forme nommée', () => {
    // Mélanger « Richard doit » et « à Conjointe » reste correct ; garder
    // « Conjointe vous doit » alors que l'autre est nommé ne le serait pas.
    const partiel = describeBalance(-500, { vous: 'Richard' });
    expect(partiel.texte).toBe('Richard doit à Conjointe');
  });
});

describe('Sens d\'un remboursement', () => {
  const VERS_PARTENAIRE = REIMBURSEMENT_DIRECTIONS.YOU_TO_PARTNER;

  it('rend le sens avec les prénoms', () => {
    expect(directionLabel(VERS_PARTENAIRE, MEMBRES, VERS_PARTENAIRE)).toBe('Richard → Cindy');
    expect(directionLabel(REIMBURSEMENT_DIRECTIONS.PARTNER_TO_YOU, MEMBRES, VERS_PARTENAIRE))
      .toBe('Cindy → Richard');
  });

  it('sans prénoms, le sens reste lisible', () => {
    expect(directionLabel(VERS_PARTENAIRE, null, VERS_PARTENAIRE)).toBe('Vous → Conjointe');
  });
});

describe('Validation d\'un prénom saisi', () => {
  it('accepte un prénom courant', () => {
    expect(validateMemberName('Richard').valid).toBe(true);
  });

  it('accepte un prénom vide : il rétablit le libellé par défaut', () => {
    expect(validateMemberName('').valid).toBe(true);
    expect(validateMemberName('   ').valid).toBe(true);
  });

  it('accepte accents, traits d\'union et apostrophes', () => {
    for (const prenom of ['Cédric', 'Anne-Marie', "N'Golo", 'José']) {
      expect(validateMemberName(prenom).valid, prenom).toBe(true);
    }
  });

  it('refuse au-delà de la longueur maximale', () => {
    const r = validateMemberName('a'.repeat(MAX_LONGUEUR_PRENOM + 1));
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/30 caractères/);
  });

  it('accepte exactement la longueur maximale', () => {
    expect(validateMemberName('a'.repeat(MAX_LONGUEUR_PRENOM)).valid).toBe(true);
  });

  it('refuse une valeur non textuelle', () => {
    expect(validateMemberName(null).valid).toBe(false);
    expect(validateMemberName(42).valid).toBe(false);
  });
});

/**
 * Qui tient le téléphone
 *
 * L'application connaissait l'adresse du compte connecté et ne s'en servait
 * jamais pour cela : la saisie rapide proposait `vous` en dur, à chaque
 * ouverture, quel que soit l'appareil. Sur le second téléphone, chaque dépense
 * expédiée en trois gestes était donc attribuée à l'autre — et le solde, la
 * seule chose que cette application calcule, s'en trouvait faussé sans le
 * moindre signal.
 */
describe('Emplacement du compte connecté', () => {
  const TABLE = { 'a@exemple.fr': 'vous', 'b@exemple.fr': 'conjointe' };

  it('rend l\'emplacement de chaque adresse connue', () => {
    expect(emplacementDuCompte('a@exemple.fr', TABLE)).toBe('vous');
    expect(emplacementDuCompte('b@exemple.fr', TABLE)).toBe('conjointe');
  });

  it('ignore la casse et les espaces', () => {
    // Une adresse se saisit comme elle se prononce : la table serait
    // silencieusement inopérante si « B@Exemple.fr » n'y correspondait pas.
    expect(emplacementDuCompte('  B@Exemple.FR ', TABLE)).toBe('conjointe');
  });

  it('retombe sur le comportement d\'avant pour une adresse inconnue', () => {
    // Un compte absent de la table garde une application utilisable.
    expect(emplacementDuCompte('inconnu@exemple.fr', TABLE)).toBe('vous');
  });

  it('ne lève sur aucune entrée inexploitable', () => {
    expect(emplacementDuCompte(null, TABLE)).toBe('vous');
    expect(emplacementDuCompte('a@exemple.fr', null)).toBe('vous');
    expect(emplacementDuCompte('', TABLE)).toBe('vous');
    expect(emplacementDuCompte('a@exemple.fr', { 'a@exemple.fr': 'fantaisie' })).toBe('vous');
  });

  it('range les deux comptes du foyer à des emplacements distincts', () => {
    // C'est tout l'objet du correctif : si les deux adresses tombaient au même
    // endroit, le second téléphone continuerait d'attribuer à l'autre.
    const foyer = ALLOWED_EMAILS
      .filter(adresse => adresse in EMPLACEMENTS_PAR_COMPTE)
      .map(adresse => emplacementDuCompte(adresse, EMPLACEMENTS_PAR_COMPTE));

    expect(foyer, 'les comptes du foyer ne sont pas déclarés').toContain('vous');
    expect(foyer, 'aucun compte n\'occupe l\'emplacement conjointe').toContain('conjointe');
  });

  it('toute adresse déclarée est autorisée', () => {
    // Une entrée qui ne serait pas dans la liste blanche ne désignerait
    // personne, et masquerait une faute de frappe.
    for (const adresse of Object.keys(EMPLACEMENTS_PAR_COMPTE)) {
      expect(ALLOWED_EMAILS, `${adresse} n'est pas un compte autorisé`).toContain(adresse);
    }
  });
});

describe('Normalisation d\'un emplacement', () => {
  it('ne retient que les deux clés de stockage', () => {
    expect(normaliserEmplacement('conjointe')).toBe('conjointe');
    expect(normaliserEmplacement('vous')).toBe('vous');
  });

  it('retombe sur « vous » pour tout le reste', () => {
    // État pas encore renseigné, lecture ratée : mieux vaut le comportement
    // d'avant qu'une valeur qu'un `<select>` ignorerait en silence.
    expect(normaliserEmplacement(undefined)).toBe('vous');
    expect(normaliserEmplacement('partage')).toBe('vous');
  });
});
