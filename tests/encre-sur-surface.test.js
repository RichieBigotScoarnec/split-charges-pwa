import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Une encre est-elle lisible LÀ OÙ ELLE EST POSÉE ?
 *
 * `tests/contraste.test.js` mesure les JETONS : `--text-primary` tient sur
 * chaque surface, `--text-muted` aussi. C'est nécessaire, et le dépôt a déjà
 * consigné que c'est insuffisant — « un jeton conforme appliqué au mauvais
 * endroit produit un texte illisible sans qu'aucune mesure de jeton ne
 * bronche ». Ce fichier est la moitié qui manquait.
 *
 * Il ne cherche pas des noms de jetons. Il relève CHAQUE déclaration
 * `color: var(--x)` des feuilles livrées, détermine la surface sur laquelle
 * cette règle pose son texte, et mesure. Un jeton neuf, un site neuf, un
 * renommage : tout passe par ici sans qu'on ait à tenir de liste.
 *
 * Ce qui a motivé son écriture
 * ---------------------------------------------------------------
 * Le 31 août, trois jetons d'encre — `--success-ink`, `--warning-ink`,
 * `--danger-ink` — ont été créés parce que les couleurs de PASTILLE rendent
 * 2,78 à 3,77:1 comme texte, sous le seuil de 4,5. Ils ont été appliqués aux
 * deux sites où le défaut avait été VU. Les trente et un autres sont restés.
 *
 * C'est le motif que ce dépôt paie depuis le début : un correctif qui ne
 * quitte pas le fichier où il est né. Huit occurrences sous le nom de
 * `normalizePair`, une neuvième pour `toFixed(1)` — « vingt-huit sites
 * écrivaient 2909.02 € ». Substituer les trente et un sites à la main sans ce
 * contrôle aurait produit la onzième.
 *
 * Ce qu'il mesure vraiment
 * ---------------------------------------------------------------
 * - La SURFACE vient de la règle elle-même. Si le bloc déclare un `background`
 *   nommant un jeton, c'est lui — sinon les trois surfaces de base, et le
 *   pire cas fait foi. Sans cela `--on-warning`, une encre volontairement
 *   fixe posée SUR l'ambre, serait rapportée à 1,11:1 : une fausse alerte qui
 *   apprendrait à ignorer le contrôle.
 * - Les fonds TRANSLUCIDES sont composités sur les surfaces de base. Le lavis
 *   `--primary-soft` de l'onglet actif n'est pas une couleur, c'est une
 *   couche.
 * - L'OPACITÉ du bloc est appliquée à l'encre. `.charge-location` porte
 *   `opacity: 0.8` : son contraste réel est plus faible que celui de son
 *   jeton, et aucune mesure de jeton ne pouvait le dire.
 * - Les DEUX THÈMES, toujours. `components.css:837` documente « la teinte
 *   pleine passe à 5,49:1 » — c'est la mesure du thème clair, et elle vaut
 *   3,63:1 en sombre. Une correction validée dans un thème sur deux est le
 *   même défaut que celle validée dans un fichier sur cinq.
 *
 * Seuil retenu : 4,5:1, celui de CLAUDE.md pour le texte courant. Il est
 * appliqué SANS exception de grande taille : un jeton d'encre sert à des
 * dizaines de sites dont la taille n'est pas connue d'ici, et l'invariant
 * utile est qu'il soit sûr partout.
 */

const DOSSIER = resolve(process.cwd(), 'public/css');
const FEUILLES = readdirSync(DOSSIER).filter((f) => f.endsWith('.css'));
const SEUIL = 4.5;

/** Les surfaces sur lesquelles du texte est réellement posé, faute de mieux. */
const SURFACES_DE_BASE = ['dark-bg', 'card-bg', 'elevated-bg'];

/**
 * Le seul jeton d'encre soustrait à la mesure, et pourquoi.
 *
 * `--google-text` vit dans `auth.css`, sur le bouton Google, avec le fond que
 * la charte de Google impose. `variables.css` consigne déjà cette exception :
 * « Le bouton Google reste en dur, sa charte l'impose. » Le mesurer contre les
 * surfaces de l'application n'aurait aucun sens — il n'y est jamais posé.
 */
