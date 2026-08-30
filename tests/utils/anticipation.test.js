import { describe, it, expect } from 'vitest';
import {
  chargesAnnuelles,
  picSaisonnier,
  capaciteDEpargne,
  depensesParLieu,
  abonnementsNonDeclares,
  rythmeDuMois,
  anticiper
} from '../../public/js/utils/anticipation.js';

/**
 * Ce qui reviendra, et ce qu'il faut mettre de côté pour l'attendre
 *
 * Une assurance qui tombe tous les ans, un décembre qui coûte plus cher que
 * les autres mois : le foyer les subit au lieu de les attendre. Ces détecteurs
 * les nomment et chiffrent la provision — sur ce qui a été RÉELLEMENT dépensé,
 * jamais sur ce que ça « devrait » coûter.
 *
 * Chaque détecteur porte son exigence d'historique et se tait tant qu'il ne
 * l'a pas : c'est ce qui permet de les livrer à un foyer qui n'a que trois
 * mois de données sans qu'aucun ne raconte n'importe quoi.
 */

/** Une charge commune minimale */
const charge = (description, amount, extra = {}) => ({
  description, amount, category: 'Maison', paidBy: 'vous', deleted: false, ...extra
});

/** Un mois, avec ses charges variables et ses salaires */
const mois = (charges, salaries = { vous: 2500, conjointe: 1800 }) => ({
  salaries,
  variableCharges: Object.fromEntries(charges.map((c, i) => [`v${i}`, c]))
});

describe('Les charges qui reviennent tous les ans', () => {
  const AVEC_DEUX_ANS = {
    '2025-03': mois([charge('Assurance auto', 480, { date: '2025-03-12' })]),
    '2025-06': mois([charge('Courses', 90)]),
    '2026-03': mois([charge('Assurance auto', 512, { date: '2026-03-12' })]),
    '2026-06': mois([charge('Courses', 95)])
  };

  it('repère la répétition et chiffre la provision', () => {
    const [vue] = chargesAnnuelles({ periods: AVEC_DEUX_ANS, moisCourant: '2026-08' });

    expect(vue.titre).toContain('Assurance auto');
    // Échéance 2027-03, et la cagnotte s'ouvre en SEPTEMBRE — c'est ce que la
    // proposition écrit. De 2026-09 à 2027-03 inclus : sept mois. Le compte
    // partait auparavant du mois affiché, soit huit — un mois pendant lequel
    // l'enveloppe n'existe pas encore, et la carte annonçait alors 64,00 €
    // quand l'enveloppe créée en réclamait 73,14.
    expect(vue.montant).toBeCloseTo(512 / 7, 6);
    expect(vue.proposition).toMatchObject({ budget: 512, fin: '2027-03-12', nature: 'cagnotte' });
  });

  it('retient le montant de la DERNIÈRE occurrence, pas la première', () => {
    // Une assurance augmente : provisionner sur le prix d'il y a deux ans
    // manquerait la cible, et le manque ne se verrait qu'au moment de payer.
    const [vue] = chargesAnnuelles({ periods: AVEC_DEUX_ANS, moisCourant: '2026-08' });
    expect(vue.proposition.budget).toBe(512);
    expect(vue.fonde).toContain('512.00');
  });

  it('dit sur quoi elle se fonde, les mois nommés', () => {
    const [vue] = chargesAnnuelles({ periods: AVEC_DEUX_ANS, moisCourant: '2026-08' });
    expect(vue.fonde).toContain('2025-03');
    expect(vue.fonde).toContain('2026-03');
  });

  it('une charge vue une seule fois ne prouve aucune récurrence', () => {
    // Elle pourrait revenir — ou jamais. Annoncer une échéance sur cette base
    // serait inventer un chiffre.
    const periods = { '2025-03': mois([charge('Assurance auto', 480, { date: '2025-03-12' })]) };
    expect(chargesAnnuelles({ periods, moisCourant: '2026-08' })).toEqual([]);
  });

  it('une charge mensuelle n\'est pas une charge annuelle', () => {
    const periods = {};
    for (let m = 1; m <= 12; m++) {
      periods[`2026-${String(m).padStart(2, '0')}`] = mois([charge('Loyer', 950)]);
    }
    expect(chargesAnnuelles({ periods, moisCourant: '2026-12' })).toEqual([]);
  });

  it('une charge vue à onze mois d\'écart puis le mois suivant n\'est pas annuelle', () => {
    // TOUS les écarts doivent être annuels : janvier, décembre, janvier
    // suivant, c'est une charge irrégulière, pas un rythme.
    const periods = {
      '2025-01': mois([charge('Truc', 100)]),
      '2025-12': mois([charge('Truc', 100)]),
      '2026-01': mois([charge('Truc', 100)])
    };
    expect(chargesAnnuelles({ periods, moisCourant: '2026-06' })).toEqual([]);
  });

  it('une échéance dans le mois même ne se provisionne plus', () => {
    // Il ne reste aucun mois pour étaler : `veille.js` suit les échéances
    // atteintes, ce module ne s'en mêle pas.
    const periods = {
      '2025-08': mois([charge('Assurance', 480, { date: '2025-08-12' })]),
      '2026-08': mois([charge('Assurance', 480, { date: '2026-08-12' })])
    };
    expect(chargesAnnuelles({ periods, moisCourant: '2027-08' })).toEqual([]);
  });

  it('les dépenses solo n\'engagent pas le foyer', () => {
    const solo = { perimetre: 'solo', paidBy: 'vous' };
    const periods = {
      '2025-03': mois([charge('Licence sport', 300, { date: '2025-03-01', ...solo })]),
      '2026-03': mois([charge('Licence sport', 300, { date: '2026-03-01', ...solo })])
    };
    expect(chargesAnnuelles({ periods, moisCourant: '2026-08' })).toEqual([]);
  });

  it('un historique vide ou illisible ne produit rien', () => {
    expect(chargesAnnuelles({ periods: null, moisCourant: '2026-08' })).toEqual([]);
    expect(chargesAnnuelles({ periods: {}, moisCourant: 'pas un mois' })).toEqual([]);
  });
});

