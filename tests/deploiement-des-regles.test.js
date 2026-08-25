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

/**
 * Un déploiement raté ne doit plus passer inaperçu
 *
 * Constaté le 25 août 2026 : la PR #83 fusionnée, le job « Tests end-to-end »
 * est tombé sur main. `deploy` en dépend, il n'a donc jamais tourné. GitHub
 * Pages a servi la version précédente pendant deux heures, personne n'en a
 * rien su, et la fonctionnalité qu'on croyait livrée n'existait pas.
 *
 * Deux angles morts distincts : ce qui est publié peut différer de ce qui est
 * fusionné, et un workflow rouge sur main peut n'être lu par personne. D'où
 * deux jobs, et ces contrôles pour qu'ils ne disparaissent pas en silence —
 * un garde-fou retiré ne casse rien de visible.
 */
describe('La vérification de ce qui est publié', () => {
  const job = workflow.slice(
    workflow.indexOf('  verifier-publication:'),
    workflow.indexOf('  alerte-publication:')
  );

  it('existe et compare gh-pages au contenu de public/', () => {
    expect(job).toContain('git fetch --no-tags --depth=1 origin gh-pages');
    expect(job).toContain('diff --recursive --brief public /tmp/publie');
  });

  it('vient après la publication, jamais avant', () => {
    // Comparer avant que l'action ait poussé rendrait toujours l'état
    // précédent : un contrôle qui passe sans rien vérifier.
    expect(job).toMatch(/needs:\s*deploy/);
  });

  it('estampille sw.js comme le fait la publication', () => {
    // Sans cela `sw.js` différerait à chaque déploiement, le contrôle crierait
    // toujours, et on cesserait de le lire.
    expect(job).toContain('__CACHE_VERSION__');
  });

  it('écarte le seul écart légitime, et lui seul', () => {
    // `.nojekyll` est posé par l'action de publication. Toute autre différence
    // doit faire échouer.
    expect(job).toContain('rm -f /tmp/publie/.nojekyll');
    expect(job).not.toContain('|| true');
    expect(job).not.toContain('continue-on-error');
  });

  it('ne se déclenche pas sur une pull request', () => {
    // Une PR ne publie rien : il n'y aurait rien à comparer.
    expect(job).toMatch(/if:\s*github\.event_name == 'push'/);
  });
});

describe('L\'alerte de publication en échec', () => {
  const job = workflow.slice(workflow.indexOf('  alerte-publication:'));

  it('surveille toute la chaîne, pas seulement la publication', () => {
    // L'incident du 25 août est tombé AVANT `deploy` : n'observer que lui
    // aurait laissé passer exactement la panne qu'on cherche à voir.
    for (const etape of ['test', 'e2e', 'deploy-rules', 'deploy', 'verifier-publication']) {
      expect(job, `${etape} n'est pas surveillé`).toMatch(
        new RegExp(`needs:\\s*\\[[^\\]]*\\b${etape}\\b`)
      );
    }
  });

  it('ne se déclenche qu\'en cas d\'échec, et sur main', () => {
    expect(job).toContain("if: failure() && github.event_name == 'push'");
  });

  it('laisse une trace durable, pas un message qui s\'efface', () => {
    // Un bandeau rouge dans l'onglet Actions se referme d'un rafraîchissement.
    expect(job).toContain('gh issue create');
  });

  it('n\'ouvre pas un ticket par exécution', () => {
    // Deux fusions coup sur coup en ouvriraient deux pour la même cause.
    expect(job).toContain('gh issue list');
    expect(job).toContain('gh issue comment');
  });

  it('demande le droit d\'écrire des tickets pour lui seul', () => {
    // Le workflow reste en lecture seule par défaut : les jobs qui exécutent
    // le code des dépendances n'ont rien à écrire.
    expect(job).toContain('issues: write');
    expect(workflow).toMatch(/^permissions:\n {2}contents: read$/m);
  });
});
