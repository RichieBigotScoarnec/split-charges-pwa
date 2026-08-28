import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