describe('Le mois de l\'année qui coûte plus cher', () => {
  /** Douze mois ordinaires à 1000 €, plus un décembre à 1600 € */
  function douzeMoisAvecUnPic() {
    const periods = {};
    for (let m = 1; m <= 12; m++) {
      const cle = `2025-${String(m).padStart(2, '0')}`;
      periods[cle] = mois([charge('Vie courante', m === 12 ? 1600 : 1000)]);
    }
    return periods;
  }

  it('compare à un mois ORDINAIRE, et chiffre le surcoût à lisser', () => {
    const vue = picSaisonnier({ periods: douzeMoisAvecUnPic(), moisCourant: '2026-01' });

    expect(vue.titre).toContain('Décembre');
    // 1600 − 1000 = 600 de surcoût. La cagnotte s'ouvre en janvier et court
    // jusqu'à décembre, échéance comprise : douze mois, comme les comptera
    // l'enveloppe. La carte divisait par onze — les mois qui SÉPARENT du pic —
    // et annonçait 54,55 € quand l'enveloppe en montrait 50,00.
    expect(vue.montant).toBeCloseTo(600 / 12, 6);
    expect(vue.fonde).toContain('1000.00');
  });

  it('se tait sans une année complète', () => {
    const periods = {};
    for (let m = 1; m <= 6; m++) {
      periods[`2026-${String(m).padStart(2, '0')}`] = mois([charge('Vie courante', 1000)]);
    }
    expect(picSaisonnier({ periods, moisCourant: '2026-07' })).toBe(null);
  });

  it('un écart de quelques pour cent n\'est pas un pic', () => {
    const periods = {};
    for (let m = 1; m <= 12; m++) {
      const cle = `2025-${String(m).padStart(2, '0')}`;
      periods[cle] = mois([charge('Vie courante', m === 12 ? 1050 : 1000)]);
    }
    expect(picSaisonnier({ periods, moisCourant: '2026-01' })).toBe(null);
  });
});

describe('Ce que le foyer peut mettre de côté', () => {
  /** Quatre mois révolus : 4300 de revenus, des charges qui varient */
  const QUATRE_MOIS = {
    '2026-04': mois([charge('Vie', 3300)]),   // reste 1000
    '2026-05': mois([charge('Vie', 3500)]),   // reste  800
    '2026-06': mois([charge('Vie', 3700)]),   // reste  600
    '2026-07': mois([charge('Vie', 3400)])    // reste  900
  };

  it('rend la médiane du reste à vivre, pas la moyenne', () => {
    // Médiane de 1000, 800, 600, 900 → 850. Un mois exceptionnel ne doit pas
    // décider de ce qu'on croit pouvoir épargner.
    const vue = capaciteDEpargne({ periods: QUATRE_MOIS, moisCourant: '2026-08' });
    expect(vue.montant).toBeCloseTo(850, 6);
  });

  it('écarte le mois courant, qui est partiel', () => {
    const avecCourant = { ...QUATRE_MOIS, '2026-08': mois([charge('Vie', 50)]) };
    const vue = capaciteDEpargne({ periods: avecCourant, moisCourant: '2026-08' });
    // Le reste de 4250 du mois en cours ferait bondir la médiane s'il comptait.
    expect(vue.montant).toBeCloseTo(850, 6);
  });

  it('signale quand les provisions proposées dépassent ce qui reste', () => {
    // Trois conseils justes un par un, et intenables ensemble : c'est la seule
    // observation qui regarde les autres.
    const vue = capaciteDEpargne({
      periods: QUATRE_MOIS, moisCourant: '2026-08', demandeMensuelle: 900
    });
    expect(vue.urgence).toBe('attention');
    expect(vue.detail).toContain('900.00');
  });

  it('reste informative quand la demande tient', () => {
    const vue = capaciteDEpargne({
      periods: QUATRE_MOIS, moisCourant: '2026-08', demandeMensuelle: 200
    });
    expect(vue.urgence).toBe('info');
  });

  it('se tait sous trois mois, et sans revenus connus', () => {
    const deux = { '2026-06': mois([charge('Vie', 100)]), '2026-07': mois([charge('Vie', 100)]) };
    expect(capaciteDEpargne({ periods: deux, moisCourant: '2026-08' })).toBe(null);

    const sansSalaires = {
      '2026-04': mois([charge('Vie', 100)], null),
      '2026-05': mois([charge('Vie', 100)], null),
      '2026-06': mois([charge('Vie', 100)], null)
    };
    expect(capaciteDEpargne({ periods: sansSalaires, moisCourant: '2026-08' })).toBe(null);
  });

  it('se tait quand il ne reste rien — un déficit n\'est pas une épargne', () => {
    const serre = {
      '2026-04': mois([charge('Vie', 4500)]),
      '2026-05': mois([charge('Vie', 4600)]),
      '2026-06': mois([charge('Vie', 4400)])
    };
    expect(capaciteDEpargne({ periods: serre, moisCourant: '2026-08' })).toBe(null);
  });
});

