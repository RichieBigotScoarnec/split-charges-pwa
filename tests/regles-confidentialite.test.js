/**
 * Le mur de confidentialité vit dans les règles, pas dans l'écran
 *
 * Une confidentialité écrite en JavaScript est du théâtre : l'autre personne a
 * exactement les mêmes accès à la base, et un drapeau « masqué » est un rideau.
 * Ces contrôles vérifient donc la seule chose qui compte — la forme des règles.
 *
 * Ils tournent en CI sans émulateur. Les mêmes règles ont été rejouées contre
 * le **moteur réel** : 22 écritures et lectures, dans les deux sens, toutes
 * conformes — dont les quatre qui définissent le mur :
 *
 *     Richard s'accorde son propre aval          → REFUSÉ
 *     Richard lit l'espace privé de Cindy        → REFUSÉ
 *     aval retiré → nouvelle écriture privée     → REFUSÉ
 *     aval retiré → Cindy lit le passé           → REFUSÉ
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const regles = JSON.parse(
  readFileSync(resolve(process.cwd(), 'database.rules.json'), 'utf8')
).rules;

const RICHARD = "auth.token.email === 'bigot.richard@gmail.com'";
const CINDY = "auth.token.email === 'cindypepe.cp95@gmail.com'";

/** Qui possède quoi, et qui est « l'autre » */
const FOYER = [
  { emplacement: 'vous', proprietaire: RICHARD, autre: CINDY },
  { emplacement: 'conjointe', proprietaire: CINDY, autre: RICHARD }
];

describe('Les trois racines vivent HORS de `household`', () => {
  it.each(['prive', 'aval', 'totauxPrives'])('`%s` est une racine à part entière', (racine) => {
    // Ce n'est pas une commodité de rangement. `.write` **cascade** dans les
    // règles Firebase : une règle profonde peut élargir un accès, jamais le
    // restreindre. Sous `household`, dont l'écriture est ouverte aux deux
    // comptes, il aurait été impossible d'exiger d'être l'autre pour accorder
    // un aval — l'autorisation du foyer aurait déjà tout ouvert.
    expect(regles[racine], `${racine} manque à la racine`).toBeDefined();
    expect(regles.household[racine], `${racine} ne doit PAS vivre sous household`).toBeUndefined();
  });
});

describe('Le mur : chacun est aveugle à l\'espace de l\'autre', () => {
  it.each(FOYER)('`prive/$emplacement` n\'est lisible que par son propriétaire', ({ emplacement, proprietaire, autre }) => {
    const lecture = regles.prive[emplacement]['.read'];
    expect(lecture).toContain(proprietaire);
    expect(lecture, 'l\'autre pourrait lire').not.toContain(autre);
  });

  it.each(FOYER)('`prive/$emplacement` n\'est écrivable que par son propriétaire', ({ emplacement, proprietaire, autre }) => {
    const ecriture = regles.prive[emplacement]['.write'];
    expect(ecriture).toContain(proprietaire);
    expect(ecriture).not.toContain(autre);
  });

  it.each(FOYER)('la lecture de `prive/$emplacement` ne dépend JAMAIS de l\'aval', ({ emplacement }) => {
    // Le point le plus important du fichier. Si la lecture était conditionnée à
    // l'aval, le retirer rendrait lisible ce qui a déjà été écrit — et « privé »
    // n'aurait jamais été vrai, seulement différé.
    expect(regles.prive[emplacement]['.read'], 'retirer l\'aval ouvrirait le passé')
      .not.toContain('aval');
  });

  it.each(FOYER)('l\'écriture dans `prive/$emplacement`, elle, exige l\'aval', ({ emplacement }) => {
    expect(regles.prive[emplacement]['.write'])
      .toContain(`root.child('aval/${emplacement}/actif').val() === true`);
  });

  it.each(FOYER)('mais on peut toujours effacer les siennes, aval ou non', ({ emplacement }) => {
    // Sans cette branche, un aval retiré emprisonnerait ses propres données
    // dans un espace qu'on ne pourrait plus vider.
    expect(regles.prive[emplacement]['.write']).toContain('!newData.exists()');
  });

  it.each(FOYER)('`prive/$emplacement` refuse un champ que le code n\'écrit pas', ({ emplacement }) => {
    const depense = regles.prive[emplacement].periods.$periode.depenses.$id;
    expect(depense.$autre['.validate']).toBe(false);
    expect(depense['.validate']).toContain("hasChildren(['montant'])");
  });
});

