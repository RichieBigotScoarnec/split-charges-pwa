/**
 * Aucune dépense solo ne bouge un chiffre du foyer
 *
 * Le vrai risque du périmètre n'est pas la fonctionnalité : c'est qu'un champ
 * neuf doive être respecté par une demi-douzaine de fonctions d'argent, et
 * qu'un seul oubli produise un chiffre faux **en silence**. C'est la classe de
 * défaut qui a coûté le plus cher à ce dépôt : le prorata calculé sur une autre
 * assiette que l'écran (100 € nés de rien, cumulés chaque mois), le
 * remboursement sans `direction` compté à l'envers (1 000 € d'écart), le budget
 * par catégorie qui comptait les charges supprimées. Aucun de ces défauts n'a
 * levé d'erreur ; tous ont simplement rendu un nombre.
 *
 * D'où ce test, qui ne vérifie pas une fonction mais une **propriété** :
 *
 *     f(communes) === f(communes + solo)
 *
 * pour toute fonction d'argent `f`. Il ne demande pas comment le filtre est
 * posé, seulement qu'il le soit. Une fonction d'argent ajoutée demain sans
 * respecter le périmètre le fera tomber, ce qu'aucune relecture ne garantit.
 *
 * Le tableau `FONCTIONS` est la liste à tenir : y ajouter toute fonction qui
 * lit une liste de charges pour en tirer un montant.
 */

import { describe, it, expect } from 'vitest';
import {
  computeSummary,
  computeVirementsByDestination,
  computeBalanceChain
} from '../../public/js/utils/calculations.js';
import { previsionnelDuMois } from '../../public/js/utils/previsionnel.js';

/** Un foyer ordinaire : salaires inégaux, prorata, une charge de chaque sorte */
const SALAIRES = { vous: 2000, conjointe: 3000 };

const COMMUNES_FIXES = [
  { id: 'f1', description: 'Loyer', amount: 900, paidBy: 'vous', destination: 'Compte joint', date: '2026-08-05' },
  { id: 'f2', description: 'Internet', amount: 40, paidBy: 'conjointe', destination: 'Compte joint', date: '2026-08-28' }
];

const COMMUNES_VARIABLES = [
  { id: 'v1', description: 'Courses', amount: 210, paidBy: 'vous', category: 'Courses', date: '2026-08-12' },
  { id: 'v2', description: 'Essence', amount: 65, paidBy: 'conjointe', category: 'Transports', date: '2026-08-30' }
];

/**
 * Les dépenses solo, sous toutes leurs formes — y compris les tordues
 *
 * La quatrième est délibérément incohérente (`solo` payé « partage ») : les
 * règles la refusent à l'écriture, mais le calcul doit tenir si elle existe
 * quand même, et la tenir **hors** du solde plutôt que de la réintégrer.
 */
const SOLOS = [
  { id: 's1', description: 'Coiffeur', amount: 45, paidBy: 'vous', perimetre: 'solo', category: 'Soins Personnels', destination: 'Compte joint', date: '2026-08-14' },
  { id: 's2', description: 'Salle de sport', amount: 35, paidBy: 'conjointe', perimetre: 'solo', category: 'Sport', destination: 'Compte joint', date: '2026-08-29' },
  { id: 's3', description: 'Livre', amount: 22, paidBy: 'vous', perimetre: 'solo', category: 'Loisirs', date: '2026-08-31' },
  { id: 's4', description: 'Solo sans propriétaire', amount: 500, paidBy: 'partage', perimetre: 'solo', category: 'Loisirs', destination: 'Compte joint', date: '2026-08-20' }
];

/**
 * Chaque fonction d'argent, appelée deux fois : sans les solo, puis avec.
 *
 * `avec` insère les solo **au milieu** des communes plutôt qu'en fin de liste :
 * un filtre qui se contenterait de tronquer passerait le test autrement.
 */
const FONCTIONS = [
  {
    nom: 'computeSummary — le solde du mois',
    appel: (fixes, variables) => computeSummary({
      salaries: SALAIRES,
      fixedCharges: fixes,
      variableCharges: variables,
      reimbursements: [{ id: 'r1', amount: 100, direction: 'conjointe-vers-vous' }],
      shareMode: 'prorata',
      customPercents: { vous: 50, conjointe: 50 }
    })
  },
  {
    nom: 'computeVirementsByDestination — combien virer',
    appel: (fixes) => computeVirementsByDestination(fixes, {
      shareMode: 'prorata',
      salaries: SALAIRES,
      totalSalaries: 5000,
      customPercents: { vous: 50, conjointe: 50 }
    })
  },
  {
    nom: 'previsionnelDuMois — ce qui reste à passer',
    appel: (fixes, variables) => previsionnelDuMois({
      fixedCharges: fixes,
      variableCharges: variables,
      aujourdhui: '2026-08-27'
    })
  }
];

