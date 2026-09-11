// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(), showConfirmModal: vi.fn()
}));

import { setState, getState, resetState } from '../../public/js/state.js';
import { calculateSummary } from '../../public/js/modules/summary.js';
import { initSelecteurPortee, peindreLaPortee } from '../../public/js/modules/selecteur-portee.js';
import { PORTEES } from '../../public/js/utils/portee.js';
import { formatCurrency } from '../../public/js/utils/format.js';

/**
 * Le résumé porte DEUX questions, et une seule avait un chiffre
 *
 * « Qui doit combien à qui » est la question du foyer. « Qu'est-ce que ce mois
 * me coûte » est la mienne, et elle n'existait nulle part : ma part et mes
 * charges solo étaient calculées séparément, leur somme jamais.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE FICHIER A CHANGÉ DE SUJET AVEC SON ARGUMENT — 2026-09-08
 *
 * Il appelait `basculerResume('solo')` : une commande propre au résumé, qui
 * écrivait `ongletDuResume`, une variable de module. Cette commande a disparu —
 * l'écran en portait DEUX pour la même grandeur, et il les annonçait toutes les
 * deux, en désaccord (`tests/e2e/portee-unique.spec.js`).
 *
 * Ce qui change ici est l'ARGUMENT : le versant se demande maintenant en
 * écrivant `porteeCourante`, le seul état qui gouverne la portée.
 *
 * **Les propriétés, elles, sont les mêmes, mot pour mot** — c'est la raison
 * pour laquelle ce fichier n'est pas réécrit mais reciblé :
 *
 *   1. L'application ouvre sur le foyer. Rouvrir sur le versant personnel
 *      serait rouvrir sur un écran où un solde impayé n'apparaît nulle part —
 *      et `porteeCourante` vit en mémoire vive, donc chaque chargement repart
 *      de « À deux » sans qu'aucune ligne ne s'en occupe.
 *   2. Le solde reste VISIBLE depuis la portée personnelle. Seule sa surface a
 *      bougé : le repère vivait sur l'onglet « À deux », il vit sur le segment
 *      du même nom.
 *   3. Le panneau personnel ne porte AUCUN chiffre du foyer. C'est la raison
 *      d'être des deux versants : un versant qui redit l'autre n'en a plus.
 *   4. Il n'écrit pas `.summary-balance`. `barre-solde.js` s'en sert comme
 *      témoin pour se taire ; l'écrire ici ferait taire la barre sur un écran
 *      qui ne porte aucune dette.
 *   5. L'état actif se lit sur un attribut ARIA : impossible de peindre un
 *      versant actif sans l'annoncer. `aria-selected` sur un onglet hier,
 *      `aria-checked` sur un segment aujourd'hui.
 *
 * Et une propriété NEUVE, que la fusion rend mesurable : le résumé LIT la
 * portée, il ne l'écrit jamais.
 */

const SALAIRES = { vous: 3000, conjointe: 1000 };

const commune = (id, amount, paidBy = 'vous') => ({
  id, description: 'Courses', amount, category: 'Maison',
  paidBy, deleted: false, date: '2026-08-04'
});

const solo = (id, amount, paidBy = 'vous') => ({
  ...commune(id, amount, paidBy), description: 'Salle de sport', perimetre: 'solo'
});

const LE_10_AOUT = new Date(2026, 7, 10, 12, 0, 0);

/**
 * Prorata 75/25, 1 000 € de commun avancés par vous, 100 € de solo.
 *
 *   ma part du commun  750,00     mes revenus       3 000,00
 *   mes charges solo   100,00     engagé              850,00
 *   reste à vivre    2 150,00     taux d'effort        28,3 %
 */
function resumeRendu({ portee = PORTEES.DEUX, charges, salaires = SALAIRES, mode = 'prorata' } = {}) {
  resetState();
  setState('currentPeriod', '2026-08');
  setState('salaries', salaires);
  setState('variableCharges', charges ?? [commune('v1', 1000), solo('s1', 100)]);
  setState('fixedCharges', []);
  setState('reimbursements', []);
  setState('shareMode', mode);

  // La portée est un ÉTAT, plus une variable de module : elle s'écrit comme
  // les autres, et le résumé la relit à chaque rendu.
  setState('porteeCourante', portee);
  calculateSummary();

  const bilan = document.getElementById('summarySection');
  return {
    bilan,
    texte: bilan.textContent,
    duo: bilan.querySelector('#resumePanneauDuo'),
    solo: bilan.querySelector('#resumePanneauSolo'),
    segmentDuo: document.querySelector('[data-portee="deux"]'),
    segmentSolo: document.querySelector('[data-portee="solo"]'),
    repere: document.querySelector('.portee-repere')
  };
}