describe('Les dépenses par lieu', () => {
  const lieu = nom => ({ location: { name: nom } });

  it('rend le lieu le plus coûteux sur douze mois', () => {
    const periods = {
      '2026-06': mois([charge('Courses', 100, lieu('Intermarché')), charge('Plein', 70, lieu('Station'))]),
      '2026-07': mois([charge('Courses', 120, lieu('Intermarché'))]),
      '2026-08': mois([charge('Courses', 110, lieu('Intermarché'))])
    };
    const vue = depensesParLieu({ periods, moisCourant: '2026-08' });

    expect(vue.titre).toContain('Intermarché');
    expect(vue.titre).toContain('330.00');
    expect(vue.detail).toContain('110.00');
  });

  it('n\'a AUCUNE proposition : des courses ne se provisionnent pas', () => {
    const periods = {
      '2026-06': mois([charge('Courses', 100, lieu('Intermarché'))]),
      '2026-07': mois([charge('Courses', 120, lieu('Intermarché'))]),
      '2026-08': mois([charge('Courses', 110, lieu('Intermarché'))])
    };
    expect(depensesParLieu({ periods, moisCourant: '2026-08' }).proposition).toBeUndefined();
  });

  it('un lieu vu une fois est un souvenir, pas une habitude', () => {
    const periods = { '2026-08': mois([charge('Restaurant', 300, lieu('Le Bistrot'))]) };
    expect(depensesParLieu({ periods, moisCourant: '2026-08' })).toBe(null);
  });

  it('ne regarde pas au-delà de douze mois', () => {
    const periods = {
      '2024-01': mois([charge('Courses', 900, lieu('Vieux magasin'))]),
      '2024-02': mois([charge('Courses', 900, lieu('Vieux magasin'))]),
      '2024-03': mois([charge('Courses', 900, lieu('Vieux magasin'))])
    };
    expect(depensesParLieu({ periods, moisCourant: '2026-08' })).toBe(null);
  });
});

describe('Tout ce que l\'application a remarqué', () => {
  const PERIODS = {
    '2025-03': mois([charge('Assurance auto', 480, { date: '2025-03-12' })]),
    '2026-03': mois([charge('Assurance auto', 512, { date: '2026-03-12' })])
  };

  it('une proposition dont l\'enveloppe existe déjà ne se répète pas', () => {
    // Sans cela la carte reparaîtrait indéfiniment après qu'on l'a acceptée :
    // le geste n'aurait servi à rien.
    const avant = anticiper({ periods: PERIODS, moisCourant: '2026-08', listeEnveloppes: [] });
    expect(avant.some(v => v.cle.startsWith('charge-annuelle'))).toBe(true);

    const apres = anticiper({
      periods: PERIODS, moisCourant: '2026-08',
      listeEnveloppes: [{ id: 'x', label: 'assurance AUTO' }]
    });
    expect(apres.some(v => v.cle.startsWith('charge-annuelle'))).toBe(false);
  });

  it('range ce qui appelle une décision avant ce qui informe', () => {
    const periods = {
      ...PERIODS,
      '2026-06': mois([charge('Courses', 100, { location: { name: 'Intermarché' } })]),
      '2026-07': mois([charge('Courses', 120, { location: { name: 'Intermarché' } })]),
      '2026-08': mois([charge('Courses', 110, { location: { name: 'Intermarché' } })])
    };
    const vues = anticiper({ periods, moisCourant: '2026-08' });
    const rang = cle => vues.findIndex(v => v.cle.startsWith(cle));

    expect(rang('charge-annuelle')).toBeGreaterThanOrEqual(0);
    expect(rang('charge-annuelle')).toBeLessThan(rang('depenses-par-lieu'));
  });

  it('la capacité compte ce que les propositions RETENUES demandent', () => {
    // Une proposition écartée parce que son enveloppe existe ne doit pas
    // gonfler la demande : le foyer la finance déjà par ailleurs.
    const periods = {
      ...PERIODS,
      '2026-04': mois([charge('Vie', 3300)]),
      '2026-05': mois([charge('Vie', 3500)]),
      '2026-06': mois([charge('Vie', 3700)])
    };

    const avec = anticiper({ periods, moisCourant: '2026-08' })
      .find(v => v.cle === 'capacite-epargne');
    expect(avec.detail).toContain('73.14');   // 512 / 7, les mois de la cagnotte

    const sans = anticiper({
      periods, moisCourant: '2026-08',
      listeEnveloppes: [{ id: 'x', label: 'Assurance auto' }]
    }).find(v => v.cle === 'capacite-epargne');
    expect(sans.detail).not.toContain('73.14');
  });

  it('un mois qui se passe bien ne produit rien', () => {
    expect(anticiper({ periods: {}, moisCourant: '2026-08' })).toEqual([]);
  });
});

