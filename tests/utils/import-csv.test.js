import { describe, it, expect } from 'vitest';

import {
  decouperLigne,
  separateurDe,
  reconnaitreLesColonnes,
  lireLePayeur,
  lireLaDate,
  analyserCsv
} from '../../public/js/utils/import-csv.js';

/**
 * Lire un CSV de charges
 *
 * Les données n'entraient que charge par charge. Le premier mois se saisissait
 * à la main, et un relevé bancaire ne pouvait pas être versé.
 *
 * Le contrôle qui compte le plus de ce fichier : **une ligne dont le payeur est
 * illisible est rejetée, jamais devinée**. L'application entière sert à dire
 * qui doit combien à qui ; attribuer une dépense au hasard fausserait le solde
 * des deux personnes sans que rien ne le signale.
 */

describe('decouperLigne — le séparateur peut être dans un libellé', () => {
  it('découpe simplement', () => {
    expect(decouperLigne('Courses;Alimentation;84,30', ';'))
      .toEqual(['Courses', 'Alimentation', '84,30']);
  });

  it('respecte les guillemets', () => {
    // Un libellé contenant le séparateur produirait une colonne de plus, et
    // tout ce qui suit serait décalé d'un cran.
    expect(decouperLigne('"Restaurant; chez Paul";Restos;46', ';'))
      .toEqual(['Restaurant; chez Paul', 'Restos', '46']);
  });

  it('lit un guillemet littéral, doublé selon la convention', () => {
    expect(decouperLigne('"Le ""Bistrot""";Restos;46', ';'))
      .toEqual(['Le "Bistrot"', 'Restos', '46']);
  });

  it('rend un champ vide plutôt que de le sauter', () => {
    expect(decouperLigne('Courses;;84,30', ';')).toEqual(['Courses', '', '84,30']);
  });

  it('élague les espaces autour des champs', () => {
    expect(decouperLigne(' Courses ; Alimentation ', ';')).toEqual(['Courses', 'Alimentation']);
  });
});

describe('separateurDe — décidé sur l\'en-tête seul', () => {
  it('reconnaît le point-virgule', () => {
    expect(separateurDe('Description;Montant;Date')).toBe(';');
  });

  it('reconnaît la virgule', () => {
    expect(separateurDe('Description,Montant,Date')).toBe(',');
  });

  it('à égalité, retient le point-virgule', () => {
    // La convention des tableurs francophones, et celle de l'export du dépôt.
    expect(separateurDe('Description;Montant,Date')).toBe(';');
  });

  it.each([[''], [null], [undefined]])('un en-tête absent (%s) retient le point-virgule', (e) => {
    expect(separateurDe(e)).toBe(';');
  });
});

describe('reconnaitreLesColonnes — sans égard à la casse ni aux accents', () => {
  it('reconnaît les intitulés de l\'export', () => {
    expect(reconnaitreLesColonnes(['Description', 'Catégorie', 'Montant', 'Payé par', 'Date']))
      .toEqual({ description: 0, category: 1, amount: 2, paidBy: 3, date: 4 });
  });

  it('reconnaît les intitulés d\'un relevé bancaire', () => {
    const trouvees = reconnaitreLesColonnes(['Date operation', 'Libelle', 'Debit']);
    expect(trouvees.date).toBe(0);
    expect(trouvees.description).toBe(1);
    expect(trouvees.amount).toBe(2);
  });

  it('se moque de l\'ordre des colonnes', () => {
    const trouvees = reconnaitreLesColonnes(['MONTANT', 'description']);
    expect(trouvees).toEqual({ amount: 0, description: 1 });
  });

  it('n\'invente pas une colonne absente', () => {
    expect(reconnaitreLesColonnes(['Description', 'Montant']).paidBy).toBeUndefined();
  });
});

describe('lireLePayeur — deviné jamais', () => {
  it.each([['vous'], ['Vous'], ['VOUS'], ['moi']])('« %s » désigne vous', (v) => {
    expect(lireLePayeur(v)).toBe('vous');
  });

  it.each([['conjointe'], ['Conjointe'], ['conjoint'], ['partenaire']])('« %s » désigne la conjointe', (v) => {
    expect(lireLePayeur(v)).toBe('conjointe');
  });

  it.each([['partage'], ['partagé'], ['commun'], ['les deux']])('« %s » désigne le partage', (v) => {
    expect(lireLePayeur(v)).toBe('partage');
  });

  it.each([[''], [null], ['Jean-Pierre'], ['?'], [42]])(
    'un payeur illisible (%s) ne désigne personne',
    (v) => {
      expect(lireLePayeur(v)).toBeNull();
    }
  );
});

