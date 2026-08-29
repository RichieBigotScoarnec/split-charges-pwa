import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

const RACINE = new URL('../..', import.meta.url).pathname;
const source = (chemin) => readFileSync(join(RACINE, chemin), 'utf-8');

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
  it('`app.js` ne rédige plus ses messages', () => {
    const app = source('public/js/app.js');

    expect(app).toContain('annoncesDuRejeu(bilan)');
    // Le témoin du défaut : les libellés écrits sur place ont disparu.
    expect(app).not.toContain('saisies enregistrées');
    expect(app).not.toContain('n\'a pas pu être enregistrée');
  });

  it('`auth.js` non plus', () => {
    const auth = source('public/js/modules/auth.js');

    expect(auth).toContain('annoncesDuRejeu(bilan)');
    expect(auth).not.toContain('saisies hors ligne enregistrées');
    expect(auth).not.toContain('refusée par la base');
  });

  it('et les deux lisent bien `refusees`', () => {
    // Le champ que l'un des deux ignorait. Nommé, parce que c'est LUI qui
    // manquait — et qu'une régression se lirait autrement comme un simple
    // changement de formulation.
    for (const chemin of ['public/js/app.js', 'public/js/modules/auth.js']) {
      expect(source(chemin), chemin).toContain('refusees');
    }
  });
});
