// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  libelleDuTotal,
  libelleDuRenvoi,
  coupleDeLaPortee,
  afficherTotalDeListe,
  afficherLeRenvoi,
  afficherEtatVide,
  accorderLesSousTotaux
} from '../../public/js/utils/totaux-liste.js';
import { PORTEES, NATURES_DE_RENVOI, renvoiDeLaPortee } from '../../public/js/utils/portee.js';

/**
 * Les totaux d'une liste, et ce qu'ils disent du personnel
 *
 * Deux formulations vivaient à un bouton de distance : le pied de liste disait
 * `commun + X perso`, et l'en-tête de catégorie ne disait rien du tout — il
 * annonçait un total qui incluait le personnel sans le nommer. Mesuré à la main
 * sur septembre 2026 : « Courses » à 381,75 €, dont 10,00 de personnel.
 *
 * Une seule rédaction depuis le lot P2, lue par les deux surfaces. Le lot
 * « Moi » lui donne une seconde portée qui filtre, et c'est `coupleDeLaPortee`
 * qui absorbe la différence — la pièce à lire en premier.
 */

/** Un commun et un personnel à moi, dans la même catégorie */
const UN_DE_CHAQUE = [
  { id: 'c', category: 'Courses', amount: 40, paidBy: 'vous' },
  { id: 's', category: 'Courses', amount: 10, paidBy: 'vous', perimetre: 'solo' }
];

const SOUS_DEUX = { portee: PORTEES.DEUX, moi: 'vous' };
const SOUS_MOI = { portee: PORTEES.SOLO, moi: 'vous' };

describe('Ce qu\'un total annonce, selon la portée', () => {
  it('sous « À deux » : le commun montré, mon perso caché nommé', () => {
    expect(coupleDeLaPortee(UN_DE_CHAQUE, PORTEES.DEUX, 'vous'))
      .toEqual({ commun: 40, solo: 10 });
  });

  it('sous « Moi » : mon perso montré, RIEN de caché', () => {
    // C'est la propriété qui empêche le pied d'annoncer « 0,00 € + 10,00 €
    // perso » sur l'écran « moi », et l'en-tête d'y annoncer le commun du
    // foyer. Le `commun` du couple veut dire « ce qui est MONTRÉ », pas
    // « ce qui est commun ».
    expect(coupleDeLaPortee(UN_DE_CHAQUE, PORTEES.SOLO, 'vous'))
      .toEqual({ commun: 10, solo: 0 });
  });

  it('sous « Privé », qui ne filtre pas : tout est montré, rien n\'est caché', () => {
    expect(coupleDeLaPortee(UN_DE_CHAQUE, PORTEES.PRIVE, 'vous'))
      .toEqual({ commun: 50, solo: 0 });
  });

  it('LE TÉMOIN — les trois portées ne rendent PAS le même couple', () => {
    // Sans lui, une fabrique qui ignorerait la portée satisferait le premier
    // cas et l'un des deux autres par coïncidence de chiffres.
    const couples = [PORTEES.DEUX, PORTEES.SOLO, PORTEES.PRIVE]
      .map(portee => JSON.stringify(coupleDeLaPortee(UN_DE_CHAQUE, portee, 'vous')));

    expect(new Set(couples).size, 'deux portées rendent le même couple').toBe(3);
  });

  it('le personnel de l\'AUTRE n\'est caché de personne — il n\'est pas à moi', () => {
    // Sous « À deux », le filtre le retire comme le mien. Mais l'annoncer dans
    // mon total ferait dire « + 30,00 € perso » là où je n'ai rien dépensé.
    const sien = [{ amount: 30, paidBy: 'conjointe', perimetre: 'solo' }];

    expect(coupleDeLaPortee(sien, PORTEES.DEUX, 'vous')).toEqual({ commun: 0, solo: 0 });
    expect(coupleDeLaPortee(sien, PORTEES.DEUX, 'conjointe')).toEqual({ commun: 0, solo: 30 });
  });

  it('une charge supprimée ne compte ni comme montrée ni comme cachée', () => {
    expect(coupleDeLaPortee(
      UN_DE_CHAQUE.map(charge => ({ ...charge, deleted: true })), PORTEES.DEUX, 'vous'
    )).toEqual({ commun: 0, solo: 0 });
  });

  it('un montant illisible vaut zéro, jamais NaN', () => {
    expect(coupleDeLaPortee([{ amount: 'beaucoup', paidBy: 'vous' }], PORTEES.DEUX, 'vous'))
      .toEqual({ commun: 0, solo: 0 });
  });
});

