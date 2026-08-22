/**
 * Routage du service worker.
 *
 * Le service worker n'était couvert par aucun test, et c'est exactement par là
 * que le défaut est passé : sa liste d'exclusion nommait « firebaseio.com »
 * alors que la base de données de ce projet vit sur
 * « <projet>.europe-west1.firebasedatabase.app ». Toutes les requêtes vers la
 * base traversaient donc le cache.
 *
 * Le WebSocket échappe au service worker, ce qui masquait le problème la
 * plupart du temps. Le long-polling — transport de repli quand le WebSocket ne
 * passe pas : réseau mobile, proxy d'entreprise — était bien intercepté.
 *
 * Ces tests exercent le vrai fichier, pas une copie de sa logique : c'est la
 * divergence entre les deux qui rendait le défaut invisible.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = readFileSync(join(RACINE, 'public', 'sw.js'), 'utf8');

/** URL réelle de la base, telle que configurée dans config.js */
const BASE = readFileSync(join(RACINE, 'public', 'js', 'config.js'), 'utf8')
  .match(/databaseURL:\s*"([^"]+)"/)[1];

/**
 * Évalue le service worker dans un environnement simulé
 * @returns {{ fetchHandler: Function }} Les gestionnaires enregistrés
 */
function chargerServiceWorker() {
  const gestionnaires = {};
  const self = {
    addEventListener: (nom, fn) => { gestionnaires[nom] = fn; },
    skipWaiting: () => {},
    clients: { claim: () => {} },
    location: { origin: 'https://exemple.github.io' }
  };
  const caches = {
    open: () => Promise.resolve({ addAll: () => Promise.resolve(), put: () => Promise.resolve() }),
    keys: () => Promise.resolve([]),
    match: () => Promise.resolve(undefined),
    delete: () => Promise.resolve(true)
  };

  // eslint-disable-next-line no-new-func
  new Function('self', 'caches', 'fetch', 'console', 'URL', SOURCE)(
    self, caches, () => Promise.resolve({ ok: true, clone: () => ({}) }),
    { log: () => {}, warn: () => {} }, URL
  );

  return { fetchHandler: gestionnaires.fetch };
}

/**
 * Le service worker prend-il la main sur cette requête ?
 * @param {string} url - URL demandée
 * @param {string} [method] - Méthode HTTP
 * @returns {boolean} Vrai si la requête est interceptée
 */
function estInterceptee(fetchHandler, url, method = 'GET') {
  const respondWith = vi.fn();
  fetchHandler({ request: { url, method }, respondWith });
  return respondWith.mock.calls.length > 0;
}

describe('Routage du service worker', () => {
  let fetchHandler;

  beforeEach(() => {
    ({ fetchHandler } = chargerServiceWorker());
  });

  it("laisse passer la base de donnees reellement configuree", () => {
    // Le test lit `databaseURL` dans config.js plutôt que de le recopier :
    // changer de région ou de projet doit faire échouer ce test si la liste
    // d'exclusion n'a pas suivi.
    const hote = new URL(BASE).hostname;
    expect(
      estInterceptee(fetchHandler, `${BASE}/sandbox/periods.json?auth=jeton`),
      `le service worker intercepte la base (${hote})`
    ).toBe(false);
  });

  it('laisse passer le long-polling de la base', () => {
    // Le transport de repli quand le WebSocket ne passe pas. C'est celui-ci
    // que le service worker interceptait, et sa mise en cache rompait la
    // liaison.
    const url = `${BASE}/.lp?start=t&ser=42&cb=1&v=5&ns=fairsplit-foyer-default-rtdb`;
    expect(estInterceptee(fetchHandler, url)).toBe(false);
  });

  it("laisse passer l'authentification et les services Google", () => {
    const distants = [
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x',
      'https://securetoken.googleapis.com/v1/token?key=x',
      'https://fairsplit-foyer.firebaseapp.com/__/auth/handler',
      'https://accounts.google.com/o/oauth2/auth',
      'https://apis.google.com/js/api.js',
      'https://test-default-rtdb.firebaseio.com/data.json'
    ];
    for (const url of distants) {
      expect(estInterceptee(fetchHandler, url), `intercepte : ${url}`).toBe(false);
    }
  });

  it('laisse passer reCAPTCHA, dont App Check dépend', () => {
    // Un script reCAPTCHA servi depuis le cache produit des attestations
    // refusées : la base devient injoignable alors que le réseau fonctionne.
    const distants = [
      'https://www.google.com/recaptcha/api.js?render=cle',
      'https://www.google.com/recaptcha/api2/anchor'
    ];
    for (const url of distants) {
      expect(estInterceptee(fetchHandler, url), `intercepte : ${url}`).toBe(false);
    }
  });

  it('laisse passer le géocodage, dont une réponse en cache serait fausse', () => {
    const url = 'https://nominatim.openstreetmap.org/reverse?lat=48.85&lon=2.35&format=json';
    expect(estInterceptee(fetchHandler, url)).toBe(false);
  });

  it('continue de prendre en charge les fichiers du site', () => {
    const locaux = [
      'https://exemple.github.io/split-charges-pwa/FairSplit.html',
      'https://exemple.github.io/split-charges-pwa/js/app.js',
      'https://exemple.github.io/split-charges-pwa/css/base.css',
      'https://exemple.github.io/split-charges-pwa/icon-192.png'
    ];
    for (const url of locaux) {
      expect(estInterceptee(fetchHandler, url), `non pris en charge : ${url}`).toBe(true);
    }
  });

  it("n'intercepte pas les requêtes autres que GET", () => {
    // Une écriture ne se met pas en cache et le cache ne saurait pas y
    // répondre : la laisser passer évite de lui servir une réponse périmée.
    const url = 'https://exemple.github.io/split-charges-pwa/FairSplit.html';
    expect(estInterceptee(fetchHandler, url, 'POST')).toBe(false);
    expect(estInterceptee(fetchHandler, url, 'PUT')).toBe(false);
  });

  it("n'accepte pas un domaine qui imite un domaine exclu", () => {
    // `includes()` acceptait « firebaseio.com.exemple.net », et un simple
    // `endsWith` accepterait « notfirebasedatabase.app ».
    const imitations = [
      'https://exemple.github.io/firebasedatabase.app/x.js',
      'https://exemple.github.io/split-charges-pwa/googleapis.com.js'
    ];
    for (const url of imitations) {
      expect(estInterceptee(fetchHandler, url), `laisse passer : ${url}`).toBe(true);
    }
  });

  it('exclut chaque hôte listé, et ses sous-domaines', () => {
    for (const domaine of ['firebasedatabase.app', 'firebaseio.com', 'googleapis.com']) {
      expect(estInterceptee(fetchHandler, `https://${domaine}/x`), domaine).toBe(false);
      expect(estInterceptee(fetchHandler, `https://a.b.${domaine}/x`), `a.b.${domaine}`).toBe(false);
      // Le domaine voisin ne doit pas être emporté avec.
      expect(estInterceptee(fetchHandler, `https://exemple.github.io/not${domaine}`)).toBe(true);
    }
  });
});
