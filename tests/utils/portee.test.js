import { describe, it, expect } from 'vitest';
import {
  PORTEES,
  PORTEE_PAR_DEFAUT,
  porteeValide,
  porteeRetenue,
  panneauPorteLaPortee,
  porteeDuPanneau,
  porteeApresChangementDeMois,
  porteeRappelleLeSolde,
  porteeMontreLeFoyer,
  chargesDeLaPortee,
  porteeFiltreLaListe,
  renvoiDeLaPortee,
  libelleDeLaPortee,
  LIBELLES_DE_PORTEE,
  NATURES_DE_RENVOI
} from '../../public/js/utils/portee.js';

/**
 * La barre collante rappelle le solde sur « À deux » et « Moi », jamais sur
 * « Privé » — vu à l'écran par le foyer, le 2026-09-11. La preuve de câblage
 * est dans `tests/e2e/barre-par-portee.spec.js`, rouge avant le correctif.
 */
describe('La barre collante suit la portée', () => {
  it('« À deux » et « Moi » rappellent le solde commun', () => {
    expect(porteeRappelleLeSolde(PORTEES.DEUX)).toBe(true);
    expect(porteeRappelleLeSolde(PORTEES.SOLO)).toBe(true);
  });

  it('« Privé » ne le rappelle jamais', () => {
    expect(porteeRappelleLeSolde(PORTEES.PRIVE)).toBe(false);
  });

  it('une valeur inconnue suit le repli : la dette ne disparaît pas par accident', () => {
    expect(porteeRappelleLeSolde('inconnue')).toBe(true);
    expect(porteeRappelleLeSolde(undefined)).toBe(true);
  });
});

/**
 * La portée gouverne TOUT le panneau Bilan — décision du foyer, 2026-09-11.
 *
 * « Moi ce mois » veut dire « cet écran parle de moi ». Sous une portée
 * personnelle, aucune carte du bilan n'affiche de chiffre du foyer. La règle
 * se déclare ici ; le panneau la lit, et `portee-du-panneau.spec.js` la tient
 * sur la page, sans nommer aucune carte.
 */
describe('Le panneau Bilan ne montre le foyer que sur « À deux »', () => {
  it('« À deux » montre le foyer', () => {
    expect(porteeMontreLeFoyer(PORTEES.DEUX)).toBe(true);
  });

  it('« Moi » et « Privé » ne le montrent jamais', () => {
    expect(porteeMontreLeFoyer(PORTEES.SOLO)).toBe(false);
    expect(porteeMontreLeFoyer(PORTEES.PRIVE)).toBe(false);
  });

  it('une valeur inconnue suit le repli — l\'écran s\'ouvre alors sur « À deux », les cartes le suivent', () => {
    expect(porteeMontreLeFoyer('inconnue')).toBe(true);
    expect(porteeMontreLeFoyer(undefined)).toBe(true);
  });
});

/**
 * La propriété centrale de ce module n'est pas « les trois portées existent ».
 *
 * C'est **« Réglages n'a pas de portée »** — la contrainte d'implémentation
 * écrite dans `design/github.md`, celle qui fait de la portée un état INTERNE à
 * deux panneaux plutôt qu'une quatrième destination. C'est elle qui doit tomber
 * si quelqu'un la défait, et c'est autour d'elle que ce fichier est construit.
 *
 * ─────────────────────────────────────────────────────────────────────
 * POURQUOI LES IDENTIFIANTS SONT ÉCRITS ICI, À LA MAIN
 *
 * `PANNEAUX_AVEC_PORTEE` n'est pas exportée, et ce fichier ne cherche pas à la
 * lire. Un test qui importerait la liste pour constater que `panneauReglages`
 * n'y figure pas relirait la SOURCE au lieu de mesurer l'EFFET : il survivrait
 * à la suppression du bloc qui s'en sert, et tomberait sur un renommage sans
 * conséquence. Les trois identifiants sont donc nommés ici, et le contrôle
 * passe par les fonctions.
 *
 * Ce qu'il ne couvre pas, et c'est dit plutôt que sous-entendu : que le DOM de
 * `panneauReglages` ne porte réellement aucun sélecteur. Ce module est pur, il
 * ne voit pas de DOM. Cette moitié-là appartient au lot qui rendra la surface.
 */