describe('La formulation d\'un total', () => {
  it('nomme le personnel quand il existe', () => {
    expect(libelleDuTotal({ commun: 371.75, solo: 10 }))
      .toMatch(/371,75.*\+.*10,00.*perso/);
  });

  it('se tait quand il n\'y en a pas', () => {
    // Sans quoi tous les mois déjà en base changeraient d'apparence, et une
    // mention systématique ferait du bruit sur la majorité des lignes.
    expect(libelleDuTotal({ commun: 371.75, solo: 0 })).not.toMatch(/perso/);
  });

  it('SE TAIT AUSSI QUAND IL EST SEUL — l\'annotation sert à DISTINGUER', () => {
    // « 0,00 € + 10,00 € perso » est le pied que « Moi ce mois » affichait avec
    // la formule d'avant : exact, et illisible. Sans commun en face, il n'y a
    // rien à distinguer, et le total se dit d'un seul nombre.
    expect(libelleDuTotal({ commun: 0, solo: 10 })).not.toMatch(/perso/);
    expect(libelleDuTotal({ commun: 0, solo: 10 })).toBe(libelleDuTotal({ commun: 10, solo: 0 }));
  });

  it('LE TÉMOIN — les deux formes DIFFÈRENT sur le même commun', () => {
    // Sans lui, « se taire » serait satisfait par une formulation qui ne dit
    // jamais rien : il faut que la présence du personnel change la phrase.
    expect(libelleDuTotal({ commun: 100, solo: 5 }))
      .not.toBe(libelleDuTotal({ commun: 100, solo: 0 }));
  });

  it('un personnel à zéro ou négatif ne s\'annonce pas', () => {
    expect(libelleDuTotal({ commun: 100, solo: 0 })).not.toMatch(/perso/);
    expect(libelleDuTotal({ commun: 100, solo: -3 })).not.toMatch(/perso/);
  });
});

describe('La phrase du renvoi — nature 1, mon personnel', () => {
  const mien = (nombre, total) => ({
    nature: NATURES_DE_RENVOI.MON_PERSONNEL, nombre, total, libelle: 'Moi ce mois'
  });

  it('dit combien et combien ça fait', () => {
    const phrase = libelleDuRenvoi(mien(3, 36.7));

    expect(phrase).toMatch(/3 dépenses perso/);
    expect(phrase).toMatch(/36,70/);
  });

  it('ACCORDE LES DEUX MOTS — le nom ET le participe', () => {
    // Écrit d'abord avec un seul accord, il rendait « 1 dépense perso …
    // rangéeS dans » : le nom au singulier et le participe au pluriel, sur le
    // cas le PLUS FRÉQUENT du renvoi — on coche « perso » une dépense à la
    // fois. Un contrôle qui n'aurait tenu que « 1 dépense » l'aurait laissé
    // passer, et c'est le second accord qui l'a fait rougir.
    const une = libelleDuRenvoi(mien(1, 10));
    expect(une).toMatch(/\b1 dépense perso\b/);
    expect(une).toMatch(/\brangée dans\b/);
    expect(une).not.toMatch(/dépenses/);
    expect(une).not.toMatch(/rangées/);

    const trois = libelleDuRenvoi(mien(3, 30));
    expect(trois).toMatch(/\b3 dépenses perso\b/);
    expect(trois).toMatch(/\brangées dans\b/);
  });

  it('rend la chaîne vide quand il n\'y a rien à annoncer', () => {
    expect(libelleDuRenvoi(mien(0, 0))).toBe('');
    expect(libelleDuRenvoi({ nature: NATURES_DE_RENVOI.AUCUNE })).toBe('');
    expect(libelleDuRenvoi(undefined)).toBe('');
  });
});

