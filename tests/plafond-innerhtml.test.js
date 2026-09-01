import { describe, it, expect } from 'vitest';
import { sitesDInjection, verdict, PLAFOND } from '../tools/plafond-innerhtml.mjs';

/**
 * Le plafond ne compte que ce qu'il prétend compter
 *
 * Le défaut réparé ici est le genre qui ne se voit pas : la CI restait verte,
 * le chiffre affiché était juste, et le garde-fou ne gardait rien. `26` mêlait
 * 24 sites d'injection et 2 `console.log` — retirer les seconds ouvrait deux
 * places aux premiers, sans qu'aucune relecture soit demandée.
 *
 * Ces contrôles fixent la séparation. Le témoin négatif est le cœur du
 * fichier : il rejoue l'ancien comptage et montre qu'il rendait bien un autre
 * chiffre, faute de quoi la correction ne se distinguerait pas d'un
 * ajustement cosmétique.
 */

/** Un rapport eslint réduit à ce que le compteur en lit */
const rapport = [
  {
    filePath: '/public/js/modules/summary.js',
    messages: [
      { ruleId: 'no-unsanitized/property', line: 679, message: 'Unsafe assignment to innerHTML' },
      { ruleId: 'no-unsanitized/property', line: 807, message: 'Unsafe assignment to innerHTML' }
    ]
  },
  {
    filePath: '/public/js/modules/export.js',
    messages: [
      { ruleId: 'no-unsanitized/method', line: 352, message: 'Unsafe call to document.write' }
    ]
  },
  {
    filePath: '/public/js/utils/debug.js',
    messages: [
      { ruleId: 'no-console', line: 30, message: 'Unexpected console statement.' },
      { ruleId: 'no-console', line: 30, message: 'Unexpected console statement.' }
    ]
  }
];

describe('Ce que le compteur retient', () => {
  it('retient les deux règles no-unsanitized, propriété comme méthode', () => {
    const sites = sitesDInjection(rapport);
    expect(sites.map((s) => s.regle)).toEqual([
      'no-unsanitized/property',
      'no-unsanitized/property',
      'no-unsanitized/method'
    ]);
  });

  it("n'a rien à faire d'un no-console — c'est tout le correctif", () => {
    const sites = sitesDInjection(rapport);
    expect(sites).toHaveLength(3);
    expect(sites.some((s) => s.regle === 'no-console')).toBe(false);
  });

  it('nomme le fichier et la ligne, pour que la relecture soit possible', () => {
    const [premier] = sitesDInjection(rapport);
    expect(premier.fichier).toBe('/public/js/modules/summary.js');
    expect(premier.ligne).toBe(679);
  });

  it('supporte un fichier sans messages, et un rapport vide', () => {
    expect(sitesDInjection([{ filePath: '/a.js', messages: [] }])).toEqual([]);
    expect(sitesDInjection([{ filePath: '/a.js' }])).toEqual([]);
    expect(sitesDInjection([])).toEqual([]);
  });

  it('ignore une règle sans identifiant — eslint en produit sur erreur de syntaxe', () => {
    const sites = sitesDInjection([
      { filePath: '/a.js', messages: [{ ruleId: null, line: 1, message: 'Parsing error' }] }
    ]);
    expect(sites).toEqual([]);
  });
});

describe('TÉMOIN NÉGATIF — l\'ancien comptage rendait un autre chiffre', () => {
  it('tous les avertissements confondus : 5 ici, les sites seuls : 3', () => {
    const tousLesAvertissements = rapport.flatMap((f) => f.messages ?? []).length;
    expect(tousLesAvertissements).toBe(5);
    expect(sitesDInjection(rapport)).toHaveLength(3);
    expect(sitesDInjection(rapport).length).toBeLessThan(tousLesAvertissements);
  });

  it('deux console.log retirés déplaçaient l\'ancien compte, jamais le nouveau', () => {
    const sansDebug = rapport.filter((f) => !f.filePath.endsWith('debug.js'));
    expect(sansDebug.flatMap((f) => f.messages ?? []).length).toBe(3);
    expect(sitesDInjection(sansDebug)).toHaveLength(sitesDInjection(rapport).length);
  });
});

describe('Le verdict', () => {
  it('dépasser échoue', () => {
    expect(verdict(25, 24).depasse).toBe(true);
  });

  it('égaler passe — le plafond est le nombre admis, pas le premier refusé', () => {
    expect(verdict(24, 24).depasse).toBe(false);
    expect(verdict(24, 24).marge).toBe(0);
  });

  it('rester dessous passe, et la marge le dit pour qu\'on abaisse le plafond', () => {
    expect(verdict(22, 24)).toEqual({ depasse: false, marge: 2 });
  });
});

describe('Le plafond publié', () => {
  it('vaut 24 : les 24 sites relus un par un, sans le bruit des autres règles', () => {
    expect(PLAFOND).toBe(24);
  });
});
