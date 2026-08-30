// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initDatabase, setAuthenticatedUser, signalerLiaison, dbGet } from '../public/js/db.js';

/**
 * Deux garanties contre un même symptôme : une application qui s'affiche vide,
 * sans salaires ni sélecteur de mois, et sans le moindre message d'erreur.
 *
 * Realtime Database ne rejette pas une lecture émise alors que le client n'est
 * pas connecté : il la met en file d'attente. La promesse reste en attente,
 * aucun `catch` ne se déclenche, et un `await` placé sur cette lecture gèle
 * définitivement la séquence d'initialisation — en silence. Le sélecteur de
 * mois, qui ne dépend d'aucune donnée, était initialisé derrière une de ces
 * lectures : il disparaissait avec elle.
 */

describe('Une lecture sans réponse ne peut pas geler l\'initialisation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setAuthenticatedUser('uid-test');

    // `db.js` retient l'état de la liaison et le miroir des lectures pour la
    // durée du module : sans remise à zéro, la coupure constatée par un
    // contrôle décide du suivant, et celui-ci passe alors par le miroir sans
    // jamais toucher la fausse base qu'il vient de poser.
    window.localStorage.clear();
    signalerLiaison(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    setAuthenticatedUser(null);
  });

  it('dbGet échoue après le délai au lieu d\'attendre indéfiniment', async () => {
    // Reproduit une base injoignable : once() ne rejette jamais, il attend.
    initDatabase({ ref: () => ({ once: () => new Promise(() => {}) }) });

    const lecture = dbGet('customCategories');
    const verdict = expect(lecture).rejects.toThrow(/sans réponse/);
    await vi.advanceTimersByTimeAsync(10000);
    await verdict;
  });

  it('le message d\'échec nomme le chemin, pour rester exploitable', async () => {
    initDatabase({ ref: () => ({ once: () => new Promise(() => {}) }) });

    const lecture = dbGet('periods/2026-08/salaries');
    const verdict = expect(lecture).rejects.toThrow(/periods\/2026-08\/salaries/);
    await vi.advanceTimersByTimeAsync(10000);
    await verdict;
  });

  it('une lecture qui aboutit n\'est pas pénalisée', async () => {
    initDatabase({
      ref: () => ({ once: () => Promise.resolve({ val: () => ({ salaireVous: 2000 }) }) })
    });

    await expect(dbGet('periods/2026-08/salaries')).resolves.toEqual({ salaireVous: 2000 });
  });
});

