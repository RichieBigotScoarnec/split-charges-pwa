import { describe, it, expect } from 'vitest';
import {
  relevesDesConfirmations, porteDesOptions
} from '../tools/confirmations-explicites.mjs';

/**
 * Aucune confirmation ne retombe sur le défaut
 *
 * Le défaut de `showConfirmModal` est NEUTRE depuis le 2026-09-18 : un appel
 * qui n'en dit rien affiche « Confirmer » en primaire. C'est la moins mauvaise
 * des deux erreurs — une information manquante plutôt qu'un faux « Supprimer »
 * en rouge — mais ça reste une erreur, et un paramètre s'oublie.
 *
 * CE CONTRÔLE NE JUGE PAS LE LIBELLÉ. « Créer » posé sur une suppression lui
 * conviendrait : aucun contrôle statique ne sait ce qu'une fonction détruit.
 * Il tient ce qui se vérifie sans arbitrer — **chaque appel dit quelque
 * chose**. Le juste libellé est l'affaire de la relecture ; l'oubli, non, parce
 * qu'il ne se voit nulle part à l'écran : un bouton neutre sur une suppression
 * ressemble à un bouton.
 *
 * Même forme que `adherences-declarees` : un outil de `tools/` fait la mesure
 * et se joue aussi à la main, le contrôle en lit le relevé.
 *
 *   node tools/confirmations-explicites.mjs
 */

const releves = relevesDesConfirmations();

describe('Toute confirmation nomme son action', () => {
  it('PRÉMISSE : le relevé trouve des appels', () => {
    // Un balayage qui ne trouve rien satisferait « aucun appel muet » sans
    // avoir rien mesuré — la première réponse condamnante de la règle 1. On
    // borne, on ne fige pas un compte : exiger 11 rougirait au premier appel
    // ajouté, et on apprendrait à corriger le chiffre sans le regarder.
    expect(releves.length).toBeGreaterThan(5);
  });

  it('aucun appel ne retombe sur le défaut', () => {
    const muets = releves.filter(r => !r.options).map(r => `${r.fichier}:${r.ligne}`);

    expect(muets, `appels sans libellé ni ton : ${muets.join(', ')}`).toEqual([]);
  });

  describe('TÉMOINS — le scanner sait séparer les deux cas', () => {
    // Nourris d'entrées FABRIQUÉES et non d'exemplaires trouvés : ce qu'on veut
    // prouver est que l'instrument mesure, et le dépôt n'a pas à conserver un
    // appel fautif dans son code pour que l'instrument reste vérifiable.
    const lire = (source) => porteDesOptions(source, source.indexOf('showConfirmModal(') + 'showConfirmModal'.length);

    it.each([
      ['un message simple', "showConfirmModal('Supprimer ?');"],
      ['un gabarit', 'showConfirmModal(`Supprimer « ${nom} » ?`);'],
      ['un gabarit qui porte des parenthèses ET une virgule DANS la chaîne',
        'showConfirmModal(`Supprimer « ${d} » (${format(m, 2)}) ?`);'],
      ['une concaténation sur deux lignes',
        "showConfirmModal(\n  'Supprimer ' +\n  '« Loyer » ?'\n);"],
      ['un appel imbriqué en seul argument', 'showConfirmModal(question(plan, format));'],
      // ⚠️ LES DEUX SUIVANTS SONT CEUX QUI ONT MANQUÉ. Retirer les options
      // d'un appel laisse la virgule de la ligne d'avant, et la garde
      // répondait « ok » sur un appel à UN seul argument : le mutant du
      // 2026-09-18 n'a pas fait tomber le contrôle, et c'est le contrôle
      // qu'il fallait interroger.
      ['une virgule finale, sans rien derrière', "showConfirmModal('Supprimer ?',);"],
      ['une virgule finale suivie d\'un commentaire',
        "showConfirmModal(\n  'Supprimer ?',\n  // options oubliées\n);"]
    ])('MUET : %s', (_nom, source) => {
      expect(lire(source)).toBe(false);
    });

    it.each([
      ['options sur la même ligne', "showConfirmModal('Supprimer ?', { libelle: 'Supprimer' });"],
      ['options après un gabarit à parenthèses',
        "showConfirmModal(`Supprimer « ${d} » (${format(m)}) ?`, { ton: TON.DESTRUCTIF });"],
      ['options après un appel imbriqué',
        "showConfirmModal(question(plan, format), { libelle: 'Reconduire' });"],
      ['options sur leur propre ligne',
        "showConfirmModal(\n  'Restaurer ?',\n  { libelle: 'Restaurer', ton: TON.DESTRUCTIF }\n);"],
      ['options après un objet en premier argument',
        "showConfirmModal(questionDeBascule({ a: 1, b: 2 }), { libelle: 'Déplacer' });"]
    ])('NOMMÉ : %s', (_nom, source) => {
      expect(lire(source)).toBe(true);
    });

    it('un commentaire entre les arguments ne fabrique pas de virgule', () => {
      expect(lire("showConfirmModal('Supprimer ?' /* , pas une option */);")).toBe(false);
    });
  });

  it('la déclaration elle-même est écartée du relevé', () => {
    // `components/modal.js` DÉCLARE la fonction ; l'y compter donnerait un
    // appel muet permanent que personne ne pourrait corriger.
    expect(releves.map(r => r.fichier).filter(f => f.includes('components/modal.js'))).toEqual([]);
  });
});
