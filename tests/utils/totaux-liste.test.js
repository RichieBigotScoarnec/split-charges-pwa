// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  libelleDuTotal,
  libelleDuRenvoi,
  afficherTotalDeListe,
  afficherLeRenvoi,
  accorderLesSousTotaux
} from '../../public/js/utils/totaux-liste.js';

/**
 * Les totaux d'une liste, et ce qu'ils disent du personnel
 *
 * Deux formulations vivaient à un bouton de distance : le pied de liste disait
 * `commun + X perso`, et l'en-tête de catégorie ne disait rien du tout — il
 * annonçait un total qui incluait le personnel sans le nommer. Mesuré à la main
 * sur septembre 2026 : « Courses » à 381,75 €, dont 10,00 de personnel.
 *
 * Une seule rédaction depuis le lot P2, lue par les deux surfaces. Ces cas
 * tiennent la formulation ; le câblage est tenu par les contrôles de rendu.
 */

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

describe('La phrase du renvoi', () => {
  it('dit combien, combien ça fait, et OÙ c\'est parti', () => {
    const phrase = libelleDuRenvoi({ nombre: 3, total: 36.7, libelle: 'Moi ce mois' });

    expect(phrase).toMatch(/3 dépenses perso/);
    expect(phrase).toMatch(/36,70/);
    expect(phrase).toMatch(/Moi ce mois/);
  });

  it('nommer la destination est le cœur du renvoi', () => {
    // Le pied annonce déjà un chiffre. Ce que le renvoi ajoute, et qui referme
    // le défaut « une dépense saisie devient introuvable », c'est le NOM de
    // l'endroit où elle est allée — celui du segment, pour qu'on le trouve.
    expect(libelleDuRenvoi({ nombre: 1, total: 10, libelle: 'Moi ce mois' }))
      .toContain('Moi ce mois');
  });

  it('ACCORDE LES DEUX MOTS — le nom ET le participe', () => {
    // Écrit d'abord avec un seul accord, il rendait « 1 dépense perso …
    // rangéeS dans » : le nom au singulier et le participe au pluriel, sur le
    // cas le PLUS FRÉQUENT du renvoi — on coche « perso » une dépense à la
    // fois. Un contrôle qui n'aurait tenu que « 1 dépense » l'aurait laissé
    // passer, et c'est le second accord qui l'a fait rougir.
    const une = libelleDuRenvoi({ nombre: 1, total: 10, libelle: 'Moi ce mois' });
    expect(une).toMatch(/\b1 dépense perso\b/);
    expect(une).toMatch(/\brangée dans\b/);
    expect(une).not.toMatch(/dépenses/);
    expect(une).not.toMatch(/rangées/);

    const trois = libelleDuRenvoi({ nombre: 3, total: 30, libelle: 'Moi ce mois' });
    expect(trois).toMatch(/\b3 dépenses perso\b/);
    expect(trois).toMatch(/\brangées dans\b/);
  });

  it('rend la chaîne vide quand il n\'y a rien à annoncer', () => {
    expect(libelleDuRenvoi({ nombre: 0, total: 0, libelle: 'Moi ce mois' })).toBe('');
  });
});

describe('Ce que le renvoi pose dans la page', () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="renvoi" hidden></p>';
  });

  const element = () => document.getElementById('renvoi');

  it('paraît avec sa phrase et son bouton', () => {
    afficherLeRenvoi(element(), {
      nombre: 2, total: 21.7, libelle: 'Moi ce mois', versLaPortee: 'solo'
    });

    expect(element().hidden).toBe(false);
    expect(element().textContent).toMatch(/2 dépenses perso/);
    expect(element().querySelector('button').dataset.action).toBe('allerALaPortee');
    expect(element().querySelector('button').dataset.arg).toBe('solo');
  });

  it('LE BOUTON EST NU — aucun attribut d\'état ARIA', () => {
    // `tests/e2e/portee-unique.spec.js` relève tout élément visible portant
    // `aria-checked`, `aria-selected` ou `aria-current` dont le texte contient
    // « moi », et exige que l'écran n'annonce qu'une portée. Ce bouton en porte
    // le mot : un attribut d'état en ferait une SECONDE annonce.
    afficherLeRenvoi(element(), {
      nombre: 1, total: 10, libelle: 'Moi ce mois', versLaPortee: 'solo'
    });

    const bouton = element().querySelector('button');
    for (const attribut of ['aria-checked', 'aria-selected', 'aria-current']) {
      expect(bouton.hasAttribute(attribut)).toBe(false);
    }
    // Et le mot est bien là : sans lui, le cas ci-dessus ne mesurerait rien.
    expect(bouton.textContent).toMatch(/moi/i);
  });

  it('se referme quand il n\'y a rien à annoncer', () => {
    afficherLeRenvoi(element(), {
      nombre: 1, total: 10, libelle: 'Moi ce mois', versLaPortee: 'solo'
    });
    afficherLeRenvoi(element(), {
      nombre: 0, total: 0, libelle: 'Moi ce mois', versLaPortee: 'solo'
    });

    expect(element().hidden).toBe(true);
    expect(element().textContent).toBe('');
  });

  it('un élément absent ne fait rien tomber', () => {
    expect(() => afficherLeRenvoi(null, { nombre: 1, total: 10, libelle: 'x' })).not.toThrow();
  });
});

describe('Le pied et les sous-totaux disent la MÊME chose', () => {
  it('le pied emprunte la formulation', () => {
    document.body.innerHTML = '<strong id="total"></strong>';
    afficherTotalDeListe(document.getElementById('total'), [
      { amount: 40, paidBy: 'vous' },
      { amount: 10, paidBy: 'vous', perimetre: 'solo' }
    ]);

    expect(document.getElementById('total').textContent)
      .toBe(libelleDuTotal({ commun: 40, solo: 10 }));
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

    accorderLesSousTotaux(document.getElementById('liste'), [
      { category: 'Courses', amount: 40, paidBy: 'vous' },
      { category: 'Courses', amount: 10, paidBy: 'vous', perimetre: 'solo' }
    ]);

    expect(document.querySelector('.category-total').textContent)
      .toBe(libelleDuTotal({ commun: 40, solo: 10 }));
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

    accorderLesSousTotaux(document.getElementById('liste'), []);

    expect(document.querySelector('.category-total').textContent)
      .toBe(libelleDuTotal({ commun: 0, solo: 0 }));
  });
});
