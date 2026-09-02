/**
 * Le mur de confidentialité vit dans les règles, pas dans l'écran
 *
 * Une confidentialité écrite en JavaScript est du théâtre : l'autre personne a
 * exactement les mêmes accès à la base, et un drapeau « masqué » est un rideau.
 * Ces contrôles vérifient donc la seule chose qui compte — la forme des règles.
 *
 * ## Ce que l'aval gouverne
 *
 *     Écrire chez soi ne demande rien. Lire chez l'autre demande son accord.
 *
 * Chacun a le droit d'avoir des dépenses à soi sans avoir à les mendier :
 * `/prive/{qui}` est écrivable par `{qui}`, sans condition. Ce qui est soumis à
 * validation, c'est l'accès au **détail de l'autre** — et l'accord est donné
 * par le propriétaire, sur ses propres données.
 *
 * Une version antérieure faisait l'inverse : elle exigeait l'accord de la
 * conjointe pour enregistrer ses propres dépenses privées. Elle confondait
 * « avoir un jardin secret » et « avoir la clé du sien ».
 *
 * ## Le point qui fait tenir l'ensemble
 *
 * **Personne ne peut s'accorder l'accès aux données de l'autre.**
 * `/aval/{qui}` n'est écrivable que par `{qui}` : vouloir lire l'espace de sa
 * conjointe en écrivant soi-même l'autorisation est refusé par le moteur de
 * règles. C'est la même garantie que la version précédente, dans l'autre sens —
 * on ne peut jamais se donner à soi-même la chose qui compte.
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

describe('Écrire chez soi ne demande rien', () => {
  it.each(FOYER)('`prive/$emplacement` est écrivable par son propriétaire, sans condition', ({ emplacement, proprietaire, autre }) => {
    // Le contrôle qui dit le sujet. Chacun a le droit d'avoir des dépenses à
    // soi sans avoir à les mendier : conditionner l'écriture à l'accord de
    // l'autre demanderait la permission d'avoir un jardin secret.
    const ecriture = regles.prive[emplacement]['.write'];
    expect(ecriture).toContain(proprietaire);
    expect(ecriture, 'l\'autre pourrait écrire chez soi').not.toContain(autre);
    expect(ecriture, 'écrire ses propres dépenses ne doit dépendre d\'aucun aval')
      .not.toContain('aval');
  });

  it.each(FOYER)('`prive/$emplacement` refuse un champ que le code n\'écrit pas', ({ emplacement }) => {
    const depense = regles.prive[emplacement].periods.$periode.depenses.$id;
    expect(depense.$autre['.validate']).toBe(false);
    expect(depense['.validate']).toContain("hasChildren(['montant'])");
  });
});

describe('Lire chez l\'autre demande son accord', () => {
  it.each(FOYER)('`prive/$emplacement` est toujours lisible par son propriétaire', ({ emplacement, proprietaire }) => {
    // Sans condition, et surtout pas la sienne : quelqu'un qui n'aurait rien
    // ouvert ne pourrait plus relire ses propres dépenses.
    expect(regles.prive[emplacement]['.read']).toContain(proprietaire);
  });

  it.each(FOYER)('l\'autre ne lit `prive/$emplacement` QUE si le propriétaire l\'a ouvert', ({ emplacement, autre }) => {
    // Le mur. L'autre apparaît dans la règle de lecture, mais jamais seul :
    // toujours accompagné de la condition qui l'autorise.
    const lecture = regles.prive[emplacement]['.read'];
    expect(lecture).toContain(autre);
    expect(lecture).toContain(`root.child('aval/${emplacement}/actif').val() === true`);

    // Et la condition porte bien sur l'autre, pas sur le propriétaire : un
    // parenthésage fautif rendrait la clause inopérante tout en la gardant
    // présente dans le texte.
    const clause = lecture.slice(lecture.indexOf(autre));
    expect(clause, 'la condition ne s\'applique pas à l\'autre')
      .toContain(`root.child('aval/${emplacement}/actif').val() === true`);
  });

  it.each(FOYER)('refermer l\'accès de `prive/$emplacement` referme aussi le passé', ({ emplacement }) => {
    // Cohérent avec ce qu'est cet accord : une permission de **lecture**, pas
    // un permis d'écrire déjà consommé. Ce que la règle exprime en n'ayant
    // aucune branche qui survivrait au retrait.
    const lecture = regles.prive[emplacement]['.read'];
    expect(lecture.match(/aval/g), 'une seule condition d\'accès, pas deux chemins')
      .toHaveLength(1);
  });
});

describe('L\'accord : personne ne peut se l\'accorder', () => {
  it.each(FOYER)('`aval/$emplacement` n\'est écrivable QUE par son propriétaire', ({ emplacement, proprietaire, autre }) => {
    // La ligne qui fait tout tenir. `/aval/{qui}` ouvre l'espace de `{qui}` :
    // laisser l'autre l'écrire reviendrait à se donner soi-même l'accès aux
    // données d'en face. Ce n'est pas une politesse d'interface — c'est le
    // moteur de règles qui refuse.
    const ecriture = regles.aval[emplacement]['.write'];
    expect(ecriture).toContain(proprietaire);
    expect(ecriture, 'l\'autre s\'accorderait l\'accès à cet espace').not.toContain(autre);
  });

  it.each(FOYER)('`aval/$emplacement` n\'enregistre que son propriétaire comme auteur', ({ emplacement }) => {
    // Redondant avec la règle d'écriture, et voulu : la trace d'audit ne peut
    // pas désigner quelqu'un qui n'avait pas le droit d'écrire ici.
    expect(regles.aval[emplacement].accordePar['.validate'])
      .toBe(`newData.isString() && newData.val() === '${emplacement}'`);
  });

  it.each(FOYER)('`aval/$emplacement` est lisible par les deux', ({ emplacement, proprietaire, autre }) => {
    // Un accord se lit dans les deux sens : celui qui le reçoit doit voir
    // qu'il l'a, celui qui le donne doit voir ce qu'il a ouvert.
    const lecture = regles.aval[emplacement]['.read'];
    expect(lecture).toContain(proprietaire);
    expect(lecture).toContain(autre);
  });

  it.each(FOYER)('`aval/$emplacement` exige au moins `actif`', ({ emplacement }) => {
    expect(regles.aval[emplacement]['.validate']).toContain("hasChildren(['actif'])");
    expect(regles.aval[emplacement].actif['.validate']).toBe('newData.isBoolean()');
  });

  it.each(FOYER)('`aval/$emplacement` accepte `publieLeTotal`', ({ emplacement }) => {
    // Le second drapeau du partage. Sans lui, « je ne publie rien » ne tiendrait
    // pas une seule saisie : le total serait déduit de sa propre absence, et la
    // dépense suivante le republierait toute seule.
    //
    // Le champ DOIT être déclaré : `$autre/.validate` vaut `false`, donc tout
    // nom non prévu est refusé par le serveur — l'écriture échouerait en
    // silence côté écran.
    expect(regles.aval[emplacement].publieLeTotal['.validate']).toBe('newData.isBoolean()');
    expect(regles.aval[emplacement].$autre['.validate'], 'les champs inconnus restent refusés')
      .toBe(false);
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
