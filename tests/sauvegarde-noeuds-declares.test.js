// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(),
  showConfirmModal: vi.fn(() => Promise.resolve(true))
}));
vi.mock('../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));
vi.mock('../public/js/state.js', () => ({ getState: vi.fn(() => 'vous') }));

/**
 * `db.js` est mocké autour de l'original, et non remplacé.
 *
 * `cheminDuPersonnel` est la fabrique que la sauvegarde emploie pour lire sa
 * propre poche : la réécrire ici en donnerait une seconde rédaction, qui
 * divergerait de celle de `db.js` au premier renommage — et le contrôle
 * resterait vert en mesurant un chemin que l'application n'emprunte plus. Seul
 * `dbGet` est remplacé, par la sonde qui relève les chemins demandés.
 */
const lectures = [];
let base = {};

vi.mock('../public/js/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  dbGet: vi.fn(async (chemin) => {
    lectures.push(chemin);
    return valeurEnBase(chemin);
  }),
  dbSet: vi.fn(() => Promise.resolve()),
  dbUpdate: vi.fn(() => Promise.resolve())
}));

/**
 * Ce que la base rend à un chemin, comme Realtime Database le ferait
 *
 * Un nœud absent rend `null` — c'est la seule chose qui distingue « vide » de
 * « inexistant », et c'est ce que l'enveloppe doit refléter.
 *
 * @param {string} chemin
 * @returns {*}
 */
function valeurEnBase(chemin) {
  let courant = base;
  for (const segment of chemin.split('/')) {
    if (courant === null || typeof courant !== 'object' || !(segment in courant)) return null;
    courant = courant[segment];
  }
  return courant === undefined ? null : courant;
}

const { buildBackup } = await import('../public/js/modules/backup.js');
const { NOEUD_PERSONNEL, cheminDuPersonnel } = await import('../public/js/db.js');

/**
 * La liste des nœuds restaurables doit suivre les règles, dans les deux sens
 *
 * `backup.js` tient à la main un inventaire des nœuds qu'une restauration a le
 * droit de poser. Restaurer écrase tout : le contrôle arrive donc **avant**
 * l'écriture, et nomme le nœud fautif plutôt que de laisser un
 * « Restauration impossible » sans indice.
 *
 * Le piège est que cet inventaire double celui des règles de sécurité, sans
 * qu'aucun mécanisme ne les tienne ensemble. Un nœud neuf déclaré dans les
 * règles et oublié dans `backup.js` produit le pire enchaînement possible :
 *
 *   1. la sauvegarde lit la racine entière — le nœud neuf y est ;
 *   2. le fichier part, et paraît complet ;
 *   3. la restauration le refuse : « des données que l'application ne connaît
 *      pas » ;
 *   4. donc **toute sauvegarde postérieure au nœud neuf est irrestaurable**,
 *      et on ne l'apprend que le jour où l'on en a besoin.
 *
 * Ce n'est pas une hypothèse. Le commentaire de `envelopes` dans la liste
 * raconte cette panne exacte, déjà survenue — et `versements`, arrivé le
 * 2026-08-27, l'a reproduite mot pour mot.
 *
 * D'où ce test, dans les deux sens. Les règles font autorité : elles seules
 * décident de ce qui peut exister sous la racine.
 */

const racine = process.cwd();

/** Les nœuds que les règles déclarent sous un espace de données */
function noeudsDeclares(espace) {
  const regles = JSON.parse(readFileSync(resolve(racine, 'database.rules.json'), 'utf8')).rules;
  return Object.keys(regles[espace]).filter(cle => !cle.startsWith('.') && !cle.startsWith('$')).sort();
}

/**
 * L'inventaire tenu par `backup.js`, lu dans la source
 *
 * Les commentaires sont retirés avant l'extraction : ils sont en français, et
 * leurs apostrophes se lisent sinon comme des chaînes.
 */
function noeudsConnus() {
  const source = readFileSync(resolve(racine, 'public/js/modules/backup.js'), 'utf8');
  const bloc = source.match(/const NOEUDS_CONNUS = \[([\s\S]*?)\];/);
  if (!bloc) throw new Error('NOEUDS_CONNUS introuvable dans backup.js');

  const sansCommentaires = bloc[1].replace(/\/\/[^\n]*/g, '');
  return [...sansCommentaires.matchAll(/'([^']+)'/g)].map(m => m[1]).sort();
}