const APPARIEMENTS_DE_MARQUE = new Set(['google-text']);

/* ============================================================
   Lecture des jetons — toutes feuilles, deux thèmes, alias résolus
   ============================================================ */

const SOURCES = Object.fromEntries(
  FEUILLES.map((f) => [f, readFileSync(resolve(DOSSIER, f), 'utf8')])
);

const VARIABLES = SOURCES['variables.css'];
const DEBUT_SOMBRE = VARIABLES.indexOf('@media (prefers-color-scheme: dark)');

/**
 * Déclarations d'un thème, tous fichiers confondus.
 *
 * Le thème sombre n'est qu'un jeu de REDÉFINITIONS : ce qu'il ne redéclare
 * pas garde sa valeur claire. Les lire séparément puis superposer reproduit
 * exactement ce que fait la cascade.
 */
function declarations(theme) {
  const texte =
    theme === 'sombre'
      ? VARIABLES.slice(DEBUT_SOMBRE)
      : VARIABLES.slice(0, DEBUT_SOMBRE) +
        FEUILLES.filter((f) => f !== 'variables.css')
          .map((f) => SOURCES[f])
          .join('\n');

  const table = new Map();
  for (const m of texte.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    if (!table.has(m[1])) table.set(m[1], m[2].trim());
  }
  return table;
}

const TABLES = { clair: declarations('clair'), sombre: declarations('sombre') };

/**
 * Valeur résolue d'un jeton dans un thème.
 *
 * Un alias — `--error-color: var(--danger-color)` — se résout DANS LE THÈME
 * DEMANDÉ, jamais dans celui où l'alias est déclaré. C'est la faute que ma
 * première sonde a commise : elle rapportait `--error-color` à #DC2626 en
 * thème sombre, alors que la cascade y donne #F87171. Un résolveur faux
 * invente des défauts, ce qui est aussi grave que d'en manquer.
 *
 * @param {string} nom - Nom du jeton, sans les tirets
 * @param {'clair'|'sombre'} theme
 * @returns {string|null} Couleur CSS, ou null si le jeton est introuvable
 */
export function valeurDuJeton(nom, theme, profondeur = 0) {
  if (profondeur > 8) return null;

  const brut = TABLES[theme].get(nom) ?? TABLES.clair.get(nom);
  if (!brut) return null;

  const alias = brut.match(/^var\(\s*--([\w-]+)\s*\)$/);
  if (alias) return valeurDuJeton(alias[1], theme, profondeur + 1);

  return brut;
}

/* ============================================================
   Couleurs : lecture, compositage, contraste
   ============================================================ */

/**
 * Les deux mots-clés de couleur employés dans ces feuilles.
 *
 * `white` et `black` sont des couleurs comme les autres ; les écrire en toutes
 * lettres ne les soustrait pas à la mesure. `transparent`, `inherit` et
 * `currentColor` ne sont pas des couleurs résolubles ici : `lireCouleur` rend
 * `null` et le site est écarté du relevé.
 */
const MOTS = { white: '#FFFFFF', black: '#000000' };