describe('Aucune fonction d\'argent ne compte une dépense solo', () => {
  for (const { nom, appel } of FONCTIONS) {
    it(nom, () => {
      const sansSolo = appel(COMMUNES_FIXES, COMMUNES_VARIABLES);

      const fixesMelangees = [COMMUNES_FIXES[0], SOLOS[0], SOLOS[3], COMMUNES_FIXES[1], SOLOS[1]];
      const variablesMelangees = [SOLOS[2], COMMUNES_VARIABLES[0], COMMUNES_VARIABLES[1]];
      const avecSolo = appel(fixesMelangees, variablesMelangees);

      expect(avecSolo).toEqual(sansSolo);
    });
  }
});

describe('computeBalanceChain — la chaîne de report lit la base sans passer par aucun chargeur', () => {
  // Le cas qui justifie de répéter la garde dans `computeSummary` plutôt que de
  // s'en remettre au partage de l'état : cette fonction lit `periods` tel quel.
  const periodeSansSolo = {
    '2026-07': {
      salaries: SALAIRES,
      fixedCharges: { f1: { description: 'Loyer', amount: 900, paidBy: 'vous' } },
      variableCharges: { v1: { description: 'Courses', amount: 210, paidBy: 'vous' } },
      reimbursements: {}
    },
    '2026-08': {
      salaries: SALAIRES,
      fixedCharges: { f1: { description: 'Loyer', amount: 900, paidBy: 'conjointe' } },
      variableCharges: { v1: { description: 'Courses', amount: 180, paidBy: 'vous' } },
      reimbursements: {}
    }
  };

  const periodeAvecSolo = JSON.parse(JSON.stringify(periodeSansSolo));
  periodeAvecSolo['2026-07'].variableCharges.s1 =
    { description: 'Coiffeur', amount: 45, paidBy: 'vous', perimetre: 'solo' };
  periodeAvecSolo['2026-08'].fixedCharges.s2 =
    { description: 'Salle de sport', amount: 35, paidBy: 'conjointe', perimetre: 'solo' };

  const contexte = {
    shareMode: 'prorata',
    customPercents: { vous: 50, conjointe: 50 },
    globalSalaries: SALAIRES
  };

  it('les soldes mois par mois sont identiques', () => {
    const sans = [...computeBalanceChain(periodeSansSolo, contexte)];
    const avec = [...computeBalanceChain(periodeAvecSolo, contexte)];
    expect(avec).toEqual(sans);
  });

  it('et le report cumulé ne dérive pas — c\'est lui qui accumule une erreur', () => {
    const sans = computeBalanceChain(periodeSansSolo, contexte).get('2026-08');
    const avec = computeBalanceChain(periodeAvecSolo, contexte).get('2026-08');
    expect(avec.total).toBe(sans.total);
    expect(avec.carry).toBe(sans.carry);
  });
});

describe('Le solo est bien pris en compte quand on le demande explicitement', () => {
  // Le miroir des tests précédents : un filtre qui rendrait toujours zéro les
  // passerait tous. Il faut donc vérifier aussi que les solo existent.
  it('une charge redevient commune si son périmètre le dit', () => {
    const enCommun = SOLOS.map(({ perimetre, ...reste }) => ({ ...reste, paidBy: 'vous' }));
    const avec = computeSummary({
      salaries: SALAIRES,
      fixedCharges: [...COMMUNES_FIXES, ...enCommun],
      variableCharges: COMMUNES_VARIABLES,
      reimbursements: [],
      shareMode: 'prorata',
      customPercents: { vous: 50, conjointe: 50 }
    });
    const sans = computeSummary({
      salaries: SALAIRES,
      fixedCharges: COMMUNES_FIXES,
      variableCharges: COMMUNES_VARIABLES,
      reimbursements: [],
      shareMode: 'prorata',
      customPercents: { vous: 50, conjointe: 50 }
    });

    // 45 + 35 + 22 + 500 = 602 € qui doivent réapparaître dans le total.
    expect(avec.total - sans.total).toBeCloseTo(602, 6);
  });
});