describe('Ce qui revient chaque mois sans être déclaré fixe', () => {
  /** Un mois avec ses charges variables ET fixes */
  const moisComplet = (variables, fixes = []) => ({
    salaries: { vous: 2500, conjointe: 1800 },
    variableCharges: Object.fromEntries(variables.map((c, i) => [`v${i}`, c])),
    fixedCharges: Object.fromEntries(fixes.map((c, i) => [`f${i}`, c]))
  });

  /** Netflix et Spotify saisis à la main, tous les mois, jamais déclarés fixes */
  const TROIS_MOIS = {
    '2026-05': moisComplet(
      [charge('Netflix', 13.49), charge('Spotify', 11.99), charge('Courses', 82)],
      [charge('Loyer', 950)]
    ),
    '2026-06': moisComplet(
      [charge('Netflix', 13.49), charge('Spotify', 11.99), charge('Courses', 104)],
      [charge('Loyer', 950)]
    ),
    '2026-07': moisComplet(
      [charge('Netflix', 13.49), charge('Spotify', 11.99), charge('Courses', 71)],
      [charge('Loyer', 950)]
    )
  };

  it('les repère, et donne le mois ET l\'année', () => {
    const vu = abonnementsNonDeclares({ periods: TROIS_MOIS, moisCourant: '2026-08' });

    expect(vu.montant).toBeCloseTo(25.48, 2);
    expect(vu.detail).toContain('25.48');
    expect(vu.detail).toContain('305.76');   // 25,48 × 12
    expect(vu.detail).toContain('Netflix');
    expect(vu.detail).toContain('Spotify');
  });

  describe('CE QUE LA PROPOSITION PORTE — et ce qu\'elle refuse de deviner', () => {
    /**
     * Le détecteur ne fait plus que constater : son observation porte de quoi
     * agir. Ce qu'elle porte engage le solde du couple, donc rien n'y est
     * déduit.
     *
     * **Le payeur n'est jamais deviné.** C'est la règle que l'import CSV a
     * posée. Un prélèvement avancé tantôt par l'un tantôt par l'autre n'a pas
     * de payeur : il en a deux. En retenir un — le premier vu, le plus
     * fréquent — ferait basculer le solde sur une déduction que personne n'a
     * validée, et le geste écrit SANS montrer de formulaire.
     *
     * Mesuré : remplacer `payeurs.size === 1` par `>= 1` laissait les 2 464
     * contrôles verts.
     */
    it('un payeur constant sur toute la fenêtre est LU, pas deviné', () => {
      const vu = abonnementsNonDeclares({ periods: TROIS_MOIS, moisCourant: '2026-08' });
      const netflix = vu.propositionFixe.charges.find(c => c.libelle === 'Netflix');

      expect(netflix.payeur).toBe('vous');
    });

    it('un payeur QUI CHANGE d\'un mois sur l\'autre ne donne aucun payeur', () => {
      const alterne = {
        '2026-05': moisComplet([charge('Netflix', 13.49, { paidBy: 'vous' })]),
        '2026-06': moisComplet([charge('Netflix', 13.49, { paidBy: 'conjointe' })]),
        '2026-07': moisComplet([charge('Netflix', 13.49, { paidBy: 'vous' })])
      };
      const vu = abonnementsNonDeclares({ periods: alterne, moisCourant: '2026-08' });

      expect(vu.propositionFixe.charges[0].payeur).toBeNull();
    });

    it('et l\'observation reste affichée : c\'est le GESTE qui s\'abstient', () => {
      // Se taire priverait le foyer du constat lui-même, qui est juste. C'est
      // au moment d'écrire que l'application refuse de choisir.
      const alterne = {
        '2026-05': moisComplet([charge('Netflix', 13.49, { paidBy: 'vous' })]),
        '2026-06': moisComplet([charge('Netflix', 13.49, { paidBy: 'conjointe' })]),
        '2026-07': moisComplet([charge('Netflix', 13.49, { paidBy: 'vous' })])
      };
      const vu = abonnementsNonDeclares({ periods: alterne, moisCourant: '2026-08' });

      expect(vu.detail).toContain('Netflix');
      expect(vu.montant).toBeCloseTo(13.49, 2);
    });

    it('la catégorie obéit à la même règle', () => {
      const melange = {
        '2026-05': moisComplet([charge('Netflix', 13.49, { category: 'Loisirs' })]),
        '2026-06': moisComplet([charge('Netflix', 13.49, { category: 'Abonnements' })]),
        '2026-07': moisComplet([charge('Netflix', 13.49, { category: 'Loisirs' })])
      };
      const vu = abonnementsNonDeclares({ periods: melange, moisCourant: '2026-08' });

      expect(vu.propositionFixe.charges[0].categorie).toBeNull();
      expect(abonnementsNonDeclares({ periods: TROIS_MOIS, moisCourant: '2026-08' })
        .propositionFixe.charges[0].categorie).toBe('Maison');
    });

    it('le montant proposé est le DERNIER connu, pas celui d\'il y a trois mois', () => {
      // Un abonnement réévalué se déclare à son nouveau prix.
      const monte = {
        '2026-05': moisComplet([charge('Netflix', 12.99)]),
        '2026-06': moisComplet([charge('Netflix', 13.49)]),
        '2026-07': moisComplet([charge('Netflix', 13.99)])
      };
      const vu = abonnementsNonDeclares({ periods: monte, moisCourant: '2026-08' });

      expect(vu.propositionFixe.charges[0].montant).toBeCloseTo(13.99, 2);
    });

    it('la proposition liste exactement ce que le détail nomme', () => {
      // Deux listes qui divergeraient feraient écrire autre chose que ce que le
      // foyer a lu — le défaut que ce dépôt poursuit depuis le début.
      const vu = abonnementsNonDeclares({ periods: TROIS_MOIS, moisCourant: '2026-08' });

      for (const proposee of vu.propositionFixe.charges) {
        expect(vu.detail).toContain(proposee.libelle);
      }
      expect(vu.propositionFixe.parMois).toBeCloseTo(vu.montant, 2);
    });
  });

  it('SE TAIT sur ce que le panneau des charges fixes porte déjà', () => {
    // Le répéter ici serait du bruit, et l'observation deviendrait un décor.
    const vu = abonnementsNonDeclares({ periods: TROIS_MOIS, moisCourant: '2026-08' });
    expect(vu.detail).not.toContain('Loyer');
  });

  it('un montant qui varie n\'est pas un abonnement', () => {
    // Des courses reviennent tous les mois sans être un prélèvement.
    const vu = abonnementsNonDeclares({ periods: TROIS_MOIS, moisCourant: '2026-08' });
    expect(vu.detail).not.toContain('Courses');
  });

  it('un seul mois manquant, et ce n\'est plus un prélèvement', () => {
    const troue = {
      '2026-05': moisComplet([charge('Netflix', 13.49)]),
      '2026-06': moisComplet([]),
      '2026-07': moisComplet([charge('Netflix', 13.49)])
    };
    expect(abonnementsNonDeclares({ periods: troue, moisCourant: '2026-08' })).toBe(null);
  });

  it('deux mois de suite peuvent être une coïncidence — il en faut trois', () => {
    const deux = {
      '2026-06': moisComplet([charge('Netflix', 13.49)]),
      '2026-07': moisComplet([charge('Netflix', 13.49)])
    };
    expect(abonnementsNonDeclares({ periods: deux, moisCourant: '2026-08' })).toBe(null);
  });

  it('le mois courant est écarté : il est partiel', () => {
    // Une charge pas encore saisie ce mois-ci ferait croire à un abonnement
    // interrompu, et la ferait disparaître de la liste.
    const vu = abonnementsNonDeclares({ periods: TROIS_MOIS, moisCourant: '2026-08' });
    expect(vu.fonde).toContain('2026-07');
    expect(vu.fonde).not.toContain('2026-08');
  });

  it('les dépenses solo n\'engagent pas le foyer', () => {
    const solo = { perimetre: 'solo', paidBy: 'vous' };
    const perso = {
      '2026-05': moisComplet([charge('Salle de sport', 29.9, solo)]),
      '2026-06': moisComplet([charge('Salle de sport', 29.9, solo)]),
      '2026-07': moisComplet([charge('Salle de sport', 29.9, solo)])
    };
    expect(abonnementsNonDeclares({ periods: perso, moisCourant: '2026-08' })).toBe(null);
  });

  it('rien à dire ne produit rien', () => {
    expect(abonnementsNonDeclares({ periods: {}, moisCourant: '2026-08' })).toBe(null);
    expect(abonnementsNonDeclares({ periods: null, moisCourant: '2026-08' })).toBe(null);
  });

  describe('SUIVRE LE CONSEIL L\'ÉTEINT', () => {
    // La fenêtre ne regarde que les trois mois qui précèdent. Le drapeau
    // « déjà déclarée fixe » y était donc aveugle au mois affiché : on ajoutait
    // « Netflix » aux charges fixes, et la carte revenait — pendant que le
    // panneau des charges fixes affichait déjà son coût annuel. Le même montant
    // deux fois sur le même écran, c'est le décor permanent que ce détecteur
    // dit vouloir éviter.
    const TROIS_MOIS_VARIABLES = {
      '2026-05': moisComplet([charge('Netflix', 13.49)]),
      '2026-06': moisComplet([charge('Netflix', 13.49)]),
      '2026-07': moisComplet([charge('Netflix', 13.49)])
    };

    it('la déclarer fixe dans le mois affiché fait taire l\'observation', () => {
      const suivi = {
        ...TROIS_MOIS_VARIABLES,
        '2026-08': moisComplet([], [charge('Netflix', 13.49)])
      };

      expect(abonnementsNonDeclares({ periods: suivi, moisCourant: '2026-08' })).toBe(null);
    });

    it('tant qu\'on ne l\'a pas fait, elle parle', () => {
      // Le témoin positif : sans lui, un détecteur muet passerait le contrôle
      // ci-dessus.
      const vu = abonnementsNonDeclares({
        periods: TROIS_MOIS_VARIABLES, moisCourant: '2026-08'
      });

      expect(vu).not.toBe(null);
      expect(vu.detail).toContain('Netflix');
    });

    it('le mois affiché ne compte pas dans la fenêtre de stabilité', () => {
      // Il est partiel : une charge pas encore saisie ferait croire à un
      // abonnement interrompu, et un montant à moitié passé le ferait varier.
      const moisEntame = {
        ...TROIS_MOIS_VARIABLES,
        '2026-08': moisComplet([charge('Netflix', 99)])
      };
      const vu = abonnementsNonDeclares({ periods: moisEntame, moisCourant: '2026-08' });

      expect(vu).not.toBe(null);
      expect(vu.montant).toBeCloseTo(13.49, 2);
    });
  });

  describe('UN LIBELLÉ RÉPÉTÉ DANS LE MOIS S\'ADDITIONNE', () => {
    // La saisie rapide sans description reprend le nom de la catégorie :
    // « Boulangerie » revient donc plusieurs fois par mois. Ne garder que la
    // dernière occurrence faisait comparer trois montants pris au hasard.

    it('des courses irrégulières ne passent pas pour un prélèvement', () => {
      const irregulier = {
        '2026-05': moisComplet([
          charge('Boulangerie', 4.5), charge('Boulangerie', 5.2), charge('Boulangerie', 5)
        ]),
        '2026-06': moisComplet([charge('Boulangerie', 6), charge('Boulangerie', 5.3)]),
        '2026-07': moisComplet([
          charge('Boulangerie', 3), charge('Boulangerie', 8),
          charge('Boulangerie', 2), charge('Boulangerie', 4.8)
        ])
      };

      // Sommes réelles : 14,70 / 11,30 / 17,80 → écart de 6,50 €, rien de
      // stable. Le défaut retenait 5,00 / 5,30 / 4,80 et déclenchait la carte.
      expect(abonnementsNonDeclares({ periods: irregulier, moisCourant: '2026-08' })).toBe(null);
    });

    it('un vrai prélèvement doublé un mois porte son montant réel', () => {
      const double = {
        '2026-05': moisComplet([charge('Netflix', 13.49)]),
        '2026-06': moisComplet([charge('Netflix', 13.49)]),
        '2026-07': moisComplet([charge('Netflix', 13.49)])
      };
      const vu = abonnementsNonDeclares({ periods: double, moisCourant: '2026-08' });

      // Une seule occurrence par mois : la somme vaut l'occurrence.
      expect(vu).not.toBe(null);
      expect(vu.montant).toBeCloseTo(13.49, 2);
    });
  });

  describe('TROIS MOIS CONSÉCUTIFS, ET NON TROIS MOIS CONNUS', () => {
    // « Revient chaque mois » est une affirmation sur des mois qui se suivent.
    // Trois mois épars — novembre, mars, juillet — ne la portent pas : on ne
    // sait rien des huit autres, et le titre de l'observation, lui, l'affirme.

    it('un trou dans la fenêtre fait taire l\'observation', () => {
      const epars = {
        '2025-11': moisComplet([charge('Netflix', 13.49), charge('Spotify', 11.99)]),
        '2026-03': moisComplet([charge('Netflix', 13.49), charge('Spotify', 11.99)]),
        '2026-07': moisComplet([charge('Netflix', 13.49), charge('Spotify', 11.99)])
      };

      // Trois mois connus, la même charge dans les trois, montant stable : le
      // défaut y voyait un prélèvement mensuel.
      expect(abonnementsNonDeclares({ periods: epars, moisCourant: '2026-08' })).toBe(null);
    });

    it('un seul mois manquant dans la fenêtre suffit', () => {
      const troue = {
        '2026-04': moisComplet([charge('Netflix', 13.49)]),
        '2026-05': moisComplet([charge('Netflix', 13.49)]),
        // juin manque
        '2026-07': moisComplet([charge('Netflix', 13.49)])
      };

      expect(abonnementsNonDeclares({ periods: troue, moisCourant: '2026-08' })).toBe(null);
    });

    it('trois mois qui se suivent, eux, parlent', () => {
      // Le témoin positif : sans lui, les deux contrôles ci-dessus seraient
      // satisfaits par une fonction qui rend toujours `null`.
      const vu = abonnementsNonDeclares({ periods: TROIS_MOIS, moisCourant: '2026-08' });

      expect(vu).not.toBe(null);
      expect(vu.detail).toContain('Netflix');
    });
  });
});

