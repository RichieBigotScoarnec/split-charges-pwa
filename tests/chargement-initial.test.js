import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Ce que la page va chercher avant de s'afficher
 *
 * Sur une connexion mobile à forte latence, ce n'est pas le poids qui coûte,
 * c'est le nombre d'allers-retours — et surtout leur mise en file. Un `@import`
 * en tête de la première feuille imposait la chaîne : HTML, puis
 * variables.css, puis le CSS de Google Fonts, puis les fichiers de police.
 * Quatre attentes l'une après l'autre, chacune bloquant le rendu, avant même
 * que Firebase ne commence.
 *
 * Ces contrôles portent sur le balisage livré. Ils ne mesurent pas un temps de
 * chargement — seul un vrai appareil le peut — mais ils empêchent la mise en
 * file de revenir, et c'est elle qui coûtait.
 */

const RACINE = process.cwd();
const html = readFileSync(resolve(RACINE, 'public/FairSplit.html'), 'utf8');

/** Chaque feuille de style livrée, avec son nom */
const feuilles = readdirSync(resolve(RACINE, 'public/css'))
  .filter((nom) => nom.endsWith('.css'))
  .map((nom) => ({ nom, source: readFileSync(resolve(RACINE, 'public/css', nom), 'utf8') }));

describe('Les feuilles de style ne mettent rien en file', () => {
  it('aucune ne charge de ressource distante par @import', () => {
    // Le cas trouvé : `@import url('https://fonts.googleapis.com/…')` en
    // deuxième ligne de variables.css, la première feuille de la page.
    const fautives = feuilles
      .filter(({ source }) => /@import\s+url\(\s*['"]?https?:/i.test(source))
      .map(({ nom }) => nom);

    expect(fautives, `@import distant dans : ${fautives.join(', ')}`).toEqual([]);
  });
});

describe('Les polices', () => {
  const variables = feuilles.find(({ nom }) => nom === 'variables.css').source;

  it('sont servies par l\'application, sans passer par un tiers', () => {
    // Le <link> vers Google supprimait bien la mise en file, mais restait une
    // inclusion de code depuis une origine tierce, sans empreinte possible :
    // le CSS de Google varie selon le navigateur, `integrity` n'y est pas
    // applicable. CodeQL l'a signale, a juste titre.
    expect(html).not.toContain('fonts.googleapis.com');
    expect(variables).toMatch(/@font-face/);
    expect(variables).toMatch(/url\('\.\.\/fonts\//);
  });

  it('pointent vers des fichiers qui existent', () => {
    const declarees = [...variables.matchAll(/url\('\.\.\/(fonts\/[^']+)'\)/g)].map((m) => m[1]);
    const absentes = declarees.filter(
      (chemin) => !existsSync(resolve(RACINE, 'public', chemin))
    );

    expect(declarees.length).toBeGreaterThan(0);
    expect(absentes, `declarees mais absentes : ${absentes.join(', ')}`).toEqual([]);
  });

  it('ne declarent que les graisses reellement employees', () => {
    // DM Sans 300 etait telechargee sans qu'aucune regle ne l'utilise.
    const employees = new Set(
      feuilles.flatMap(({ source }) =>
        [...source.matchAll(/^\s*font-weight:\s*(\d{3});/gm)].map((m) => m[1])
      )
    );
    const declarees = new Set(
      [...variables.matchAll(/@font-face[^}]*?font-weight:\s*(\d{3});/gs)].map((m) => m[1])
    );

    for (const graisse of declarees) {
      expect(
        employees.has(graisse),
        `graisse ${graisse} declaree mais employee par aucune regle`
      ).toBe(true);
    }
    expect(declarees.size).toBeGreaterThan(0);
  });

  it('ne declarent pas d\'italique, qui n\'est employe nulle part', () => {
    const italiqueEmploye = feuilles.some(({ source }) => /font-style:\s*italic/.test(source));

    expect(italiqueEmploye).toBe(false);
  });

  it('laissent le texte s\'afficher pendant leur chargement', () => {
    // Sans `font-display: swap`, le texte reste invisible le temps du
    // telechargement -- le pire comportement possible sur connexion lente.
    const blocs = variables.match(/@font-face\s*\{[^}]*\}/g) || [];

    for (const bloc of blocs) {
      expect(bloc, 'un @font-face sans font-display: swap').toContain('font-display: swap');
    }
  });
});

describe('Les connexions anticipees', () => {
  it('ne visent aucune origine tierce, faute d\'en joindre une au demarrage', () => {
    // unpkg ne sert qu'a Leaflet, charge seulement si la carte s'ouvre ; les
    // polices sont desormais locales. Anticiper une connexion inutilisee
    // coutait DNS et TLS pour rien.
    const preconnects = [...html.matchAll(/rel="preconnect"\s+href="([^"]+)"/g)].map((m) => m[1]);

    expect(preconnects, `preconnect inutilise : ${preconnects.join(', ')}`).toEqual([]);
  });
});

describe('La politique de securite', () => {
  it('n\'autorise plus Google pour les styles ni les polices', () => {
    // Une origine qui n'est plus jointe n'a pas a rester autorisee.
    const csp = html.split('\n').find((l) => l.includes('Content-Security-Policy'));

    expect(csp).toContain("font-src 'self'");
    expect(csp).not.toContain('fonts.googleapis.com');
    expect(csp).not.toContain('fonts.gstatic.com');
  });

  it('laisse reCAPTCHA joindre son service, sans quoi App Check ne peut rien attester', () => {
    // La panne que ce contrôle ferme : `script-src` et `frame-src` citaient
    // www.google.com, `connect-src` non. Le script de reCAPTCHA se chargeait
    // donc, son cadre s'affichait, et ses propres requêtes étaient refusées par
    // la page elle-même. Le journal du téléphone montrait quatre violations
    // « bloqué par connect-src » puis « attestation impossible : 400 », et la
    // base restait injoignable sur un réseau parfaitement valide.
    //
    // Rien de tout cela ne se voit à l'écran : une origine oubliée dans une
    // ligne de deux mille caractères ne se relit pas, elle se teste.
    const csp = politique(html);

    expect(csp['script-src'], 'reCAPTCHA charge son script depuis www.google.com')
      .toContain('https://www.google.com');
    expect(csp['frame-src'], 'reCAPTCHA affiche son épreuve dans un cadre')
      .toContain('https://www.google.com');
    expect(csp['connect-src'], 'reCAPTCHA fait ses propres requêtes vers www.google.com')
      .toContain('https://www.google.com');

    // L'échange du jeton d'attestation vise content-firebaseappcheck.googleapis.com
    expect(csp['connect-src']).toContain('https://*.googleapis.com');
  });

  it('laisse le long-polling de la base injecter ses scripts', () => {
    // La panne que ce contrôle ferme, et elle a coûté cher.
    //
    // Realtime Database parle par WebSocket. Le SDK écrit
    // `previous_websocket_failure` dans localStorage *avant* chaque tentative
    // — « assume failure until proven otherwise » — et ne l'efface qu'une fois
    // la liaison établie. Une seconde de réseau perdue, un mode avion, un
    // tunnel : le drapeau reste.
    //
    // Au chargement suivant, `initTransports_` lit ce drapeau et bascule sur le
    // long-polling. Or ce transport n'est pas du `fetch` : il injecte des
    // balises `<script>` vers l'hôte de la base, dans une iframe qu'il
    // fabrique. Sans cette origine dans `script-src`, il est refusé.
    //
    // Et la bascule est sans retour : le drapeau ne s'efface que sur une
    // liaison réussie, qui ne peut plus arriver. Rechargement après
    // rechargement, la base restait injoignable sur un réseau parfaitement
    // sain — seul l'effacement des données du site la ramenait, en effaçant le
    // drapeau. Le refus, lui, était invisible : il a lieu dans l'iframe, dont
    // le document n'est pas celui qu'écoute le journal de diagnostic.
    const csp = politique(html);

    expect(csp['script-src'], 'le long-polling de Realtime Database injecte des <script> vers son hôte')
      .toContain('https://*.firebasedatabase.app');
    expect(csp['connect-src'], 'le WebSocket et les lectures REST visent le même hôte')
      .toContain('https://*.firebasedatabase.app');
    expect(csp['connect-src']).toContain('wss://*.firebasedatabase.app');
  });

  it('dit la même chose dans la page et dans firebase.json, dans les deux sens', () => {
    // Deux copies d'une même règle divergent toujours : celle de firebase.json
    // ne s'applique qu'à l'hébergement Firebase, celle de la page à GitHub
    // Pages — d'où la production est servie. Corriger l'une en oubliant
    // l'autre laisserait la panne intacte partout où l'oubli porte.
    //
    // La comparaison ne portait que dans un sens : tout ce que la page
    // autorisait devait figurer dans firebase.json. L'inverse n'était pas
    // contrôlé — et c'est exactement par là que la panne est passée.
    // `https://*.firebasedatabase.app` figurait dans le `script-src` de
    // firebase.json, où il ne s'applique jamais, et manquait dans celui de la
    // page, la seule qui compte. Un test à sens unique ne protège que d'une
    // moitié des oublis, et rien ne dit laquelle.
    const entetes = JSON.parse(readFileSync(resolve(RACINE, 'firebase.json'), 'utf8'));
    const entete = entetes.hosting.headers
      .flatMap((regle) => regle.headers)
      .find((en) => en.key === 'Content-Security-Policy');

    expect(entete, 'firebase.json ne déclare plus de politique de sécurité').toBeTruthy();

    const page = politique(html);
    const hebergement = politique(entete.value);

    // Les origines localhost n'appartiennent qu'à la page : `?emulator=1` ne
    // s'utilise pas depuis l'hébergement, et n'a donc pas à figurer là-bas.
    const propre = (origines) => (origines || [])
      .filter((origine) => !origine.includes('localhost') && !origine.includes('127.0.0.1'));

    for (const directive of ['script-src', 'connect-src', 'frame-src', 'img-src']) {
      // `script-src-elem` n'est déclaré que dans firebase.json. La
      // spécification dit qu'à défaut il hérite de `script-src` : comparer
      // l'un à l'autre est donc juste, et ne pas le faire laisserait une
      // divergence réelle passer pour une différence de forme.
      const cotePage = propre(resoudre(page, directive));
      const coteHebergement = propre(resoudre(hebergement, directive));

      for (const origine of cotePage) {
        expect(coteHebergement, `${directive} : ${origine} est dans la page, absent de firebase.json`)
          .toContain(origine);
      }

      for (const origine of coteHebergement) {
        expect(cotePage, `${directive} : ${origine} est dans firebase.json, absent de la page — c'est la page qui s'applique`)
          .toContain(origine);
      }
    }
  });
});

/**
 * Les origines d'une directive, repli de la spécification compris
 *
 * `script-src-elem` hérite de `script-src` quand il n'est pas déclaré, et
 * réciproquement il le remplace pour les balises quand il l'est. Comparer
 * naïvement deux politiques dont l'une déclare les deux ferait passer une
 * divergence réelle pour une différence de forme.
 *
 * @param {Object<string, string[]>} directives
 * @param {string} directive
 * @returns {string[]}
 */
function resoudre(directives, directive) {
  const propres = directives[directive] || [];
  if (directive !== 'script-src') return propres;

  return [...new Set([...propres, ...(directives['script-src-elem'] || [])])];
}

/**
 * Découpe une politique de sécurité en directives
 *
 * @param {string} texte - Ligne de la balise meta, ou valeur de l'en-tête
 * @returns {Object<string, string[]>} Origines autorisées, par directive
 */
function politique(texte) {
  // Le balisage complet est accepté : on y isole la balise, plutôt que
  // d'obliger chaque appelant à la retrouver — et à s'y tromper.
  const balise = texte.split('\n').find((ligne) => ligne.includes('http-equiv="Content-Security-Policy"'));
  const contenu = balise ? (balise.match(/content="([^"]+)"/) || [])[1] || '' : texte;

  const directives = {};

  for (const morceau of contenu.split(';')) {
    const jetons = morceau.trim().split(/\s+/).filter(Boolean);
    if (jetons.length === 0) continue;
    directives[jetons[0]] = jetons.slice(1);
  }

  return directives;
}
