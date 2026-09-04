import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

    // AUDIT-012. Ce filtre écartait les origines locales des DEUX côtés, au
    // motif qu'elles « n'appartiennent qu'à la page ». Elles figurent en fait
    // dans les deux fichiers, et pour une raison : `npm run emulators` lance
    // aussi l'émulateur d'hébergement (port 5000), qui applique les en-têtes
    // de `firebase.json` — les en retirer casserait ce chemin de
    // développement. Le filtre créait donc un angle mort exactement là où ce
    // contrôle existe pour ne pas en avoir.
    //
    // Elles sont désormais comparées comme le reste. Ce qui les rend
    // acceptables en production est tenu ailleurs, et mesuré :
    // `balisage-sain.test.js` exige qu'elles soient en `http`/`ws` — donc
    // bloquées comme contenu mixte — et qu'elles ne sortent pas de
    // `connect-src`.
    const propre = (origines) => origines || [];

    // Toutes les directives des deux côtés, et non quatre choisies à la main.
    //
    // La liste était figée à `script-src`, `connect-src`, `frame-src` et
    // `img-src` — celles que la panne du long-polling avait fait ajouter. Les
    // quatre autres n'étaient comparées par personne : `base-uri`,
    // `object-src` et `form-action` ne vivaient que dans la page, `style-src`
    // et `font-src` citaient encore les serveurs de Google Fonts dans
    // firebase.json, restes d'avant le rapatriement des polices. Aucune de ces
    // divergences n'ouvrait quoi que ce soit en production — Pages ne sert que
    // la balise, qui est la plus stricte — mais c'est exactement ainsi qu'a
    // commencé la panne que ce contrôle est censé fermer : par une directive
    // que personne ne regardait.
    //
    // La réunion des deux côtés, plutôt qu'une liste : une directive ajoutée
    // demain à l'un des deux fichiers entre d'elle-même dans la comparaison.
    const directives = [...new Set([...Object.keys(page), ...Object.keys(hebergement)])]
      // `script-src-elem` est comparé à travers `script-src`, qu'il complète.
      .filter((nom) => nom !== 'script-src-elem');

    expect(directives.length, 'aucune directive à comparer : le découpage a échoué')
      .toBeGreaterThan(4);

    for (const directive of directives) {
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

/**
 * Une origine autorisée admet-elle cette URL ?
 *
 * Reproduit la comparaison de source CSP dans ce qu'elle a d'utile ici :
 * `'self'` pour une URL relative, un joker de sous-domaine (`https://*.x.tld`),
 * et un préfixe de CHEMIN — `https://unpkg.com/leaflet@1.9.4/` n'autorise que
 * ce qui commence par lui, et c'est précisément ce qui a borné unpkg.
 *
 * @param {string} source - Une entrée de directive
 * @param {URL} url - Ressource chargée
 * @returns {boolean}
 */
function sourceAdmet(source, url) {
  if (source === "'self'" || source === "'none'") return false;
  if (source === '*') return true;
  if (source.startsWith("'")) return false;

  const motif = source.includes('://') ? source : `https://${source}`;
  let borne;
  try {
    borne = new URL(motif);
  } catch {
    return false;
  }

  if (borne.protocol !== url.protocol) return false;

  const hote = borne.hostname.startsWith('*.')
    ? url.hostname === borne.hostname.slice(2) || url.hostname.endsWith(borne.hostname.slice(1))
    : url.hostname === borne.hostname;
  if (!hote) return false;

  if (borne.port && borne.port !== '*' && borne.port !== url.port) return false;

  // Un chemin qui n'est pas « / » borne : la source ne vaut que pour ce
  // préfixe. C'est ce qui distingue « tout unpkg » de « Leaflet 1.9.4 ».
  return borne.pathname === '/' || url.pathname.startsWith(borne.pathname);
}

/**
 * La politique laisse-t-elle charger cette ressource ?
 *
 * @param {Object<string, string[]>} csp
 * @param {string} directive - `script-src`, `style-src`, `img-src`, …
 * @param {string} href - Tel qu'il est écrit dans le balisage
 * @returns {boolean}
 */
function autorisee(csp, directive, href) {
  const sources = resoudre(csp, directive).length
    ? resoudre(csp, directive)
    : (csp['default-src'] || []);

  // Une URL relative est servie par l'origine de la page : `'self'` suffit.
  if (!/^[a-z]+:\/\//i.test(href)) return sources.includes("'self'");

  const url = new URL(href);
  return sources.some((source) => sourceAdmet(source, url));
}

describe('LA POLITIQUE EST CONFRONTÉE À CE QUE LA PAGE CHARGE VRAIMENT', () => {
  /**
   * Les contrôles au-dessus lisent la politique et vérifient qu'elle contient
   * telle origine — nommée à la main, parce qu'une panne l'avait fait ajouter.
   * Aucun ne part de l'autre bout : **ce que la page va réellement chercher**.
   *
   * Un `<script src>` vers une origine absente de `script-src` se charge donc
   * sans qu'aucun test ne bronche, et le refus n'a lieu que dans le navigateur
   * du foyer. C'est exactement la panne du long-polling, qui a rendu la base
   * injoignable pour toujours sur un réseau sain — et il a fallu effacer les
   * données du site pour en sortir.
   *
   * Le sens inverse est déjà tenu ailleurs (`balisage-sain.test.js` compare la
   * balise et `firebase.json`). Celui-ci part du balisage.
   */
  const csp = politique(html);

  /** Tout ce que la page déclare aller chercher, avec sa directive */
  const RESSOURCES = [
    ...[...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)]
      .map(([, href]) => ({ directive: 'script-src', href })),
    ...[...html.matchAll(/<link[^>]*\srel="stylesheet"[^>]*\shref="([^"]+)"/g)]
      .map(([, href]) => ({ directive: 'style-src', href })),
    ...[...html.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)]
      .map(([, href]) => ({ directive: 'img-src', href }))
  ];

  it('le relevé n\'est pas vide', () => {
    // Une expression régulière cassée rendrait tout le bloc vert.
    expect(RESSOURCES.filter(r => r.directive === 'script-src').length).toBeGreaterThan(4);
    expect(RESSOURCES.filter(r => r.directive === 'style-src').length).toBeGreaterThan(4);
  });

  it('chaque ressource du balisage est admise par la politique', () => {
    const refusees = RESSOURCES
      .filter(({ directive, href }) => !autorisee(csp, directive, href))
      .map(({ directive, href }) => `${directive} ← ${href}`);

    expect(refusees, `la page les charge, la politique les refuse :\n${refusees.join('\n')}`)
      .toEqual([]);
  });

  it('Leaflet aussi, qui n\'est chargé qu\'à l\'ouverture de la carte', () => {
    // Il n'est pas dans le balisage : `map.js` fabrique les deux balises au
    // premier usage. Un test qui ne lirait que le HTML ne le verrait jamais —
    // et c'est justement l'origine dont `script-src` a été RESSERRÉE sur un
    // chemin exact, donc celle qu'un changement de version casserait en
    // silence, sans qu'on s'en aperçoive avant d'ouvrir la carte.
    const map = readFileSync(resolve(RACINE, 'public/js/modules/map.js'), 'utf8');
    const urls = [...map.matchAll(/'(https:\/\/[^']+\.(?:js|css))'/g)].map(([, url]) => url);

    expect(urls.length, 'les URL de Leaflet ont changé de forme').toBe(2);

    for (const url of urls) {
      const directive = url.endsWith('.css') ? 'style-src' : 'script-src';
      expect(autorisee(csp, directive, url), `${directive} refuse ${url}`).toBe(true);
    }
  });

  it('et une origine que la politique ne cite pas serait bien refusée', () => {
    // Le test doit savoir échouer.
    expect(autorisee(csp, 'script-src', 'https://cdn.exemple.test/x.js')).toBe(false);

    // Le bornage d'unpkg au chemin exact : une autre version, un autre paquet.
    expect(autorisee(csp, 'script-src', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js')).toBe(true);
    expect(autorisee(csp, 'script-src', 'https://unpkg.com/leaflet@2.0.0/dist/leaflet.js')).toBe(false);
    expect(autorisee(csp, 'script-src', 'https://unpkg.com/n-importe-quoi.js')).toBe(false);
  });
});

describe('ET CE QUE LE SCRIPT VA CHERCHER, que le balisage ne montre pas', () => {
  /**
   * Le bloc précédent part du BALISAGE : chaque `<script src>`, chaque feuille,
   * chaque image. C'est déjà l'autre bout que les contrôles nommant les origines
   * à la main, mais ce n'est que la moitié du chemin.
   *
   * L'autre moitié, c'est ce que le code va chercher LUI-MÊME : le géocodage,
   * les tuiles de la carte, l'avatar Google, la base. Rien de tout cela
   * n'apparaît dans le HTML. Mesuré : retirer `nominatim.openstreetmap.org` de
   * `connect-src` — dans la page ET dans `firebase.json`, donc sans que le
   * miroir des deux politiques ne bronche — laissait les 2 378 contrôles verts.
   * La recherche de lieu serait morte en production, et rien ne l'aurait dit.
   *
   * Chaque entrée ci-dessous nomme la directive que le navigateur consulte pour
   * ce genre de requête, et l'endroit du code qui la déclenche.
   */
  const csp = politique(html);

  const DISTANTES = [
    {
      quoi: 'le géocodage inverse — le lieu déduit de la position GPS',
      directive: 'connect-src',
      url: 'https://nominatim.openstreetmap.org/reverse',
      ou: 'utils/lieu.js'
    },
    {
      quoi: 'la recherche de lieu par son nom',
      directive: 'connect-src',
      url: 'https://nominatim.openstreetmap.org/search',
      ou: 'utils/recherche-lieu.js'
    },
    {
      quoi: 'la base de données',
      directive: 'connect-src',
      url: 'https://fairsplit-foyer-default-rtdb.europe-west1.firebasedatabase.app/',
      ou: 'config.js — databaseURL'
    },
    {
      quoi: 'les tuiles de la carte',
      directive: 'img-src',
      url: 'https://a.tile.openstreetmap.org/12/2045/1430.png',
      ou: 'modules/map.js — L.tileLayer'
    },
    {
      quoi: 'l\'avatar du compte Google',
      directive: 'img-src',
      url: 'https://lh3.googleusercontent.com/a/exemple',
      ou: 'modules/auth.js — userAvatarEl.src = user.photoURL'
    }
  ];

  it.each(DISTANTES)('$quoi ($ou)', ({ directive, url }) => {
    expect(autorisee(csp, directive, url), `${directive} refuse ${url}`).toBe(true);
  });

  it('le relevé colle à ce que le code contient encore', () => {
    // Une liste tenue à la main dérive. Celle-ci est comparée aux URL absolues
    // réellement écrites dans `public/js` : une origine qui disparaîtrait du
    // code sans quitter cette liste ferait échouer ce contrôle, et l'inverse
    // aussi.
    const dansLeCode = new Set();
    for (const chemin of sourcesJs(resolve(RACINE, 'public/js'))) {
      for (const [url] of readFileSync(chemin, 'utf8').matchAll(/https:\/\/[a-zA-Z0-9.*/@{}-]+/g)) {
        const hote = url.split('/')[2];
        // `www.openstreetmap.org/copyright` n'est qu'un lien d'attribution dans
        // le balisage de la carte : rien n'est chargé depuis lui.
        if (hote && hote !== 'www.openstreetmap.org') dansLeCode.add(hote);
      }
    }

    // Les hôtes que le relevé couvre, gabarits de sous-domaine résolus.
    const couverts = new Set(['nominatim.openstreetmap.org', 'unpkg.com',
      'fairsplit-foyer-default-rtdb.europe-west1.firebasedatabase.app',
      '{s}.tile.openstreetmap.org']);

    expect([...dansLeCode].filter(h => !couverts.has(h)),
      'une origine jointe par le code n\'est pas au relevé').toEqual([]);
  });
});

/** Tous les fichiers JS livrés */
function sourcesJs(dossier, trouves = []) {
  for (const entree of readdirSync(dossier)) {
    const chemin = resolve(dossier, entree);
    if (statSync(chemin).isDirectory()) sourcesJs(chemin, trouves);
    else if (entree.endsWith('.js')) trouves.push(chemin);
  }
  return trouves;
}