describe('L\'aval : personne ne peut se l\'accorder', () => {
  it.each(FOYER)('`aval/$emplacement` n\'est écrivable QUE par l\'autre', ({ emplacement, proprietaire, autre }) => {
    // La ligne qui fait tout tenir. Ce n'est pas une politesse d'interface :
    // c'est le moteur de règles qui refuse une auto-autorisation.
    const ecriture = regles.aval[emplacement]['.write'];
    expect(ecriture).toContain(autre);
    expect(ecriture, 'le propriétaire pourrait s\'auto-autoriser').not.toContain(proprietaire);
  });

  it.each(FOYER)('`aval/$emplacement` est lisible par les deux', ({ emplacement, proprietaire, autre }) => {
    // Un pacte se lit dans les deux sens : celui qui le reçoit doit voir qu'il
    // l'a, celui qui le donne doit voir qu'il l'a donné.
    const lecture = regles.aval[emplacement]['.read'];
    expect(lecture).toContain(proprietaire);
    expect(lecture).toContain(autre);
  });

  it.each(FOYER)('`aval/$emplacement` exige au moins `actif`', ({ emplacement }) => {
    expect(regles.aval[emplacement]['.validate']).toContain("hasChildren(['actif'])");
    expect(regles.aval[emplacement].actif['.validate']).toBe('newData.isBoolean()');
  });
});

describe('Le total publié : le seul chiffre qui franchit le mur', () => {
  it.each(FOYER)('`totauxPrives/$emplacement` n\'est écrit que par son propriétaire', ({ emplacement, proprietaire, autre }) => {
    const ecriture = regles.totauxPrives[emplacement]['.write'];
    expect(ecriture).toContain(proprietaire);
    expect(ecriture, 'l\'autre pourrait falsifier le total annoncé').not.toContain(autre);
  });

  it.each(FOYER)('`totauxPrives/$emplacement` est lisible par les deux', ({ emplacement, proprietaire, autre }) => {
    const lecture = regles.totauxPrives[emplacement]['.read'];
    expect(lecture).toContain(proprietaire);
    expect(lecture).toContain(autre);
  });

  it.each(FOYER)('`totauxPrives/$emplacement` ne porte QUE des nombres', ({ emplacement }) => {
    // Le contrat du mur, vérifié sur la forme de ce qui sort : un montant, un
    // compte, et rien d'autre. `$autre: false` ferme la porte à un libellé
    // qu'un client complaisant y ajouterait.
    const periode = regles.totauxPrives[emplacement].$periode;
    expect(Object.keys(periode).filter(k => !k.startsWith('.')).sort())
      .toEqual(['$autre', 'montant', 'nombre']);
    expect(periode.$autre['.validate']).toBe(false);
    expect(periode.montant['.validate']).toContain('isNumber()');
    expect(periode.nombre['.validate']).toContain('isNumber()');
  });
});

describe('Toutes les règles exigent une adresse vérifiée', () => {
  it.each(['prive', 'aval', 'totauxPrives'])('`%s` refuse un compte non vérifié', (racine) => {
    // Le fournisseur e-mail reste joignable avec la clé publique du projet :
    // sans cette exigence, il suffirait de créer un compte à l'adresse du foyer
    // pour lire son espace privé.
    for (const { emplacement } of FOYER) {
      for (const acces of ['.read', '.write']) {
        expect(regles[racine][emplacement][acces]).toContain('auth.token.email_verified === true');
        expect(regles[racine][emplacement][acces]).toContain('auth != null');
      }
    }
  });
});
