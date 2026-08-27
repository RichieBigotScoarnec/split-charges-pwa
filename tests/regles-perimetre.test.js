/**
 * Le périmètre est borné côté serveur, pas seulement à l'écran
 *
 * Une dépense perso qui ne pèse pas sur le solde est une décision d'argent.
 * Si seule l'application la contrôle, il suffit d'écrire dans la base — les
 * deux comptes du foyer y ont un accès complet — pour sortir n'importe quelle
 * charge du solde, ou pour y remettre celles de l'autre. Le contrôle doit donc
 * vivre dans `database.rules.json`, où il est vrai.
 *
 * Ces contrôles-ci portent sur le fichier, et tournent en CI sans émulateur.
 * Les mêmes règles ont été rejouées contre le **moteur réel** — 14 écritures,
 * 6 qui doivent passer et 8 qui doivent être refusées, toutes conformes — et
 * `tests/e2e/regles-donnees.spec.js` en éprouve d'autres de la même façon.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const regles = JSON.parse(
  readFileSync(resolve(process.cwd(), 'database.rules.json'), 'utf8')
).rules;

/** Les quatre blocs de charges : deux espaces × deux natures */
const BLOCS = [];
for (const espace of ['household', 'sandbox']) {
  for (const collection of ['fixedCharges', 'variableCharges']) {
    BLOCS.push({
      nom: `${espace}/${collection}`,
      regle: regles[espace].periods.$periode[collection].$id
    });
  }
}

describe('Le champ `perimetre` est déclaré partout où le code l\'écrit', () => {
  it.each(BLOCS)('$nom le déclare', ({ regle }) => {
    // Sans déclaration, il tomberait dans le fourre-tout `$autre`, qui accepte
    // n'importe quelle chaîne de 500 caractères. C'est ce qui était arrivé à
    // `heure` : le seul champ d'une charge sans règle propre.
    expect(regle.perimetre).toBeDefined();
  });

  it.each(BLOCS)('$nom n\'accepte que « commun » et « solo »', ({ regle }) => {
    const v = regle.perimetre['.validate'];
    expect(v).toContain('isString()');
    expect(v).toContain("=== 'commun'");
    expect(v).toContain("=== 'solo'");
  });
});

describe('L\'invariant croisé : une dépense solo désigne son propriétaire', () => {
  it.each(BLOCS)('$nom exige un payeur nommé quand le périmètre vaut solo', ({ regle }) => {
    // Le cœur de la règle. `perimetre: 'solo'` avec `paidBy: 'partage'` n'a pas
    // de sens : une dépense perso est payée par la personne à qui elle
    // appartient. Sans cet invariant, une charge pourrait sortir du solde sans
    // que personne ne sache à qui elle est — et le total « perso » affiché à
    // l'autre serait faux des deux côtés.
    const v = regle['.validate'];
    expect(v).toContain("perimetre').val() !== 'solo'");
    expect(v).toContain("paidBy').val() === 'vous'");
    expect(v).toContain("paidBy').val() === 'conjointe'");
  });

  it.each(BLOCS)('$nom laisse passer une charge sans périmètre — tout l\'existant', ({ regle }) => {
    // La rétrocompatibilité, écrite dans la règle : `!newData.hasChild(…)`
    // ouvre la porte à toutes les charges déjà en base, qui n'ont pas ce champ.
    // Sans cette clause, l'invariant refuserait chaque charge historique
    // rouverte, et la reconduction du mois échouerait en bloc.
    expect(regle['.validate']).toContain("!newData.hasChild('perimetre')");
  });

  it.each(BLOCS)('$nom continue d\'exiger un montant', ({ regle }) => {
    // L'invariant a été ajouté à un `.validate` qui portait déjà cette
    // exigence : la remplacer plutôt que la compléter aurait ouvert l'écriture
    // d'une charge sans montant, que `computeSummary` compte pour zéro.
    expect(regle['.validate']).toContain("hasChildren(['amount'])");
  });
});
