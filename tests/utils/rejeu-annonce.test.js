import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { annoncesDuRejeu } from '../../public/js/utils/rejeu-annonce.js';

/**
 * Ce qu'un rejeu de file a le devoir de dire
 *
 * Le défaut mesuré : `app.js` et `auth.js` rejouaient tous deux la file, et
 * rédigeaient chacun ses messages. Ils avaient divergé sur celui qui compte le
 * plus — `synchroniserLesSaisies` d'`app.js` ne lisait pas `refusees`.
 *
 * Une saisie que le serveur refusera **toujours** est écartée de la file, mais
 * le miroir la porte encore : elle reste à l'écran. Sans un mot, le foyer voit
 * sa dépense, la croit enregistrée, et elle n'existe nulle part. Le
 * commentaire de `db.js` promet pourtant que « l'appelant apprend qu'elle
 * n'ira pas plus loin » — la promesse n'était tenue que par un appelant sur
 * deux, et c'était le plus RARE des deux : `auth.js` ne rejoue qu'au
 * chargement des données, quand `app.js` rejoue à chaque reconnexion.
 */

// `fileURLToPath` et non `.pathname` : sous Windows ce dernier rend
// `/C:/Users/...`, que `join` préfixe en `C:\C:\Users\...`. Les contrôles
// tombaient donc chez le développeur et passaient en CI, où personne ne les
// voyait échouer.
const RACINE = fileURLToPath(new URL('../..', import.meta.url));
const source = (chemin) => readFileSync(join(RACINE, chemin), 'utf-8');

/** Tous les fichiers JS livrés */
function fichiersLivres(dossier = 'public/js', trouves = []) {
  for (const entree of readdirSync(join(RACINE, dossier))) {
    const chemin = `${dossier}/${entree}`;
    if (statSync(join(RACINE, chemin)).isDirectory()) fichiersLivres(chemin, trouves);
    else if (entree.endsWith('.js')) trouves.push(chemin);
  }
  return trouves;
}

describe('Le message de succès', () => {
  it('se tait quand rien n\'est parti', () => {
    // Une reconnexion se produit à chaque sortie de veille : un message à
    // chacune ferait de celui-ci un bruit de fond.
    expect(annoncesDuRejeu({ envoyees: 0, restantes: 0 }).succes).toBeNull();
  });

  it('accorde le singulier et le pluriel', () => {
    expect(annoncesDuRejeu({ envoyees: 1 }).succes).toBe('1 saisie hors ligne enregistrée');
    expect(annoncesDuRejeu({ envoyees: 3 }).succes).toBe('3 saisies hors ligne enregistrées');
  });
});

describe('LE MESSAGE DE REFUS — celui qu\'un appelant sur deux ne disait pas', () => {
  it('annonce une saisie définitivement refusée', () => {
    const { refus } = annoncesDuRejeu({ envoyees: 0, restantes: 0, refusees: [{ chemin: 'x' }] });

    expect(refus).toBe('1 saisie refusée par la base — à ressaisir');
  });

  it('et le dit au pluriel', () => {
    const { refus } = annoncesDuRejeu({ refusees: [{ chemin: 'a' }, { chemin: 'b' }] });

    expect(refus).toBe('2 saisies refusées par la base — à ressaisir');
  });

  it('se tait quand il n\'y en a pas', () => {
    expect(annoncesDuRejeu({ envoyees: 2, refusees: [] }).refus).toBeNull();
    expect(annoncesDuRejeu({ envoyees: 2 }).refus).toBeNull();
  });

  it('ne se confond jamais avec « restantes »', () => {
    // Une saisie refusée ne « reste » pas : elle est perdue. Les confondre
    // promettait un envoi qui n'arriverait jamais.
    const { refus, restant } = annoncesDuRejeu({
      envoyees: 0, restantes: 0, refusees: [{ chemin: 'x' }], erreur: null
    });

    expect(refus).toBeTruthy();
    expect(restant).toBeNull();
  });
});

describe('Le message des saisies restées à quai', () => {
  it('exige une erreur : sans elle, on n\'a pas encore essayé', () => {
    // La session n'est pas toujours rétablie quand la liaison s'établit. Sans
    // cette nuance, chaque ouverture avec une file non vide annoncerait un
    // échec inexistant.
    expect(annoncesDuRejeu({ restantes: 4, erreur: null }).restant).toBeNull();
    expect(annoncesDuRejeu({ restantes: 4, erreur: 'réseau' }).restant)
      .toBe('4 saisies restent sur cet appareil');
  });

  it('accorde le singulier', () => {
    expect(annoncesDuRejeu({ restantes: 1, erreur: 'réseau' }).restant)
      .toBe('1 saisie reste sur cet appareil');
  });
});

describe('Un bilan abîmé ne fabrique aucun message', () => {
  it.each([undefined, null, {}, { envoyees: NaN, restantes: 'trois', refusees: 'non' }])(
    'reste muet sur %o',
    (bilan) => {
      expect(annoncesDuRejeu(bilan)).toEqual({ succes: null, refus: null, restant: null });
    }
  );
});

describe('UNE SEULE FABRIQUE : les deux appelants passent par elle', () => {
  /**
   * Ce bloc lisait la SOURCE d'`app.js` et d'`auth.js` — « contient
   * `annoncesDuRejeu(bilan)` », « contient `refusees` ». Mesuré : supprimer le
   * bloc `if (refus) { toast.error(refus); … }` laissait les deux chaînes en
   * place, et les 2 378 contrôles verts. Le correctif entier disparaissait sans
   * que rien ne bronche.
   *
   * Les deux appelants vivent maintenant dans `utils/reprise.js`, et
   * `tests/utils/reprise.test.js` les MONTE : il regarde ce que le foyer voit
   * affiché, pas ce que le fichier a l'air de contenir. Ce qui reste ici tient
   * la seule propriété qu'une lecture de texte puisse honnêtement tenir : que
   * personne n'ait rédigé une SECONDE fois ces messages ailleurs.
   */
  it('personne ne rédige ces messages en dehors de la fabrique', () => {
    const fragments = [
      'hors ligne enregistrée', 'hors ligne enregistrées',
      'refusée par la base', 'refusées par la base',
      'reste sur cet appareil', 'restent sur cet appareil'
    ];

    const coupables = [];
    for (const chemin of fichiersLivres()) {
      if (chemin.endsWith('utils/rejeu-annonce.js')) continue;
      const texte = source(chemin);
      for (const fragment of fragments) {
        if (texte.includes(fragment)) coupables.push(`${chemin} → « ${fragment} »`);
      }
    }

    expect(coupables, `messages rédigés hors de la fabrique :\n${coupables.join('\n')}`).toEqual([]);
  });

  it('et les deux appelants l\'interrogent bien', () => {
    // Le pendant : la fabrique ne servirait à rien si personne ne l'appelait.
    // L'EFFET de ces appels est mesuré dans `tests/utils/reprise.test.js`.
    const reprise = source('public/js/utils/reprise.js');

    expect((reprise.match(/annoncesDuRejeu\(bilan\)/g) || []).length).toBe(2);
  });
});
