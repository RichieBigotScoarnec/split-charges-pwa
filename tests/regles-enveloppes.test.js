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

  it('LA PROVENANCE est déclarée, sinon elle serait refusée en silence', () => {
    // `$autre: false` refuse tout champ non nommé, et le refus arrive côté
    // serveur — après que l'écran a dit « créée ». Deux champs neufs sans
    // règle, c'est une enveloppe qui ne s'écrit plus du tout.
    for (const espace of ESPACES) {
      const entree = regles[espace].envelopes.$rang;

      expect(entree.creePar, `creePar manque sous ${espace}`).toBeDefined();
      // Les deux mêmes valeurs que l'auteur d'un versement : pas de texte libre.
      expect(entree.creePar['.validate']).toContain("=== 'vous'");
      expect(entree.creePar['.validate']).toContain("=== 'conjointe'");

      expect(entree.creeLe, `creeLe manque sous ${espace}`).toBeDefined();
      expect(entree.creeLe['.validate']).toContain('isNumber');
    }
  });

  it('la provenance d\'une enveloppe est bornée comme celle d\'un versement', () => {
    // Une seule convention pour la même chose : si les deux divergent, l'une
    // des deux acceptera un jour ce que l'autre refuse.
    for (const espace of ESPACES) {
      const enveloppe = regles[espace].envelopes.$rang;
      const versement = regles[espace].versements.$enveloppe.$versement;

      expect(enveloppe.creePar['.validate']).toBe(versement.auteur['.validate']);
      expect(enveloppe.creeLe['.validate']).toBe(versement.timestamp['.validate']);
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

describe('L\'allocation et le rythme, bornés côté serveur', () => {
  // Ces champs décident de ce que l'écran affiche comme « restant ». Une nature
  // inventée ferait retomber la lecture sur le défaut `cagnotte` côté client —
  // silencieusement, et sur une enveloppe qui se croit mensuelle. Le refus
  // appartient donc au serveur, où il est vrai pour les deux téléphones.
  //
  // Rejoué contre le moteur réel : 16 écritures, 7 acceptées et 9 refusées,
  // toutes conformes.
  const CHAMPS = {
    nature: ["=== 'mensuelle'", "=== 'cagnotte'"],
    rang: ["=== 'fixe'", "=== 'mensuel'", "=== 'provision'", "=== 'epargne'", "=== 'reserve'"],
    perimetre: ["=== 'commun'", "=== 'solo'"],
    proprietaire: ["=== 'vous'", "=== 'conjointe'"]
  };

  for (const [champ, valeurs] of Object.entries(CHAMPS)) {
    it(`\`${champ}\` n'accepte que ses valeurs connues, dans les deux espaces`, () => {
      for (const espace of ESPACES) {
        const regle = regles[espace].envelopes.$rang[champ];
        expect(regle, `${champ} manque sous ${espace}`).toBeDefined();
        expect(regle['.validate']).toContain('isString()');
        for (const valeur of valeurs) {
          expect(regle['.validate']).toContain(valeur);
        }
      }
    });
  }

  it('`report` est un booléen, pas une chaîne « oui »', () => {
    for (const espace of ESPACES) {
      expect(regles[espace].envelopes.$rang.report['.validate']).toBe('newData.isBoolean()');
    }
  });

  it('une enveloppe solo doit désigner son propriétaire', () => {
    // Sans cet invariant, une enveloppe pourrait sortir du commun sans qu'on
    // sache à qui elle est — le jumeau exact du contrôle posé sur les charges.
    for (const espace of ESPACES) {
      const v = regles[espace].envelopes.$rang['.validate'];
      expect(v).toContain("perimetre').val() !== 'solo'");
      expect(v).toContain("hasChild('proprietaire')");
    }
  });

  it('et un propriétaire n\'a de sens que sur une solo', () => {
    // L'invariant réciproque : « commune, appartenant à Richard » est
    // contradictoire, et la contradiction se lirait différemment selon l'écran.
    for (const espace of ESPACES) {
      const v = regles[espace].envelopes.$rang['.validate'];
      expect(v).toContain("!newData.hasChild('proprietaire')");
      expect(v).toContain("child('perimetre').val() === 'solo'");
    }
  });

  it('l\'exigence d\'origine tient toujours : un identifiant et un libellé', () => {
    // L'invariant a été ajouté à un `.validate` qui portait déjà cette
    // exigence. La remplacer plutôt que la compléter aurait ouvert l'écriture
    // d'une enveloppe anonyme, que `normaliserEnveloppe` écarte ensuite — donc
    // une entrée en base que plus rien n'affiche ni ne supprime.
    for (const espace of ESPACES) {
      expect(regles[espace].envelopes.$rang['.validate'])
        .toContain("hasChildren(['id', 'label'])");
    }
  });
});

describe('Les versements : un nœud neuf, donc refusé tant qu\'il n\'est pas nommé', () => {
  // `household` refuse tout ce qu'elle ne connaît pas — `$autre` y vaut
  // `.validate: false`. Un nœud ajouté sans être déclaré est donc rejeté côté
  // serveur, longtemps après que l'écran a affiché un formulaire crédible et
  // un toast de succès. C'est exactement ce qui était arrivé à
  // `reconductedFrom` : les charges fixes n'étaient reconduites aucun mois.
  //
  // Rejoué contre le moteur réel : 14 écritures, 5 acceptées et 9 refusées,
  // toutes conformes.
  it('le nœud existe dans les deux espaces de données', () => {
    for (const espace of ESPACES) {
      expect(regles[espace].versements, `versements manque sous ${espace}`).toBeDefined();
    }
  });

  it('un versement exige un montant ET un auteur', () => {
    // Sans auteur, « vous avez mis 400, elle 300 » devient incalculable — et
    // c'est la seule question qu'on pose à un pot commun.
    for (const espace of ESPACES) {
      expect(regles[espace].versements.$enveloppe.$versement['.validate'])
        .toContain("hasChildren(['montant', 'auteur'])");
    }
  });

  it('le montant est strictement positif : un versement négatif serait un retrait déguisé', () => {
    for (const espace of ESPACES) {
      const v = regles[espace].versements.$enveloppe.$versement.montant['.validate'];
      expect(v).toContain('isNumber()');
      expect(v).toContain('> 0');
      expect(v).toContain('<= 10000000');
    }
  });

  it('l\'auteur désigne une personne, jamais « partage »', () => {
    for (const espace of ESPACES) {
      const v = regles[espace].versements.$enveloppe.$versement.auteur['.validate'];
      expect(v).toContain("=== 'vous'");
      expect(v).toContain("=== 'conjointe'");
      expect(v).not.toContain("'partage'");
    }
  });

  it('la date suit le format des autres dates, chaîne vide comprise', () => {
    for (const espace of ESPACES) {
      const v = regles[espace].versements.$enveloppe.$versement.date['.validate'];
      expect(v).toContain("newData.val() === ''");
      expect(v).toContain('[0-9]{4}-[0-9]{2}-[0-9]{2}');
    }
  });

  it('LA PROVENANCE est déclarée, sinon elle serait refusée en silence', () => {
    // `$autre: false` refuse tout champ non nommé, et le refus arrive côté
    // serveur — après que l'écran a dit « créée ». Deux champs neufs sans
    // règle, c'est une enveloppe qui ne s'écrit plus du tout.
    for (const espace of ESPACES) {
      const entree = regles[espace].envelopes.$rang;

      expect(entree.creePar, `creePar manque sous ${espace}`).toBeDefined();
      // Les deux mêmes valeurs que l'auteur d'un versement : pas de texte libre.
      expect(entree.creePar['.validate']).toContain("=== 'vous'");
      expect(entree.creePar['.validate']).toContain("=== 'conjointe'");

      expect(entree.creeLe, `creeLe manque sous ${espace}`).toBeDefined();
      expect(entree.creeLe['.validate']).toContain('isNumber');
    }
  });

  it('la provenance d\'une enveloppe est bornée comme celle d\'un versement', () => {
    // Une seule convention pour la même chose : si les deux divergent, l'une
    // des deux acceptera un jour ce que l'autre refuse.
    for (const espace of ESPACES) {
      const enveloppe = regles[espace].envelopes.$rang;
      const versement = regles[espace].versements.$enveloppe.$versement;

      expect(enveloppe.creePar['.validate']).toBe(versement.auteur['.validate']);
      expect(enveloppe.creeLe['.validate']).toBe(versement.timestamp['.validate']);
    }
  });

  it('refuse un champ que le code n\'écrit pas', () => {
    // La même posture que pour les enveloppes et les catégories : ce qui n'est
    // pas prévu est refusé, plutôt que stocké au cas où.
    for (const espace of ESPACES) {
      expect(regles[espace].versements.$enveloppe.$versement.$autre['.validate']).toBe(false);
    }
  });

  it('la suppression reste douce : `deleted` est déclaré', () => {
    for (const espace of ESPACES) {
      expect(regles[espace].versements.$enveloppe.$versement.deleted['.validate'])
        .toBe('newData.isBoolean()');
    }
  });
});
