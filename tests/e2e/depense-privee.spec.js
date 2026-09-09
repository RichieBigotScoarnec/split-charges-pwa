import { test, expect } from './_couverture.js';
import { setupFirebaseMock, waitForApp, allerAuPanneau } from './_harness.js';

/**
 * Écrire chez soi ne demande rien ; lire chez l'autre demande son accord
 *
 * Le mur lui-même est éprouvé ailleurs, contre le vrai moteur de règles — c'est
 * le seul endroit où il puisse l'être, puisque c'est le serveur qui refuse.
 * Ces contrôles-ci portent sur ce que le double en mémoire permet de vérifier :
 * que l'écran **écrit au bon endroit**, sous la bonne clé, et qu'il ne promet
 * rien que les règles démentiraient.
 *
 * Le point le plus important : **l'accord qu'on donne s'écrit sous SON PROPRE
 * emplacement**. C'est ce qui rend la règle serveur applicable — elle exige
 * d'être le propriétaire pour ouvrir son espace. L'écrire sous celui de l'autre
 * reviendrait à s'accorder l'accès à ses données, et ferait un écran qui paraît
 * fonctionner dont chaque écriture serait rejetée en production.
 */

/**
 * Va sur l'écran des dépenses privées
 *
 * ── IL PILOTAIT `showPrivateExpensesModal()`, QUI N'EXISTE PLUS ──
 *
 * L'espace privé était une modale ; c'est une VUE depuis le 2026-09-08, la
 * troisième portée du sélecteur. Ce helper fait donc ce que fait la personne :
 * il touche le segment.
 *
 * L'attente porte sur ce que l'écran MONTRE — les trois crans de partage — et
 * non sur un conteneur nommé. C'est ce qui a permis à tous les cas de ce
 * fichier de survivre au déplacement sans être réécrits : ils cherchaient déjà
 * leur contenu par son texte.
 */
async function ouvrirPrive(page) {
  await allerAuPanneau(page, 'panneauBilan');
  await page.locator('.panneau--actif [data-portee="prive"]').click();
  await expect(page.getByText('Total + détail', { exact: true })).toBeVisible();
}

/**
 * Choisit ce qu'on partage : « rien », « total » ou « detail »
 *
 * L'écran portait une bascule à deux états, qui ne pouvait pas distinguer
 * « je ne publie rien » de « je publie mon total ». Les deux crans du bas
 * valent tous deux `actif: false` — refermer le détail, c'est donc revenir à
 * « total », et non à « rien ».
 */
async function choisirLePartage(page, posture) {
  await page.locator(`.prive-posture-cran[data-posture="${posture}"]`).click();
  await page.waitForTimeout(600);
}

/** Les clés écrites aux trois racines */
async function clesEcrites(page) {
  return page.evaluate(() => Object.keys(window.__db).filter(c =>
    c.startsWith('aval') || c.startsWith('prive') || c.startsWith('totauxPrives')));
}

