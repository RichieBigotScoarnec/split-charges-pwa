// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  applicationPrete,
  quandApplicationPrete,
  DELAI_APPLICATION_PRETE
} from '../../public/js/utils/attente-application.js';

/**
 * Ce que la saisie rapide attend avant d'écrire
 *
 * Ouverte par le raccourci, la modale paraît avant que Firebase ait répondu.
 * Le montant se tape pendant la connexion ; l'écriture, elle, ne peut pas
 * partir sans période ni compte. `data-app-ready` est le seul marqueur qui
 * dise la vérité — `#mainApp` devient visible bien avant.
 */
describe('applicationPrete', () => {

  it('reconnaît le marqueur posé', () => {
    document.body.dataset.appReady = 'true';
    expect(applicationPrete(document)).toBe(true);
  });

  it('refuse un marqueur absent', () => {
    delete document.body.dataset.appReady;
    expect(applicationPrete(document)).toBe(false);
  });

  it('refuse toute autre valeur que « true »', () => {
    document.body.dataset.appReady = 'presque';
    expect(applicationPrete(document)).toBe(false);
  });

  it('ne casse pas sur un document absent', () => {
    expect(applicationPrete(null)).toBe(false);
    expect(applicationPrete({})).toBe(false);
  });
});

describe('quandApplicationPrete', () => {

  it('se résout immédiatement si le marqueur est déjà là', async () => {
    document.body.dataset.appReady = 'true';
    await expect(quandApplicationPrete(document)).resolves.toBe(true);
  });

  it('attend le marqueur, puis se résout', async () => {
    delete document.body.dataset.appReady;

    const attente = quandApplicationPrete(document, { delaiMax: 2000 });

    // Posé après coup, comme le fait `initializeAppData` au bout de sa séquence.
    setTimeout(() => { document.body.dataset.appReady = 'true'; }, 10);

    await expect(attente).resolves.toBe(true);
  });

  it('renonce au bout du délai plutôt que de ne jamais rendre la main', async () => {
    delete document.body.dataset.appReady;

    // Une promesse qui ne se résout pas laisserait le verrou de soumission
    // fermé pour le reste de la session : le second appui serait ignoré.
    await expect(quandApplicationPrete(document, { delaiMax: 20 })).resolves.toBe(false);
  });

  it('ignore un autre attribut posé sur le corps', async () => {
    delete document.body.dataset.appReady;

    const attente = quandApplicationPrete(document, { delaiMax: 60 });
    document.body.dataset.autreChose = 'true';

    await expect(attente).resolves.toBe(false);
    delete document.body.dataset.autreChose;
  });

  it('rend un refus quand il n\'y a rien à observer', async () => {
    await expect(quandApplicationPrete(null)).resolves.toBe(false);
  });

  it('le délai par défaut laisse le temps d\'une séquence complète', () => {
    // Jeton, attestation, listes du foyer, salaires, charges du mois : rendre
    // la main trop tôt ferait perdre une saisie déjà tapée.
    expect(DELAI_APPLICATION_PRETE).toBeGreaterThanOrEqual(20000);
  });
});
