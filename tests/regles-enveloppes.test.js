import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Les règles de sécurité savent-elles ce que le code écrit ?
 *
 * `household` refuse tout nœud qu'elle ne connaît pas : `$autre` y vaut
 * `.validate: false`. C'est la bonne posture — mais elle a une conséquence
 * qu'on oublie en ajoutant une fonctionnalité : un nœud neuf est refusé tant
 * que les règles ne le nomment pas, et le refus arrive côté serveur, longtemps
 * après que l'interface a affiché un formulaire parfaitement crédible.
 *
 * Ces contrôles portent sur le fichier de règles. Ils ne prouvent pas qu'un
 * déploiement a eu lieu — `tests/deploiement-des-regles.test.js` s'occupe de
 * l'étape, et `tests/e2e/regles-donnees.spec.js` les éprouve contre le moteur
 * réel de l'émulateur — mais ils empêchent que le code et les règles repartent
 * chacun de leur côté.
 */

const regles = JSON.parse(
  readFileSync(resolve(process.cwd(), 'database.rules.json'), 'utf8')
).rules;

/** Les deux espaces de données : le foyer, et le bac à sable */
const ESPACES = ['household', 'sandbox'];

describe('Le nœud des enveloppes', () => {
  it('existe dans les deux espaces de données', () => {
    // Absent, il tomberait sous `$autre: false` : créer une enveloppe
    // échouerait en base après que l'écran a dit « créée ».
    for (const espace of ESPACES) {
      expect(regles[espace].envelopes, `envelopes manque sous ${espace}`).toBeDefined();
    }
  });

  it('exige au minimum un identifiant et un libellé', () => {
    for (const espace of ESPACES) {
      const entree = regles[espace].envelopes.$rang;
      expect(entree['.validate']).toContain("hasChildren(['id', 'label'])");
    }
  });

  it('refuse un champ que le code n\'écrit pas', () => {
    // La même posture que pour les catégories : ce qui n'est pas prévu est
    // refusé, plutôt que stocké au cas où.
    for (const espace of ESPACES) {
      expect(regles[espace].envelopes.$rang.$autre['.validate']).toBe(false);
    }
  });

  it('borne les champs comme les listes voisines', () => {
    for (const espace of ESPACES) {
      const entree = regles[espace].envelopes.$rang;
      expect(entree.id['.validate']).toContain('length <= 100');
      expect(entree.label['.validate']).toContain('length <= 100');
      expect(entree.icon['.validate']).toContain('length <= 20');
      expect(entree.cloturee['.validate']).toContain('isBoolean');
    }
  });

  it('n\'accepte un budget que strictement positif et plafonné', () => {
    // Le plafond est celui de `categoryBudgets` : deux plafonds différents pour
    // deux budgets auraient fini par diverger.
    for (const espace of ESPACES) {
      const budget = regles[espace].envelopes.$rang.budget['.validate'];
      expect(budget).toContain('isNumber()');
      expect(budget).toContain('> 0');
      expect(budget).toContain('<= 10000000');
    }
  });

  it('n\'accepte une date qu\'au format AAAA-MM-JJ', () => {
    for (const espace of ESPACES) {
      for (const borne of ['debut', 'fin']) {
        const regle = regles[espace].envelopes.$rang[borne]['.validate'];
        expect(regle, `${espace}.envelopes.${borne}`)
          .toContain('[0-9]{4}-[0-9]{2}-[0-9]{2}');
      }
    }
  });
});

describe('Le champ porté par les charges', () => {
  it('est déclaré sur les charges fixes comme sur les variables', () => {
    // Une mensualité de chèques vacances est une charge fixe qui appartient à
    // l'enveloppe Vacances : les deux formulaires écrivent le même champ.
    for (const espace of ESPACES) {
      for (const genre of ['fixedCharges', 'variableCharges']) {
        const champ = regles[espace].periods.$periode[genre].$id.envelope;
        expect(champ, `${espace}.${genre}.envelope`).toBeDefined();
        expect(champ['.validate']).toContain('isString()');
        expect(champ['.validate']).toContain('length <= 100');
      }
    }
  });
});

describe('Ce que l\'ajout ne doit pas avoir desserré', () => {
  it('la racine reste fermée', () => {
    expect(regles['.read']).toBe(false);
    expect(regles['.write']).toBe(false);
  });

  it('un nœud inconnu reste refusé dans les deux espaces', () => {
    for (const espace of ESPACES) {
      expect(regles[espace].$autre['.validate']).toBe(false);
    }
  });

  it('l\'espace du foyer exige toujours une adresse vérifiée de la liste', () => {
    for (const acces of ['.read', '.write']) {
      const regle = regles.household[acces];
      expect(regle).toContain('email_verified === true');
      expect(regle).toContain('bigot.richard@gmail.com');
      expect(regle).toContain('cindypepe.cp95@gmail.com');
      // Le compte de test n'a jamais eu sa place ici : il vit dans le bac à
      // sable, et son mot de passe circule.
      expect(regle).not.toContain('testfairsplit@gmail.com');
    }
  });
});