describe('La phrase du renvoi — nature 2, le commun', () => {
  const duCommun = {
    nature: NATURES_DE_RENVOI.LE_COMMUN, nombre: 0, total: 0, libelle: 'À deux'
  };

  it('dit que le commun n\'est pas dans cette liste', () => {
    expect(libelleDuRenvoi(duCommun)).toMatch(/communes.*pas dans cette liste/);
  });

  it('SANS AUCUN CHIFFRE — le montant est dans le grand-livre, deux cartes plus haut', () => {
    // Ce qui manquait sous « Moi » n'était pas un chiffre, c'était une ADRESSE.
    // Un agrégat ne répond pas à « où est passée ma course de 122,07 € ».
    expect(libelleDuRenvoi(duCommun)).not.toMatch(/\d/);
  });

  it('LE TÉMOIN — l\'autre nature, elle, en porte', () => {
    // Sans lui, « aucun chiffre » serait satisfait par une phrase vide, et par
    // une fabrique qui n'écrirait jamais de montant nulle part.
    expect(libelleDuRenvoi({
      nature: NATURES_DE_RENVOI.MON_PERSONNEL, nombre: 1, total: 10, libelle: 'Moi ce mois'
    })).toMatch(/\d/);
  });

  it('elle NE DÉPEND PAS du compte ni du nombre — la nature suffit', () => {
    // Le piège du lot : `nombre` à zéro voulait dire « rien à annoncer » sous
    // P2. Deux natures à zéro ne se distinguent que par la nature.
    expect(libelleDuRenvoi({ ...duCommun, nombre: 0 }))
      .toBe(libelleDuRenvoi({ ...duCommun, nombre: 7, total: 960 }));
  });
});

describe('Ce que le renvoi pose dans la page', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="renvoi" hidden></p>';
  });

  const element = () => document.getElementById('renvoi');

  it('paraît avec sa phrase et son bouton', () => {
    afficherLeRenvoi(element(), {
      nature: NATURES_DE_RENVOI.MON_PERSONNEL,
      nombre: 2, total: 21.7, libelle: 'Moi ce mois', versLaPortee: 'solo'
    });

    expect(element().hidden).toBe(false);
    expect(element().textContent).toMatch(/2 dépenses perso/);
    expect(element().querySelector('button').dataset.action).toBe('allerALaPortee');
    expect(element().querySelector('button').dataset.arg).toBe('solo');
  });

  it('et sous « Moi », il mène à « À deux »', () => {
    afficherLeRenvoi(element(), {
      nature: NATURES_DE_RENVOI.LE_COMMUN,
      nombre: 0, total: 0, libelle: 'À deux', versLaPortee: 'deux'
    });

    expect(element().hidden).toBe(false);
    expect(element().querySelector('button').dataset.arg).toBe('deux');
    expect(element().querySelector('button').textContent).toContain('À deux');
    // La page entière du renvoi, bouton compris, ne porte aucun chiffre.
    expect(element().textContent).not.toMatch(/\d/);
  });

  it('LE BOUTON EST NU — aucun attribut d\'état ARIA', () => {
    // `tests/e2e/portee-unique.spec.js` relève tout élément visible portant
    // `aria-checked`, `aria-selected` ou `aria-current` dont le texte contient
    // « moi » ou « à deux », et exige que l'écran n'annonce qu'une portée. Les
    // deux natures en portent un : un attribut d'état en ferait une SECONDE
    // annonce.
    for (const renvoi of [
      { nature: NATURES_DE_RENVOI.MON_PERSONNEL, nombre: 1, total: 10, libelle: 'Moi ce mois', versLaPortee: 'solo' },
      { nature: NATURES_DE_RENVOI.LE_COMMUN, nombre: 0, total: 0, libelle: 'À deux', versLaPortee: 'deux' }
    ]) {
      afficherLeRenvoi(element(), renvoi);
      const bouton = element().querySelector('button');
      for (const attribut of ['aria-checked', 'aria-selected', 'aria-current']) {
        expect(bouton.hasAttribute(attribut), `${renvoi.nature} : ${attribut}`).toBe(false);
      }
      // Et le mot est bien là : sans lui, le cas ne mesurerait rien.
      expect(bouton.textContent).toMatch(/moi|à deux/i);
    }
  });

  it('se referme quand il n\'y a rien à annoncer', () => {
    afficherLeRenvoi(element(), {
      nature: NATURES_DE_RENVOI.MON_PERSONNEL,
      nombre: 1, total: 10, libelle: 'Moi ce mois', versLaPortee: 'solo'
    });
    afficherLeRenvoi(element(), {
      nature: NATURES_DE_RENVOI.AUCUNE, nombre: 0, total: 0, libelle: 'Moi ce mois', versLaPortee: 'solo'
    });

    expect(element().hidden).toBe(true);
    expect(element().textContent).toBe('');
  });

  it('un élément absent ne fait rien tomber', () => {
    expect(() => afficherLeRenvoi(null, { nature: null })).not.toThrow();
  });
});