/**
 * Le repère est-il RENDU, et non seulement présent ?
 *
 * Il est posé une fois puis masqué, plutôt que créé et détruit : chercher sa
 * présence dans le document ne dirait donc plus rien — un contrôle vert sur un
 * nœud qui ne se voit pas. C'est son état affiché qu'on lit.
 */
const repereVisible = () => {
  const repere = document.querySelector('.portee-repere');
  return Boolean(repere) && !repere.hidden;
};

describe('Le versant du résumé', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="panneauBilan" class="panneau"></section>
      <div id="summarySection"></div>
      <div id="balanceBar"></div>
      <div id="categoryBudgets"></div>
      <section id="trendsSection"></section>
    `;
    // Le sélecteur porte le repère de solde : sans lui posé, les contrôles du
    // repère mesureraient une absence, pas un état.
    initSelecteurPortee();
    vi.useFakeTimers();
    vi.setSystemTime(LE_10_AOUT);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('l\'ouverture', () => {
    it('ouvre sur le foyer, jamais sur le suivi personnel', () => {
      const { duo, solo: panneauSolo, segmentDuo } = resumeRendu();

      expect(duo).not.toBeNull();
      expect(panneauSolo).toBeNull();
      expect(segmentDuo.getAttribute('aria-checked')).toBe('true');
    });

    // Le total a quitté la tête au lot D (2026-09-11) : il est au rang 3,
    // carte « Dépensé à deux ». La propriété que ce cas tient — le panneau
    // du foyer porte le total du foyer — n'a pas bougé ; son titre, si.
    it('porte le total du foyer, au rang 3 depuis le lot D', () => {
      const { texte } = resumeRendu();
      expect(texte).toContain(formatCurrency(1000));
    });
  });

  describe('le repère de solde', () => {
    it('marque « À deux » tant qu\'un solde reste dû', () => {
      const { segmentDuo } = resumeRendu();

      expect(repereVisible()).toBe(true);
      // Sur le segment du FOYER, et sur lui seul : un repère posé sur « Moi ce
      // mois » désignerait une dette que ce versant ne montre pas.
      expect(segmentDuo.querySelector('.portee-repere')).not.toBeNull();
    });

    it('reste visible depuis la portée personnelle — sinon la dette disparaîtrait', () => {
      // LA propriété que le déplacement devait préserver. Le panneau du foyer
      // n'est plus rendu du tout : sans ce repère, un solde impayé n'apparaît
      // nulle part sur l'écran.
      const { duo } = resumeRendu({ portee: PORTEES.SOLO });

      expect(duo, 'prémisse : le panneau du foyer est bien absent').toBeNull();
      expect(repereVisible()).toBe(true);
    });

    it('disparaît quand les comptes sont équilibrés', () => {
      // Chacun avance sa part exacte : rien à se rembourser.
      resumeRendu({
        charges: [commune('v1', 750, 'vous'), commune('v2', 250, 'conjointe')]
      });
      expect(repereVisible()).toBe(false);
    });

    it('se rallume et s\'éteint d\'un rendu à l\'autre', () => {
      // Le repère est posé une fois puis basculé. Un contrôle qui ne le voit
      // que dans un sens ne dirait pas si l'attribut se remet jamais.
      resumeRendu();
      expect(repereVisible()).toBe(true);

      resumeRendu({ charges: [commune('v1', 750, 'vous'), commune('v2', 250, 'conjointe')] });
      expect(repereVisible()).toBe(false);

      resumeRendu();
      expect(repereVisible()).toBe(true);
    });
  });

  describe('le panneau personnel', () => {
    it('affiche le reste à vivre et le taux d\'effort', () => {
      const { texte } = resumeRendu({ portee: PORTEES.SOLO });

      expect(texte).toContain(formatCurrency(2150));
      expect(texte).toContain('Reste à vivre hors privé');
      expect(texte).toContain('28');
    });

    it('dit que les dépenses privées n\'en sont pas déduites', () => {
      const { texte } = resumeRendu({ portee: PORTEES.SOLO });
      expect(texte).toContain('privées n\'en sont pas déduites');
    });

    it('affiche mes charges solo, et dit qu\'elles sont visibles', () => {
      const { texte } = resumeRendu({ portee: PORTEES.SOLO });
      expect(texte).toContain(formatCurrency(100));
      expect(texte).toContain('visible de');
    });

    it('ne porte AUCUN chiffre du foyer', () => {
      const { texte } = resumeRendu({ portee: PORTEES.SOLO });

      // Le total du foyer, la part due, le geste de règlement : tout cela
      // appartient à l'autre question.
      expect(texte).not.toContain(formatCurrency(1000));
      expect(texte).not.toContain(formatCurrency(750));
      expect(texte).not.toContain('Régler ce solde');
    });

    it('n\'écrit pas `.summary-balance` — la barre collante doit reprendre le relais', () => {
      const { bilan } = resumeRendu({ portee: PORTEES.SOLO });
      expect(bilan.querySelector('.summary-balance')).toBeNull();
    });

    it('demande les revenus plutôt que d\'inventer un reste à vivre', () => {
      // Le 50-50 ne réclame aucun salaire — c'est souvent la raison de son
      // choix. Le bilan se calcule ; le versant personnel, lui, n'a rien à
      // diviser, et le dit pour lui seul.
      const { texte, bilan } = resumeRendu({
        portee: PORTEES.SOLO, salaires: { vous: 0, conjointe: 0 }, mode: '50-50'
      });

      expect(texte).toContain('Renseignez vos revenus');
      expect(bilan.querySelector('[data-action="focusSalaries"]')).not.toBeNull();
      expect(texte).not.toContain('Reste à vivre hors privé');
    });
  });

  describe('« Privé » a son propre panneau', () => {
    it('ne rend ni le foyer ni le versant personnel', () => {
      // ── CE CAS DISAIT L'INVERSE, ET C'ÉTAIT UNE DETTE ÉCRITE ──
      //
      // « Privé » rendait le panneau du foyer, faute de vue : le test était
      // `!== solo` et jamais `=== deux`, parce que montrer mes chiffres
      // personnels sous une étiquette qui promet le privé aurait menti
      // davantage. La vue existe depuis le 2026-09-08 ; la dette est fermée, et
      // ce cas passe de l'un à l'autre sans changer de sujet — il dit toujours
      // ce que « Privé » rend.
      const { duo, solo: panneauSolo } = resumeRendu({ portee: PORTEES.PRIVE });

      expect(duo, 'le foyer est rendu sous une étiquette qui promet le privé')
        .toBeNull();
      expect(panneauSolo, 'le versant personnel est rendu sous l\'étiquette du privé')
        .toBeNull();
      expect(document.getElementById('resumePanneauPrive'),
        'aucun panneau privé n\'est posé').not.toBeNull();
    });

    it('pose un conteneur que la lecture remplira, jamais un écran vide', () => {
      // Le remplissage est asynchrone — quatre lectures en base — et ce
      // contrôle-ci tourne sur un double synchrone. Ce qu'il tient est que le
      // conteneur ne part pas VIDE : un panneau blanc se lit comme une panne,
      // et c'est le seul état que la personne verrait si la base tardait.
      resumeRendu({ portee: PORTEES.PRIVE });
      expect(document.getElementById('resumePanneauPrive').textContent.trim())
        .not.toBe('');
    });
  });

  describe('l\'annonce du versant actif', () => {
    it('bascule `aria-checked` des deux côtés', () => {
      // La peinture suit l'ÉTAT, elle n'est pas déduite du geste : le contrôle
      // écrit la portée sans toucher un segment, puis demande la peinture. Un
      // segment qui se colorerait au clic resterait gris ici.
      const enSolo = resumeRendu({ portee: PORTEES.SOLO });
      peindreLaPortee();
      expect(enSolo.segmentSolo.getAttribute('aria-checked')).toBe('true');
      expect(enSolo.segmentDuo.getAttribute('aria-checked')).toBe('false');

      const enDuo = resumeRendu({ portee: PORTEES.DEUX });
      peindreLaPortee();
      expect(enDuo.segmentDuo.getAttribute('aria-checked')).toBe('true');
      expect(enDuo.segmentSolo.getAttribute('aria-checked')).toBe('false');
    });

    it('garde les trois portées atteignables depuis n\'importe laquelle', () => {
      resumeRendu({ portee: PORTEES.SOLO });
      expect(document.querySelectorAll('[data-portee]')).toHaveLength(3);
    });
  });

  describe('le résumé LIT la portée, il ne l\'écrit jamais', () => {
    it('rendre le bilan laisse `porteeCourante` intacte, les trois fois', () => {
      // La propriété que la fusion existe pour tenir, et « Privé » est le cas
      // qui la met à l'épreuve : le résumé n'a pas de vue privée, et un rendu
      // qui corrigerait l'état — « je n'en ai pas, je retombe sur deux » —
      // recréerait une seconde source, sous une forme bien plus difficile à
      // voir qu'un second bouton.
      for (const portee of [PORTEES.DEUX, PORTEES.SOLO, PORTEES.PRIVE]) {
        resumeRendu({ portee });
        expect(getState('porteeCourante'),
          `le rendu a réécrit la portée « ${portee} »`).toBe(portee);

        // Et un second rendu non plus : c'est au deuxième passage qu'une
        // correction silencieuse se serait installée.
        calculateSummary();
        expect(getState('porteeCourante'),
          `le second rendu a réécrit la portée « ${portee} »`).toBe(portee);
      }
    });
  });
});