/** @returns {{rgb: number[], alpha: number}|null} */
export function lireCouleur(valeur) {
  if (!valeur) return null;
  const v = MOTS[valeur.trim().toLowerCase()] ?? valeur.trim();

  const court = v.match(/^#([0-9A-Fa-f]{3})$/);
  if (court) {
    const h = court[1];
    return { rgb: [...h].map((c) => parseInt(c + c, 16)), alpha: 1 };
  }

  const long = v.match(/^#([0-9A-Fa-f]{6})$/);
  if (long) {
    return {
      rgb: [0, 2, 4].map((i) => parseInt(long[1].slice(i, i + 2), 16)),
      alpha: 1
    };
  }

  const fonction = v.match(/^rgba?\(([^)]+)\)$/);
  if (fonction) {
    const p = fonction[1].split(',').map((x) => parseFloat(x.trim()));
    if (p.length < 3 || p.some((x) => Number.isNaN(x))) return null;
    return { rgb: [p[0], p[1], p[2]], alpha: p.length > 3 ? p[3] : 1 };
  }

  return null;
}

/** Superpose une couleur translucide sur un fond opaque. */
export function composer(dessus, dessous) {
  return dessus.rgb.map((c, i) => c * dessus.alpha + dessous[i] * (1 - dessus.alpha));
}

/** Luminance relative, WCAG 2.1 */
function luminance(rgb) {
  const canal = (valeur) => {
    const c = valeur / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(rgb[0]) + 0.7152 * canal(rgb[1]) + 0.0722 * canal(rgb[2]);
}

/** @returns {number} Rapport de contraste entre deux couleurs opaques */
export function contraste(premier, second) {
  const a = luminance(premier);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* ============================================================
   Relevé des sites : chaque `color:` avec le bloc qui le porte
   ============================================================ */

/**
 * Découpe une feuille en blocs de règles, en gardant le plus INTERNE.
 *
 * Une media query est un bloc qui en contient d'autres : c'est le bloc
 * intérieur qui porte les déclarations, et c'est lui qu'il faut rendre.
 *
 * @returns {Array<{contenu: string, ligne: number}>}
 */
export function blocsDeRegles(css) {
  const blocs = [];
  const pile = [];
  let ligne = 1;

  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '\n') ligne++;
    else if (c === '{') pile.push({ debut: i + 1, ligne });
    else if (c === '}') {
      const ouvert = pile.pop();
      if (!ouvert) continue;
      const contenu = css.slice(ouvert.debut, i);
      // Un bloc qui contient une accolade est un conteneur (media query,
      // supports) : ses déclarations appartiennent à ses enfants.
      if (!contenu.includes('{')) blocs.push({ contenu, ligne: ouvert.ligne });
    }
  }
  return blocs;
}

/**
 * L'opacité déclarée par un bloc, 1 s'il n'en déclare aucune.
 *
 * Extraite pour être éprouvée sur une entrée SYNTHÉTIQUE. La garde qui la
 * couvrait exigeait qu'un site à `opacity: 0.8` existe dans les feuilles — elle
 * est tombée le jour où ce site a été corrigé, en signalant un défaut du
 * dépôt là où il n'y avait qu'une prémisse périmée. Une garde doit mesurer la
 * CAPACITÉ du contrôle, jamais l'état du code qu'il inspecte.
 *
 * @param {string} contenu - Corps d'un bloc de règles
 * @returns {number}
 */
export function opaciteDuBloc(contenu) {
  const trouve = contenu.match(/(^|[;\s])opacity:\s*([\d.]+)/);
  return trouve ? parseFloat(trouve[2]) : 1;
}

/** Numéro de ligne d'un décalage dans un texte. */
function ligneDe(texte, decalage) {
  let n = 1;
  for (let i = 0; i < decalage; i++) if (texte[i] === '\n') n++;
  return n;
}

/**
 * Tous les sites où une encre est posée, avec la surface déclarée par sa règle.
 *
 * Une encre peut être un JETON (`color: var(--success-ink)`) ou un LITTÉRAL
 * (`color: #fff`, `color: white`). Ne relever que les jetons laissait 14 sites
 * hors de portée, dont trois fautifs — et le pire du dépôt : du blanc sur
 * `--success-color`, qui rend 1,92:1 en thème sombre.
 *
 * @returns {Array<{fichier: string, ligne: number, jeton: string|null,
 *                  litteral: string|null, fondJeton: string|null,
 *                  fondLitteral: string|null, opacite: number}>}
 */
export function relever() {
  const sites = [];

  for (const fichier of FEUILLES) {
    const css = SOURCES[fichier];

    for (const bloc of blocsDeRegles(css)) {
      const fond = bloc.contenu.match(/(^|[;\s])background(?:-color)?:\s*([^;]+)/);
      const valeurFond = fond ? fond[2].trim() : null;
      const jetonFond = valeurFond?.match(/^var\(\s*--([\w-]+)\s*\)$/)?.[1] ?? null;
      // Un fond littéral opaque est une surface aussi mesurable qu'un jeton.
      // Un dégradé ou `transparent` ne renseigne pas : `lireCouleur` rend null.
      const fondLitteral = !jetonFond && valeurFond && lireCouleur(valeurFond)
        ? valeurFond
        : null;

      const opacite = opaciteDuBloc(bloc.contenu);

      // `color:` et non `border-color:`, `background-color:`, `accent-color:`…
      // Le caractère qui précède doit être un début, un point-virgule ou un
      // blanc — jamais un tiret.
      for (const m of bloc.contenu.matchAll(/(^|[;\s])color:\s*([^;}]+)/g)) {
        const brut = m[2].trim();
        const jeton = brut.match(/^var\(\s*--([\w-]+)\s*\)$/)?.[1] ?? null;
        const litteral = !jeton && lireCouleur(brut) ? brut : null;

        // `inherit`, `currentColor`, `transparent` : rien à mesurer ici.
        if (!jeton && !litteral) continue;

        sites.push({
          fichier,
          ligne: bloc.ligne + ligneDe(bloc.contenu, m.index) - 1,
          jeton,
          litteral,
          fondJeton: jetonFond,
          fondLitteral,
          opacite
        });
      }
    }
  }

  return sites;
}

