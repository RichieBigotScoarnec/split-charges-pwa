import { describe, it, expect } from 'vitest';
import { apprendre, categorieProposee } from '../../public/js/utils/memoire-libelle.js';

/**
 * L'application se souvient de ce que vous rangez où
 *
 * Les concurrents lisent le compte bancaire : la catégorie se devine du
 * commerçant. FairSplit demande un geste par dépense, et ce geste est le vrai
 * coût d'usage d'une application sans lien bancaire.
 *
 * Ce module n'invente rien : il relit ce que le foyer a lui-même saisi. Les
 * contrôles portent donc autant sur ce qu'il PROPOSE que sur ce qu'il refuse
 * de proposer — une catégorie posée de travers sans qu'on le remarque coûte
 * plus cher que pas de proposition du tout.
 */

/** Une charge minimale */
const charge = (description, category, extra = {}) => ({
  description, category, amount: 20, paidBy: 'vous', deleted: false, ...extra
});

/** Un historique à partir d'une liste de charges par mois */
const historique = (parMois) => Object.fromEntries(
  Object.entries(parMois).map(([mois, charges]) => [
    mois,
    { variableCharges: Object.fromEntries(charges.map((c, i) => [`v${i}`, c])) }
  ])
);

describe('Ce que le foyer a rangé où', () => {
  const DEUX_FOIS = historique({
    '2026-07': [charge('Intermarché', 'Courses'), charge('Le Bistrot', 'Restaurant')],
    '2026-08': [charge('Intermarché', 'Courses')]
  });

  it('retient une habitude et compte ce qui la soutient', () => {
    const memoire = apprendre(DEUX_FOIS);
    const vu = categorieProposee('Intermarché', memoire);

    expect(vu.categorie).toBe('Courses');
    expect(vu.saisies).toBe(2);
    expect(vu.exact).toBe(true);
  });

  it('une seule saisie ne prouve rien', () => {
    // Elle a pu être rangée de travers : la reproposer perpétuerait l'erreur
    // au lieu de la corriger.
    expect(categorieProposee('Le Bistrot', apprendre(DEUX_FOIS))).toBe(null);
  });

  it('les accents ne sont pas exigés, comme pour la recherche', () => {
    const memoire = apprendre(DEUX_FOIS);
    expect(categorieProposee('intermarche', memoire).categorie).toBe('Courses');
    expect(categorieProposee('INTERMARCHÉ', memoire).categorie).toBe('Courses');
  });

  it('la casse et les espaces de bord non plus', () => {
    expect(categorieProposee('  intermarché  ', apprendre(DEUX_FOIS)).categorie).toBe('Courses');
  });
});

