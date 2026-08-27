// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

import {
  panneauxProposes,
  panneauRetenu,
  activerOnglet,
  ongletCourant,
  initOnglets
} from '../../public/js/utils/onglets.js';
import { oublierLesEcouteurs } from '../../public/js/utils/ecouteur.js';

/**
 * Trois destinations plutôt qu'un seul long écran
 *
 * Le module ne fait qu'une chose — déplacer une classe et un attribut — et
 * c'est précisément pour cela qu'il mérite d'être verrouillé : sous 900 px,
 * `onglets.css` masque tout panneau sans `panneau--actif`. Une erreur d'un
 * caractère ici, et l'application s'ouvre sur une page blanche, qui se lit
 * comme une panne et non comme un bogue d'affichage.
 *
 * Les deux propriétés qui comptent, tenues par les contrôles ci-dessous :
 *
 *   1. **Il y a toujours exactement un panneau actif.** Zéro donne l'écran
 *      vide ; deux donne le long écran qu'on cherchait à découper.
 *   2. **Un onglet ne désigne qu'un `.panneau` réel.** C'est ce qui permet à
 *      la barre de rester hors de la liste blanche de `init.js` : elle ne
 *      résout pas de nom de fonction, elle désigne un élément qu'on vérifie.
 */

/** Le balisage minimal qu'attend le module */
function poserLaPage({ ongletOrphelin = false } = {}) {
  document.body.innerHTML = `
    <main>
      <div class="col-bilan panneau panneau--actif" id="panneauBilan">bilan</div>
      <div class="col-listes panneau" id="panneauCharges">charges</div>
      <div class="col-reglages panneau" id="panneauReglages">réglages</div>
      <div id="pasUnPanneau">intrus</div>
      <nav class="onglets" id="onglets">
        <button type="button" class="onglet" data-panneau="panneauBilan" aria-current="true">
          <span class="onglet-nom">Bilan</span>
        </button>
        <button type="button" class="onglet" data-panneau="panneauCharges">
          <span class="onglet-nom">Charges</span>
        </button>
        <button type="button" class="onglet" data-panneau="panneauReglages">
          <span class="onglet-nom">Réglages</span>
        </button>
        ${ongletOrphelin ? '<button type="button" class="onglet" data-panneau="pasUnPanneau">Intrus</button>' : ''}
      </nav>
    </main>
  `;
}

/** Les identifiants des panneaux effectivement affichés */
function actifs() {
  return [...document.querySelectorAll('.panneau--actif')].map((p) => p.id);
}

/** Les onglets portant `aria-current` */
function marques() {
  return [...document.querySelectorAll('.onglet[aria-current]')].map((o) => o.dataset.panneau);
}

beforeEach(() => {
  poserLaPage();
  oublierLesEcouteurs(document.getElementById('onglets'));
});

describe('panneauxProposes — lus du balisage, jamais codés en dur', () => {
  it('rend les trois panneaux, dans l\'ordre de la barre', () => {
    expect(panneauxProposes()).toEqual(['panneauBilan', 'panneauCharges', 'panneauReglages']);
  });

  it('écarte un onglet qui ne désigne pas un `.panneau`', () => {
    // La garde qui permet à la barre de vivre hors de la liste blanche de
    // `init.js` : un attribut du DOM ne peut désigner qu'un élément déjà
    // marqué comme panneau. Un `data-panneau` injecté ne fait rien.
    poserLaPage({ ongletOrphelin: true });
    expect(panneauxProposes()).not.toContain('pasUnPanneau');
    expect(panneauxProposes()).toHaveLength(3);
  });

  it('rend une liste vide sans barre d\'onglets', () => {
    document.body.innerHTML = '<main><div class="panneau" id="panneauBilan"></div></main>';
    expect(panneauxProposes()).toEqual([]);
  });
});

describe('panneauRetenu — jamais d\'écran vide', () => {
  const proposes = ['panneauBilan', 'panneauCharges', 'panneauReglages'];

  it('retient l\'identifiant demandé quand il existe', () => {
    expect(panneauRetenu('panneauCharges', proposes)).toBe('panneauCharges');
  });

  it.each([['inconnu'], [''], [null], [undefined], ['pasUnPanneau']])(
    'replie sur le premier onglet quand « %s » ne désigne rien',
    (demande) => {
      // Sans ce repli, tous les panneaux resteraient masqués sous 900 px :
      // une page blanche, qu'on lit comme une panne et non comme une erreur
      // de navigation.
      expect(panneauRetenu(demande, proposes)).toBe('panneauBilan');
    }
  );

  it('ne retient rien s\'il n\'y a aucun onglet', () => {
    expect(panneauRetenu('panneauBilan', [])).toBeNull();
    expect(panneauRetenu('panneauBilan', null)).toBeNull();
  });
});