describe('À ce rythme, combien coûtera le mois', () => {
  /** Trois mois révolus à 1 000 €, et un mois en cours qui part plus vite */
  const socle = {
    '2026-05': mois([charge('Vie', 1000)]),
    '2026-06': mois([charge('Vie', 1000)]),
    '2026-07': mois([charge('Vie', 1000)])
  };

  it('projette la dépense sur le mois entier et la compare à l\'ordinaire', () => {
    const periods = { ...socle, '2026-08': mois([charge('Vie', 600)]) };
    // 600 € en 10 jours → 1 860 € sur 31 jours, contre 1 000 € d'ordinaire.
    const vu = rythmeDuMois({ periods, moisCourant: '2026-08', moisReel: '2026-08', jourDuMois: 10, joursDuMois: 31 });

    expect(vu.urgence).toBe('attention');
    expect(vu.montant).toBeCloseTo(1860, 2);
    expect(vu.detail).toContain('1000.00');
    expect(vu.fonde).toContain('10 jours');
  });

  it('se tait les premiers jours du mois', () => {
    // Sur deux jours, une seule grosse course projette un dépassement qui n'en
    // est pas un.
    const periods = { ...socle, '2026-08': mois([charge('Vie', 400)]) };
    expect(rythmeDuMois({ periods, moisCourant: '2026-08', moisReel: '2026-08', jourDuMois: 2, joursDuMois: 31 }))
      .toBe(null);
  });

  it('se tait sans trois mois révolus : « ordinaire » ne veut rien dire', () => {
    const court = {
      '2026-07': mois([charge('Vie', 1000)]),
      '2026-08': mois([charge('Vie', 600)])
    };
    expect(rythmeDuMois({ periods: court, moisCourant: '2026-08', moisReel: '2026-08', jourDuMois: 10, joursDuMois: 31 }))
      .toBe(null);
  });

  it('un mois qui suit son cours ordinaire ne dit rien', () => {
    // 320 € en 10 jours → 992 € sur 31 : c'est un mois normal.
    const periods = { ...socle, '2026-08': mois([charge('Vie', 320)]) };
    expect(rythmeDuMois({ periods, moisCourant: '2026-08', moisReel: '2026-08', jourDuMois: 10, joursDuMois: 31 }))
      .toBe(null);
  });

  it('un écart de quelques pour cent n\'est pas un dépassement', () => {
    // 360 € en 10 jours → 1 116 €, soit 11 % de plus : sous le seuil.
    const periods = { ...socle, '2026-08': mois([charge('Vie', 360)]) };
    expect(rythmeDuMois({ periods, moisCourant: '2026-08', moisReel: '2026-08', jourDuMois: 10, joursDuMois: 31 }))
      .toBe(null);
  });

  it('le dernier jour du mois, il n\'y a plus rien à projeter', () => {
    const periods = { ...socle, '2026-08': mois([charge('Vie', 1800)]) };
    expect(rythmeDuMois({ periods, moisCourant: '2026-08', moisReel: '2026-08', jourDuMois: 31, joursDuMois: 31 }))
      .toBe(null);
  });

  it('des entrées inexploitables ne font pas tomber le calcul', () => {
    expect(rythmeDuMois({ periods: null, moisCourant: '2026-08', moisReel: '2026-08', jourDuMois: 10, joursDuMois: 31 }))
      .toBe(null);
    expect(rythmeDuMois({ periods: socle, moisCourant: 'pas un mois', moisReel: 'pas un mois', jourDuMois: 10, joursDuMois: 31 }))
      .toBe(null);
  });

  /**
   * Un mois avec ses charges fixes ET variables — la forme réelle d'un mois
   * ouvert : la reconduction y a inscrit tout le fixe dès le premier jour.
   */
  const moisReconduit = (fixes, variables) => ({
    salaries: { vous: 2500, conjointe: 1800 },
    fixedCharges: Object.fromEntries(fixes.map((c, i) => [`f${i}`, c])),
    variableCharges: Object.fromEntries(variables.map((c, i) => [`v${i}`, c]))
  });

  describe('LE FIXE NE SE PROJETTE PAS : il est déjà entier', () => {
    // La reconduction inscrit toutes les charges fixes dès la première
    // ouverture du mois, chacune à son quantième. Les étendre au prorata des
    // jours écoulés revient à projeter six loyers.
    const AVEC_FIXE = {
      '2026-05': moisReconduit([charge('Loyer', 900)], [charge('Vie', 400)]),
      '2026-06': moisReconduit([charge('Loyer', 900)], [charge('Vie', 400)]),
      '2026-07': moisReconduit([charge('Loyer', 900)], [charge('Vie', 400)]),
      // Au 5 : 900 € de loyer déjà inscrits, 200 € de variables saisis.
      '2026-08': moisReconduit([charge('Loyer', 900)], [charge('Vie', 200)])
    };

    it('n\'étend que les dépenses variables', () => {
      const vu = rythmeDuMois({
        periods: AVEC_FIXE, moisCourant: '2026-08', moisReel: '2026-08',
        jourDuMois: 5, joursDuMois: 31
      });

      // 900 + 200 × 31/5 = 900 + 1 240 = 2 140.
      // Le défaut multipliait TOUT : 1 100 × 31/5 = 6 820 €.
      expect(vu).not.toBe(null);
      expect(vu.montant).toBeCloseTo(2140, 2);
      expect(vu.montant).toBeLessThan(6820);
    });

    it('le fonde distingue les deux, sans quoi le chiffre serait invérifiable', () => {
      const vu = rythmeDuMois({
        periods: AVEC_FIXE, moisCourant: '2026-08', moisReel: '2026-08',
        jourDuMois: 5, joursDuMois: 31
      });

      expect(vu.fonde).toContain('200.00');
      expect(vu.fonde).toContain('900.00');
      expect(vu.fonde).toContain('déjà inscrites');
    });

    it('un mois où SEUL le fixe est passé ne projette aucun dépassement', () => {
      // C'est le cas du 2 ou du 3 du mois, avant la première course. Le défaut
      // y voyait 900 × 31/6 = 4 650 € et criait au dépassement.
      const seulLeFixe = {
        ...AVEC_FIXE,
        '2026-08': moisReconduit([charge('Loyer', 900)], [])
      };
      const vu = rythmeDuMois({
        periods: seulLeFixe, moisCourant: '2026-08', moisReel: '2026-08',
        jourDuMois: 6, joursDuMois: 31
      });

      // 900 € projetés contre 1 300 € d'ordinaire : rien à signaler.
      expect(vu).toBe(null);
    });
  });

  describe('SEUL LE MOIS RÉELLEMENT EN COURS SE PROJETTE', () => {
    // `moisCourant` est le mois du sélecteur ; le jour vient de l'horloge.
    // Sans le rapprochement, choisir un mois clos projetait ses dépenses sur
    // les jours écoulés d'aujourd'hui.
    //
    // Les mois sont posés de façon que CHAQUE cas déclencherait l'observation
    // sans la garde : quatre mois révolus à 1 000 € avant le plus ancien des
    // trois qu'on interroge, et un total assez lourd dans chacun. Sans cette
    // précaution les contrôles passeraient pour la mauvaise raison — trop peu
    // d'historique, ou un mois vide — et ne mesureraient rien.
    const periods = {
      '2026-03': mois([charge('Vie', 1000)]),
      '2026-04': mois([charge('Vie', 1000)]),
      '2026-05': mois([charge('Vie', 1000)]),
      '2026-06': mois([charge('Vie', 1000)]),
      '2026-07': mois([charge('Vie', 1800)]),
      '2026-08': mois([charge('Vie', 600)]),
      '2026-09': mois([charge('Vie', 600)])
    };

    it('un mois révolu n\'a rien à projeter : il est connu', () => {
      // Sans la garde : 1 800 × 31/10 = 5 580 € « à la fin » d'un mois clos.
      expect(rythmeDuMois({
        periods, moisCourant: '2026-07', moisReel: '2026-08',
        jourDuMois: 10, joursDuMois: 31
      })).toBe(null);
    });

    it('un mois à venir non plus', () => {
      // Sans la garde : 600 × 31/10 = 1 860 € pour un mois pas encore commencé.
      expect(rythmeDuMois({
        periods, moisCourant: '2026-09', moisReel: '2026-08',
        jourDuMois: 10, joursDuMois: 31
      })).toBe(null);
    });

    it('sans mois réel, on ne suppose pas que le mois affiché est celui d\'aujourd\'hui', () => {
      expect(rythmeDuMois({
        periods, moisCourant: '2026-08', jourDuMois: 10, joursDuMois: 31
      })).toBe(null);
    });

    it('le mois réellement en cours, lui, se projette', () => {
      // Le témoin positif : sans lui, les trois contrôles ci-dessus seraient
      // satisfaits par une fonction qui rend toujours `null`.
      const vu = rythmeDuMois({
        periods, moisCourant: '2026-08', moisReel: '2026-08',
        jourDuMois: 10, joursDuMois: 31
      });

      expect(vu).not.toBe(null);
      expect(vu.montant).toBeCloseTo(1860, 2);
    });
  });
});