describe('L\'état vide d\'une liste', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="liste"></div>';
  });

  const liste = () => document.getElementById('liste');
  const texte = () => liste().textContent;

  /** Le renvoi que la portée produirait sur ce mois-là */
  const renvoiDuMois = (charges, portee) => renvoiDeLaPortee(charges, portee, 'vous');

  it('ZÉRO `innerHTML` — la fabrique construit les nœuds', () => {
    // Mesuré : le plafond des sites d'injection est à 24 sur 24, marge nulle.
    // Une fabrique qui rendrait une chaîne assignée à `innerHTML` le porterait
    // à 26, sur des phrases qui n'interpolent rien. Le contrôle tient la FORME
    // du rendu, pas seulement son texte : un `<p>` et un `<small>`, construits.
    afficherEtatVide(liste(), {
      collection: 'variableCharges', portee: PORTEES.DEUX, renvoi: renvoiDuMois([], PORTEES.DEUX)
    });

    const bloc = liste().querySelector('p.empty-state');
    expect(bloc).not.toBeNull();
    expect(bloc.querySelector('small')).not.toBeNull();
  });

  it('un mois vraiment vide explique ce que la section attend', () => {
    for (const [collection, attendu] of [
      ['variableCharges', /courses/i],
      ['fixedCharges', /loyer/i]
    ]) {
      afficherEtatVide(liste(), {
        collection, portee: PORTEES.DEUX, renvoi: renvoiDuMois([], PORTEES.DEUX)
      });
      expect(texte(), collection).toMatch(attendu);
    }
  });

  it('SOUS « À DEUX », un mois qui ne porte que du personnel ne s\'annonce PAS vide', () => {
    // La propriété de P2 : l'écran ne prétend jamais qu'un mois est vide quand
    // il ne l'est pas. Il dit qu'il n'y a rien de COMMUN.
    const duPerso = [{ amount: 45, paidBy: 'vous', perimetre: 'solo' }];

    afficherEtatVide(liste(), {
      collection: 'variableCharges',
      portee: PORTEES.DEUX,
      renvoi: renvoiDuMois(duPerso, PORTEES.DEUX)
    });

    expect(texte()).toMatch(/commune/i);
    expect(texte()).not.toMatch(/pour cette période/);
  });

  it('SOUS « MOI », elle dit que je n\'en ai pas — et que ce n\'est pas l\'application', () => {
    // C'est le cas NOMINAL de la section des charges fixes : relevé sur la base
    // réelle le 2026-09-17, zéro charge fixe personnelle. Une section vide
    // installe une ambiguïté — « je n'en ai pas » ou « on ne me les montre
    // pas ? » — et la phrase doit dire laquelle.
    const duCommun = [{ amount: 800, paidBy: 'vous' }];

    afficherEtatVide(liste(), {
      collection: 'fixedCharges',
      portee: PORTEES.SOLO,
      renvoi: renvoiDuMois(duCommun, PORTEES.SOLO)
    });

    expect(texte()).toMatch(/perso/i);
    expect(texte(), 'elle doit lever l\'ambiguïté, pas seulement constater')
      .toMatch(/n'en as aucun|ne .*cache/i);
  });

  it('LE TÉMOIN — les trois cas rendent trois phrases DIFFÉRENTES', () => {
    // Sans lui, une fabrique qui rendrait toujours la même phrase satisferait
    // les trois cas ci-dessus dès que l'un d'eux contient les mots des autres.
    const phrases = [
      { portee: PORTEES.DEUX, charges: [] },
      { portee: PORTEES.DEUX, charges: [{ amount: 45, paidBy: 'vous', perimetre: 'solo' }] },
      { portee: PORTEES.SOLO, charges: [{ amount: 800, paidBy: 'vous' }] }
    ].map(({ portee, charges }) => {
      afficherEtatVide(liste(), {
        collection: 'variableCharges', portee, renvoi: renvoiDuMois(charges, portee)
      });
      return texte();
    });

    expect(new Set(phrases).size).toBe(3);
  });

  it('la même distinction pour les deux collections, jamais la même phrase', () => {
    // Six rédactions du même patron dans deux fichiers seraient la règle 4 à
    // l'état pur. Une seule fabrique, mais chaque section garde SA phrase :
    // « loyer, assurance, abonnements » n'aide personne sous les dépenses.
    const rendues = new Set();
    for (const collection of ['variableCharges', 'fixedCharges']) {
      for (const portee of [PORTEES.DEUX, PORTEES.SOLO]) {
        afficherEtatVide(liste(), { collection, portee, renvoi: renvoiDuMois([], portee) });
        rendues.add(texte());
      }
    }
    expect(rendues.size).toBe(4);
  });

  it('une collection inconnue ne pose rien, et ne lève pas', () => {
    liste().textContent = 'ce qui était là';
    expect(() => afficherEtatVide(liste(), {
      collection: 'inventée', portee: PORTEES.DEUX, renvoi: renvoiDuMois([], PORTEES.DEUX)
    })).not.toThrow();
    expect(texte()).toBe('ce qui était là');
  });

  it('un élément absent ne fait rien tomber', () => {
    expect(() => afficherEtatVide(null, {
      collection: 'variableCharges', portee: PORTEES.DEUX, renvoi: renvoiDuMois([], PORTEES.DEUX)
    })).not.toThrow();
  });
});

