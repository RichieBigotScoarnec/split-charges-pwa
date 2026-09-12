import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp } from './_harness.js';

/**
 * Deux blocs frères d'une colonne du bilan ne se recouvrent jamais.
 *
 * ─────────────────────────────────────────────────────────────────────
 * POURQUOI CE CONTRÔLE EXISTE, ALORS QU'UN AUTRE DIT DÉJÀ « RIEN NE SE
 * RECOUVRE »
 *
 * `coherence-visuelle` porte « aucune commande du contenu n'en recouvre une
 * autre ». Il ne collecte QUE des commandes — `button, a[href], select,
 * input`. Le 2026-09-12, le bandeau du partage (qui porte un bouton) et le
 * prévisionnel (qui n'en porte aucun) se chevauchaient de 8 px, à 390, 900 et
 * 1280 px : la paire n'a jamais été comparée, et la suite entière est restée
 * verte.
 *
 * Cette limite était DÉJÀ ÉCRITE dans le commentaire de ce contrôle, à propos
 * du dépliant « Voir le détail » : *« ce contrôle ne collecte que des
 * commandes, et une division n'en est pas une »*. Une limite consignée dans un
 * commentaire n'est pas un contrôle — elle a resservi telle quelle.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CE QU'IL MESURE, ET SUR QUELLE SURFACE
 *
 * Des FRÈRES, dans des conteneurs qui empilent : la carte de tête, le panneau
 * du duo, la colonne des cartes. Deux frères d'une pile verticale n'ont
 * aucune raison de se superposer ; quand ça arrive, c'est une marge négative
 * qui a trouvé un voisin qu'elle n'attendait pas — ici, `.summary-previsionnel`
 * porte −8 px pour se coller au solde, et le bandeau s'est glissé entre les
 * deux.
 *
 * Il ne nomme donc ni le bandeau ni le prévisionnel : il vaut pour le bloc
 * qu'on ajoutera demain au même endroit.
 */

const COLONNES = ['.summary-card--tete', '#resumePanneauDuo', '.bilan-cartes'];

async function semer(page) {
  await page.evaluate(async () => {
    const { dbUpdate, dbSet } = await import('/js/db.js');
    const mois = document.getElementById('periodSelect').value;
    await dbSet('salaries', { vous: 3000, conjointe: 1000 });
    await dbUpdate(undefined, {
      [`periods/${mois}/salaries`]: { vous: 3000, conjointe: 1000 },
      [`periods/${mois}/variableCharges/v1`]: {
        description: 'Courses', amount: 120, category: 'Courses', paidBy: 'vous',
        date: `${mois}-03`, deleted: false, timestamp: 1,
        location: { lat: 48.85, lng: 2.35, name: 'Paris' }
      },
      [`periods/${mois}/fixedCharges/f1`]: {
        description: 'Loyer', amount: 800, category: 'Maison', paidBy: 'vous',
        destination: 'Compte Commun', date: `${mois}-05`, deleted: false
      }
    });
    await window.changePeriod();
  });
  await page.waitForTimeout(1500);
}

for (const { largeur, hauteur } of [
  { largeur: 390, hauteur: 844 },
  { largeur: 900, hauteur: 900 },
  { largeur: 1280, hauteur: 900 }
]) {
  test.describe(`Les blocs du bilan — ${largeur} px`, () => {
    test.use({ viewport: { width: largeur, height: hauteur } });

    test('aucun bloc frère n\'en recouvre un autre', async ({ page }) => {
      await setupFirebaseMock(page);
      await waitForApp(page);
      await semer(page);

      const releve = await page.evaluate((colonnes) => {
        const nommer = (el) =>
          `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`
          + `${typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''}`;

        const chevauchements = [];
        let comptes = 0;

        for (const selecteur of colonnes) {
          const colonne = document.querySelector(selecteur);
          if (!colonne) continue;

          const blocs = [...colonne.children].filter((el) => {
            const r = el.getBoundingClientRect();
            return el.checkVisibility() && r.height > 0 && r.width > 0;
          });

          for (let i = 0; i < blocs.length; i++) {
            for (let j = i + 1; j < blocs.length; j++) {
              comptes += 1;
              const a = blocs[i].getBoundingClientRect();
              const b = blocs[j].getBoundingClientRect();
              const horizontal = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const vertical = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              // Deux pixels de tolérance : des bordures adjacentes se touchent.
              if (horizontal > 2 && vertical > 2) {
                chevauchements.push(
                  `${selecteur} : ${nommer(blocs[i])} ⨯ ${nommer(blocs[j])} — ${Math.round(vertical)} px`
                );
              }
            }
          }
        }
        return { chevauchements, comptes };
      }, COLONNES);

      // Témoin positif : un relevé vide se lit comme un écran sain. Sans paire
      // comparée, « aucun chevauchement » ne mesurerait rien.
      expect(releve.comptes, 'prémisse : aucune paire de blocs n\'a été comparée')
        .toBeGreaterThan(0);

      expect(releve.chevauchements, releve.chevauchements.join(' | ')).toEqual([]);
    });
  });
}
