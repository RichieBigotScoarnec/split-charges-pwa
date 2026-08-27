/**
 * L'allocation d'une enveloppe : ce qu'on lui donne, ce qu'il lui reste
 *
 * L'enveloppe savait dire ce qu'elle avait coûté. Elle ne savait pas dire ce
 * qu'il lui restait — c'est pourtant la seule des deux lectures qui fasse
 * prendre une décision. « 480 € dépensés » se constate ; « 120 € restants » se
 * décide.
 *
 * Deux natures, parce qu'un budget et une cagnotte n'ont pas le même reliquat :
 *
 *   mensuelle — le reliquat est une *information*. Reporter les 120 € non
 *               dépensés en août gonflerait septembre, puis octobre, et au bout
 *               d'un trimestre le budget ne mesurerait plus rien.
 *   cagnotte  — le reliquat *est* de l'argent. Les 28,63 € d'une provision
 *               travaux existent, et zéroter chaque 1er les ferait disparaître.
 *
 * Le contrat le plus important de ce fichier est ailleurs : **une enveloppe
 * écrite avant que ces champs existent doit se comporter exactement comme
 * avant**. C'est le rôle du défaut `cagnotte`.
 */

import { describe, it, expect } from 'vitest';
import {
  NATURES,
  RANGS,
  normaliserEnveloppe,
  moisEcoules,
  chargesRetenues,
  allocationCumulee,
  bilanEnveloppe,
  resteParJour
} from '../../public/js/utils/enveloppes.js';

/** Trois mois de courses, pour éprouver le cadrage */
const COURSES = [
  { id: 'a', amount: 180, periode: '2026-06' },
  { id: 'b', amount: 200, periode: '2026-07' },
  { id: 'c', amount: 150, periode: '2026-08' },
  { id: 'd', amount: 90, periode: '2026-08' }
];

const mensuelle = (extra = {}) => normaliserEnveloppe({
  id: 'courses', label: 'Courses', nature: 'mensuelle', budget: 600, ...extra
});

const cagnotte = (extra = {}) => normaliserEnveloppe({
  id: 'travaux', label: 'Travaux', budget: 1200, ...extra
});

