/**
 * Le service worker s'installe vraiment, et refuse de s'installer à moitié
 *
 * `install` a été réécrit : `addAll` — atomique, donc une seule réponse
 * dégradée faisait échouer les cent fichiers — a laissé place à un `cache.put`
 * par ressource, et `skipWaiting()` est passé *après* le remplissage au lieu
 * d'être appelé d'entrée.
 *
 * C'est du code qui ne s'exécute que dans un navigateur, au moment précis d'un
 * déploiement, et dont l'échec se voit un mois plus tard sur un téléphone hors
 * réseau. Autrement dit : exactement le genre de code qu'on relit en hochant la
 * tête et qui ne marche pas.
 *
 * Ce test l'exécute. Il fabrique un `self` minimal — `caches`, `fetch`,
 * `skipWaiting` — appelle le gestionnaire d'installation tel que le fichier le
 * pose, et attend la promesse que `waitUntil` reçoit.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Charge sw.js dans un contexte simulé et rend de quoi l'observer
 *
 * @param {Object} options
 * @param {Array<string>} [options.echecs] - Ressources dont le réseau échoue
 * @returns {Object}
 */
function chargerServiceWorker({ echecs = [] } = {}) {
  const source = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf-8');

  const cache = new Map();
  const caches = {
    open: vi.fn().mockResolvedValue({
      put: (requete, reponse) => { cache.set(requete, reponse); return Promise.resolve(); },
      addAll: vi.fn()
    }),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
    match: vi.fn().mockResolvedValue(undefined)
  };

  const gestionnaires = {};
  const skipWaiting = vi.fn().mockResolvedValue(undefined);

  const self = {
    addEventListener: (nom, fn) => { gestionnaires[nom] = fn; },
    skipWaiting,
    clients: { claim: vi.fn().mockResolvedValue(undefined) }
  };

  const fetch = vi.fn((ressource) => echecs.includes(ressource)
    ? Promise.reject(new Error('réseau'))
    : Promise.resolve({ ok: true, status: 200, clone: () => ({}) }));

  // eslint-disable-next-line no-new-func -- le seul moyen d'exécuter un service
  // worker hors navigateur ; la source vient du dépôt, pas de l'extérieur.
  new Function('self', 'caches', 'fetch', 'console', source)(
    self, caches, fetch, { log: () => {}, warn: () => {} }
  );

  return { gestionnaires, cache, skipWaiting, fetch, source };
}

/** Déclenche `install` et rend la promesse confiée à `waitUntil` */
function installer(sw) {
  let promesse;
  sw.gestionnaires.install({ waitUntil: (p) => { promesse = p; } });
  return promesse;
}

describe('Installation du service worker', () => {
  it('le gestionnaire d\'installation est bien posé', () => {
    const sw = chargerServiceWorker();
    expect(typeof sw.gestionnaires.install).toBe('function');
  });

  it('remplit le cache et ne prend la main qu\'ensuite', async () => {
    const sw = chargerServiceWorker();

    await expect(installer(sw)).resolves.toBeUndefined();

    // Toutes les ressources déclarées ont été demandées puis rangées.
    expect(sw.fetch.mock.calls.length).toBeGreaterThan(80);
    expect(sw.cache.size).toBe(sw.fetch.mock.calls.length);
    expect(sw.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('une ressource secondaire absente n\'empêche pas l\'installation', async () => {
    // C'était tout l'objet du changement : `addAll` faisait tout échouer pour
    // une seule réponse dégradée, et l'échec était avalé — le cache restait
    // vide alors que l'installation se déclarait réussie.
    const sw = chargerServiceWorker({ echecs: ['./icon-512.png', './css/map.css'] });

    await expect(installer(sw)).resolves.toBeUndefined();

    expect(sw.cache.has('./icon-512.png')).toBe(false);
    expect(sw.cache.has('./FairSplit.html')).toBe(true);
    expect(sw.cache.has('./js/utils/calculations.js')).toBe(true);
    expect(sw.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('un fichier du socle absent fait ÉCHOUER l\'installation, sans prendre la main', async () => {
    // L'ancien service worker reste alors en place. Prendre la main avec un
    // cache privé de son socle reviendrait à remplacer une application qui
    // fonctionne par une qui ne démarre pas hors réseau.
    const sw = chargerServiceWorker({ echecs: ['./js/utils/calculations.js'] });

    await expect(installer(sw)).rejects.toThrow(/[Ss]ocle incomplet/);
    expect(sw.skipWaiting).not.toHaveBeenCalled();
  });

  it('chaque fichier du socle est réellement dans la liste de précache', () => {
    const sw = chargerServiceWorker();
    const socle = [...sw.source.matchAll(/const SOCLE = \[([\s\S]*?)\];/g)][0][1];
    const noms = [...socle.matchAll(/'([^']+)'/g)].map(m => m[1]);
    const precache = sw.source.slice(sw.source.indexOf('STATIC_ASSETS = ['));

    expect(noms.length).toBeGreaterThan(5);
    for (const nom of noms) {
      // Un socle qui nomme un fichier jamais mis en cache ferait échouer
      // toute installation, pour toujours.
      expect(precache).toContain(`'${nom}'`);
    }
  });

  it('skipWaiting n\'est pas appelé avant le remplissage', () => {
    // Contrôle sur la source : l'ordre est le cœur du correctif, et un test
    // d'exécution ne distingue pas « après » de « au début » si tout réussit.
    const sw = chargerServiceWorker();
    const install = sw.source.slice(sw.source.indexOf("addEventListener('install'"));
    const rangSkip = install.indexOf('skipWaiting');
    const rangSocle = install.indexOf('socleManquant');

    expect(rangSocle).toBeGreaterThan(0);
    expect(rangSkip).toBeGreaterThan(rangSocle);
  });
});