describe('lireLaDate — les deux formes qu\'on rencontre', () => {
  it('lit la forme ISO', () => {
    expect(lireLaDate('2026-08-14')).toBe('2026-08-14');
  });

  it.each([['14/08/2026'], ['14-08-2026'], ['14.08.2026']])(
    'lit la forme française (%s)',
    (v) => {
      expect(lireLaDate(v)).toBe('2026-08-14');
    }
  );

  it('complète les chiffres seuls', () => {
    expect(lireLaDate('4/8/2026')).toBe('2026-08-04');
  });

  it.each([[''], [null], ['hier'], ['2026-13-01'], ['32/01/2026'], ['08/2026']])(
    'une date illisible (%s) vaut null, jamais une date inventée',
    (v) => {
      expect(lireLaDate(v)).toBeNull();
    }
  );
});

describe('analyserCsv — ce qui passe, et ce qui est rejeté avec son motif', () => {
  const CSV = [
    'Description;Catégorie;Montant;Payé par;Date;Type',
    'Courses Leclerc;Courses;84,30;vous;2026-08-12;variable',
    'Loyer;Maison;950;vous;05/08/2026;fixe',
    '"Restaurant; chez Paul";Restos;46.00;conjointe;2026-08-16;'
  ].join('\n');

  it('lit les lignes bien formées', () => {
    const { lignes } = analyserCsv(CSV);
    expect(lignes).toHaveLength(3);
    expect(lignes[0]).toEqual({
      description: 'Courses Leclerc', amount: 84.3, paidBy: 'vous',
      category: 'Courses', date: '2026-08-12', type: 'variable'
    });
  });

  it('lit les deux formes de date et les deux décimales', () => {
    const { lignes } = analyserCsv(CSV);
    expect(lignes[1].date).toBe('2026-08-05');
    expect(lignes[2].amount).toBeCloseTo(46, 6);
  });

  it('« fixe » doit être demandé ; tout le reste est variable', () => {
    // Une charge fixe entre dans la reconduction du mois suivant : l'y mettre
    // par défaut ferait revenir chaque ligne importée, tous les mois.
    const { lignes } = analyserCsv(CSV);
    expect(lignes.map(l => l.type)).toEqual(['variable', 'fixe', 'variable']);
  });

  it('un payeur illisible rejette la ligne, et dit pourquoi', () => {
    // Le contrôle qui compte le plus. Deviner attribuerait une dépense au
    // hasard et fausserait le solde des deux personnes.
    const { lignes, rejets } = analyserCsv(
      'Description;Montant;Payé par\nCourses;84,30;Jean-Pierre');
    expect(lignes).toEqual([]);
    expect(rejets).toHaveLength(1);
    expect(rejets[0].motif).toMatch(/payeur illisible/);
    expect(rejets[0].ligne).toBe(2);
  });

  it('un montant illisible rejette la ligne', () => {
    const { lignes, rejets } = analyserCsv(
      'Description;Montant;Payé par\nCourses;abc;vous\nRestaurant;46;vous');
    expect(lignes.map(l => l.description)).toEqual(['Restaurant']);
    expect(rejets[0].motif).toMatch(/montant illisible/);
  });

  it.each([['0'], ['-10'], ['999999']])('un montant hors bornes (%s) est rejeté', (montant) => {
    const { lignes } = analyserCsv(`Description;Montant;Payé par\nCourses;${montant};vous`);
    expect(lignes).toEqual([]);
  });

  it('un libellé vide rejette la ligne', () => {
    const { rejets } = analyserCsv('Description;Montant;Payé par\n;84,30;vous');
    expect(rejets[0].motif).toMatch(/libellé vide/);
  });

  it('une ligne abîmée n\'emporte pas les suivantes', () => {
    const { lignes, rejets } = analyserCsv([
      'Description;Montant;Payé par',
      'Courses;abc;vous',
      'Restaurant;46;conjointe',
      ';12;vous',
      'Essence;78;vous'
    ].join('\n'));
    expect(lignes.map(l => l.description)).toEqual(['Restaurant', 'Essence']);
    expect(rejets).toHaveLength(2);
  });

  describe('sans colonne de payeur', () => {
    const SANS = 'Description;Montant\nCourses;84,30\nRestaurant;46';

    it('le signale, pour que l\'écran puisse demander', () => {
      expect(analyserCsv(SANS).payeurManquant).toBe(true);
    });

    it('sans défaut choisi, tout est rejeté plutôt que deviné', () => {
      const { lignes, rejets } = analyserCsv(SANS);
      expect(lignes).toEqual([]);
      expect(rejets).toHaveLength(2);
      expect(rejets[0].motif).toMatch(/aucun payeur/);
    });

    it('avec un défaut choisi, les lignes passent', () => {
      const { lignes } = analyserCsv(SANS, { payeurParDefaut: 'conjointe' });
      expect(lignes).toHaveLength(2);
      expect(lignes.every(l => l.paidBy === 'conjointe')).toBe(true);
    });

    it('un défaut lui-même illisible ne sauve rien', () => {
      expect(analyserCsv(SANS, { payeurParDefaut: 'Jean-Pierre' }).lignes).toEqual([]);
    });
  });

  it('sans libellé ni montant dans l\'en-tête, rien n\'est lu', () => {
    // Il n'y a pas de charge sans ces deux-là : mieux vaut ne rien proposer
    // que de proposer des lignes vides.
    const { lignes, colonnes } = analyserCsv('Date;Catégorie\n2026-08-12;Courses');
    expect(lignes).toEqual([]);
    expect(colonnes.amount).toBeUndefined();
  });

  it('accepte les fins de ligne Windows', () => {
    const { lignes } = analyserCsv('Description;Montant;Payé par\r\nCourses;84,30;vous\r\n');
    expect(lignes).toHaveLength(1);
    expect(lignes[0].description).toBe('Courses');
  });

  it('accepte la virgule comme séparateur', () => {
    const { lignes, separateur } = analyserCsv('Description,Montant,Payé par\nCourses,84.30,vous');
    expect(separateur).toBe(',');
    expect(lignes[0].amount).toBeCloseTo(84.3, 6);
  });

  it('une catégorie absente retombe sur « Autre », jamais sur du vide', () => {
    const { lignes } = analyserCsv('Description;Montant;Payé par\nCourses;84,30;vous');
    expect(lignes[0].category).toBe('Autre');
  });

  it.each([[''], ['   '], [null], [undefined], [42], ['une seule ligne']])(
    'une entrée inexploitable (%s) rend un résultat vide sans lever',
    (texte) => {
      const resultat = analyserCsv(texte);
      expect(resultat.lignes).toEqual([]);
      expect(resultat.rejets).toEqual([]);
    }
  );

  it('borne les textes plutôt que de laisser passer un roman', () => {
    const { lignes } = analyserCsv(
      `Description;Montant;Payé par\n${'x'.repeat(300)};84,30;vous`);
    expect(lignes[0].description).toHaveLength(100);
  });
});

