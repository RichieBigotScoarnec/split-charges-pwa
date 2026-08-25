import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Le raccourci déclaré par le manifeste
 *
 * Un appui long sur l'icône de l'application ouvre un menu contextuel :
 * Android le construit à partir du membre `shortcuts`. C'est ce qu'une PWA
 * peut offrir de plus proche d'un widget — lequel exige un
 * `AppWidgetProvider`, donc une application native.
 *
 * Trois choses peuvent le casser en silence : une URL qui ne mène nulle part,
 * une icône déclarée et absente, ou un paramètre que l'application ne sait pas
 * lire.
 */

const RACINE = process.cwd();
const manifeste = JSON.parse(readFileSync(resolve(RACINE, 'public/manifest.json'), 'utf8'));

describe('Le raccourci de saisie rapide', () => {
  const raccourci = (manifeste.shortcuts || [])[0];

  it('est déclaré', () => {
    expect(manifeste.shortcuts, 'aucun raccourci déclaré').toBeInstanceOf(Array);
    expect(raccourci?.name).toBe('Saisie rapide');
  });

  it('mène à une page qui existe, avec le paramètre que l\'application lit', () => {
    expect(raccourci.url).toContain('action=quick-add');

    const page = raccourci.url.split('?')[0].replace(/^\.?\//, '');
    expect(existsSync(resolve(RACINE, 'public', page)), `${page} n'existe pas`).toBe(true);
  });

  it('reste dans la portée du manifeste', () => {
    // Hors portée, Android ouvrirait un navigateur au lieu de l'application.
    expect(raccourci.url.startsWith('./')).toBe(true);
  });

  it('porte des icônes qui existent', () => {
    expect(raccourci.icons.length).toBeGreaterThan(0);

    for (const icone of raccourci.icons) {
      const chemin = resolve(RACINE, 'public', icone.src.replace(/^\.?\//, ''));
      expect(existsSync(chemin), `${icone.src} est déclarée et absente`).toBe(true);
    }
  });

  it('déclare la taille qu\'Android réclame', () => {
    expect(raccourci.icons.map(i => i.sizes)).toContain('96x96');
  });
});

describe('Le comportement au lancement', () => {
  it('une seule fenêtre, quel que soit le chemin d\'ouverture', () => {
    // Sans cela, le raccourci peut ouvrir un second exemplaire à côté de celui
    // qui tourne déjà — deux vues de la même base, dont une périmée.
    expect(manifeste.launch_handler?.client_mode).toBe('focus-existing');
  });
});

describe('Les icônes du raccourci sont précachées', () => {
  it('elles sont dans STATIC_ASSETS', () => {
    // Sinon l'appui long propose une icône que l'appareil n'a pas hors ligne.
    const sw = readFileSync(resolve(RACINE, 'public/sw.js'), 'utf8');

    for (const icone of (manifeste.shortcuts[0].icons || [])) {
      expect(sw, `${icone.src} manque au précache`).toContain(icone.src);
    }
  });
});
