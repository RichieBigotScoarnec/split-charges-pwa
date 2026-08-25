import { describe, it, expect } from 'vitest';
import { jourDeTri, plusRecenteDAbord, trierParDate, grouperParCategorie } from '../../public/js/utils/tri.js';

/**
 * L'ordre d'affichage
 *
 * Rien n'était trié — ni les charges fixes, ni les variables, ni les
 * remboursements. Les entrées sortaient dans l'ordre où Firebase rend ses clés,
 * c'est-à-dire l'ordre de création : une dépense du 3, saisie après une du 20,
 * s'affichait après elle.
 *
 * Le défaut est resté invisible tant qu'aucune date ne s'affichait. Sans repère
 * temporel, un ordre arbitraire ressemble à un ordre — c'est précisément ce qui
 * le rendait indétectable autrement qu'en s'en servant.
 */

const le = (jour, extra = {}) => ({ date: jour, amount: 10, ...extra });

describe('Le jour retenu pour trier', () => {
  it('prend la date déclarée', () => {
    expect(jourDeTri({ date: '2026-08-15' })).toBe('2026-08-15');
  });

  it('tire le jour local d\'un horodatage, pour les entrées anciennes', () => {
    // Les deux formes doivent se comparer entre elles : sans conversion, on
    // comparerait une chaîne à un nombre de millisecondes.
    expect(jourDeTri({ timestamp: new Date(2026, 7, 15, 14, 0).getTime() })).toBe('2026-08-15');
  });

  it('rend une chaîne vide quand l\'entrée n\'apprend rien', () => {
    expect(jourDeTri({})).toBe('');
    expect(jourDeTri(null)).toBe('');
  });
});

describe('Le plus récent d\'abord', () => {
  it('classe par jour décroissant', () => {
    const trie = trierParDate([le('2026-08-03'), le('2026-08-20'), le('2026-08-11')]);
    expect(trie.map(c => c.date)).toEqual(['2026-08-20', '2026-08-11', '2026-08-03']);
  });

  it('départage un même jour par l\'ordre de saisie, la dernière en tête', () => {
    // C'est celle qu'on vient d'ajouter et qu'on veut vérifier.
    const trie = trierParDate([
      le('2026-08-15', { id: 'tot', timestamp: 100 }),
      le('2026-08-15', { id: 'tard', timestamp: 900 })
    ]);
    expect(trie.map(c => c.id)).toEqual(['tard', 'tot']);
  });

  it('mélange sans peine dates déclarées et horodatages', () => {
    const trie = trierParDate([
      le('2026-08-03', { id: 'declaree' }),
      { id: 'ancienne', amount: 5, timestamp: new Date(2026, 7, 20, 9, 0).getTime() }
    ]);
    expect(trie.map(c => c.id)).toEqual(['ancienne', 'declaree']);
  });

  it('relègue en dernier ce qui n\'a aucun repère temporel', () => {
    // Une entrée sans date n'a pas de place légitime dans une suite
    // chronologique : la reléguer le dit, plutôt que de la glisser n'importe où.
    const trie = trierParDate([
      { id: 'nulle part', amount: 1 },
      le('2026-08-03', { id: 'vieille' }),
      le('2026-08-20', { id: 'recente' })
    ]);
    expect(trie.map(c => c.id)).toEqual(['recente', 'vieille', 'nulle part']);
  });

  it('ne remanie pas le tableau qu\'on lui donne', () => {
    const origine = [le('2026-08-03', { id: 'a' }), le('2026-08-20', { id: 'b' })];
    trierParDate(origine);
    expect(origine.map(c => c.id)).toEqual(['a', 'b']);
  });

  it('supporte une entrée absente sans se rompre', () => {
    expect(() => trierParDate(null)).not.toThrow();
    expect(trierParDate(null)).toEqual([]);
    expect(plusRecenteDAbord(null, null)).toBe(0);
  });
});