describe('Les nœuds restaurables et les règles disent la même chose', () => {
  it('tout nœud déclaré par les règles est restaurable', () => {
    // Le sens qui a cassé. Un nœud que les règles acceptent finit dans le
    // fichier de sauvegarde ; s'il n'est pas ici, le fichier est mort-né.
    const manquants = noeudsDeclares('household').filter(n => !noeudsConnus().includes(n));
    expect(manquants, `Nœuds acceptés par les règles mais refusés à la restauration : ${manquants.join(', ')}`)
      .toEqual([]);
  });

  it('tout nœud restaurable est déclaré par les règles', () => {
    // L'autre sens, qui n'a jamais cassé mais coûterait autant : restaurer un
    // nœud que les règles refusent échoue au milieu de l'écriture, après avoir
    // effacé ce qui précède.
    const orphelins = noeudsConnus().filter(n => !noeudsDeclares('household').includes(n));
    expect(orphelins, `Nœuds que la restauration poserait et que les règles refuseraient : ${orphelins.join(', ')}`)
      .toEqual([]);
  });

  it('le bac à sable déclare exactement les mêmes nœuds que le foyer', () => {
    // `?sandbox=1` bascule DATA_ROOT. Un nœud déclaré d'un seul côté rendrait
    // le bac à sable incapable de reproduire une panne du foyer — ce à quoi il
    // sert.
    expect(noeudsDeclares('sandbox')).toEqual(noeudsDeclares('household'));
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LA COUVERTURE A CHANGÉ DE NATURE, ET LES DEUX CAS CI-DESSUS NE LE VOIENT PAS
 *
 * Tant que la sauvegarde lisait la racine de l'espace en une requête, la
 * couverture était STRUCTURELLE : tout ce qui vivait sous la racine partait
 * dans le fichier, y compris un nœud dont personne ne se souvenait. Les deux
 * cas ci-dessus suffisaient — ils tenaient l'inventaire, et l'inventaire ne
 * servait qu'à la restauration.
 *
 * Depuis que le droit de lecture a descendu d'un cran, cette requête est
 * refusée et la sauvegarde lit nœud par nœud. La couverture est donc tenue À
 * LA MAIN, et les deux cas ci-dessus resteraient VERTS si un nœud déclaré
 * était oublié dans la boucle : ils comparent la liste aux règles, jamais la
 * liste à ce qui est réellement demandé à la base.
 *
 * Les deux cas qui suivent mesurent l'EFFET — les chemins que `buildBackup`
 * demande, et l'enveloppe qu'elle produit.
 */
describe('La sauvegarde lit ce que la liste déclare', () => {
  /** Une base plausible : les sept nœuds que le foyer porte réellement */
  const BASE_REELLE = () => ({
    carryOverEnabled: true,
    customCategories: [{ id: 'sport', label: 'Sport' }],
    envelopes: [{ id: 'vacances', label: 'Vacances' }],
    members: { vous: 'Richard', conjointe: 'Cindy' },
    periods: { '2026-09': { variableCharges: { a: { amount: 12 } } } },
    salaries: { vous: 3000, conjointe: 2000 },
    shareMode: { mode: 'prorata' }
  });

  /**
   * Joue une sauvegarde sur une base donnée
   * @param {Object} contenu - L'arbre que la base rendra
   * @returns {Promise<{chemins: Array<string>, data: Object}>}
   */
  const sauvegarderSur = async (contenu) => {
    base = contenu;
    lectures.length = 0;
    const { contenu: fichier } = await buildBackup();
    return { chemins: [...lectures], data: JSON.parse(fichier).data };
  };

  it('tout nœud déclaré est effectivement LU par la sauvegarde', async () => {
    // Le cas que la lecture de racine rendait inutile. Son témoin : retirer un
    // nœud de `plansDeLecture` fait tomber CELUI-CI, et lui seul — les deux
    // cas ci-dessus continuent de comparer la liste aux règles, sans rien
    // savoir de ce qui est demandé.
    const { chemins } = await sauvegarderSur(BASE_REELLE());

    // Un chemin remonte à son nœud de premier niveau : la poche personnelle se
    // lit à `personnel/vous`, jamais à `personnel`.
    const lus = [...new Set(chemins.map((chemin) => chemin.split('/')[0]))].sort();

    expect(lus, `Nœuds déclarés mais jamais lus : ${
      noeudsConnus().filter((n) => !lus.includes(n)).join(', ')}`)
      .toEqual(noeudsConnus());
  });

  it('ne lit que SA poche personnelle, jamais le conteneur des deux', async () => {
    // `personnel` en entier n'est lisible par personne : son droit de lecture
    // vit sur chaque moitié, parce que les deux moitiés n'ont pas le même
    // propriétaire. Une lecture par le nom du nœud échouerait, et la
    // sauvegarde entière avec elle.
    const { chemins } = await sauvegarderSur(BASE_REELLE());

    expect(chemins).toContain(cheminDuPersonnel('vous'));
    expect(chemins).not.toContain(NOEUD_PERSONNEL);
  });

  it("l'enveloppe reste celle que produisait la lecture de racine", async () => {
    // La propriété qui compte, et elle est plus étroite qu'« elle contient les
    // mêmes nœuds » : un nœud absent de la base ne doit produire AUCUNE clé.
    // Cinq des treize n'existent pas dans le foyer réel. Les écrire à `null`
    // ferait porter à l'enveloppe des clés que la lecture de racine n'a jamais
    // rendues — et `validateBackup`, comme `tools/enveloppe-sauvegarde.mjs`,
    // verrait alors autre chose que ce qu'ils ont toujours vu.
    const reelle = BASE_REELLE();
    const { data } = await sauvegarderSur(reelle);

    // Realtime Database rend les enfants dans l'ordre de leurs clés : la
    // référence est donc la base, clés triées. Comparée par sa SÉRIALISATION,
    // parce que c'est le fichier qui part, pas l'objet.
    const commeLaRacine = Object.fromEntries(
      Object.entries(reelle).sort(([a], [b]) => (a < b ? -1 : 1)));

    expect(JSON.stringify(data)).toBe(JSON.stringify(commeLaRacine));
  });

  it('LE TÉMOIN — une base non vide produit bien des clés', async () => {
    // Sans lui, « les nœuds absents ne paraissent pas » serait satisfait par
    // une enveloppe VIDE : le cas ci-dessus passerait au vert sur une
    // sauvegarde qui ne sauvegarde rien.
    //
    // Il ne nomme AUCUN nœud du foyer, et c'est voulu : mesuré, exiger la
    // présence de `reminders` le faisait tomber en même temps que le cas de
    // couverture ci-dessus, sur le même mutant. Deux contrôles qui tombent
    // ensemble ne disent pas lequel des deux défauts s'est produit.
    const { data } = await sauvegarderSur({
      ...BASE_REELLE(),
      [NOEUD_PERSONNEL]: { vous: { periods: { '2026-09': {} } } }
    });

    // Rangée sous son propriétaire, comme en base.
    expect(data[NOEUD_PERSONNEL]).toEqual({ vous: { periods: { '2026-09': {} } } });
    expect(Object.keys(data).length).toBeGreaterThan(5);
  });

  it("la poche de l'autre ne peut pas entrer dans l'enveloppe", async () => {
    // Elle est en base — l'autre l'a écrite — et elle est illisible sans aval.
    // La sauvegarde ne demande donc que la sienne, et le fichier ne porte
    // qu'elle. C'est ce qui oblige la restauration à ne jamais écrire
    // `personnel` par la racine.
    const { data } = await sauvegarderSur({
      ...BASE_REELLE(),
      [NOEUD_PERSONNEL]: {
        vous: { periods: { '2026-09': { variableCharges: { a: { amount: 9 } } } } },
        conjointe: { periods: { '2026-09': { variableCharges: { b: { amount: 8 } } } } }
      }
    });

    expect(Object.keys(data[NOEUD_PERSONNEL])).toEqual(['vous']);
  });
});