/** L'étiquette d'un site dans les rapports — jeton nommé, ou littéral cité. */
export function cleDuSite(site) {
  return site.jeton ? `--${site.jeton}` : `littéral « ${site.litteral} »`;
}

/**
 * Le pire contraste d'un site, tous thèmes et toutes surfaces plausibles.
 *
 * @returns {{ratio: number, theme: string, surface: string}|null}
 */
export function pireContraste(site) {
  let pire = null;

  // Une encre LITTÉRALE sans fond déclaré n'est pas mesurable ici : `#FFFFFF`
  // rapporté aux surfaces de base rendrait 1,05:1 et signalerait un défaut là
  // où la règle pose en réalité son texte sur un fond hérité, coloré. C'est la
  // frontière exacte entre ce contrôle et celui du rendu, qui, lui, voit
  // l'ancêtre. Un jeton, lui, EST conçu pour les surfaces de base : le repli y
  // reste légitime.
  if (site.litteral && !site.fondJeton && !site.fondLitteral) return null;

  for (const theme of ['clair', 'sombre']) {
    const encreBrute = site.jeton
      ? lireCouleur(valeurDuJeton(site.jeton, theme))
      : lireCouleur(site.litteral);
    if (!encreBrute) continue;

    // La surface : celle que la règle déclare, sinon les trois de base.
    const candidates = site.fondJeton
      ? [site.fondJeton]
      : site.fondLitteral
        ? [site.fondLitteral]
        : SURFACES_DE_BASE;

    for (const nomSurface of candidates) {
      const fondBrut = site.fondLitteral === nomSurface
        ? lireCouleur(nomSurface)
        : lireCouleur(valeurDuJeton(nomSurface, theme));
      if (!fondBrut) continue;

      // Un fond translucide est une COUCHE : il se compose sur les surfaces
      // de base, et chacune donne un résultat différent.
      const bases = fondBrut.alpha < 1
        ? SURFACES_DE_BASE.map((s) => lireCouleur(valeurDuJeton(s, theme)))
            .filter(Boolean)
            .map((b) => composer(fondBrut, b.rgb))
        : [fondBrut.rgb];

      for (const fond of bases) {
        // L'opacité du bloc affaiblit l'encre exactement comme une alpha.
        const alpha = encreBrute.alpha * site.opacite;
        const encre = alpha < 1 ? composer({ rgb: encreBrute.rgb, alpha }, fond) : encreBrute.rgb;

        const ratio = contraste(encre, fond);
        if (!pire || ratio < pire.ratio) pire = { ratio, theme, surface: nomSurface };
      }
    }
  }

  return pire;
}

/* ============================================================
   Les cas
   ============================================================ */

const SITES = relever();

const DEFAUTS = SITES
  .filter((s) => !APPARIEMENTS_DE_MARQUE.has(s.jeton))
  .map((s) => ({ ...s, mesure: pireContraste(s) }))
  .filter((s) => s.mesure && s.mesure.ratio < SEUIL);

