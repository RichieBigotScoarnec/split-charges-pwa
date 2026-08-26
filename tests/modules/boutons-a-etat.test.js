import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * Les boutons à deux états disent lequel est retenu
 *
 * Les trois groupes de la saisie rapide — catégorie, mode de partage, payeur —
 * ne marquaient leur sélection que par une classe CSS. Rien dans le balisage ne
 * disait laquelle était choisie : un lecteur d'écran annonçait des boutons
 * rigoureusement identiques, et « Payé par » restait indéchiffrable alors que
 * c'est le champ qui décide du sens du solde.
 *
 * `aria-pressed` est la propriété faite pour ça — un bouton à deux états — sans
 * exiger le rôle `radio`, qui imposerait une navigation par flèches et un
 * conteneur `radiogroup`.
 *
 * Ces contrôles lisent les fichiers plutôt que d'exécuter la modale : la faute
 * était de ne rien écrire du tout, et c'est cela qu'il faut empêcher de
 * revenir — un `classList.toggle('selected')` posé sans son pendant.
 */

const MODULE = readFileSync(
  new URL('../../public/js/modules/quick-add.js', import.meta.url), 'utf8');
const PAGE = readFileSync(
  new URL('../../public/FairSplit.html', import.meta.url), 'utf8');

describe('Les boutons choisis se lisent au lecteur d\'écran', () => {

  it('marque l\'état par une seule fonction, jamais par la classe seule', () => {
    // `marquerLEtat` pose la classe *et* l'attribut. Un `toggle('selected')`
    // qui lui échappe est exactement le défaut d'origine.
    const echappes = MODULE.split('\n')
      .map((ligne, rang) => ({ ligne: ligne.trim(), rang: rang + 1 }))
      .filter(({ ligne }) => /classList\.toggle\(\s*'selected'/.test(ligne));

    expect(echappes.map(e => `${e.rang}: ${e.ligne}`),
      'un bouton bascule sa classe sans dire son état')
      .toHaveLength(1);

    // L'unique occurrence tolérée est celle de `marquerLEtat` lui-même.
    expect(MODULE).toMatch(
      /function marquerLEtat\([^)]*\)\s*\{[^}]*classList\.toggle\('selected', choisi\);[^}]*aria-pressed/s);
  });

  it('fabrique les tuiles de catégorie avec leur état', () => {
    expect(MODULE).toMatch(/class="category-btn"[^>]*aria-pressed="false"/);
  });

  it('dit que « N autres » déplie, plutôt que de se prétendre choisi', () => {
    // Ce bouton-là n'est pas à deux états : il révèle le reste de la grille.
    expect(MODULE).toMatch(/id="categoryPlus"[\s\S]{0,80}aria-expanded="false"/);
  });

  it('donne aux trois boutons de payeur leur état initial', () => {
    const groupe = /<div class="payer-toggle" id="quickAddPayer">([\s\S]*?)<\/div>/
      .exec(PAGE);
    expect(groupe, 'le groupe des payeurs a disparu du balisage').not.toBeNull();

    const boutons = groupe[1].match(/<button[^>]*>/g) || [];
    expect(boutons).toHaveLength(3);
    for (const bouton of boutons) {
      expect(bouton, `« ${bouton} » ne dit pas son état`).toMatch(/aria-pressed="(true|false)"/);
    }

    // Un seul est enfoncé, et c'est celui qui porte `selected`.
    const enfonces = boutons.filter(b => b.includes('aria-pressed="true"'));
    expect(enfonces).toHaveLength(1);
    expect(enfonces[0]).toContain('class="selected"');
  });

  it('donne aux deux boutons de partage leur état initial', () => {
    for (const id of ['quickSplitProrata', 'quickSplit5050']) {
      const bouton = new RegExp(`<button[^>]*id="${id}"[^>]*>`).exec(PAGE);
      expect(bouton, `${id} a disparu du balisage`).not.toBeNull();
      expect(bouton[0], `${id} ne dit pas son état`).toMatch(/aria-pressed="(true|false)"/);
    }
  });
});
