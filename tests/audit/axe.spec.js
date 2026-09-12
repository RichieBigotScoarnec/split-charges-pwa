/**
 * FairSplit — Balayage d'accessibilité sur le DOM rendu
 *
 * Sortie : .claude/audit/tooling/axe.json, consommée par la chaîne d'audit (§17
 * du contrat). Une mesure sur le rendu est une preuve recevable : elle permet à
 * un agent d'écrire [Constaté] là où la lecture de code plafonne à [Déduit].
 *
 * Lancé par toi ou par la CI, jamais par un agent — exécuter le code du dépôt
 * est interdit aux agents d'audit (§10).
 *
 * Ce fichier réutilise le harnais e2e existant plutôt que de refaire
 * l'authentification : `setupFirebaseMock` et `waitForApp` portent déjà la
 * liste blanche, le double réactif de la base et l'attente de montage.
 *
 * ⚠️ Un balayage automatique ne couvre qu'une part des critères WCAG. L'ordre
 * de lecture, la pertinence d'un libellé, le sens d'une animation lui
 * échappent. Il donne le socle mesuré, pas le verdict.
 */
import { test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from '../e2e/_harness.js';

const PANNEAUX = ['panneauBilan', 'panneauCharges', 'panneauReglages'];
const resultats = [];

const balayer = async (page, etiquette) => {
  const rapport = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  resultats.push({
    etat: etiquette,
    violations: rapport.violations.map((v) => ({
      regle: v.id,
      impact: v.impact,
      description: v.description,
      criteres: v.tags.filter((t) => t.startsWith('wcag')),
      occurrences: v.nodes.map((n) => ({ cible: n.target, resume: n.failureSummary }))
    })),
    reussites: rapport.passes.length,
    incomplets: rapport.incomplete.map((v) => v.id)
  });
};

test('axe — écran de connexion', async ({ page }) => {
  await page.goto('/');
  await balayer(page, 'connexion');
});

for (const id of PANNEAUX) {
  test(`axe — ${id}`, async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
    await allerAuPanneau(page, id);
    await balayer(page, id);
  });
}

test.afterAll(() => {
  mkdirSync('.claude/audit/tooling', { recursive: true });
  writeFileSync(
    '.claude/audit/tooling/axe.json',
    JSON.stringify(
      {
        outil: '@axe-core/playwright',
        date: new Date().toISOString().slice(0, 10),
        commit: execSync('git rev-parse --short HEAD').toString().trim(),
        navigateur: 'chromium',
        couverture: 'balayage automatique — une part des critères WCAG seulement',
        etats: resultats
      },
      null,
      2
    )
  );
});