test.describe('Les dépenses privées', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  /**
   * ── « LE BOUTON PRIVÉ OUVRE L'ÉCRAN » A ÉTÉ RETIRÉ D'ICI ──
   *
   * Il visait `[data-action="showPrivateExpensesModal"]`, le bouton de la
   * rangée des lectures du mois. Ce bouton a disparu le 2026-09-08 : l'espace
   * privé est une portée, et le segment le gouverne.
   *
   * Il n'est pas réécrit ici parce qu'il vit ailleurs, et mieux :
   * `prive-en-vue.spec.js` tient « choisir Privé rend l'espace privé, sans
   * autre geste » **avec sa prémisse** — un relevé d'avant qui exige que
   * l'espace ne soit pas déjà à l'écran. Le réécrire ici en serait une seconde
   * rédaction, plus faible, qu'un correctif ne reporterait pas.
   */

  test('la saisie est disponible d\'emblée, sans accord de personne', async ({ page }) => {
    // Le contrôle qui dit le sujet. Une version antérieure retirait le
    // formulaire tant que la conjointe n'avait rien accordé : elle demandait la
    // permission d'avoir un jardin secret.
    await ouvrirPrive(page);

    await expect(page.locator('#priveMontant')).toBeVisible();
    await expect(page.locator('#priveAjouter')).toBeVisible();
  });

  test('une dépense privée s\'enregistre dans son propre espace', async ({ page }) => {
    await ouvrirPrive(page);
    await page.locator('#priveMontant').fill('45');
    await page.locator('#priveDescription').fill('Coiffeur');
    await page.locator('#priveAjouter').click();
    await page.waitForTimeout(700);

    const chemins = (await clesEcrites(page)).filter(c => c.startsWith('prive/vous/periods/'));
    expect(chemins.length).toBeGreaterThan(0);

    // Et rien n'a été écrit dans l'espace commun : une dépense privée qui
    // atterrirait dans `household` serait lisible par l'autre.
    const dansLeFoyer = await page.evaluate(() =>
      Object.keys(window.__db).filter(c => c.includes('household') && c.includes('Coiffeur')));
    expect(dansLeFoyer).toEqual([]);
  });

  test('l\'accord qu\'on donne s\'écrit sous SON PROPRE emplacement', async ({ page }) => {
    // Le contrôle qui compte le plus de ce fichier. La règle serveur exige
    // d'être le propriétaire pour écrire `aval/{emplacement}` : l'écrire sous
    // celui de l'autre reviendrait à s'accorder l'accès à ses données, et la
    // production le rejetterait après un écran qui paraît marcher.
    await ouvrirPrive(page);
    await choisirLePartage(page, 'detail');

    const cles = await clesEcrites(page);
    // Le compte d'essai est « vous » : c'est donc son propre espace qu'il ouvre.
    expect(cles).toContain('aval/vous');
    expect(cles, 'il se serait accordé l\'accès aux données de l\'autre').not.toContain('aval/conjointe');
  });

  test('l\'accord porte son état, sa date et son auteur', async ({ page }) => {
    await ouvrirPrive(page);
    await choisirLePartage(page, 'detail');

    const aval = await page.evaluate(() => window.__db['aval/vous']);
    expect(aval.actif).toBe(true);
    // L'auteur est toujours le propriétaire : la règle serveur le vérifie, et
    // une trace d'audit qui désignerait quelqu'un d'autre serait fausse.
    expect(aval.accordePar).toBe('vous');
    expect(typeof aval.accordeLe).toBe('number');
  });

  test('refermer l\'accord l\'écrit à faux plutôt que d\'effacer la trace', async ({ page }) => {
    await ouvrirPrive(page);
    await choisirLePartage(page, 'detail');
    await choisirLePartage(page, 'total');

    const aval = await page.evaluate(() => window.__db['aval/vous']);
    expect(aval.actif).toBe(false);
    expect(aval.accordeLe, 'la trace de l\'accord passé disparaîtrait').toBeGreaterThan(0);
  });

  test('refermer l\'accord n\'efface aucune dépense', async ({ page }) => {
    // Un accès qu'on referme ne détruit rien : il cesse d'être lisible par
    // l'autre, c'est tout.
    await ouvrirPrive(page);
    await page.locator('#priveMontant').fill('45');
    await page.locator('#priveAjouter').click();
    await page.waitForTimeout(700);

    await choisirLePartage(page, 'detail');
    await choisirLePartage(page, 'total');

    await expect(page.locator('#resumePanneauPrive')).toContainText('45,00');
  });

  test('l\'écran nomme les deux accords, et pas seulement le sien', async ({ page }) => {
    // Un accord se lit dans les deux sens, et aucun des deux n'oblige l'autre :
    // ouvrir son espace ne donne aucun droit sur celui d'en face.
    await ouvrirPrive(page);

    // `innerText` rend le texte tel qu'il s'affiche, et la feuille de style met
    // les titres en capitales : comparer en minuscules porte sur le contenu
    // plutôt que sur sa présentation.
    const texte = (await page.locator('#resumePanneauPrive').innerText()).toLowerCase();
    // « Ce que vous ouvrez » est devenu « ce que vous partagez » : le bloc ne
    // gouverne plus une ouverture mais une échelle a trois crans, dont le plus
    // bas ne publie rien du tout. Ce que ce contrôle garantit n'a pas bougé —
    // les DEUX sens sont nommés, et aucun n'oblige l'autre.
    expect(texte).toContain('ce que vous partagez');
    expect(texte).toContain('vous ouvre');
  });

  test('le total publié ne porte que des nombres, jamais un libellé', async ({ page }) => {
    // Le contrat du mur, vérifié sur ce qui sort réellement : sans accord,
    // c'est tout ce que l'autre voit.
    await ouvrirPrive(page);
    await page.locator('#priveMontant').fill('45');
    await page.locator('#priveDescription').fill('Coiffeur');
    await page.locator('#priveAjouter').click();
    await page.waitForTimeout(700);

    const totaux = await page.evaluate(() => {
      const cle = Object.keys(window.__db).find(c => c.startsWith('totauxPrives/vous/'));
      return cle ? window.__db[cle] : null;
    });

    expect(totaux).not.toBeNull();
    expect(Object.keys(totaux).sort()).toEqual(['montant', 'nombre']);
    expect(totaux.montant).toBe(45);
    expect(JSON.stringify(totaux), 'un libellé a franchi le mur').not.toContain('Coiffeur');
  });
});

