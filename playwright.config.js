import { defineConfig } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Charge les variables locales depuis .env.local, s'il existe.
 *
 * Ce fichier porte le mot de passe du compte de test. Il est ignoré par git
 * et ne doit jamais être affiché : le chiffrer n'apporterait rien — pour que
 * les tests puissent déchiffrer, la clé devrait être aussi accessible que le
 * secret lui-même. Ce qui protège réellement, c'est qu'il ne quitte pas la
 * machine et n'apparaisse dans aucune trace.
 */
function chargerVariablesLocales() {
  const chemin = resolve(process.cwd(), '.env.local');
  if (!existsSync(chemin)) return;

  for (const ligne of readFileSync(chemin, 'utf8').split('\n')) {
    const nette = ligne.trim();
    if (!nette || nette.startsWith('#')) continue;

    const separateur = nette.indexOf('=');
    if (separateur === -1) continue;

    const cle = nette.slice(0, separateur).trim();
    // La valeur n'est ni journalisée ni retournée : elle ne transite que par
    // l'environnement du processus de test.
    if (cle && !process.env[cle]) {
      process.env[cle] = nette.slice(separateur + 1).trim();
    }
  }
}

chargerVariablesLocales();

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3333',
    headless: true,
    screenshot: 'only-on-failure',
    // Volontairement absent : une trace Playwright enregistre les arguments de
    // `fill`, donc le mot de passe en clair dans un artefact conservé sur
    // disque et téléversable.
    trace: 'off'
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npx http-server public -p 3333 -c-1 --silent',
    port: 3333,
    reuseExistingServer: true,
  },
});
