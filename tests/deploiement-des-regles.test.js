import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Le déploiement des règles, vu depuis le dépôt
 *
 * Le déploiement de GitHub Pages ne publie que `public/`. Les règles de
 * sécurité, elles, ne montaient dans Firebase que par une commande lancée à la
 * main — une étape invisible depuis le dépôt, donc oubliée. La base tournait
 * alors sous des règles plus anciennes que le code qui l'interroge, sans que
 * rien ne le signale : le dépôt affiche la protection, la base ne l'applique
 * pas.
 *
 * Ces contrôles portent sur le fichier de workflow lui-même. Ils ne prouvent
 * pas qu'un déploiement aboutit — seule la CI le peut — mais ils empêchent que
 * l'étape disparaisse, ou qu'elle se remette à dépendre d'une mémoire humaine.
 */

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/deploy.yml'),
  'utf8'
);

/** Corps du job de déploiement des règles */
const jobRegles = workflow.slice(
  workflow.indexOf('  deploy-rules:'),
  workflow.indexOf('  deploy:', workflow.indexOf('  deploy-rules:'))
);

describe('Le job de déploiement des règles', () => {
  it('existe', () => {
    expect(workflow).toContain('deploy-rules:');
    expect(jobRegles).toContain('firebase deploy --only database');
  });

  it('attend les tests unitaires et les tests end-to-end', () => {
    // Déployer des règles qu'aucun test n'a exercées reviendrait à confier la
    // porte d'entrée à un fichier jamais relu. `regles-donnees.spec.js` les
    // éprouve contre le moteur réel de l'émulateur.
    expect(jobRegles).toMatch(/needs:\s*\[test,\s*e2e\]/);
  });

  it('ne se déclenche pas sur une pull request', () => {
    // Une PR ne doit jamais toucher aux règles de production.
    expect(jobRegles).toMatch(/if:\s*github\.event_name == 'push'/);
  });

  it('ne demande aucun droit d\'écriture sur le dépôt', () => {
    // Le workflow est en lecture seule ; seul le job gh-pages déroge.
    expect(jobRegles).not.toContain('contents: write');
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/m);
  });

  it('déploie sans condition sur la modification du fichier', () => {
    // Une condition mal posée ne casse rien de visible : elle saute le
    // déploiement en silence, ce qui est exactement la panne à supprimer.
    expect(jobRegles).not.toContain('git diff');
    expect(jobRegles).not.toContain('paths-filter');
  });
});

describe('Le secret du compte de service', () => {
  it('ne transite jamais par la ligne de commande', () => {
    // Les journaux d'exécution conservent les commandes lancées.
    expect(jobRegles).not.toMatch(/firebase deploy[^\n]*\$\{\{\s*secrets\./);
    expect(jobRegles).toMatch(/COMPTE_DE_SERVICE:\s*\$\{\{\s*secrets\.FIREBASE_SERVICE_ACCOUNT\s*\}\}/);
  });

  it('est écrit hors du dépôt, puis effacé', () => {
    expect(jobRegles).toContain('$RUNNER_TEMP/compte-de-service.json');
    expect(jobRegles).toMatch(/rm -f "\$fichier"/);
  });

  it('son absence avertit sans faire échouer la publication du site', () => {
    // Le job de pages est indépendant : une clé manquante ne doit pas priver
    // le foyer de son application. L'avertissement, lui, doit rester visible.
    expect(jobRegles).toContain('::warning');
    expect(jobRegles).toContain('GITHUB_STEP_SUMMARY');
    expect(jobRegles).toMatch(/exit 0/);
  });
});

describe('Les actions employées restent épinglées', () => {
  it('chaque action porte un SHA de commit, jamais une étiquette seule', () => {
    // Une étiquette peut être redirigée vers un autre commit ; un SHA non.
    const actions = workflow.match(/uses: [^\n]+/g) || [];
    expect(actions.length).toBeGreaterThan(0);

    for (const action of actions) {
      expect(action, `non épinglée : ${action}`).toMatch(/@[0-9a-f]{40}/);
    }
  });
});