test.describe('Ce qu\'on voit de l\'autre', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('sans son accord : son total, et la réserve qui va avec', async ({ page }) => {
    await page.evaluate(() => {
      const periode = document.getElementById('periodSelect')?.value;
      window.__db[`totauxPrives/conjointe/${periode}`] = { montant: 340, nombre: 5 };
    });
    await ouvrirPrive(page);

    await expect(page.locator('#resumePanneauPrive')).toContainText('340,00');
    // Et surtout : aucun libellé.
    await expect(page.locator('#resumePanneauPrive')).not.toContainText('Manucure');
  });

  /**
   * ─────────────────────────────────────────────────────────────────────
   * CE CAS A ÉTÉ RÉÉCRIT LE 2026-09-08, ET IL ÉTAIT ROUGE AVANT
   *
   * Il a été écrit la veille pour protéger le passage de Privé en vue. Il
   * mesurait un écran de **1280 × 720** — le viewport par défaut de Playwright,
   * appliqué en silence à tout fichier sans `test.use`. Il était donc vert sur
   * un écran que personne n'affiche, et rouge dès qu'on lui donnait un
   * téléphone : à 320 px il rend « la réserve est hors de la vue », avec son
   * propre semis.
   *
   * ─────────────────────────────────────────────────────────────────────
   * CE QUE LA MESURE A CHANGÉ À LA PROPRIÉTÉ
   *
   * L'ancienne formulation — « sur le même écran et sans geste supplémentaire »
   * — voulait dire « dans la vue À L'OUVERTURE ». **Elle n'est pas tenable, et
   * ce n'est pas un défaut à corriger.** Cet écran porte mes accords, ma
   * saisie, ma liste et le côté de l'autre : à 320 px il fait 872 px de contenu
   * dans une boîte de 574 avec ZÉRO dépense à moi, et 1 149 avec six. Aucun
   * arrangement ne fait tenir tout cela sans défiler. Exiger l'ouverture
   * reviendrait à interdire à cet écran d'être long.
   *
   * Remonter le bloc en tête le rendrait visible à l'ouverture — mesuré, il
   * passe de `top: 1007` à `top: 129` — et ce serait le mauvais remède pour
   * deux raisons : ça ne dit rien des AUTRES positions de défilement, et ça
   * ferait ouvrir l'écran privé sur le total de quelqu'un d'autre, ce que
   * `resume-prive.js` a explicitement refusé le 2026-09-02.
   *
   * ─────────────────────────────────────────────────────────────────────
   * LA PROPRIÉTÉ TENABLE EST INVARIANTE PAR DÉFILEMENT
   *
   *     À AUCUNE position de défilement le montant déclaré n'est lisible
   *     sans la réserve qui l'accompagne.
   *
   * C'est le danger réel, dit exactement : quelqu'un qui lit « 340,00 € » le
   * prend pour un chiffre vérifié. Peu importe qu'il ait fallu défiler pour y
   * arriver — ce qui compte est qu'on ne puisse pas le lire seul.
   *
   * Et elle était **FAUSSE**, dans 7 configurations sur 8. Le montant et sa
   * réserve étaient à 4 px l'un de l'autre, dans le même bloc, mais en deux
   * lignes distinctes : **le bord de la boîte passait entre eux**. Relevé par
   * balayage complet du défilement, une position tous les 20 px :
   *
   *     largeur / dépenses à moi     positions où le montant est SEUL
   *     320 / 0                      1   (à y = 40)
   *     320 / 3                      1   (à y = 120)
   *     320 / 6                      1   (à y = 320)
   *     320 / 12                     2   (à y = 700, 720)
   *     390 / 0                      0   ← le seul cas sain
   *     390 / 6                      2   (à y = 160, 180)
   *     390 / 12                     1   (à y = 560)
   *
   * Le remède n'est pas un arrangement, c'est une INDIVISIBILITÉ : la réserve,
   * dans sa forme courte, entre dans la même boîte de ligne que le chiffre. Un
   * bord d'écran ne peut plus passer entre les deux sans couper le chiffre
   * lui-même. La phrase complète reste dessous, où elle explique.
   *
   * ─────────────────────────────────────────────────────────────────────
   * POURQUOI LE SEMIS PORTE SIX DÉPENSES
   *
   * Parce que zéro ne sépare rien à 390 px : c'est la seule configuration
   * saine des huit, et c'est celle que l'ancien cas semait. Un jeu d'essai qui
   * ne porte que le cas indulgent laisse passer un correctif partiel.
   */
  for (const { nom, viewport } of [
    { nom: '320', viewport: { width: 320, height: 720 } },
    { nom: '390', viewport: { width: 390, height: 844 } }
  ]) {
    test.describe(`au téléphone — ${nom} px`, () => {
      test.use({ viewport, hasTouch: true });

      test('le montant déclaré n\'est jamais lisible sans sa réserve, à aucun défilement', async ({ page }) => {
        await page.evaluate(() => {
          const periode = document.getElementById('periodSelect')?.value;
          window.__db[`totauxPrives/conjointe/${periode}`] = { montant: 340, nombre: 5 };
          // Six dépenses à moi : ce qui allonge l'écran, c'est MA liste, et
          // c'est le régime où les deux largeurs se séparent.
          for (let i = 0; i < 6; i++) {
            window.__db[`prive/vous/periods/${periode}/depenses/s${i}`] = {
              montant: 20 + i, description: `Dépense ${i}`,
              date: `${periode}-0${(i % 9) + 1}`, deleted: false
            };
          }
        });
        await ouvrirPrive(page);

        const releve = await page.evaluate(() => {
          // Le texte PROPRE, sans celui des descendants : sinon la racine porte
          // tout, et n'importe quel écran satisfait n'importe quoi.
          const propre = (el) => [...el.childNodes]
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();

          const tous = [...document.querySelectorAll('body *')];
          // Cherchés par leur TEXTE — le chiffre rendu d'un côté, le mot qui
          // nomme la réserve de l'autre. Jamais par une classe ni un
          // identifiant : le contrôle survit au déplacement qu'il protège.
          const montant = tous.find((el) => /340[,.]00/.test(propre(el)));
          const reserve = tous.find((el) => /déclar/i.test(propre(el)));
          if (!montant || !reserve) {
            return { montantTrouve: Boolean(montant), reserveTrouvee: Boolean(reserve) };
          }

          const dansUnDepliantFerme = (el) => {
            for (let n = el; n; n = n.parentElement) {
              if (n.tagName === 'DETAILS' && !n.open) return true;
            }
            return false;
          };
          // ── « DANS LA VUE » NE SUFFIT PAS : IL FAUT « LISIBLE » ──
          //
          // La première rédaction demandait un chevauchement — `top < hauteur
          // && bottom > 0`. Elle a produit un FAUX POSITIF dès le passage en
          // vue : à un défilement de 280 px, la boîte du montant commence 4 px
          // au-dessus du bord bas et le marqueur 1 px en dessous. La sonde
          // annonçait « montant visible, réserve non » là où personne ne
          // pouvait lire quoi que ce soit — quatre pixels de boîte vide.
          //
          // La propriété parle de LECTURE. Un élément est donc lisible quand sa
          // boîte tient entièrement dans la vue, pas quand elle l'effleure.
          const lisible = (el) => {
            const r = el.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= window.innerHeight
              && r.left >= 0 && r.right <= window.innerWidth;
          };

          // ── LE BALAYAGE A CHANGÉ DE SUJET AVEC LA SURFACE ──
          //
          // Il portait sur le défilement INTERNE d'une carte de modale : une
          // boîte qui défile dans une boîte. L'espace privé est une vue depuis
          // le 2026-09-08, et c'est la PAGE qui défile. Un balayage resté sur
          // `carte.scrollTop` n'aurait trouvé qu'une position — celle du haut —
          // et la prémisse ci-dessous le dit à voix haute plutôt que de rendre
          // vert sur un instrument devenu immobile.
          //
          // C'est le déplacement même que ce contrôle existait pour protéger.
          // Il tient la même propriété, sur la surface qui défile vraiment.
          const max = Math.max(0,
            document.documentElement.scrollHeight - window.innerHeight);

          const seul = [];
          let vuEnsemble = 0;
          for (let y = 0; y <= max; y += 20) {
            window.scrollTo(0, y);
            const m = lisible(montant);
            const r = lisible(reserve);
            if (m && !r) seul.push(y);
            if (m && r) vuEnsemble++;
          }
          window.scrollTo(0, 0);

          return {
            montantTrouve: true,
            reserveTrouvee: true,
            reserveRepliee: dansUnDepliantFerme(reserve),
            defilementMax: max,
            positionsSeul: seul,
            positionsEnsemble: vuEnsemble,
            texteReserve: propre(reserve).slice(0, 60)
          };
        });

        // ── LES PRÉMISSES ──
        // Sans le chiffre, il n'y a rien à protéger, et le balayage passerait
        // sur un écran qui ne rend rien.
        expect(releve.montantTrouve, 'prémisse : le total déclaré n\'est pas rendu')
          .toBe(true);
        expect(releve.reserveTrouvee,
          'le total déclaré est rendu SANS aucune réserve : aucune règle ne peut '
          + 'vérifier la somme de ce qu\'elle n\'a pas le droit de lire, et le taire '
          + 'ferait croire à une garantie technique qui n\'existe pas')
          .toBe(true);

        // La carte doit DÉFILER, sinon le balayage n'a qu'une position et le cas
        // retombe sur l'ancien — celui qui ne mesurait qu'un grand écran.
        expect(releve.defilementMax,
          'prémisse : la page ne défile pas, le balayage ne sépare rien')
          .toBeGreaterThan(0);

        // Le témoin positif : il existe au moins une position où les deux sont
        // là. Sans lui, « jamais seul » serait satisfait par un montant jamais
        // visible — la propriété vraie pour la pire des raisons.
        expect(releve.positionsEnsemble,
          'prémisse : le montant n\'est visible à AUCUNE position, « jamais seul » '
          + 'ne mesure alors rien')
          .toBeGreaterThan(0);

        expect(releve.reserveRepliee,
          `la réserve est repliée dans un dépliant fermé — « ${releve.texteReserve} » : `
          + 'présente n\'est pas lisible, et l\'ouvrir est un geste de plus')
          .toBe(false);

        // ── LA PROPRIÉTÉ ──
        expect(releve.positionsSeul,
          `le montant déclaré se lit SEUL à ${releve.positionsSeul.length} position(s) `
          + `de défilement (y = ${releve.positionsSeul.join(', ')}) : le bord de `
          + 'l\'écran passe entre le chiffre et sa réserve, et le chiffre se lit '
          + 'alors comme un montant vérifié')
          .toEqual([]);
      });

      test('un prénom hostile et un gros montant ne séparent pas le couple', async ({ page }) => {
        /**
         * ── LE CAS QUI TIENT LE `nowrap`, ET IL A FALLU LE CHERCHER ──
         *
         * Le premier mutant posé sur `white-space: nowrap` n'a PAS fait tomber
         * le cas précédent : sur un prénom court et un montant à trois
         * chiffres, « 340,00 € déclaré » tient sur une ligne de toute façon.
         * Un mutant qui ne tombe pas interroge le contrôle avant le code — et
         * ici il disait vrai : le jeu d'essai ne portait que le régime
         * indulgent.
         *
         * Ce qui sépare les deux : un prénom de 30 caractères insécables — la
         * limite que le champ laisse saisir — et un montant à cinq chiffres.
         * Mesuré à 320 px :
         *
         *     avec `nowrap`   le bloc du montant fait 24 px, une seule ligne
         *     sans            48 px, et « déclaré » descend à 29 px du chiffre
         *
         * ── ET LE DÉBORD QUE CE CAS A TROUVÉ EN CHEMIN ──
         *
         * Le sous-titre débordait de **106 px** avec ce prénom, AVANT ce lot :
         * l'intitulé était un nœud de texte nu dans un conteneur flex, donc un
         * élément anonyme qu'aucune règle ne pouvait faire rétrécir. La réserve
         * ajoutée à côté du chiffre portait le débord à 153. Enveloppé, il se
         * tronque ; le montant, lui, ne se tronque jamais.
         */
        await page.evaluate(() => {
          const periode = document.getElementById('periodSelect')?.value;
          window.__db[`totauxPrives/conjointe/${periode}`] = { montant: 12345.67, nombre: 5 };
        });
        await page.evaluate(async () => {
          const { setState } = await import('/js/state.js');
          // 30 caractères SANS coupure : un prénom plausible en porte, et la
          // langue offre alors des occasions de s'enrouler que le cas hostile
          // ne doit pas donner.
          setState('members', { vous: 'Moi', conjointe: 'Bartholomewmaximilienleonardxy' });
        });
        await ouvrirPrive(page);

        const m = await page.evaluate(() => {
          // Par le TEXTE, comme le cas voisin : aucune classe, aucun
          // identifiant. Le montant porte le chiffre en propre, le marqueur
          // porte le mot — ce sont deux éléments, et c'est ce qui permet de
          // mesurer l'écart entre eux.
          const propre = (el) => [...el.childNodes]
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
          const tous = [...document.querySelectorAll('body *')];
          const total = tous.find((el) => /345[,.]67/.test(propre(el)));
          const marque = tous.find((el) => /^déclaré$/i.test(propre(el)));
          if (!total || !marque) return { absent: true, total: Boolean(total), marque: Boolean(marque) };
          const h3 = total.closest('h3');
          const rt = total.getBoundingClientRect();
          const rm = marque.getBoundingClientRect();

          return {
            debordSousTitre: h3.scrollWidth - h3.clientWidth,
            montantRogne: total.scrollWidth > total.clientWidth + 1,
            // Même boîte de ligne : les deux partagent leur bord haut.
            ecartVertical: Math.round(rm.top - rt.top),
            texte: total.innerText.replace(/\s+/g, ' ').trim()
          };
        });

        expect(m.absent, 'prémisse : le total déclaré n\'est pas rendu').toBeFalsy();
        expect(m.texte, 'prémisse : le gros montant n\'est pas celui qu\'on croit')
          .toContain('345');

        expect(m.ecartVertical,
          `« déclaré » est tombé à ${m.ecartVertical} px sous le chiffre : le bord `
          + 'de l\'écran peut à nouveau passer entre les deux')
          .toBeLessThan(6);

        expect(m.debordSousTitre,
          `le sous-titre déborde de ${m.debordSousTitre} px : le prénom pousse le `
          + 'montant hors de l\'écran au lieu de se tronquer')
          .toBeLessThanOrEqual(1);

        expect(m.montantRogne, 'le montant lui-même est rogné — un chiffre abrégé est faux')
          .toBe(false);
      });
    });
  }

  test('sans rien publié, l\'écran se tait plutôt que d\'affirmer', async ({ page }) => {
    // « Rien publié » n'est pas « zéro dépense privée ». Afficher 0 € ferait
    // croire à une information qu'on n'a pas.
    await ouvrirPrive(page);
    await expect(page.locator('#resumePanneauPrive')).toContainText('on n\'en sait rien');
  });

  test('avec son accord : le détail, et plus la réserve du chiffre déclaré', async ({ page }) => {
    // Le double en mémoire n'applique pas les règles : on simule ici l'accord
    // donné par l'autre, pour éprouver le chemin de lecture que la production
    // autorisera.
    await page.evaluate(() => {
      const periode = document.getElementById('periodSelect')?.value;
      window.__db['aval/conjointe'] = { actif: true, accordeLe: 1756300000000, accordePar: 'conjointe' };
      window.__db[`prive/conjointe/periods/${periode}/depenses`] = {
        k1: { montant: 60, description: 'Manucure', date: `${periode}-12`, deleted: false },
        k2: { montant: 25, description: 'Livre', date: `${periode}-18`, deleted: false }
      };
    });
    await ouvrirPrive(page);

    const modale = page.locator('#resumePanneauPrive');
    await expect(modale).toContainText('Manucure');
    await expect(modale).toContainText('Livre');
    await expect(modale).toContainText('85,00');
    // Le total déclaré n'a plus lieu d'être : on lit la source.
    await expect(modale).not.toContainText('déclaré');
  });

  test('le détail de l\'autre ne propose aucune croix de suppression', async ({ page }) => {
    // Voir ne donne pas le droit de retirer, et la règle serveur le refuserait :
    // proposer une croix qui échoue serait promettre ce qu'on ne peut pas tenir.
    await page.evaluate(() => {
      const periode = document.getElementById('periodSelect')?.value;
      window.__db['aval/conjointe'] = { actif: true, accordeLe: 1756300000000, accordePar: 'conjointe' };
      window.__db[`prive/conjointe/periods/${periode}/depenses`] = {
        k1: { montant: 60, description: 'Manucure', date: `${periode}-12`, deleted: false }
      };
    });
    await ouvrirPrive(page);

    const croixDansSonBloc = await page.locator('.prive-autre .prive-retirer').count();
    expect(croixDansSonBloc, 'une croix sans effet est promise à échouer').toBe(0);
  });

  test('ouvrir son propre détail n\'ouvre pas celui de l\'autre', async ({ page }) => {
    // Les deux accords sont indépendants. Les lier ferait un chantage discret :
    // « montre-moi les tiennes et je te montre les miennes ».
    await page.evaluate(() => {
      const periode = document.getElementById('periodSelect')?.value;
      window.__db[`prive/conjointe/periods/${periode}/depenses`] = {
        k1: { montant: 60, description: 'Manucure', date: `${periode}-12`, deleted: false }
      };
    });
    await ouvrirPrive(page);
    await choisirLePartage(page, 'detail');

    await expect(page.locator('#resumePanneauPrive')).not.toContainText('Manucure');
  });
});

test.describe('Le solde du couple', () => {
  test.beforeEach(async ({ page }) => {
    await setupFirebaseMock(page);
    await waitForApp(page);
  });

  test('une dépense privée n\'y entre pas', async ({ page }) => {
    // Elle vit hors de `household` : le bilan ne peut pas la voir. Le vérifier
    // quand même, parce que c'est la propriété que tout le dispositif protège.
    await page.locator('#salaireVous').fill('2000');
    await page.locator('#salaireVous').blur();
    await page.locator('#salaireConjointe').fill('3000');
    await page.locator('#salaireConjointe').blur();
    await page.waitForTimeout(500);

    const avant = await page.locator('#summarySection').innerText();

    await ouvrirPrive(page);
    await page.locator('#priveMontant').fill('45');
    await page.locator('#priveAjouter').click();
    await page.waitForTimeout(700);

    // On revient au foyer par le SEGMENT : l'espace privé était une modale
    // qu'on refermait par `#priveFermer`, c'est une vue dont on sort en
    // choisissant une autre portée. Une vue ne se referme pas.
    await page.locator('.panneau--actif [data-portee="deux"]').click();
    await page.waitForTimeout(600);

    expect(await page.locator('#summarySection').innerText()).toBe(avant);
  });
});