describe('Une ligne ambiguë est rejetée, jamais tronquée en silence', () => {
  it('un fichier à virgules avec des montants à virgule ne perd pas ses centimes', () => {
    // Le piège : « Courses,vous,84,30 » se découpe en QUATRE champs pour trois
    // colonnes. La colonne « Montant » attrapait « 84 », « 30 » tombait dans le
    // vide, et 84,00 € partait en base — sans rejet, et l'aperçu affichait
    // 84,00 € comme si de rien n'était. Trente centimes par ligne, sur un
    // relevé entier.
    const r = analyserCsv('Description,Payé par,Montant\nCourses,vous,84,30');

    expect(r.lignes).toHaveLength(0);
    expect(r.rejets).toHaveLength(1);
    expect(r.rejets[0].motif).toMatch(/4 champs pour 3 colonnes/);
  });

  it('le même contenu en point-virgule passe, et garde ses centimes', () => {
    // Le témoin : c'est bien l'ambiguïté du séparateur qu'on refuse, pas le
    // montant à virgule, qui est la forme française normale.
    const r = analyserCsv('Description;Payé par;Montant\nCourses;vous;84,30');

    expect(r.rejets).toHaveLength(0);
    expect(r.lignes[0].amount).toBeCloseTo(84.3, 6);
  });

  it('un champ entre guillemets contenant le séparateur reste accepté', () => {
    // `decouperLigne` respecte les guillemets : le compte de champs est juste,
    // et la ligne ne doit pas être rejetée.
    const r = analyserCsv('Description,Payé par,Montant\n"Courses, Leclerc",vous,84.30');

    expect(r.rejets).toHaveLength(0);
    expect(r.lignes[0].description).toBe('Courses, Leclerc');
    expect(r.lignes[0].amount).toBeCloseTo(84.3, 6);
  });

  it('moins de champs que de colonnes reste accepté : une colonne finale vide', () => {
    // Beaucoup de tableurs omettent la dernière colonne quand elle est vide.
    const r = analyserCsv('Description;Payé par;Montant;Date\nCourses;vous;84,30');

    expect(r.rejets).toHaveLength(0);
    expect(r.lignes[0].amount).toBeCloseTo(84.3, 6);
  });
});
