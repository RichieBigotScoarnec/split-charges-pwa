import { describe, it, expect } from 'vitest';
import { questionDeBascule } from '../../public/js/utils/bascule-poche.js';

/**
 * La question posée avant de changer une charge de poche
 *
 * Ce n'est pas de la mise en forme : c'est la SEULE chose qui dise à quelqu'un
 * qu'il est en train de publier une dépense, ou de la retirer de la vue de
 * l'autre. Le lot P1b existe parce que le propriétaire de l'application a
 * utilisé l'espace privé quotidiennement sans savoir ce qu'il faisait de ses
 * données — une garantie exacte n'est pas une information reçue.
 *
 * Les cas tiennent donc le SENS, jamais la ponctuation : le sens qui publie
 * doit nommer la personne qui verra, et l'autre doit dire que le solde ne bouge
 * pas. Une rédaction plus jolie qui perdrait l'un des deux les fait tomber.
 */

const MEMBERS = { vous: 'Richie', conjointe: 'Cindy' };

describe('Le sens qui PUBLIE', () => {
  const question = () => questionDeBascule({
    versLePersonnel: false,
    autre: 'conjointe',
    members: MEMBERS,
    description: 'Cadeau',
    montant: 42
  });

  it('nomme la personne qui verra la dépense', () => {
    expect(question()).toContain('Cindy');
  });

  it('dit que la dépense devient visible, sans euphémisme', () => {
    expect(question()).toMatch(/VISIBLE/);
  });

  it('nomme la charge et son montant', () => {
    expect(question()).toContain('Cadeau');
    expect(question()).toMatch(/42/);
  });

  it('LE TÉMOIN — il ne dit PAS que rien ne change', () => {
    // Sans lui, une rédaction qui recopierait la phrase rassurante de l'autre
    // sens — « le solde ne change pas » — passerait les trois cas ci-dessus en
    // décrivant la bascule la plus coûteuse comme anodine.
    expect(question()).not.toMatch(/ne change pas/);
  });
});

describe('Le sens qui RETIRE de la vue', () => {
  const question = () => questionDeBascule({
    versLePersonnel: true,
    autre: 'conjointe',
    members: MEMBERS,
    description: 'Sport',
    montant: 30
  });

  it('nomme la personne qui ne la verra plus', () => {
    expect(question()).toContain('Cindy');
  });

  it('dit que le solde ne bouge pas', () => {
    // Une charge personnelle n'a jamais pesé sur le solde. Sans cette phrase,
    // la dépense disparaît d'une liste et on la cherche dans le calcul.
    expect(question()).toMatch(/solde ne change pas/);
  });

  it('LE TÉMOIN — les deux sens ne rendent pas la même phrase', () => {
    // Le cas qui sépare : une fabrique qui ignorerait `versLePersonnel`
    // satisferait toutes les assertions de présence de nom et de montant.
    expect(question()).not.toBe(questionDeBascule({
      versLePersonnel: false,
      autre: 'conjointe',
      members: MEMBERS,
      description: 'Sport',
      montant: 30
    }));
  });
});

describe('Ce que la question fait d\'une charge mal renseignée', () => {
  it('se passe du libellé quand il n\'y en a pas', () => {
    const question = questionDeBascule({
      versLePersonnel: true, autre: 'conjointe', members: MEMBERS
    });

    expect(question).toContain('cette charge');
    expect(question).not.toMatch(/«\s*»/);
  });

  it('se passe du montant quand il n\'est pas lisible', () => {
    // `amount` peut valoir `undefined` ou une chaîne : `formatCurrency` rendrait
    // alors « NaN », et une question qui annonce « NaN » dans une frontière de
    // confidentialité est pire qu'une question sans chiffre.
    for (const montant of [undefined, NaN, null, 'douze']) {
      expect(questionDeBascule({
        versLePersonnel: false, autre: 'conjointe', members: MEMBERS,
        description: 'Sport', montant
      })).not.toMatch(/NaN|null|undefined/);
    }
  });

  it('un libellé fait d\'espaces compte comme absent', () => {
    expect(questionDeBascule({
      versLePersonnel: true, autre: 'conjointe', members: MEMBERS, description: '   '
    })).toContain('cette charge');
  });
});

describe('UNE SEULE RÉDACTION POUR LES DEUX LISTES', () => {
  it('la question ne dépend pas de la liste d\'où elle vient', () => {
    // Les charges fixes et variables posent la même question. Deux rédactions
    // divergeraient au premier correctif — et la moins à jour serait celle qui
    // décrit mal une frontière de confidentialité (règle 4). Il n'y a rien à
    // passer ici qui nomme une liste : c'est la propriété, et ce cas la tient
    // en refusant l'arrivée d'un tel paramètre.
    expect(questionDeBascule.length).toBe(1);
  });
});