describe('Le pied et les sous-totaux disent la MÊME chose', () => {
  it('le pied emprunte la formulation', () => {
    document.body.innerHTML = '<strong id="total"></strong>';
    afficherTotalDeListe(document.getElementById('total'), UN_DE_CHAQUE, SOUS_DEUX);

    expect(document.getElementById('total').textContent)
      .toBe(libelleDuTotal({ commun: 40, solo: 10 }));
  });

  it('et sous « Moi », il dit le personnel SEUL — sans « 0,00 € + »', () => {
    document.body.innerHTML = '<strong id="total"></strong>';
    afficherTotalDeListe(document.getElementById('total'), UN_DE_CHAQUE, SOUS_MOI);

    // ⚠️ ANCRER, NE PAS EXCLURE — troisième fois de ce chantier qu'une
    // exclusion de sous-chaîne se retourne sur un montant : « 10,00 € »
    // contient « 0,00 », comme « 45,00 € » contenait « 5,00 € ». Un montant se
    // tient par une égalité ou une ancre, jamais par l'absence d'un morceau
    // d'un autre montant.
    const pied = document.getElementById('total').textContent;
    expect(pied).toBe(libelleDuTotal({ commun: 10, solo: 0 }));
    expect(pied).toMatch(/^10,00[\s\u202F\u00A0]€$/);
  });

  it('l\'en-tête de catégorie aussi — c\'est la propriété qui compte', () => {
    // Deux rédactions du même chiffre à deux lignes de distance : c'est le
    // défaut que ce dépôt paie le plus cher. Le cas compare les deux surfaces
    // plutôt qu'une chaîne écrite ici.
    document.body.innerHTML = `
      <div id="liste">
        <div class="charge-category" data-categorie="Courses">
          <span class="category-total"></span>
        </div>
      </div>`;

    accorderLesSousTotaux(document.getElementById('liste'), UN_DE_CHAQUE, SOUS_DEUX);

    expect(document.querySelector('.category-total').textContent)
      .toBe(libelleDuTotal({ commun: 40, solo: 10 }));
  });

  it('ET IL SUIT LA PORTÉE, comme le pied', () => {
    // Le défaut que le lot « Moi » aurait produit sans `coupleDeLaPortee` :
    // l'en-tête annonçait le couple du groupe ENTIER, donc « 40,00 € + 10,00 €
    // perso » au-dessus d'une liste qui ne montre que les 10 €.
    document.body.innerHTML = `
      <div id="liste">
        <div class="charge-category" data-categorie="Courses">
          <span class="category-total"></span>
        </div>
      </div>`;

    accorderLesSousTotaux(document.getElementById('liste'), UN_DE_CHAQUE, SOUS_MOI);

    expect(document.querySelector('.category-total').textContent)
      .toBe(libelleDuTotal({ commun: 10, solo: 0 }));
    expect(document.querySelector('.category-total').textContent).not.toMatch(/40,00/);
  });

  it('une catégorie dont plus rien n\'est affiché retombe à zéro', () => {
    // Pendant une recherche, `hideEmptyCategories` la masque de toute façon —
    // mais un bloc laissé avec un total périmé réapparaîtrait faux au premier
    // caractère effacé.
    document.body.innerHTML = `
      <div id="liste">
        <div class="charge-category" data-categorie="Courses">
          <span class="category-total">381,75 €</span>
        </div>
      </div>`;

    accorderLesSousTotaux(document.getElementById('liste'), [], SOUS_DEUX);

    expect(document.querySelector('.category-total').textContent)
      .toBe(libelleDuTotal({ commun: 0, solo: 0 }));
  });
});