// ═══════════════════════════════════════════════════════════════════════════
describe('La nature, et le défaut qui préserve l\'existant', () => {
  it('une enveloppe sans le champ est une cagnotte', () => {
    // Le contrat qui protège toutes celles déjà en base : elles traversaient
    // les mois et se comparaient à un budget total. C'est la cagnotte.
    expect(normaliserEnveloppe({ id: 'x', label: 'X' }).nature).toBe(NATURES.CAGNOTTE);
  });

  it.each([['Mensuelle'], ['MENSUELLE'], [' mensuelle'], ['mois'], [''], [true], [1]])(
    '« %s » ne bascule pas en mensuelle',
    (nature) => {
      expect(normaliserEnveloppe({ id: 'x', label: 'X', nature }).nature).toBe(NATURES.CAGNOTTE);
    }
  );

  it('seule la chaîne exacte bascule', () => {
    expect(normaliserEnveloppe({ id: 'x', label: 'X', nature: 'mensuelle' }).nature)
      .toBe(NATURES.MENSUELLE);
  });

  it('le report ne s\'attrape que sur une mensuelle', () => {
    // Une cagnotte reporte par nature : le drapeau y serait redondant, et
    // laisser deux façons de dire la même chose invite à ce qu'elles divergent.
    expect(normaliserEnveloppe({ id: 'x', label: 'X', report: true }).report).toBe(false);
    expect(mensuelle({ report: true }).report).toBe(true);
    expect(mensuelle().report).toBe(false);
  });

  it('le rang n\'accepte que les cinq valeurs connues', () => {
    for (const rang of Object.values(RANGS)) {
      expect(normaliserEnveloppe({ id: 'x', label: 'X', rang }).rang).toBe(rang);
    }
    expect(normaliserEnveloppe({ id: 'x', label: 'X', rang: 'divers' }).rang).toBeNull();
    expect(normaliserEnveloppe({ id: 'x', label: 'X' }).rang).toBeNull();
  });

  it('une enveloppe solo désigne son propriétaire, ou personne', () => {
    const solo = normaliserEnveloppe({ id: 'x', label: 'X', perimetre: 'solo', proprietaire: 'vous' });
    expect(solo.perimetre).toBe('solo');
    expect(solo.proprietaire).toBe('vous');

    // La même règle que pour une charge : un propriétaire illisible n'en
    // désigne aucun plutôt que d'en désigner un au hasard.
    const bancale = normaliserEnveloppe({ id: 'x', label: 'X', perimetre: 'solo', proprietaire: 'partage' });
    expect(bancale.perimetre).toBe('solo');
    expect(bancale.proprietaire).toBeNull();

    // Et un propriétaire sur une enveloppe commune n'a pas de sens.
    const commune = normaliserEnveloppe({ id: 'x', label: 'X', proprietaire: 'vous' });
    expect(commune.perimetre).toBe('commun');
    expect(commune.proprietaire).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('moisEcoules — compter sans fabriquer de date', () => {
  it('le même mois vaut un', () => {
    expect(moisEcoules('2026-08', '2026-08')).toBe(1);
  });

  it('deux mois consécutifs valent deux — les bornes comptent', () => {
    expect(moisEcoules('2026-07', '2026-08')).toBe(2);
  });

  it('traverse un changement d\'année', () => {
    expect(moisEcoules('2025-11', '2026-02')).toBe(4);
  });

  it('accepte une date complète et n\'en lit que le mois', () => {
    expect(moisEcoules('2026-03-17', '2026-08-02')).toBe(6);
  });

  it('un ordre inversé ne rend pas un compte négatif', () => {
    // Une allocation négative inventerait de l'argent à l'envers.
    expect(moisEcoules('2026-08', '2026-06')).toBe(1);
  });

  it.each([[null], [undefined], ['août'], ['2026'], ['2026-13'], [20268]])(
    'une borne illisible (%s) rend zéro plutôt qu\'un compte inventé',
    (valeur) => {
      expect(moisEcoules(valeur, '2026-08')).toBe(0);
      expect(moisEcoules('2026-08', valeur)).toBe(0);
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
describe('chargesRetenues — ce que chaque nature regarde', () => {
  it('une cagnotte regarde tout, depuis toujours', () => {
    expect(chargesRetenues(COURSES, cagnotte(), '2026-08')).toHaveLength(4);
  });

  it('une mensuelle sans report ne regarde que le mois consulté', () => {
    const retenues = chargesRetenues(COURSES, mensuelle(), '2026-08');
    expect(retenues.map(c => c.id)).toEqual(['c', 'd']);
  });

  it('et change de réponse quand on change de mois', () => {
    expect(chargesRetenues(COURSES, mensuelle(), '2026-06').map(c => c.id)).toEqual(['a']);
    expect(chargesRetenues(COURSES, mensuelle(), '2026-09')).toEqual([]);
  });

  it('une mensuelle à report remonte à son début déclaré', () => {
    const env = mensuelle({ report: true, debut: '2026-07-01' });
    expect(chargesRetenues(COURSES, env, '2026-08').map(c => c.id)).toEqual(['b', 'c', 'd']);
  });

  it('sans début déclaré, elle remonte à sa plus ancienne dépense', () => {
    const env = mensuelle({ report: true });
    expect(chargesRetenues(COURSES, env, '2026-08')).toHaveLength(4);
  });

  it('et ne regarde jamais au-delà du mois consulté', () => {
    // Un mois futur ne doit pas consommer l'allocation du mois affiché.
    const env = mensuelle({ report: true, debut: '2026-06-01' });
    expect(chargesRetenues(COURSES, env, '2026-07').map(c => c.id)).toEqual(['a', 'b']);
  });

  it('un mois consulté illisible ne filtre rien plutôt que de tout jeter', () => {
    expect(chargesRetenues(COURSES, mensuelle(), 'août')).toHaveLength(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('allocationCumulee — ce que l\'enveloppe s\'est vu donner', () => {
  it('une cagnotte a son budget, une fois', () => {
    expect(allocationCumulee(cagnotte(), COURSES, '2026-08')).toBe(1200);
  });

  it('une mensuelle sans report a son budget, chaque mois', () => {
    expect(allocationCumulee(mensuelle(), COURSES, '2026-08')).toBe(600);
    expect(allocationCumulee(mensuelle(), COURSES, '2026-06')).toBe(600);
  });

  it('une mensuelle à report accumule mois après mois', () => {
    // 600 €/mois depuis juin, consultée en août : juin, juillet, août = 1 800 €.
    const env = mensuelle({ report: true, debut: '2026-06-01' });
    expect(allocationCumulee(env, COURSES, '2026-08')).toBe(1800);
    expect(allocationCumulee(env, COURSES, '2026-06')).toBe(600);
  });

  it('sans budget déclaré, il n\'y a rien à comparer', () => {
    expect(allocationCumulee(mensuelle({ budget: null }), COURSES, '2026-08')).toBeNull();
    expect(allocationCumulee(cagnotte({ budget: 0 }), COURSES, '2026-08')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('bilanEnveloppe — la jauge descend au lieu de monter', () => {
  it('une cagnotte se comporte exactement comme avant', () => {
    // Le contrôle de non-régression : c'est ce que faisait l'enveloppe pour
    // toutes celles déjà en base.
    const bilan = bilanEnveloppe(COURSES, cagnotte(), '2026-08');
    expect(bilan.total).toBe(620);
    expect(bilan.allocation).toBe(1200);
    expect(bilan.reste).toBe(580);
    expect(bilan.mois).toBe(3);
    expect(bilan.nombre).toBe(4);
  });

  it('une mensuelle ne compte que son mois', () => {
    const bilan = bilanEnveloppe(COURSES, mensuelle(), '2026-08');
    expect(bilan.total).toBe(240);
    expect(bilan.allocation).toBe(600);
    expect(bilan.reste).toBe(360);
  });

  it('partRestante descend quand on dépense', () => {
    // 240 dépensés sur 600 : il reste 60 %.
    expect(bilanEnveloppe(COURSES, mensuelle(), '2026-08').partRestante).toBe(60);
    // Un mois sans dépense : tout est encore là.
    expect(bilanEnveloppe(COURSES, mensuelle(), '2026-09').partRestante).toBe(100);
  });

  it('un dépassement ne fait pas sortir la barre de son cadre, ni disparaître', () => {
    const bilan = bilanEnveloppe(COURSES, mensuelle({ budget: 200 }), '2026-08');
    expect(bilan.depasse).toBe(true);
    expect(bilan.reste).toBe(-40);
    expect(bilan.partRestante, 'une barre négative disparaîtrait').toBe(0);
    expect(bilan.part, 'une barre au-delà de 100 déborderait').toBe(100);
  });

  it('une mensuelle à report compare l\'accumulé à l\'accumulé', () => {
    // 600 €/mois depuis juin = 1 800 € alloués, 620 € dépensés → 1 180 € restants.
    // Le piège serait de comparer 620 € de dépenses cumulées à 600 € d'une
    // seule allocation, et d'annoncer un dépassement là où il n'y en a pas.
    const env = mensuelle({ report: true, debut: '2026-06-01' });
    const bilan = bilanEnveloppe(COURSES, env, '2026-08');
    expect(bilan.total).toBe(620);
    expect(bilan.allocation).toBe(1800);
    expect(bilan.reste).toBe(1180);
    expect(bilan.depasse).toBe(false);
  });

  it('sans allocation, ne compare rien plutôt que de comparer à zéro', () => {
    const bilan = bilanEnveloppe(COURSES, cagnotte({ budget: null }), '2026-08');
    expect(bilan.allocation).toBeNull();
    expect(bilan.reste).toBeNull();
    expect(bilan.partRestante).toBeNull();
    expect(bilan.depasse).toBe(false);
    expect(bilan.total, 'le total reste dû').toBe(620);
  });

  it('un montant abîmé vaut zéro, jamais NaN', () => {
    const abimees = [{ amount: 100, periode: '2026-08' }, { amount: undefined, periode: '2026-08' }];
    const bilan = bilanEnveloppe(abimees, mensuelle(), '2026-08');
    expect(bilan.total).toBe(100);
    expect(Number.isFinite(bilan.reste)).toBe(true);
  });

  it('ne lève ni sur une liste vide ni sur une enveloppe absente', () => {
    expect(bilanEnveloppe([], mensuelle(), '2026-08').total).toBe(0);
    expect(bilanEnveloppe(null, null, null).nombre).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('resteParJour — le nombre qui fait ralentir', () => {
  const env = mensuelle({ budget: 600 });

  it('divise ce qui reste par les jours qui restent, celui-ci compris', () => {
    // Août a 31 jours. Le 22, il en reste 10 (du 22 au 31 inclus).
    // 240 dépensés sur 600 → 360 restants → 36 €/jour.
    const bilan = bilanEnveloppe(COURSES, env, '2026-08');
    const parJour = resteParJour(bilan, '2026-08', '2026-08-22');
    expect(parJour.jours).toBe(10);
    expect(parJour.parJour).toBeCloseTo(36, 6);
  });

  it('le dernier jour du mois ne divise pas par zéro', () => {
    const bilan = bilanEnveloppe(COURSES, env, '2026-08');
    const parJour = resteParJour(bilan, '2026-08', '2026-08-31');
    expect(parJour.jours).toBe(1);
    expect(parJour.parJour).toBeCloseTo(360, 6);
  });

  it('connaît la longueur réelle des mois, février compris', () => {
    const bilan = bilanEnveloppe([], mensuelle({ budget: 280 }), '2028-02');
    // 2028 est bissextile : 29 jours.
    expect(resteParJour(bilan, '2028-02', '2028-02-01').jours).toBe(29);
    const court = bilanEnveloppe([], mensuelle({ budget: 280 }), '2026-02');
    expect(resteParJour(court, '2026-02', '2026-02-01').jours).toBe(28);
  });

  it('se tait sur un autre mois que celui en cours', () => {
    // Un mois révolu n'a plus de jours devant lui ; un mois à venir n'a pas
    // commencé. Un « 0 €/jour » s'y lirait comme une alerte.
    const bilan = bilanEnveloppe(COURSES, env, '2026-07');
    expect(resteParJour(bilan, '2026-07', '2026-08-22')).toBeNull();
  });

  it('se tait sur une cagnotte : elle n\'a pas d\'échéance mensuelle', () => {
    const bilan = bilanEnveloppe(COURSES, cagnotte(), '2026-08');
    expect(resteParJour(bilan, '2026-08', '2026-08-22')).toBeNull();
  });

  it('se tait sans allocation', () => {
    const bilan = bilanEnveloppe(COURSES, mensuelle({ budget: null }), '2026-08');
    expect(resteParJour(bilan, '2026-08', '2026-08-22')).toBeNull();
  });

  it('rend un chiffre négatif quand le pot est dépassé, plutôt que de se taire', () => {
    // C'est précisément le moment où l'on veut être prévenu.
    const bilan = bilanEnveloppe(COURSES, mensuelle({ budget: 200 }), '2026-08');
    const parJour = resteParJour(bilan, '2026-08', '2026-08-22');
    expect(parJour.parJour).toBeLessThan(0);
  });

  it.each([[null], ['2026-08'], ['hier'], [42]])(
    'un jour illisible (%s) rend null plutôt qu\'un NaN par jour',
    (aujourdhui) => {
      const bilan = bilanEnveloppe(COURSES, env, '2026-08');
      expect(resteParJour(bilan, '2026-08', aujourdhui)).toBeNull();
    }
  );
});