describe('Ce que le module refuse de proposer', () => {
  it('à égalité, il n\'y a pas d\'habitude mais deux usages du même mot', () => {
    // Trancher au hasard rangerait de travers une fois sur deux.
    const partage = historique({
      '2026-07': [charge('Leclerc', 'Courses'), charge('Leclerc', 'Essence')]
    });
    expect(categorieProposee('Leclerc', apprendre(partage))).toBe(null);
  });

  it('à égalité SUR PLUSIEURS SAISIES non plus — c\'est là que la règle joue', () => {
    // Le cas 1 contre 1 ci-dessus est écarté un cran plus tôt, par le seuil
    // « deux saisies minimum » : il n'atteint jamais la règle de majorité.
    // Trois contre trois, si — et sans elle, `apprendre` proposerait
    // « Courses » avec trois saisies pour l'appuyer, sur un mot que le foyer
    // emploie exactement autant dans l'autre sens.
    const troisPartout = historique({
      '2026-06': [
        charge('Leclerc', 'Courses'), charge('Leclerc', 'Courses'), charge('Leclerc', 'Courses'),
        charge('Leclerc', 'Essence'), charge('Leclerc', 'Essence'), charge('Leclerc', 'Essence')
      ]
    });

    expect(categorieProposee('Leclerc', apprendre(troisPartout))).toBe(null);
    expect(apprendre(troisPartout)).toEqual({});
  });

  it('une majorité d\'une seule voix suffit, et pas moins', () => {
    // La frontière exacte : 3 contre 2 tranche, 3 contre 3 non. Sans ce
    // couple, une règle « au moins la moitié » passerait le contrôle du haut.
    const troisContreDeux = historique({
      '2026-06': [
        charge('Leclerc', 'Courses'), charge('Leclerc', 'Courses'), charge('Leclerc', 'Courses'),
        charge('Leclerc', 'Essence'), charge('Leclerc', 'Essence')
      ]
    });

    expect(categorieProposee('Leclerc', apprendre(troisContreDeux)).categorie).toBe('Courses');
  });

  it('mais une majorité stricte tranche', () => {
    const majorite = historique({
      '2026-07': [charge('Leclerc', 'Courses'), charge('Leclerc', 'Courses')],
      '2026-08': [charge('Leclerc', 'Essence')]
    });
    const vu = categorieProposee('Leclerc', apprendre(majorite));
    expect(vu.categorie).toBe('Courses');
    expect(vu.saisies).toBe(2);
  });

  it('les dépenses solo ne décident pas des catégories du foyer', () => {
    const solo = historique({
      '2026-07': [
        charge('Décathlon', 'Sport', { perimetre: 'solo' }),
        charge('Décathlon', 'Sport', { perimetre: 'solo' })
      ]
    });
    expect(categorieProposee('Décathlon', apprendre(solo))).toBe(null);
  });

  it('la corbeille non plus', () => {
    const supprimees = historique({
      '2026-07': [
        charge('Truc', 'Courses', { deleted: true }),
        charge('Truc', 'Courses', { deleted: true })
      ]
    });
    expect(categorieProposee('Truc', apprendre(supprimees))).toBe(null);
  });

  it('un libellé ou une catégorie absents ne créent pas d\'entrée', () => {
    const bancal = historique({
      '2026-07': [
        { amount: 10, category: 'Courses', deleted: false },
        charge('Sans catégorie', ''),
        charge('Sans catégorie', '')
      ]
    });
    const memoire = apprendre(bancal);
    expect(Object.keys(memoire).length).toBe(0);
  });

  it('un historique illisible rend une mémoire vide, pas une erreur', () => {
    expect(Object.keys(apprendre(null)).length).toBe(0);
    expect(Object.keys(apprendre({ 'pas-un-mois': {} })).length).toBe(0);
    expect(categorieProposee('quoi que ce soit', apprendre(null))).toBe(null);
  });

  it('une saisie vide ne propose rien', () => {
    const memoire = apprendre(historique({
      '2026-07': [charge('Intermarché', 'Courses'), charge('Intermarché', 'Courses')]
    }));
    expect(categorieProposee('', memoire)).toBe(null);
    expect(categorieProposee('   ', memoire)).toBe(null);
    expect(categorieProposee(null, memoire)).toBe(null);
  });
});

describe('Pendant qu\'on écrit', () => {
  const MEMOIRE = apprendre(historique({
    '2026-06': [charge('Intermarché', 'Courses'), charge('Intermarché Rennes', 'Courses')],
    '2026-07': [charge('Intermarché', 'Courses'), charge('Intermarché Rennes', 'Courses')],
    '2026-08': [charge('Cinéma UGC', 'Loisirs'), charge('Cinéma UGC', 'Loisirs')]
  }));

  it('trois caractères suffisent quand tout ce qui commence ainsi s\'accorde', () => {
    const vu = categorieProposee('Interm', MEMOIRE);
    expect(vu.categorie).toBe('Courses');
    expect(vu.exact).toBe(false);
    // Les deux libellés qui commencent ainsi, quatre saisies en tout.
    expect(vu.saisies).toBe(4);
  });

  it('sous trois caractères, tout ressemble à tout', () => {
    // « c » désignerait « Courses », « Café » et « Cinéma » à la fois.
    expect(categorieProposee('In', MEMOIRE)).toBe(null);
    expect(categorieProposee('C', MEMOIRE)).toBe(null);
  });

  it('deux libellés qui commencent pareil et se rangent ailleurs : silence', () => {
    const ambigu = apprendre(historique({
      '2026-07': [
        charge('Carrefour', 'Courses'), charge('Carrefour', 'Courses'),
        charge('Carburant', 'Essence'), charge('Carburant', 'Essence')
      ]
    }));

    // « car » mène aux deux : choisir serait choisir à la place de
    // l'utilisateur, sans qu'il le sache.
    expect(categorieProposee('car', ambigu)).toBe(null);
    // Mais dès que la saisie tranche, la proposition revient.
    expect(categorieProposee('carr', ambigu).categorie).toBe('Courses');
    expect(categorieProposee('carb', ambigu).categorie).toBe('Essence');
  });

  it('le libellé exact l\'emporte sur ce qui commence pareil', () => {
    // « Intermarché » est connu exactement : inutile d'aller voir plus loin.
    expect(categorieProposee('Intermarché', MEMOIRE).exact).toBe(true);
  });

  it('une amorce inconnue ne propose rien', () => {
    expect(categorieProposee('Zanzibar', MEMOIRE)).toBe(null);
  });
});
