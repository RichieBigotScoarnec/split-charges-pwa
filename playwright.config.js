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

  // Mesuré sur la suite entière : 8,7 min à 4 workers contre 19,2 min en CI,
  // où le défaut — la moitié des cœurs, soit 2 sur un runner GitHub — laissait
  // le parallélisme à peine entamé. Le téléchargement des émulateurs, lui, ne
  // coûtait que 0,6 s : le temps est dans les tests, pas dans leur mise en
  // place.
  //
  // La mesure vient d'une machine à 14 cœurs. Sur 4, le gain sera plus faible :
  // on passe de 2 à 4 workers, pas de 2 à 14. Attendre une amélioration, pas
  // une division par deux.
  workers: process.env.CI ? 4 : undefined,

  // `fullyParallel` reste ABSENT, et c'est délibéré.
  //
  // Il ne changerait rien entre fichiers — ceux-ci se répartissent déjà entre
  // workers — mais il ferait tourner en parallèle les tests D'UN MÊME fichier.
  // Or `scenario-reel.spec.js` ne s'adresse pas à un émulateur isolé : il écrit
  // dans le vrai Firebase, sur un compte de test unique, et deux de ses cas
  // s'appellent « deux ouvertures simultanées ». Ils orchestrent eux-mêmes la
  // concurrence qu'ils mesurent.
  //
  // Leur sérialisation à l'intérieur du fichier est ce qui les tient. Elle
  // tient aujourd'hui par le défaut de Playwright ; l'écrire ici la rend
  // intentionnelle plutôt qu'accidentelle.
  //
  // CE RAISONNEMENT ÉTAIT INCOMPLET, et il a coûté trois jours de CI rouge.
  //
  // Il traite la concurrence AU SEIN d'un fichier et conclut que celle ENTRE
  // fichiers est sans danger, « ceux-ci se répartissent déjà entre workers ».
  // C'est vrai partout sauf ici : le projet `reel` porte DEUX fichiers, et
  // tous deux pilotent le même compte sur le vrai Firebase. Les répartir entre
  // workers, c'est précisément les faire écrire ensemble.
  //
  // `scenario-reel` efface `sandbox/` puis y écrit six mois d'historique,
  // pendant que `bouclier-navigateur` ouvre l'application sur le même compte —
  // laquelle reconduit les charges et complète les instantanés de salaires,
  // sous les mêmes chemins. Le solde relu mêle alors deux jeux de données.
  //
  // La sérialisation du projet `reel` ne peut pas s'écrire ici : `workers` est
  // global, il n'existe pas par projet. Elle est donc portée par la commande du
  // job « Tests contre le vrai Firebase » dans `.github/workflows/deploy.yml`,
  // qui passe `--workers=1`. Toute reprise de ce parallélisme doit se lire aux
  // deux endroits.

  use: {
    baseURL: 'http://localhost:3333',
    headless: true,
    screenshot: 'only-on-failure',
    // Volontairement absent : une trace Playwright enregistre les arguments de
    // `fill`, donc le mot de passe en clair dans un artefact conservé sur
    // disque et téléversable.
    trace: 'off'
  },
  // Deux natures de contrôles, et elles ne peuvent pas s'exécuter au même
  // moment de la chaîne.
  //
  // `chromium` parle aux émulateurs : il valide `database.rules.json` AVANT
  // que la CI ne le publie, et c'est lui qui doit garder le déploiement.
  //
  // `reel` s'adresse au vrai Firebase, donc aux règles DÉJÀ publiées. Le faire
  // garder le déploiement crée un cycle : une règle corrigée ne peut pas être
  // publiée tant que les contrôles ne passent pas, et ils ne peuvent pas passer
  // sans elle. C'est arrivé le 2026-09-01 — le correctif du bac à sable a bloqué
  // sa propre publication, et avec elle celle du site.
  //
  // Le workflow les enchaîne donc : `chromium` → publication → `reel`.
  //
  // En local, `npx playwright test` sans argument exécute les deux, comme
  // avant : la séparation ne sert qu'à ordonner la CI.
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
      testIgnore: /(scenario-reel|bouclier-navigateur)\.spec\.js/
    },
    {
      name: 'reel',
      use: { browserName: 'chromium' },
      testMatch: /(scenario-reel|bouclier-navigateur)\.spec\.js/
    },
  ],
  webServer: {
    command: 'npx http-server public -p 3333 -c-1 --silent',
    port: 3333,
    reuseExistingServer: true,
  },
});
