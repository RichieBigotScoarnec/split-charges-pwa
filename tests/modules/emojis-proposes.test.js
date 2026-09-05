// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../public/js/db.js', () => ({
  dbGet: vi.fn(() => Promise.resolve(null)), dbSet: vi.fn(), dbUpdate: vi.fn(), dbPush: vi.fn()
}));
vi.mock('../../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../../public/js/utils/debug.js', () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }));

const { emojisProposes } = await import('../../public/js/modules/custom-lists.js');

/**
 * Signalé à l'usage : « concernant les logos, il n'y a pas café, bar… »
 *
 * La détection par le lieu sait viser « Bar », « Café » et « Boulangerie ».
 * Encore faut-il que le foyer puisse les créer — et personne ne crée une
 * catégorie qu'il ne peut pas se représenter. Sans ces images, la moitié de la
 * détection restait inerte, sans que rien ne le signale.
 */
describe('Les emojis proposés à la création', () => {
  const proposes = emojisProposes();

  it('couvrent les catégories que la détection par le lieu sait viser', () => {
    // Chacune est visée par `categorie-lieu.js` et absente des catégories
    // livrées : elles ne peuvent venir que d'une création par le foyer.
    const attendus = {
      '🍺': 'Bar',
      '☕': 'Café',
      '🥐': 'Boulangerie'
    };

    for (const [emoji, quoi] of Object.entries(attendus)) {
      expect(proposes, `aucune image pour « ${quoi} »`).toContain(emoji);
    }
  });

  it('couvrent le RYTHME, pas seulement le domaine', () => {
    // Toutes les autres propositions nomment un domaine de dépense — une
    // maison, une voiture, un café. Une charge fixe, elle, se définit par son
    // rythme : elle revient. Un abonnement, un prélèvement mensuel, une
    // cotisation ne sont d'aucun domaine en particulier, et le foyer n'avait
    // que 🏠 pour se les représenter — le seul glyphe qui pouvait vaguement
    // faire l'affaire, et qui dit tout autre chose.
    //
    // La présentation du glyphe a été MESURÉE avant de l'inscrire : U+1F501
    // porte `Emoji_Presentation=Yes` et Chromium le peint par la police,
    // insensible à `color`, comme les 57 autres. Il tombe donc du bon côté de
    // la garde de contraste d'`encre-rendue.spec.js`, qui écarte les emoji
    // couleur et mesure au seuil de 3:1 les glyphes qui, eux, suivent `color`.
    expect(proposes, 'aucune image pour une charge qui revient').toContain('🔁');
  });

  it('couvrent aussi les familles courantes du foyer', () => {
    // Courses, essence, santé, loisirs, maison, transport : les six catégories
    // livrées doivent rester représentables après une suppression.
    for (const emoji of ['🛒', '⛽', '💊', '🎮', '🏠', '🚌']) {
      expect(proposes).toContain(emoji);
    }
  });

  it('n\'en proposent aucun deux fois', () => {
    // Un doublon fait douter d'avoir déjà choisi, et occupe une place.
    const doublons = proposes.filter((e, i) => proposes.indexOf(e) !== i);

    expect(doublons, `emojis en double : ${doublons.join(' ')}`).toEqual([]);
  });

  it('restent parcourables au pouce', () => {
    // Assez pour couvrir, assez peu pour se lire. Une planche de deux cents
    // emojis ne se parcourt pas, elle se subit.
    expect(proposes.length).toBeGreaterThanOrEqual(40);
    expect(proposes.length).toBeLessThanOrEqual(72);
  });
});