/** Les encres fautives, chacune avec ses sites — un cas par encre, pour que la
 *  sortie reste lisible quand il y en a cinquante. */
const PAR_ENCRE = [...new Set(DEFAUTS.map(cleDuSite))].sort();

describe('Le mesureur lui-même', () => {
  // Un mesureur faux validerait n'importe quoi en silence.
  it('noir sur blanc vaut 21:1', () => {
    expect(contraste([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
  });

  it('une couleur avec elle-même vaut 1:1', () => {
    expect(contraste([91, 105, 128], [91, 105, 128])).toBeCloseTo(1, 5);
  });

  it('retrouve les 3,77:1 que variables.css documente pour #059669 sur blanc', () => {
    // C'est l'étalon : cette valeur est écrite dans le dépôt, mesurée
    // indépendamment de ce fichier. S'en écarter voudrait dire que tout le
    // reste est faux.
    expect(contraste([5, 150, 105], [255, 255, 255])).toBeCloseTo(3.77, 2);
  });

  it('compose une couche translucide sur son fond', () => {
    // 50 % de noir sur blanc donne un gris moyen.
    expect(composer({ rgb: [0, 0, 0], alpha: 0.5 }, [255, 255, 255]))
      .toEqual([127.5, 127.5, 127.5]);
  });

  it('résout un alias dans le thème demandé, pas dans celui de sa déclaration', () => {
    // `--error-color: var(--danger-color)` n'est déclaré qu'en thème clair.
    // En sombre, la cascade donne pourtant le rouge SOMBRE. Une résolution
    // naïve rendrait #DC2626 et inventerait un défaut.
    expect(valeurDuJeton('error-color', 'sombre')).toBe(valeurDuJeton('danger-color', 'sombre'));
    expect(valeurDuJeton('error-color', 'sombre')).not.toBe(valeurDuJeton('danger-color', 'clair'));
  });

  it('ne confond pas `color` avec `border-color` ni `background-color`', () => {
    const blocs = blocsDeRegles('.a { border-color: var(--x); background-color: var(--y); color: var(--z); }');
    const trouves = [...blocs[0].contenu.matchAll(/(^|[;\s])color:\s*var\(\s*--([\w-]+)\s*\)/g)].map((m) => m[2]);
    expect(trouves).toEqual(['z']);
  });
});

describe('Le relevé', () => {
  it('trouve des sites dans chaque feuille qui en porte', () => {
    // Un relevé vide rendrait tous les cas suivants verts sans rien mesurer :
    // c'est le mode de panne le plus dangereux de ce fichier.
    expect(SITES.length).toBeGreaterThan(200);
  });

  it('lit la surface que la règle déclare, quand elle en déclare une', () => {
    // `.offline-banner` pose `--on-warning` sur `background: var(--warning-color)`.
    // Sans cette lecture, l'encre serait rapportée à 1,11:1 contre une surface
    // sur laquelle elle n'est jamais posée.
    const banniere = SITES.find((s) => s.jeton === 'on-warning');
    expect(banniere, 'le site --on-warning doit être relevé').toBeDefined();
    expect(banniere.fondJeton).toBe('warning-color');
  });

  it('lit l\'opacité d\'un bloc, sur une entrée synthétique', () => {
    // La version précédente de cette garde exigeait qu'un site à
    // `opacity: 0.8` existe dans les feuilles — c'était `.charge-location`.
    // Elle est tombée le jour où ce site a été corrigé, en signalant un défaut
    // là où il n'y avait qu'une prémisse périmée. Une garde doit mesurer la
    // CAPACITÉ du contrôle, jamais l'état du code qu'il inspecte.
    expect(opaciteDuBloc('color: red; opacity: 0.75;')).toBe(0.75);
    expect(opaciteDuBloc('color: red;')).toBe(1);
    // Et ne confond pas une opacité avec la fin d'un autre nom.
    expect(opaciteDuBloc('--mon-opacity: 0.3;')).toBe(1);
  });

  it('APPLIQUE l\'opacité à l\'encre, et ne fait pas que la relever', () => {
    // Sans ce cas, `opaciteDuBloc` pourrait être juste et son résultat jeté :
    // le relevé serait exact et la mesure fausse.
    const nu = {
      jeton: 'text-secondary', litteral: null,
      fondJeton: null, fondLitteral: null, opacite: 1
    };
    expect(pireContraste({ ...nu, opacite: 0.5 }).ratio)
      .toBeLessThan(pireContraste(nu).ratio);
  });

  it('relève les encres LITTÉRALES, et les mesure sur le fond déclaré', () => {
    // Le contrôle n'a longtemps lu que `color: var(...)`. Les 14 sites écrits
    // en clair lui échappaient — dont du blanc sur `--success-color`, qui rend
    // 1,92:1 en thème sombre, le pire du dépôt.
    const litteraux = SITES.filter((s) => s.litteral);
    expect(litteraux.length, 'les encres littérales doivent être relevées')
      .toBeGreaterThanOrEqual(10);

    const surJeton = litteraux.filter((s) => s.fondJeton);
    expect(surJeton.length, 'et celles posées sur un fond nommé doivent être mesurables')
      .toBeGreaterThan(0);
    expect(pireContraste(surJeton[0])).not.toBeNull();
  });

  it('ne mesure PAS une encre littérale dont le fond est hérité', () => {
    // `summary.css:325` pose `color: #FFFFFF` sans déclarer de fond : le fond
    // vient de l'ancêtre. Rapporter ce site aux surfaces de base rendrait
    // 1,05:1 et signalerait un défaut qui n'existe pas. C'est la frontière
    // avec le contrôle de rendu, qui, lui, voit l'ancêtre.
    const herite = SITES.find((s) => s.litteral && !s.fondJeton && !s.fondLitteral);
    expect(herite, 'un tel site doit exister dans ces feuilles').toBeDefined();
    expect(pireContraste(herite), 'et ne doit pas être mesuré ici').toBeNull();
  });

  it('mesure une encre littérale sur un fond littéral', () => {
    // `responsive.css` : `background: white; color: black` dans le même bloc.
    const impression = SITES.find((s) => s.litteral && s.fondLitteral);
    expect(impression, 'le bloc d\'impression doit être relevé').toBeDefined();
    expect(pireContraste(impression).ratio).toBeGreaterThan(15);
  });
});

describe('Aucune encre posée sous le seuil AA', () => {
  /**
   * Un cas par jeton fautif. Le message nomme le rapport mesuré, le thème et
   * la surface, puis TOUS les sites à reprendre : c'est ce qui rend le
   * correctif mécanique plutôt que fouillé à la main.
   */
  if (PAR_ENCRE.length === 0) {
    it('aucune encre ne tombe sous 4,5:1', () => {
      expect(DEFAUTS).toEqual([]);
    });
  }

  for (const encre of PAR_ENCRE) {
    const sites = DEFAUTS.filter((d) => cleDuSite(d) === encre);
    const pire = sites.reduce((a, b) => (a.mesure.ratio <= b.mesure.ratio ? a : b));

    it(`${encre} tient le seuil partout où il est posé (${sites.length} site${sites.length > 1 ? 's' : ''})`, () => {
      const detail = sites
        .map((s) => `    ${s.fichier}:${s.ligne}  →  ${s.mesure.ratio.toFixed(2)}:1 `
          + `(thème ${s.mesure.theme}, sur ${s.mesure.surface.startsWith('#') || s.mesure.surface.includes('(')
            ? s.mesure.surface : '--' + s.mesure.surface}`
          + `${s.opacite !== 1 ? `, opacity ${s.opacite}` : ''})`)
        .join('\n');

      expect(
        pire.mesure.ratio,
        `\n\n  ${encre} : ${pire.mesure.ratio.toFixed(2)}:1 au pire, seuil ${SEUIL}\n`
        + `  ${sites.length} site${sites.length > 1 ? 's' : ''} à reprendre :\n${detail}\n`
      ).toBeGreaterThanOrEqual(SEUIL);
    });
  }
});