describe('Ordre d\'initialisation', () => {
  // En environnement jsdom, import.meta.url est une URL http : on résout
  // depuis la racine du projet, que Vitest fixe comme répertoire courant.
  const source = readFileSync(
    resolve(process.cwd(), 'public/js/modules/auth.js'),
    'utf8'
  );

  /**
   * Le sélecteur de mois se déduit de la date courante : aucune lecture requise.
   * Le placer après une étape réseau revient à faire dépendre la navigation de
   * la disponibilité de la base. Cet ordre est une garantie, pas une préférence.
   */
  it('le sélecteur de période précède toute étape lisant en base', () => {
    const selecteur = source.indexOf("runStep('sélecteur de période'");
    expect(selecteur).toBeGreaterThan(-1);

    const etapesReseau = [
      "runStep('listes personnalisées'",
      "runStep('salaires de la période'",
      "runStep('mode de partage'",
      "runStep('charges variables'",
      "runStep('charges fixes'"
    ];

    etapesReseau.forEach(etape => {
      const position = source.indexOf(etape);
      expect(position, `${etape} introuvable`).toBeGreaterThan(-1);
      expect(selecteur, `le sélecteur doit précéder ${etape}`).toBeLessThan(position);
    });
  });

  /**
   * Une confirmation ne vaut que si elle dit vrai au moment où elle paraît.
   *
   * « FairSplit chargé » était émis par `initApp`, juste après la pose de
   * l'écouteur d'authentification. À cet instant Firebase n'a rien répondu et
   * aucune donnée n'est lue : le message s'affichait par-dessus l'écran
   * d'attente, à côté de « Connexion… ». Deux affirmations contraires dans le
   * même coup d'œil, et la fausse était la rassurante.
   */
  it('la confirmation de chargement n\'est émise qu\'une fois les données lues', () => {
    const entree = readFileSync(resolve(process.cwd(), 'public/js/app.js'), 'utf8');

    // Le contrôle portait sur le fichier entier, faute de quoi que ce soit
    // d'autre à y confirmer. Il visait pourtant `initApp` seule : c'est elle
    // qui s'exécute avant toute réponse de Firebase. Depuis que la même page
    // annonce aussi le rejeu des saisies gardées hors ligne — un message émis,
    // lui, après une écriture réelle —, le contrôle doit viser ce qu'il
    // voulait dire, sinon il interdit un message vrai pour en empêcher un faux.
    const corpsInitApp = extraireFonction(entree, 'async function initApp()');
    expect(corpsInitApp, 'initApp introuvable dans app.js').not.toBe('');
    expect(corpsInitApp, 'initApp ne peut rien confirmer : Firebase n\'a pas répondu')
      .not.toContain('toast.success(');

    const confirmation = source.indexOf("toast.success('FairSplit chargé')");
    expect(confirmation, 'confirmation introuvable dans auth.js').toBeGreaterThan(-1);
    expect(
      confirmation,
      'la confirmation doit suivre la fin des étapes de chargement'
    ).toBeGreaterThan(source.indexOf('appInitialized = true'));
  });

  it('le rejeu hors ligne ne confirme rien tant que rien n\'est parti', () => {
    // Le pendant du contrôle précédent, pour le seul autre message de succès de
    // la page : une reconnexion se produit à chaque sortie de veille, et
    // annoncer « saisies enregistrées » à chacune ferait de la confirmation un
    // bruit de fond.
    // Ce contrôle a été RENDU INERTE par un refactor : il cherchait
    // `if (envoyees > 0)` dans `app.js`, chaîne devenue `if (succes)` et
    // fichier devenu `utils/reprise.js`. `indexOf` rendait -1, et
    // « -1 < n'importe quoi » passait sans rien mesurer. Une lecture de source
    // ne survit pas au renommage de ce qu'elle lit.
    //
    // Ce qu'il voulait tenir est désormais mesuré pour de vrai — la
    // confirmation ne paraît que si quelque chose est parti, contrôlé en
    // montant la fonction dans `tests/utils/reprise.test.js`. Ce qui reste ici
    // est la seule chose que ce fichier-ci puisse dire : le message de succès
    // du rejeu n'est écrit nulle part ailleurs dans la page.
    const entree = readFileSync(resolve(process.cwd(), 'public/js/app.js'), 'utf8');

    expect(entree, 'le rejeu ne doit plus confirmer depuis app.js')
      .not.toContain('toast.success(');
  });

  it('les saisies gardées hors ligne partent une fois les données chargées', () => {
    // Et pas avant : la liaison s'établit plusieurs secondes avant que la
    // session ne soit rétablie. Un rejeu déclenché par le seul événement de
    // connexion ne pourrait que lever.
    // L'appel, pas la déclaration : chercher le seul nom de la fonction
    // laissait ce contrôle passer alors que l'appel avait disparu.
    const rejeu = source.indexOf('await ecoulerLesSaisiesGardees();');
    expect(rejeu, 'appel au rejeu introuvable dans auth.js').toBeGreaterThan(-1);
    expect(rejeu, 'le rejeu doit suivre la fin des étapes de chargement')
      .toBeGreaterThan(source.indexOf('appInitialized = true'));
  });

  it('chaque étape est isolée par runStep, aucune n\'échappe au filet', () => {
    // Un appel direct hors runStep propagerait son échec et interromprait
    // toutes les étapes suivantes.
    const appelsDirects = source.match(/^\s+await (initCustomLists|loadPeriodData|loadShareMode|loadVariableCharges|loadFixedCharges)\(/gm) || [];
    appelsDirects.forEach(appel => {
      expect(source.indexOf(appel.trim())).toBeGreaterThan(source.indexOf('runStep('));
    });
    expect(source).toContain('async function runStep(');
  });
});

/**
 * Extrait le corps d'une fonction, accolades comptées
 *
 * Une expression régulière s'arrêterait à la première accolade fermante venue
 * — celle d'un `try`, d'un objet littéral — et le contrôle porterait alors sur
 * un fragment, en donnant l'air de porter sur la fonction.
 *
 * @param {string} source
 * @param {string} signature - Début exact de la déclaration
 * @returns {string} Corps de la fonction, chaîne vide si elle est introuvable
 */
function extraireFonction(source, signature) {
  const debut = source.indexOf(signature);
  if (debut === -1) return '';

  const ouverture = source.indexOf('{', debut);
  if (ouverture === -1) return '';

  let profondeur = 0;
  for (let rang = ouverture; rang < source.length; rang++) {
    if (source[rang] === '{') profondeur++;
    else if (source[rang] === '}') {
      profondeur--;
      if (profondeur === 0) return source.slice(ouverture, rang + 1);
    }
  }
  return '';
}

describe('LE CÂBLAGE DE LA REPRISE AUTONOME', () => {
  /**
   * `app.js` est la racine de composition : il ne fait que dire quel geste, à
   * quel moment. Lire sa source est légitime ICI, et seulement ici, parce que
   * le comportement composé est mesuré ailleurs pour de vrai —
   * `tests/utils/reprise.test.js` monte les trois fonctions et regarde ce que
   * le foyer voit affiché.
   *
   * Ce qui rend cette lecture honnête, c'est cette division : la forme du fil
   * est vérifiée ici, son effet là-bas. Une lecture de source qui prétend
   * tenir un COMPORTEMENT, elle, ne tient rien — mesuré : supprimer le bloc
   * qui annonce les saisies refusées laissait le contrôle qui le « tenait »
   * entièrement vert.
   */
  const app = () => readFileSync(resolve(process.cwd(), 'public/js/app.js'), 'utf8');

  it('la reprise réussie déclenche `surRepriseDeLiaison`', () => {
    // `.info/connected` peut rester faux alors que la base répond — la panne
    // qui a duré des heures. Ce rappel est la seule issue, et il était une
    // fermeture anonyme, donc inatteignable par tout contrôle.
    expect(app()).toContain('surLiaisonRetablie(surRepriseDeLiaison)');
  });

  it('et une reconnexion annoncée par Firebase écoule la file', () => {
    expect(app()).toContain('if (isConnected) synchroniserLesSaisies()');
  });

  it('app.js ne porte plus aucun de ces comportements lui-même', () => {
    // S'ils y revenaient, ils échapperaient de nouveau à toute mesure.
    expect(app()).not.toContain('async function synchroniserLesSaisies');
    expect(app()).not.toContain('annoncesDuRejeu');
  });
});
