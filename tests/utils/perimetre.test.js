import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PERIMETRES,
  perimetreDeLaCharge,
  estSolo,
  proprietaireDuSolo,
  chargesCommunes,
  chargesSolo,
  totalDesCharges,
  perimetreEcrivable,
  totauxParPerimetre,
  listeMelangeLesPerimetres
} from '../../public/js/utils/perimetre.js';

describe('perimetreDeLaCharge — le défaut préserve l\'argent déjà en base', () => {
  // Le contrat le plus important du fichier, et le seul dont une erreur se
  // paierait immédiatement : toutes les charges écrites avant ce jour n'ont pas
  // de champ `perimetre`. Si l'absence valait « solo », le solde de tous les
  // mois passés tomberait à zéro sans un mot.
  it('une charge sans le champ est commune', () => {
    expect(perimetreDeLaCharge({ amount: 50 })).toBe(PERIMETRES.COMMUN);
  });

  it('un objet vide est commun', () => {
    expect(perimetreDeLaCharge({})).toBe(PERIMETRES.COMMUN);
  });

  it('null et undefined sont communs plutôt que de lever', () => {
    expect(perimetreDeLaCharge(null)).toBe(PERIMETRES.COMMUN);
    expect(perimetreDeLaCharge(undefined)).toBe(PERIMETRES.COMMUN);
  });

  it('seule la chaîne exacte « solo » sort du solde', () => {
    expect(perimetreDeLaCharge({ perimetre: 'solo' })).toBe(PERIMETRES.SOLO);
  });

  it.each([
    ['Solo', 'une majuscule'],
    ['SOLO', 'des capitales'],
    [' solo', 'une espace en tête'],
    ['perso', 'un synonyme'],
    ['', 'une chaîne vide'],
    [true, 'un booléen'],
    [1, 'un nombre']
  ])('« %s » (%s) reste commun', (valeur) => {
    expect(perimetreDeLaCharge({ perimetre: valeur })).toBe(PERIMETRES.COMMUN);
  });

  it('« commun » explicite est commun', () => {
    expect(perimetreDeLaCharge({ perimetre: 'commun' })).toBe(PERIMETRES.COMMUN);
  });
});

describe('proprietaireDuSolo — désigner quelqu\'un, ou personne', () => {
  it('rend le payeur quand il désigne une personne', () => {
    expect(proprietaireDuSolo({ perimetre: 'solo', paidBy: 'vous' })).toBe('vous');
    expect(proprietaireDuSolo({ perimetre: 'solo', paidBy: 'conjointe' })).toBe('conjointe');
  });

  it('rend null sur une charge commune, quel que soit son payeur', () => {
    expect(proprietaireDuSolo({ paidBy: 'vous' })).toBeNull();
    expect(proprietaireDuSolo({ perimetre: 'commun', paidBy: 'conjointe' })).toBeNull();
  });

  it.each(['partage', 'both', '', undefined, null, 'Vous'])(
    'un solo payé « %s » n\'appartient à personne plutôt qu\'à quelqu\'un au hasard',
    (paidBy) => {
      expect(proprietaireDuSolo({ perimetre: 'solo', paidBy })).toBeNull();
    }
  );

  it('mais il reste solo : un champ illisible n\'est pas une invitation à bouger le solde', () => {
    // Le même raisonnement que pour un remboursement sans `direction`. Respecter
    // le champ « solo » ne peut qu'ôter de l'argent du solde ; le réintégrer au
    // commun en ajouterait, sur la foi d'une donnée qu'on vient de juger fausse.
    expect(estSolo({ perimetre: 'solo', paidBy: 'partage' })).toBe(true);
  });
});