/** Les trois panneaux, nommés ici et non importés. */
const BILAN = 'panneauBilan';
const CHARGES = 'panneauCharges';
const REGLAGES = 'panneauReglages';

describe('Réglages n\'a pas de portée', () => {
  it('le dit par `panneauPorteLaPortee`', () => {
    expect(panneauPorteLaPortee(REGLAGES)).toBe(false);
  });

  it('et le tient même quand une portée est demandée pour lui', () => {
    // Le cas qui compte : quelqu'un a bien une portée en main et la présente à
    // Réglages. La réponse doit rester « ce panneau n'en a pas ».
    for (const portee of Object.values(PORTEES)) {
      expect(porteeDuPanneau(REGLAGES, portee), `portée ${portee}`).toBeNull();
    }
  });

  it('TÉMOIN POSITIF — les deux autres panneaux, eux, en portent une', () => {
    // Sans ce cas, un module qui rendrait `null` pour TOUT identifiant
    // satisferait les deux contrôles ci-dessus sans rien mesurer.
    expect(panneauPorteLaPortee(BILAN)).toBe(true);
    expect(panneauPorteLaPortee(CHARGES)).toBe(true);
    expect(porteeDuPanneau(BILAN, PORTEES.SOLO)).toBe(PORTEES.SOLO);
    expect(porteeDuPanneau(CHARGES, PORTEES.PRIVE)).toBe(PORTEES.PRIVE);
  });

  it('un panneau inconnu n\'en porte pas non plus', () => {
    // On n'invente pas une portée pour une surface qu'on ne connaît pas.
    expect(panneauPorteLaPortee('panneauInconnu')).toBe(false);
    expect(panneauPorteLaPortee('')).toBe(false);
    expect(panneauPorteLaPortee(undefined)).toBe(false);
    expect(porteeDuPanneau('panneauInconnu', PORTEES.SOLO)).toBeNull();
  });

  it('`null` et « à deux » ne se confondent pas', () => {
    // « ce panneau n'a pas de portée » et « ce panneau est en portée À deux »
    // sont deux états différents : les confondre ferait peindre un segment
    // actif sur un écran qui n'a pas de segments.
    expect(porteeDuPanneau(REGLAGES, PORTEES.DEUX)).toBeNull();
    expect(porteeDuPanneau(BILAN, PORTEES.DEUX)).toBe(PORTEES.DEUX);
  });
});

describe('Les trois portées', () => {
  it('sont exactement trois', () => {
    expect(Object.values(PORTEES)).toEqual(['deux', 'solo', 'prive']);
  });

  it('sont les seules valides', () => {
    for (const portee of Object.values(PORTEES)) {
      expect(porteeValide(portee), portee).toBe(true);
    }
    for (const autre of ['commun', 'Deux', 'DEUX', '', null, undefined, 0, {}, ['solo']]) {
      expect(porteeValide(autre), String(autre)).toBe(false);
    }
  });

  it('« commun » n\'en est pas une, et c\'est voulu', () => {
    // `utils/perimetre.js` classe une CHARGE en `commun` / `solo`. Ce module
    // choisit une VUE. Les deux vocabulaires sont séparés parce que les objets
    // le sont, et une valeur qui passerait de l'un à l'autre serait un pont
    // qu'on n'a pas voulu.
    expect(porteeValide('commun')).toBe(false);
    expect(porteeRetenue('commun')).toBe(PORTEES.DEUX);
  });
});

describe('Le repli', () => {
  it('va vers « à deux », jamais vers « privé »', () => {
    // La seule des trois dont l'ouverture par accident coûte quelque chose.
    for (const douteuse of [undefined, null, '', 'prive ', 'PRIVE', 'nimportequoi', 42]) {
      expect(porteeRetenue(douteuse), String(douteuse)).toBe(PORTEES.DEUX);
    }
  });

  it('laisse passer une portée valide sans la toucher', () => {
    // Le témoin du cas ci-dessus : une fonction qui rendrait TOUJOURS « deux »
    // le satisferait entièrement.
    expect(porteeRetenue(PORTEES.SOLO)).toBe(PORTEES.SOLO);
    expect(porteeRetenue(PORTEES.PRIVE)).toBe(PORTEES.PRIVE);
  });

  it('et le défaut est bien « à deux »', () => {
    expect(PORTEE_PAR_DEFAUT).toBe(PORTEES.DEUX);
  });
});