describe('activerOnglet — exactement un panneau, exactement un onglet marqué', () => {
  it.each([['panneauBilan'], ['panneauCharges'], ['panneauReglages']])(
    'afficher « %s » n\'en laisse aucun autre ouvert',
    (id) => {
      expect(activerOnglet(id)).toBe(id);
      expect(actifs()).toEqual([id]);
      expect(marques()).toEqual([id]);
    }
  );

  it('un identifiant inconnu affiche le bilan plutôt que rien', () => {
    activerOnglet('panneauCharges');
    expect(activerOnglet('panneauFantome')).toBe('panneauBilan');
    expect(actifs()).toEqual(['panneauBilan']);
  });

  it('retire `aria-current` au lieu de le mettre à « false »', () => {
    // « false » est une valeur comme une autre pour cet attribut : certains
    // lecteurs d'écran annonceraient alors deux onglets courants.
    activerOnglet('panneauCharges');
    const bilan = document.querySelector('.onglet[data-panneau="panneauBilan"]');
    expect(bilan.hasAttribute('aria-current')).toBe(false);
  });

  it('deux activations de suite ne laissent qu\'un seul panneau', () => {
    activerOnglet('panneauCharges');
    activerOnglet('panneauReglages');
    expect(actifs()).toEqual(['panneauReglages']);
    expect(marques()).toEqual(['panneauReglages']);
  });

  it('ne fait rien, sans lever, quand la page n\'a pas d\'onglets', () => {
    document.body.innerHTML = '<main></main>';
    expect(activerOnglet('panneauBilan')).toBeNull();
  });
});

describe('ongletCourant — ce que le balisage déclare', () => {
  it('lit l\'onglet marqué', () => {
    expect(ongletCourant()).toBe('panneauBilan');
    activerOnglet('panneauReglages');
    expect(ongletCourant()).toBe('panneauReglages');
  });

  it('rend null quand aucun onglet n\'est marqué', () => {
    document.querySelector('.onglet[aria-current]').removeAttribute('aria-current');
    expect(ongletCourant()).toBeNull();
  });
});

describe('initOnglets — un écouteur, et l\'appui qui change d\'écran', () => {
  it('trouve la barre et rend vrai', () => {
    expect(initOnglets()).toBe(true);
  });

  it('rend faux, sans lever, quand la barre est absente', () => {
    document.body.innerHTML = '<main></main>';
    expect(initOnglets()).toBe(false);
  });

  it('un appui sur un onglet affiche son panneau', () => {
    initOnglets();
    document.querySelector('.onglet[data-panneau="panneauCharges"]').click();
    expect(actifs()).toEqual(['panneauCharges']);
    expect(marques()).toEqual(['panneauCharges']);
  });

  it('un appui sur le libellé, à l\'intérieur du bouton, compte aussi', () => {
    // La cible réelle d'un doigt est presque toujours le `<span>` du texte,
    // pas le bouton : sans `closest`, un appui sur deux serait ignoré.
    initOnglets();
    document.querySelector('.onglet[data-panneau="panneauReglages"] .onglet-nom').click();
    expect(actifs()).toEqual(['panneauReglages']);
  });

  it('deux initialisations ne posent qu\'un seul écouteur', () => {
    // `initializeAppData()` rejoue à chaque reconnexion sans rechargement.
    // Un gestionnaire posé deux fois remonterait la page deux fois par appui.
    let appels = 0;
    const barre = document.getElementById('onglets');
    barre.addEventListener('click', () => { appels += 1; });

    initOnglets();
    initOnglets();
    document.querySelector('.onglet[data-panneau="panneauCharges"]').click();

    expect(appels).toBe(1);
    expect(actifs()).toEqual(['panneauCharges']);
  });

  it('l\'état de départ vient du balisage, pas d\'une session précédente', () => {
    // Ouvrir l'application doit poser la question à laquelle elle répond —
    // le solde — et non rouvrir l'écran de réglages consulté la veille.
    initOnglets();
    expect(actifs()).toEqual(['panneauBilan']);
  });

  it('un appui hors d\'un onglet ne change rien', () => {
    initOnglets();
    document.getElementById('onglets').click();
    expect(actifs()).toEqual(['panneauBilan']);
  });
});
