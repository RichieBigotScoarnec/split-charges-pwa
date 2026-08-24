// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { refreshConnectionBanner, majSaisiesEnAttente } from '../public/js/utils/connection-banner.js';

/**
 * Ce que le bandeau annonce pendant la coupure
 *
 * Il a longtemps dit « vos saisies ne sont pas enregistrées ». C'était vrai, et
 * c'est devenu faux le jour où elles ont été gardées sur l'appareil : elles
 * partent maintenant à la reconnexion. Un bandeau qui annonce une perte qui
 * n'a pas lieu apprend à ne plus lire les bandeaux.
 *
 * Le balisage est celui de la page réellement livrée, extrait de
 * `FairSplit.html`. Un banc d'essai qui poserait le sien ne dirait rien du cas
 * qui casse pour de bon : le module écrit dans un identifiant que la page ne
 * porte plus.
 */

/** Le bandeau tel que la page le livre */
function bandeauLivre() {
  const page = readFileSync(resolve(process.cwd(), 'public/FairSplit.html'), 'utf8');
  const debut = page.indexOf('<div id="offlineBanner"');
  expect(debut, 'bandeau hors ligne introuvable dans FairSplit.html').toBeGreaterThan(-1);

  const fin = page.indexOf('</div>', debut);
  return page.slice(debut, fin + '</div>'.length);
}

beforeEach(() => {
  document.body.innerHTML = bandeauLivre();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Le texte du bandeau, espaces normalisés */
function texte() {
  return document.getElementById('offlineBanner').textContent.replace(/\s+/g, ' ').trim();
}

describe('La page livre bien ce que le module écrit', () => {
  it('porte l\'emplacement du compte des saisies', () => {
    // C'est le point de rupture silencieuse : le module écrit dans un
    // identifiant, la page le perd au fil d'une refonte, et le bandeau annonce
    // pour toujours le texte d'origine sans que rien ne le signale.
    expect(document.getElementById('offlineBannerAttente')).not.toBeNull();
  });

  it('n\'annonce plus une perte qui n\'a pas lieu', () => {
    expect(texte()).not.toContain('ne sont pas enregistrées');
    expect(texte()).toContain('conservées sur cet appareil');
  });

  it('nomme toujours le bouclier de navigateur', () => {
    // Deux pannes signalées en production venaient de là, et personne ne fera
    // spontanément le lien entre « mes salaires ne partent pas » et « mon
    // navigateur protège ma vie privée ».
    expect(texte()).toMatch(/bloqueur de contenu/i);
  });

  it('reste masqué tant que rien ne l\'a affiché', () => {
    expect(document.getElementById('offlineBanner').hidden).toBe(true);
  });
});

describe('Le compte des saisies en attente', () => {
  it('reste général quand rien n\'attend', () => {
    majSaisiesEnAttente(0);
    expect(texte()).toContain('vos saisies sont conservées sur cet appareil');
  });

  it('s\'accorde au singulier', () => {
    majSaisiesEnAttente(1);
    expect(texte()).toContain('1 saisie est conservée sur cet appareil');
  });

  it('s\'accorde au pluriel', () => {
    majSaisiesEnAttente(3);
    expect(texte()).toContain('3 saisies sont conservées sur cet appareil');
  });

  it('ne se laisse pas écrire n\'importe quoi', () => {
    majSaisiesEnAttente(NaN);
    expect(texte()).toContain('vos saisies sont conservées');

    majSaisiesEnAttente(-4);
    expect(texte()).toContain('vos saisies sont conservées');
  });

  it('se met à jour alors que le bandeau est déjà affiché', () => {
    // Aucun événement de connexion ne survient pendant la coupure : sans cette
    // mise à jour, le bandeau dirait « 1 saisie » alors qu'il y en a trois.
    refreshConnectionBanner(false, 1);
    vi.advanceTimersByTime(9000);
    expect(document.getElementById('offlineBanner').hidden).toBe(false);

    majSaisiesEnAttente(3);
    expect(texte()).toContain('3 saisies');
    expect(document.getElementById('offlineBanner').hidden, 'le bandeau ne doit pas se refermer')
      .toBe(false);
  });
});

describe('L\'affichage du bandeau', () => {
  it('ne paraît pas pour la reconnexion ordinaire', () => {
    // Firebase annonce « déconnecté » le temps d'établir sa liaison, à chaque
    // ouverture. Un bandeau qui clignote à chaque ouverture ne se lit plus.
    refreshConnectionBanner(false, 0);
    vi.advanceTimersByTime(3000);
    refreshConnectionBanner(true, 0);
    vi.advanceTimersByTime(20000);

    expect(document.getElementById('offlineBanner').hidden).toBe(true);
  });

  it('paraît quand la coupure dure, avec son compte', () => {
    refreshConnectionBanner(false, 2);
    vi.advanceTimersByTime(9000);

    expect(document.getElementById('offlineBanner').hidden).toBe(false);
    expect(texte()).toContain('2 saisies sont conservées sur cet appareil');
  });

  it('disparaît au retour de la liaison', () => {
    refreshConnectionBanner(false, 2);
    vi.advanceTimersByTime(9000);
    refreshConnectionBanner(true, 0);

    expect(document.getElementById('offlineBanner').hidden).toBe(true);
  });
});
