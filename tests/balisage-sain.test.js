// @vitest-environment jsdom
/**
 * Le balisage de la page ne fuit pas, et la garde s'y trouve vraiment
 *
 * Un commentaire mal fermé a suffi. En ajoutant la garde anti-encadrement,
 * j'ai laissé un `-->` orphelin au milieu du bloc : trois lignes de
 * commentaire se sont retrouvées hors commentaire, et l'une d'elles contenait
 * le mot `<script>` entre guillemets obliques.
 *
 * Deux conséquences, et la seconde est la pire :
 *
 * 1. « Fichier externe, et non balise ` » s'affichait en haut de l'écran, au
 *    dessus de tout, sur le téléphone du foyer.
 * 2. Ce `<script>` cité **ouvrait un vrai élément script**. Tout ce qui
 *    suivait — y compris `<script src="js/anti-cadre.js">` — devenait son
 *    contenu, jusqu'au premier `</script>`. La garde n'était donc jamais
 *    chargée : elle était inerte, tout en paraissant posée dans le fichier.
 *
 * Le premier défaut se voit. Le second, non — et c'est celui qui comptait.
 * D'où ce test : il lit la page avec un analyseur HTML réel, et non une
 * expression régulière, parce que c'est précisément l'analyseur qui voyait
 * autre chose que ce que le fichier avait l'air de dire.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

// `import.meta.url` est réécrit par Vite en environnement jsdom (`/@fs/…`) :
// le résoudre donnait un chemin inexistant. `process.cwd()` est la racine du
// dépôt, d'où vitest est lancé.
function pageAnalysee(nom) {
  return new JSDOM(readFileSync(join(process.cwd(), 'public', nom), 'utf-8')).window.document;
}

describe('FairSplit.html — le balisage dit ce qu\'il a l\'air de dire', () => {
  const doc = pageAnalysee('FairSplit.html');

  it('aucun texte nu ne traîne dans le <head>', () => {
    const texteNu = [...doc.head.childNodes]
      .filter(noeud => noeud.nodeType === 3)
      .map(noeud => noeud.textContent.trim())
      .filter(Boolean);

    expect(texteNu).toEqual([]);
  });

  it('aucun texte nu n\'est enfant direct du <body>', () => {
    // Le contrôle qui aurait vu le défaut le plus tôt, et par lequel il s'est
    // vu en vrai : tout en haut de l'écran, sur un téléphone.
    //
    // Un commentaire mal fermé ne laisse pas son texte dans le `<head>` : le
    // navigateur — et jsdom avec lui — le déplace en tête du `<body>`, où il
    // s'affiche au-dessus de toute l'application. Mesuré sur le balisage
    // fautif : un unique nœud texte, « Fichier externe, et non balise ` ».
    //
    // Toute la page est faite d'éléments : un texte posé directement sous
    // `<body>` n'a aucune raison d'exister, et signale une balise ou un
    // commentaire qui ne se ferme pas là où on le croit.
    const texteNu = [...doc.body.childNodes]
      .filter(noeud => noeud.nodeType === 3)
      .map(noeud => noeud.textContent.trim())
      .filter(Boolean);

    expect(texteNu).toEqual([]);
  });

  it('la garde anti-encadrement est un vrai script du <head>', () => {
    const scripts = [...doc.head.querySelectorAll('script[src]')]
      .map(script => script.getAttribute('src'));

    expect(scripts).toContain('js/anti-cadre.js');
  });

  it('la garde précède la première feuille de style', () => {
    // Tout son intérêt : s'exécuter avant le premier pixel. Placée après une
    // feuille de style, elle laisserait le temps d'un rendu.
    const enfants = [...doc.head.children];
    const rangGarde = enfants.findIndex(el =>
      el.tagName === 'SCRIPT' && el.getAttribute('src') === 'js/anti-cadre.js');
    const rangStyle = enfants.findIndex(el =>
      el.tagName === 'LINK' && el.getAttribute('rel') === 'stylesheet');

    expect(rangGarde).toBeGreaterThanOrEqual(0);
    expect(rangStyle).toBeGreaterThanOrEqual(0);
    expect(rangGarde).toBeLessThan(rangStyle);
  });

  it('la garde n\'est pas différée : elle ne porte ni defer ni type=module', () => {
    const garde = doc.head.querySelector('script[src="js/anti-cadre.js"]');
    expect(garde.hasAttribute('defer')).toBe(false);
    expect(garde.hasAttribute('async')).toBe(false);
    expect(garde.getAttribute('type')).not.toBe('module');
  });

  it('aucun script en ligne : la CSP se passe d\'unsafe-inline', () => {
    const enLigne = [...doc.querySelectorAll('script:not([src])')]
      .filter(script => script.textContent.trim());

    expect(enLigne.map(s => s.textContent.trim().slice(0, 60))).toEqual([]);
  });

  it('la politique de sécurité est DANS le <head>, où elle s\'applique', () => {
    // Le pire effet du `-->` orphelin, et le plus discret.
    //
    // Du texte nu en tête ferme `<head>` et ouvre `<body>` : tout ce qui suit
    // y bascule, la balise de politique comprise. Or une politique posée dans
    // `<body>` est purement ignorée — mesuré sous Chromium : le même script
    // inline est bloqué quand la balise est en tête, et s'exécute quand elle a
    // glissé dans le corps.
    //
    // Le site a donc tourné sans aucune politique de sécurité, sans que rien
    // ne le signale : la balise était bien dans le fichier, et l'onglet
    // Éléments la montrait — dans le corps.
    const meta = doc.querySelector('meta[http-equiv="Content-Security-Policy"]');

    expect(meta).not.toBeNull();
    expect(doc.head.contains(meta)).toBe(true);
  });

  it('les origines locales de connect-src vont de pair avec la garde d\'hôte', () => {
    // Deux décisions qui ne tiennent qu'ensemble.
    //
    // `?emulator=1` détourne la base et l'authentification vers localhost. Les
    // origines locales doivent donc figurer dans `connect-src`, sinon les
    // tests d'intégration et le développement local ne fonctionnent plus —
    // une balise meta ne sait pas être conditionnelle.
    //
    // Ce qui rend cela acceptable en production, ce n'est pas la politique,
    // c'est que `USE_EMULATOR` exige un hôte local : sur github.io,
    // l'application n'ouvre aucune connexion locale, quoi que la politique
    // autorise. Retirer cette garde sans retirer les origines rouvrirait le
    // lien piégé — d'où ce test, qui refuse de laisser l'une sans l'autre.
    const csp = doc.querySelector('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    const connectSrc = csp.split(';').map(d => d.trim()).find(d => d.startsWith('connect-src'));
    const autoriseLocal = connectSrc.includes('http://localhost:*');

    const config = readFileSync(join(process.cwd(), 'public', 'js', 'config.js'), 'utf-8');
    const gardeDHote = /HOTE_LOCAL\s*=\s*\/\^\(localhost/.test(config)
      && /USE_EMULATOR[\s\S]{0,200}HOTE_LOCAL\.test\(location\.hostname\)/.test(config);

    expect(autoriseLocal).toBe(gardeDHote);

    // Et elles ne doivent jamais déborder de `connect-src` : un script ou un
    // cadre servi depuis localhost n'a aucune raison d'être.
    for (const directive of ['script-src', 'style-src', 'frame-src', 'img-src']) {
      const valeur = csp.split(';').map(d => d.trim()).find(d => d.startsWith(directive));
      expect(valeur).not.toContain('localhost');
      expect(valeur).not.toContain('127.0.0.1');
    }
  });

  it('aucun commentaire ne cite une balise exécutable', () => {
    // La mine qui a explosé, et qu'on désamorce à la source.
    //
    // Un commentaire qui contient le mot `script` entre chevrons est inoffensif
    // tant qu'il est bien fermé — et devient un vrai élément à la seconde où un
    // `-->` se place un caractère trop tôt. Le coût d'écrire « balise de
    // script » au lieu de la citer est nul ; le coût de l'oubli s'est mesuré
    // sur un téléphone.
    //
    // Contrôle sur le texte brut, et non sur l'arbre : une fois analysé, il est
    // trop tard pour distinguer le commentaire de ce qu'il a laissé échapper.
    const source = readFileSync(join(process.cwd(), 'public', 'FairSplit.html'), 'utf-8');
    const commentaires = [...source.matchAll(/<!--([\s\S]*?)-->/g)].map(m => m[1]);

    expect(commentaires.length).toBeGreaterThan(20);

    const mines = commentaires.flatMap(contenu =>
      [...contenu.matchAll(/<\s*(script|iframe|object|embed|style)\b/gi)].map(m => m[0]));

    expect(mines).toEqual([]);
  });

  it('aucun gestionnaire on* dans le balisage', () => {
    // Même raison : la CSP les bloquerait, donc un bouton qui en porterait un
    // serait mort sans que rien ne le dise.
    const avecGestionnaire = [...doc.querySelectorAll('*')].filter(el =>
      [...el.attributes].some(attr => /^on[a-z]+$/i.test(attr.name)));

    expect(avecGestionnaire.map(el => el.tagName)).toEqual([]);
  });
});

describe('index.html — la page de redirection reste sans script', () => {
  const doc = pageAnalysee('index.html');

  it('aucun texte nu dans le <head>', () => {
    const texteNu = [...doc.head.childNodes]
      .filter(noeud => noeud.nodeType === 3)
      .map(noeud => noeud.textContent.trim())
      .filter(Boolean);

    expect(texteNu).toEqual([]);
  });

  it('aucun script du tout — c\'est ce qui lui permet sa politique stricte', () => {
    expect(doc.querySelectorAll('script')).toHaveLength(0);
  });
});