describe('chargesCommunes / chargesSolo — le partage des listes', () => {
  const liste = [
    { id: 'a', amount: 100 },                                          // ancienne, sans champ
    { id: 'b', amount: 50, perimetre: 'commun', paidBy: 'partage' },
    { id: 'c', amount: 30, perimetre: 'solo', paidBy: 'vous' },
    { id: 'd', amount: 20, perimetre: 'solo', paidBy: 'conjointe' },
    { id: 'e', amount: 10, perimetre: 'solo', paidBy: 'partage' }      // sans propriétaire
  ];

  it('les communes gardent les anciennes charges', () => {
    expect(chargesCommunes(liste).map(c => c.id)).toEqual(['a', 'b']);
  });

  it('les solo comprennent celle sans propriétaire', () => {
    expect(chargesSolo(liste).map(c => c.id)).toEqual(['c', 'd', 'e']);
  });

  it('les deux listes sont complémentaires et sans recouvrement', () => {
    const communes = chargesCommunes(liste).map(c => c.id);
    const solos = chargesSolo(liste).map(c => c.id);
    expect([...communes, ...solos].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(communes.filter(id => solos.includes(id))).toEqual([]);
  });

  it('filtrer par propriétaire écarte celle qui n\'en a pas', () => {
    expect(chargesSolo(liste, 'vous').map(c => c.id)).toEqual(['c']);
    expect(chargesSolo(liste, 'conjointe').map(c => c.id)).toEqual(['d']);
  });

  it('ne filtre pas les charges supprimées : c\'est un autre critère', () => {
    // Les mêler ici les rendrait invisibles l'un à l'autre — la corbeille a
    // besoin de voir une charge solo supprimée.
    const avecSupprimee = [{ amount: 5, perimetre: 'solo', paidBy: 'vous', deleted: true }];
    expect(chargesSolo(avecSupprimee)).toHaveLength(1);
  });

  it('une entrée non tableau ne lève pas', () => {
    expect(chargesCommunes(null)).toEqual([]);
    expect(chargesSolo(undefined)).toEqual([]);
    expect(chargesCommunes('pas une liste')).toEqual([]);
  });
});

describe('totalDesCharges — un montant abîmé vaut zéro, jamais NaN', () => {
  it('additionne les montants exploitables', () => {
    expect(totalDesCharges([{ amount: 10.5 }, { amount: 4.5 }])).toBe(15);
  });

  it.each([
    [undefined, 'absent'],
    [null, 'nul'],
    ['30', 'une chaîne'],
    [NaN, 'NaN'],
    [Infinity, 'infini']
  ])('un montant %s (%s) vaut zéro et ne contamine pas le total', (amount) => {
    const total = totalDesCharges([{ amount: 100 }, { amount }]);
    expect(total).toBe(100);
    expect(Number.isFinite(total)).toBe(true);
  });

  it('une liste vide vaut zéro', () => {
    expect(totalDesCharges([])).toBe(0);
    expect(totalDesCharges(null)).toBe(0);
  });
});

describe('perimetreEcrivable — le refus s\'explique avant l\'écriture', () => {
  it('accepte une dépense commune quel que soit le payeur', () => {
    for (const paidBy of ['vous', 'conjointe', 'partage', 'both']) {
      expect(perimetreEcrivable('commun', paidBy).valide).toBe(true);
    }
  });

  it('accepte un solo payé par une personne', () => {
    expect(perimetreEcrivable('solo', 'vous').valide).toBe(true);
    expect(perimetreEcrivable('solo', 'conjointe').valide).toBe(true);
  });

  it.each(['partage', 'both', '', undefined])(
    'refuse un solo payé « %s », et dit pourquoi',
    (paidBy) => {
      const verdict = perimetreEcrivable('solo', paidBy);
      expect(verdict.valide).toBe(false);
      expect(verdict.erreur).toMatch(/personne/i);
    }
  );

  it('refuse un périmètre inconnu', () => {
    expect(perimetreEcrivable('perso', 'vous').valide).toBe(false);
  });
});

describe('totauxParPerimetre — le pied de liste ne contredit pas le bilan', () => {
  const liste = [
    { amount: 900, paidBy: 'vous' },                                  // ancienne
    { amount: 315, perimetre: 'commun', paidBy: 'partage' },
    { amount: 45, perimetre: 'solo', paidBy: 'vous' },
    { amount: 35, perimetre: 'solo', paidBy: 'conjointe' },
    { amount: 999, perimetre: 'commun', paidBy: 'vous', deleted: true },
    { amount: 500, perimetre: 'solo', paidBy: 'vous', deleted: true }
  ];

  it('sépare le commun du perso', () => {
    const { commun, solo } = totauxParPerimetre(liste);
    expect(commun).toBe(1215);
    expect(solo).toBe(80);
  });

  it('écarte les charges supprimées des deux côtés', () => {
    // 999 et 500 sont à la corbeille : ni l'un ni l'autre ne doit peser.
    const { total } = totauxParPerimetre(liste);
    expect(total).toBe(1295);
  });

  it('compte les dépenses perso, pour savoir s\'il faut afficher la ligne', () => {
    expect(totauxParPerimetre(liste).nombreSolo).toBe(2);
    expect(totauxParPerimetre([{ amount: 10 }]).nombreSolo).toBe(0);
  });

  it('sans dépense perso, le total est celui d\'avant', () => {
    const { commun, solo, total } = totauxParPerimetre([{ amount: 10 }, { amount: 5 }]);
    expect(commun).toBe(15);
    expect(solo).toBe(0);
    expect(total).toBe(15);
  });

  it('une liste vide ne lève pas', () => {
    expect(totauxParPerimetre(null)).toEqual({ commun: 0, solo: 0, total: 0, nombreSolo: 0 });
  });
});

describe('listeMelangeLesPerimetres — le badge est une propriété de la LISTE', () => {
  /**
   * Le badge « perso » existait pour qu'une dépense personnelle ne se confonde
   * pas avec une charge commune au milieu des mêmes lignes. Depuis que la
   * portée filtre la liste, il paraissait très exactement là où il ne distingue
   * plus rien — vu à l'écran sur septembre 2026, sous « Moi ce mois » les trois
   * lignes le portaient TOUTES.
   *
   * Ce bloc tient la propriété qui le gouverne, et elle NE NOMME AUCUNE
   * PORTÉE : c'est ce qui l'empêche de se périmer **en vert** le jour où P3
   * filtrera « Privé ».
   */
  const commune = { amount: 120, paidBy: 'partage' };
  const mienne = { amount: 45, paidBy: 'vous', perimetre: 'solo' };
  const sienne = { amount: 30, paidBy: 'conjointe', perimetre: 'solo' };

  it('une liste MIXTE mélange — c\'est là que le badge sépare', () => {
    expect(listeMelangeLesPerimetres([commune, mienne])).toBe(true);
  });

  it('une liste TOUTE COMMUNE ne mélange pas', () => {
    // « À deux » depuis le lot P2 : le badge y est impossible.
    expect(listeMelangeLesPerimetres([commune, { amount: 60, paidBy: 'vous' }])).toBe(false);
  });

  it('une liste TOUTE PERSONNELLE ne mélange pas', () => {
    // « Moi ce mois » depuis le lot « Moi » : toutes les lignes portaient le
    // badge, donc il ne séparait rien. C'est le défaut que ce lot retire.
    expect(listeMelangeLesPerimetres([mienne, sienne])).toBe(false);
  });

  it('LE TÉMOIN — les trois régimes ne rendent PAS la même réponse', () => {
    // Sans lui, une fabrique qui répondrait toujours `false` satisferait deux
    // des trois cas ci-dessus, et une qui répondrait toujours `true` le
    // premier. C'est la règle 2 : un jeu d'essai qui ne sépare pas les deux
    // lectures ne prouve ni l'une ni l'autre.
    const reponses = [
      listeMelangeLesPerimetres([commune, mienne]),
      listeMelangeLesPerimetres([commune]),
      listeMelangeLesPerimetres([mienne])
    ];
    expect(reponses).toEqual([true, false, false]);
  });

  it('elle ignore à QUI le personnel appartient', () => {
    // Deux natures cohabitent, c'est tout ce que le badge a besoin de savoir :
    // il dit « celle-là n'est pas commune », pas « celle-là est à toi ».
    expect(listeMelangeLesPerimetres([commune, sienne])).toBe(true);
  });

  it('une SUPPRIMÉE ne fait mélanger personne', () => {
    // Elle n'est affichée nulle part. Sans cette garde, une corbeille pleine
    // ferait mélanger une liste d'une seule nature, et le badge reparaîtrait
    // sur un écran qui ne montre qu'une nature.
    expect(listeMelangeLesPerimetres([commune, { ...mienne, deleted: true }])).toBe(false);
    expect(listeMelangeLesPerimetres([mienne, { ...commune, deleted: true }])).toBe(false);
  });

  it('une liste vide, absente ou abîmée ne mélange rien', () => {
    expect(listeMelangeLesPerimetres([])).toBe(false);
    expect(listeMelangeLesPerimetres(null)).toBe(false);
    expect(listeMelangeLesPerimetres(undefined)).toBe(false);
    expect(listeMelangeLesPerimetres([null, undefined])).toBe(false);
  });

  it('elle ne nomme AUCUNE portée — la garde qui l\'empêche de se périmer', () => {
    // La propriété du fichier, pas de la fonction : `perimetre.js` ne doit rien
    // savoir des portées. Une liste de portées écrite ici serait juste
    // aujourd'hui et fausse le jour où P3 filtre « Privé » — et elle se
    // périmerait EN VERT.
    //
    // La garde lit la SOURCE, ce qui est faible en général (règle 1) ; ici
    // c'est légitime, parce que la propriété tenue est une ABSENCE, et qu'une
    // absence ne se mesure pas par le comportement.
    const source = readFileSync(
      fileURLToPath(new URL('../../public/js/utils/perimetre.js', import.meta.url)), 'utf-8'
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    expect(code, 'témoin : le fichier a bien été lu et dépouillé').toContain('listeMelangeLesPerimetres');
    for (const mot of ['portee', 'porteeCourante', 'PORTEES', 'prive', 'deux']) {
      expect(code.toLowerCase(), `« ${mot} » n'a rien à faire dans perimetre.js`)
        .not.toContain(mot.toLowerCase());
    }
  });
});