describe('Au changement de mois, la portée persiste', () => {
  /**
   * DÉCISION, pas comportement accidentel.
   *
   * Regarder son solo en septembre, reculer d'un mois pour le comparer à août,
   * revenir : c'est un seul geste. Le ramener trois fois à « À deux » ferait
   * payer la comparaison. Même raisonnement que la position de défilement
   * retenue d'un panneau à l'autre dans `onglets.js`.
   *
   * Ces cas existent pour qu'un futur « on réinitialise à chaque mois » soit un
   * ROUGE, et non un changement silencieux.
   */
  it('« solo » reste « solo » d\'un mois à l\'autre', () => {
    expect(porteeApresChangementDeMois(PORTEES.SOLO)).toBe(PORTEES.SOLO);
  });

  it('« privé » aussi — c\'est un point de vue, pas un dévoilement', () => {
    // La décision porte sur la PORTÉE. Le dévoilement des montants se referme
    // de son côté, et il n'a pas à suivre la même règle.
    expect(porteeApresChangementDeMois(PORTEES.PRIVE)).toBe(PORTEES.PRIVE);
  });

  it('mais une portée absente ou douteuse retombe sur « à deux »', () => {
    expect(porteeApresChangementDeMois(undefined)).toBe(PORTEES.DEUX);
    expect(porteeApresChangementDeMois('nimportequoi')).toBe(PORTEES.DEUX);
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LE FILTRE LIT LE PÉRIMÈTRE, JAMAIS LE PAYEUR
 *
 * C'est le seul défaut de ce lot qui coûterait des euros. Une charge payée par
 * une personne **et partagée** est COMMUNE — `paidBy` dit qui a AVANCÉ
 * l'argent, jamais à qui la dépense APPARTIENT. Un filtre écrit de mémoire la
 * retirerait de la liste du foyer, en silence, pendant que le solde
 * continuerait de la compter.
 *
 * Le jeu d'essai porte les QUATRE couples. Sans les quatre il ne sépare pas les
 * deux lectures : sur un jeu où tout solo est payé par « vous » et tout commun
 * par « conjointe », un filtre sur le payeur rend exactement le même résultat
 * qu'un filtre sur le périmètre.
 */

/** Les quatre couples payeur × périmètre, nommés */
const QUATRE = {
  vousPartagee: { id: 'vp', description: 'Loyer', amount: 900, paidBy: 'vous' },
  vousSolo: {
    id: 'vs', description: 'Coiffeur', amount: 45, paidBy: 'vous', perimetre: 'solo'
  },
  conjointePartagee: {
    id: 'cp', description: 'Courses', amount: 60, paidBy: 'conjointe'
  },
  conjointeSolo: {
    id: 'cs', description: 'Yoga', amount: 30, paidBy: 'conjointe', perimetre: 'solo'
  }
};

const LES_QUATRE = Object.values(QUATRE);
const identifiants = (charges) => charges.map(charge => charge.id).sort();

describe('Ce que « À deux » montre de la liste', () => {
  it('garde les deux PARTAGÉES, quel que soit leur payeur', () => {
    expect(identifiants(chargesDeLaPortee(LES_QUATRE, PORTEES.DEUX)))
      .toEqual(['cp', 'vp']);
  });

  it('LE CAS QUI COÛTERAIT DES EUROS — une partagée payée par une personne RESTE', () => {
    // Un filtre sur le payeur la retirerait : elle est payée par « vous », donc
    // elle « a l'air » personnelle. Elle pèse pourtant sur le solde, et le
    // solde continuerait de la compter — une liste du foyer amputée d'une
    // dépense réelle, sans un mot.
    expect(chargesDeLaPortee([QUATRE.vousPartagee], PORTEES.DEUX))
      .toEqual([QUATRE.vousPartagee]);
  });

  it('retire les deux SOLO, quel que soit leur payeur', () => {
    const vues = identifiants(chargesDeLaPortee(LES_QUATRE, PORTEES.DEUX));
    expect(vues).not.toContain('vs');
    expect(vues).not.toContain('cs');
  });

  it('LE TÉMOIN — le jeu d\'essai SÉPARE bien les deux lectures', () => {
    // Sans lui, les trois cas ci-dessus seraient satisfaits par un filtre sur
    // le payeur : il faut que chaque payeur porte les deux périmètres, et que
    // chaque périmètre porte les deux payeurs.
    const parPayeur = new Map();
    for (const charge of LES_QUATRE) {
      const perimetres = parPayeur.get(charge.paidBy) || new Set();
      perimetres.add(charge.perimetre || 'commun');
      parPayeur.set(charge.paidBy, perimetres);
    }

    expect([...parPayeur.keys()].sort()).toEqual(['conjointe', 'vous']);
    for (const perimetres of parPayeur.values()) {
      expect([...perimetres].sort()).toEqual(['commun', 'solo']);
    }
  });

  it('un montant illisible ou une entrée abîmée ne fait pas tomber le filtre', () => {
    expect(chargesDeLaPortee([{ amount: 'beaucoup' }], PORTEES.DEUX)).toHaveLength(1);
    expect(chargesDeLaPortee(null, PORTEES.DEUX)).toEqual([]);
    expect(chargesDeLaPortee(undefined, PORTEES.DEUX)).toEqual([]);
  });
});

describe('Ce que « Moi ce mois » montre de la liste', () => {
  /**
   * ⚠️ CE BLOC TENAIT LA DÉCISION INVERSE, ET ELLE ÉTAIT JUSTE.
   *
   * P2 avait laissé « Moi » non filtrée, délibérément : sa cible était « le
   * personnel seul, la part du commun en carte agrégée », et la carte
   * n'existait pas. Filtrer sans elle aurait donné un écran dont le héros
   * soustrait une part du commun que rien ne montre.
   *
   * La prémisse était FAUSSE, et c'est la mesure qui l'a dit : `suiteDeMoi`
   * (`summary.js`) affiche déjà « Ta part du commun » textuellement, sous le
   * héros, dans un grand-livre ouvert en permanence — décision prise avec son
   * prix chiffré. La carte a donc été abandonnée, et le filtre n'attend plus
   * rien.
   *
   * Les cas ne sont pas supprimés : ils changent de propriété. C'est le même
   * jeu d'essai, retourné.
   */
  it('rend MON personnel, et lui seul', () => {
    expect(identifiants(chargesDeLaPortee(LES_QUATRE, PORTEES.SOLO, 'vous')))
      .toEqual(['vs']);
  });

  it('LE CAS QUI COÛTERAIT DES EUROS, dans l\'autre sens — une partagée payée par MOI ne vient PAS', () => {
    // Le symétrique exact du cas d'« À deux » : un filtre sur le payeur
    // ramènerait « vp » sous « Moi », parce qu'elle est payée par « vous ».
    // Elle est COMMUNE — elle pèse sur le solde des deux — et l'afficher sur
    // l'écran « moi » contredirait le grand-livre juste au-dessus, qui la
    // compte dans « Ta part du commun » et non dans « Tes dépenses solo ».
    const vues = identifiants(chargesDeLaPortee(LES_QUATRE, PORTEES.SOLO, 'vous'));
    expect(vues).not.toContain('vp');
    expect(vues).not.toContain('cp');
  });

  it('ET JAMAIS LE PERSONNEL DE L\'AUTRE — c\'est MON écran', () => {
    // Depuis P1b, `poches.js` fusionne dans l'état le personnel de l'autre
    // quand un aval le rend lisible. « cs » est sa dépense à elle.
    expect(identifiants(chargesDeLaPortee(LES_QUATRE, PORTEES.SOLO, 'vous')))
      .not.toContain('cs');
  });

  it('et il change de côté pour l\'autre compte', () => {
    // Le cas symétrique, sur le MÊME jeu d'essai : c'est lui qui prouve que le
    // filtre lit `moi` et non un nom en dur.
    expect(identifiants(chargesDeLaPortee(LES_QUATRE, PORTEES.SOLO, 'conjointe')))
      .toEqual(['cs']);
  });

  it('SANS `moi` LISIBLE, LA LISTE EST VIDE — jamais celle de tout le monde', () => {
    // `chargesSolo(liste)` sans propriétaire rend TOUT le personnel lisible :
    // c'est la fuite qu'un oubli d'argument produirait. Entre un défaut qu'on
    // voit — trois dépenses et aucune à l'écran — et une fuite que personne ne
    // voit, on prend le visible.
    for (const inconnu of [undefined, null, '', 'partage', 'bidon']) {
      expect(chargesDeLaPortee(LES_QUATRE, PORTEES.SOLO, inconnu),
        `« ${String(inconnu)} » ne désigne personne : la liste doit être vide`)
        .toEqual([]);
    }
  });

  it('« Privé » ne filtre toujours pas — son écran appartient à P3', () => {
    expect(identifiants(chargesDeLaPortee(LES_QUATRE, PORTEES.PRIVE, 'vous')))
      .toEqual(['cp', 'cs', 'vp', 'vs']);
    expect(chargesDeLaPortee(LES_QUATRE, PORTEES.PRIVE, 'vous')).toBe(LES_QUATRE);
  });

  it('et une valeur inconnue suit le repli « À deux » — donc elle FILTRE', () => {
    // Le repli montre le commun : c'est toujours un comportement juste, et
    // c'est celui qui ne révèle rien du personnel par accident.
    expect(identifiants(chargesDeLaPortee(LES_QUATRE, 'inventée', 'vous')))
      .toEqual(['cp', 'vp']);
    expect(porteeFiltreLaListe(undefined)).toBe(true);
  });

  it('`porteeFiltreLaListe` le déclare, portée par portée', () => {
    expect(porteeFiltreLaListe(PORTEES.DEUX)).toBe(true);
    expect(porteeFiltreLaListe(PORTEES.SOLO)).toBe(true);
    expect(porteeFiltreLaListe(PORTEES.PRIVE)).toBe(false);
  });

  it('LE TÉMOIN — les deux portées qui filtrent ne rendent PAS la même chose', () => {
    // Sans lui, un filtre unique branché sur les deux portées satisferait tous
    // les cas ci-dessus qui portent sur une absence. C'est la garde qui dit que
    // la table des comportements a bien DEUX valeurs distinctes.
    const sousDeux = identifiants(chargesDeLaPortee(LES_QUATRE, PORTEES.DEUX, 'vous'));
    const sousMoi = identifiants(chargesDeLaPortee(LES_QUATRE, PORTEES.SOLO, 'vous'));

    expect(sousDeux).not.toEqual(sousMoi);
    expect(sousDeux.filter(id => sousMoi.includes(id)),
      'aucune charge ne peut être à la fois commune et personnelle')
      .toEqual([]);
  });

  it('une entrée abîmée ne fait pas tomber le filtre personnel', () => {
    expect(chargesDeLaPortee([{ amount: 'beaucoup' }], PORTEES.SOLO, 'vous')).toEqual([]);
    expect(chargesDeLaPortee(null, PORTEES.SOLO, 'vous')).toEqual([]);
  });
});

describe('Le renvoi, nature 1 : ce que « À deux » masque de MES dépenses', () => {
  it('compte mes seules dépenses personnelles, et leur total', () => {
    const renvoi = renvoiDeLaPortee(LES_QUATRE, PORTEES.DEUX, 'vous');

    expect(renvoi.nature).toBe(NATURES_DE_RENVOI.MON_PERSONNEL);
    expect(renvoi.nombre).toBe(1);
    expect(renvoi.total).toBe(45);
    expect(renvoi.libelle).toBe('Moi ce mois');
    expect(renvoi.versLaPortee).toBe(PORTEES.SOLO);
  });

  it('JAMAIS celles de l\'autre — elles appartiennent à la fenêtre de P3', () => {
    // Sous un aval actif, la liste du foyer porte aussi son personnel. Le
    // filtre le retire, et il n'a PAS de renvoi : « Moi ce mois » est MON
    // écran. C'est un trou de P3, consigné et non comblé ici.
    const renvoi = renvoiDeLaPortee(LES_QUATRE, PORTEES.DEUX, 'vous');

    expect(renvoi.total).toBe(45);
    expect(renvoi.total).not.toBe(75);
  });

  it('et il change de côté pour l\'autre compte', () => {
    // Le cas symétrique, sur le MÊME jeu d'essai : c'est lui qui prouve que le
    // compte lit `moi` et non un nom en dur.
    const renvoi = renvoiDeLaPortee(LES_QUATRE, PORTEES.DEUX, 'conjointe');

    expect(renvoi.nombre).toBe(1);
    expect(renvoi.total).toBe(30);
  });

  it('rien à annoncer sur une portée qui ne filtre pas', () => {
    // ⚠️ CE CAS LISAIT `nombre`, ET IL EST RESTÉ VERT APRÈS LE LOT — pour une
    // raison qui n'avait plus rien à voir avec ce qu'il prétendait tenir.
    //
    // Il couvrait « Moi » et « Privé » ensemble, du temps où ni l'une ni
    // l'autre ne filtrait. « Moi » filtre depuis ce lot, et son renvoi porte
    // `nombre: 0` par décision — aucun chiffre. L'assertion passait donc sur un
    // renvoi BIEN PRÉSENT, de nature différente : le contrôle mesurait un zéro
    // qui ne voulait plus dire « rien à annoncer ».
    //
    // C'est la nature qui dit « rien », et elle seule. `Privé` reste la seule
    // portée sans filtre, donc le seul cas de ce titre.
    const renvoi = renvoiDeLaPortee(LES_QUATRE, PORTEES.PRIVE, 'vous');

    expect(renvoi.nature).toBe(NATURES_DE_RENVOI.AUCUNE);
    expect(renvoi.nombre).toBe(0);
  });

  it('rien à annoncer quand aucune dépense n\'est personnelle', () => {
    // Le cas NOMINAL de la plupart des mois : pas de renvoi, pas de bruit.
    expect(renvoiDeLaPortee(
      [QUATRE.vousPartagee, QUATRE.conjointePartagee], PORTEES.DEUX, 'vous'
    ).nature).toBe(NATURES_DE_RENVOI.AUCUNE);
  });

  it('une dépense personnelle SUPPRIMÉE ne s\'annonce pas', () => {
    // Elle n'est nulle part : ni dans la liste, ni sous « Moi ce mois ». Un
    // renvoi qui la compterait enverrait chercher ce qui n'existe plus.
    expect(renvoiDeLaPortee(
      [{ ...QUATRE.vousSolo, deleted: true }], PORTEES.DEUX, 'vous'
    ).nature).toBe(NATURES_DE_RENVOI.AUCUNE);
  });

  it('une solo sans propriétaire établi n\'est comptée pour personne', () => {
    // `perimetre.js` : une solo dont le payeur ne désigne personne vaut
    // `null`. L'attribuer à qui regarde serait désigner quelqu'un au hasard.
    const orpheline = { id: 'o', amount: 12, paidBy: 'partage', perimetre: 'solo' };

    expect(renvoiDeLaPortee([orpheline], PORTEES.DEUX, 'vous').nature)
      .toBe(NATURES_DE_RENVOI.AUCUNE);
    expect(renvoiDeLaPortee([orpheline], PORTEES.DEUX, 'conjointe').nature)
      .toBe(NATURES_DE_RENVOI.AUCUNE);
    // Mais elle est bien RETIRÉE de la liste : le filtre lit le périmètre.
    expect(chargesDeLaPortee([orpheline], PORTEES.DEUX)).toEqual([]);
  });
});

describe('Le renvoi, nature 2 : ce que « Moi » masque du COMMUN', () => {
  /**
   * LE PIÈGE QUE CE BLOC EXISTE POUR FERMER.
   *
   * `renvoiDeLaPortee` s'ouvre sur `porteeFiltreLaListe`. Inscrire « Moi » dans
   * la table des filtres allume donc le renvoi tout seul, et le renvoi de P2
   * aurait annoncé « 3 dépenses perso (45,00 €) — rangées dans "Moi ce mois" »
   * **sur l'écran « Moi ce mois »** : un compte de ce qui est AFFICHÉ, et une
   * destination qui est l'écran où l'on se trouve.
   *
   * Il fallait donc une seconde NATURE, et c'est la nature — jamais un compte —
   * qui décide de ce que l'écran dit.
   */
  it('nomme « À deux », et non l\'écran où l\'on est', () => {
    const renvoi = renvoiDeLaPortee(LES_QUATRE, PORTEES.SOLO, 'vous');

    expect(renvoi.nature).toBe(NATURES_DE_RENVOI.LE_COMMUN);
    expect(renvoi.versLaPortee).toBe(PORTEES.DEUX);
    expect(renvoi.libelle).toBe('À deux');
  });

  it('NE PORTE AUCUN CHIFFRE, et la donnée elle-même est à zéro', () => {
    // Le montant de ma part du commun est déjà à l'écran, dans le grand-livre
    // de « Moi », deux cartes plus haut. Ce qui manquait n'était pas un
    // chiffre, c'était une ADRESSE.
    //
    // Et la décision est dans la DONNÉE, pas seulement dans la rédaction qui la
    // lit : ce qu'on ne calcule pas ne peut pas s'afficher par accident. Le
    // total du commun vaut 960 € sur ce jeu d'essai — il ne doit apparaître
    // nulle part dans le renvoi.
    const renvoi = renvoiDeLaPortee(LES_QUATRE, PORTEES.SOLO, 'vous');

    expect(renvoi.nombre).toBe(0);
    expect(renvoi.total).toBe(0);
    expect(Object.values(renvoi)).not.toContain(960);
  });

  it('se tait sur un mois qui ne porte AUCUN commun', () => {
    // « Les dépenses communes ne sont pas dans cette liste » sur un mois qui
    // n'en porte aucune annonce l'absence de rien. Même discipline que le volet
    // personnel du total : seulement s'il existe.
    expect(renvoiDeLaPortee(
      [QUATRE.vousSolo, QUATRE.conjointeSolo], PORTEES.SOLO, 'vous'
    ).nature).toBe(NATURES_DE_RENVOI.AUCUNE);
  });

  it('LE TÉMOIN — il paraît bien quand le mois en porte', () => {
    // Sans lui, « se taire » serait satisfait par un renvoi qui ne paraît
    // jamais sous « Moi », et le cas ci-dessus ne mesurerait rien.
    expect(renvoiDeLaPortee(
      [QUATRE.vousSolo, QUATRE.vousPartagee], PORTEES.SOLO, 'vous'
    ).nature).toBe(NATURES_DE_RENVOI.LE_COMMUN);
  });

  it('un commun SUPPRIMÉ ne compte pas comme du commun', () => {
    expect(renvoiDeLaPortee(
      [QUATRE.vousSolo, { ...QUATRE.vousPartagee, deleted: true }], PORTEES.SOLO, 'vous'
    ).nature).toBe(NATURES_DE_RENVOI.AUCUNE);
  });

  it('il ne dépend pas de QUI regarde — le commun est le commun', () => {
    // À la différence de la première nature, qui change de côté selon le
    // compte : ici les deux comptes voient la même phrase, parce que le commun
    // n'appartient à personne en particulier.
    for (const qui of ['vous', 'conjointe']) {
      expect(renvoiDeLaPortee(LES_QUATRE, PORTEES.SOLO, qui).nature)
        .toBe(NATURES_DE_RENVOI.LE_COMMUN);
    }
  });
});

describe('Le nom d\'une portée n\'a qu\'une rédaction', () => {
  it('les trois portées ont un nom', () => {
    expect(libelleDeLaPortee(PORTEES.DEUX)).toBe('À deux');
    expect(libelleDeLaPortee(PORTEES.SOLO)).toBe('Moi ce mois');
    expect(libelleDeLaPortee(PORTEES.PRIVE)).toBe('Privé');
  });

  it('une valeur inconnue prend celui du repli', () => {
    expect(libelleDeLaPortee('inventée')).toBe('À deux');
  });

  it('LE TÉMOIN — aucune portée n\'est sans nom', () => {
    // Sans lui, une portée ajoutée demain sortirait `undefined` à l'écran.
    for (const portee of Object.values(PORTEES)) {
      expect(typeof LIBELLES_DE_PORTEE[portee]).toBe('string');
      expect(LIBELLES_DE_PORTEE[portee].length).toBeGreaterThan(0);
    }
  });
});