describe('Le regroupement par catégorie', () => {
  const charges = [
    { id: '1', category: 'Courses', amount: 40, date: '2026-08-03' },
    { id: '2', category: 'Maison', amount: 900, date: '2026-08-05' },
    { id: '3', category: 'Courses', amount: 60, date: '2026-08-20' },
    { id: '4', category: 'Loisirs', amount: 25, date: '2026-08-12' }
  ];

  it('met la catégorie la plus dépensière en tête', () => {
    // L'ordre suivait celui de la première charge rencontrée, ce qui ne veut
    // rien dire. Le total répond à la question qu'on se pose en ouvrant
    // l'écran : où part l'argent ?
    expect(grouperParCategorie(charges).map(g => g.categorie))
      .toEqual(['Maison', 'Courses', 'Loisirs']);
  });

  it('additionne juste', () => {
    const courses = grouperParCategorie(charges).find(g => g.categorie === 'Courses');
    expect(courses.total).toBe(100);
  });

  it('trie aussi à l\'intérieur de chaque catégorie', () => {
    const courses = grouperParCategorie(charges).find(g => g.categorie === 'Courses');
    expect(courses.charges.map(c => c.id)).toEqual(['3', '1']);
  });

  it('range sous « Sans catégorie » ce qui n\'en porte pas', () => {
    // Ces charges existent en base : mieux vaut les montrer sous un nom
    // explicite que les faire disparaître sous une clé vide.
    const groupes = grouperParCategorie([{ id: 'x', amount: 12 }]);
    expect(groupes[0].categorie).toBe('Sans catégorie');
    expect(groupes[0].total).toBe(12);
  });

  it('ne se laisse pas fausser par un montant illisible', () => {
    const groupes = grouperParCategorie([
      { category: 'Courses', amount: 40 },
      { category: 'Courses', amount: 'beaucoup' }
    ]);
    expect(groupes[0].total).toBe(40);
  });

  it('accepte une liste vide ou absente', () => {
    expect(grouperParCategorie([])).toEqual([]);
    expect(grouperParCategorie(null)).toEqual([]);
  });
});

/**
 * L'heure départage ce que le jour laisse ex æquo
 *
 * Trois courses du même samedi sortaient dans l'ordre où elles avaient été
 * saisies — le marché du matin après le plein du soir si on l'avait régularisé
 * ensuite. L'heure déclarée le dit ; l'ordre de saisie ne le disait pas.
 */
describe('À jour égal, l\'heure décide', () => {
  const dépense = (description, heure, timestamp) => ({
    description, date: '2026-08-25', heure, timestamp
  });

  it('range la plus tardive en tête', () => {
    const triees = trierParDate([
      dépense('Marché', '08:30', 1),
      dépense('Plein', '19:05', 2),
      dépense('Café', '14:00', 3)
    ]);

    expect(triees.map(c => c.description)).toEqual(['Plein', 'Café', 'Marché']);
  });

  it('l\'heure prime sur l\'ordre de saisie', () => {
    // Le plein a été saisi en dernier, mais il est du matin.
    const triees = trierParDate([
      dépense('Dîner', '20:30', 1),
      dépense('Plein', '07:15', 99)
    ]);

    expect(triees.map(c => c.description)).toEqual(['Dîner', 'Plein']);
  });

  it('le jour prime sur l\'heure', () => {
    // 08:00 la veille reste avant 23:00 aujourd'hui : comparer les heures sans
    // regarder le jour inverserait les deux.
    const triees = trierParDate([
      { description: 'Hier soir', date: '2026-08-24', heure: '23:00' },
      { description: 'Ce matin', date: '2026-08-25', heure: '08:00' }
    ]);

    expect(triees.map(c => c.description)).toEqual(['Ce matin', 'Hier soir']);
  });

  it('range une dépense sans heure après celles de sa journée qui en portent', () => {
    // Elle ne peut pas s'intercaler entre deux heures sans qu'on invente
    // laquelle. La reléguer laisse la suite des heures lisible.
    const triees = trierParDate([
      dépense('Sans heure', undefined, 5),
      dépense('Matin', '08:00', 1)
    ]);

    expect(triees.map(c => c.description)).toEqual(['Matin', 'Sans heure']);
  });

  it('entre deux dépenses sans heure, l\'ordre de saisie décide encore', () => {
    const triees = trierParDate([
      dépense('Première', undefined, 1),
      dépense('Seconde', undefined, 2)
    ]);

    expect(triees.map(c => c.description)).toEqual(['Seconde', 'Première']);
  });

  it('une heure illisible ne classe pas : elle vaut une absence', () => {
    const triees = trierParDate([
      dépense('Illisible', '25:99', 9),
      dépense('Matin', '08:00', 1)
    ]);

    expect(triees.map(c => c.description)).toEqual(['Matin', 'Illisible']);
  });
});
