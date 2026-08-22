// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  escapeHtml,
  formatPaidBy
} from '../../public/js/utils/format.js';

// ===== formatCurrency =====
describe('formatCurrency', () => {
  it('formate un entier', () => {
    expect(formatCurrency(100)).toMatch(/100/);
    expect(formatCurrency(100)).toMatch(/€/);
  });

  it('formate un nombre décimal', () => {
    const result = formatCurrency(1234.5);
    expect(result).toMatch(/1\s?234/);  // séparateur milliers fr-FR
    expect(result).toMatch(/50/);       // centimes
  });

  it('formate zéro', () => {
    expect(formatCurrency(0)).toMatch(/0/);
    expect(formatCurrency(0)).toMatch(/€/);
  });

  it('null retourne 0 €', () => {
    const result = formatCurrency(null);
    expect(result).toMatch(/0/);
    expect(result).toMatch(/€/);
  });

  it('undefined retourne 0 €', () => {
    expect(formatCurrency(undefined)).toMatch(/0/);
  });

  it('formate les montants négatifs', () => {
    expect(formatCurrency(-50)).toMatch(/-/);
    expect(formatCurrency(-50)).toMatch(/50/);
  });

  it('formate les grands montants', () => {
    const result = formatCurrency(10000);
    expect(result).toMatch(/10/);
    expect(result).toMatch(/€/);
  });
});

// ===== escapeHtml =====
describe('escapeHtml', () => {
  it('chaîne vide retourne chaîne vide', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('null retourne chaîne vide', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('undefined retourne chaîne vide', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('échappe les balises HTML', () => {
    const result = escapeHtml('<script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('échappe les guillemets doubles', () => {
    // La moitié des appelants injectent en contexte d'attribut
    // (aria-label="Modifier ${escapeHtml(description)}") : un guillemet non
    // échappé y refermait l'attribut et en ouvrait d'autres sur la balise.
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('échappe les apostrophes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('neutralise une sortie de contexte d\'attribut', () => {
    const charge = 'x" onfocus=alert(1) autofocus="';
    const html = `<button aria-label="Modifier ${escapeHtml(charge)}"></button>`;
    const hote = document.createElement('div');
    hote.innerHTML = html;

    const bouton = hote.querySelector('button');
    expect(bouton.hasAttribute('onfocus')).toBe(false);
    expect(bouton.hasAttribute('autofocus')).toBe(false);
    expect(bouton.getAttribute('aria-label')).toBe(`Modifier ${charge}`);
  });

  it('zéro et false ne deviennent pas une chaîne vide', () => {
    // La garde portait sur la fausseté, pas sur l'absence : un montant à 0
    // disparaissait de l'affichage.
    expect(escapeHtml(0)).toBe('0');
    expect(escapeHtml(false)).toBe('false');
  });

  it('échappe le &', () => {
    const result = escapeHtml('AT&T');
    expect(result).toContain('&amp;');
  });

  it('laisse le texte normal intact', () => {
    expect(escapeHtml('Bonjour monde')).toBe('Bonjour monde');
  });

  it('laisse les chiffres intacts', () => {
    expect(escapeHtml('1234.56')).toBe('1234.56');
  });

  it('échappe les chevrons', () => {
    expect(escapeHtml('3 > 2')).toContain('&gt;');
    expect(escapeHtml('1 < 2')).toContain('&lt;');
  });
});

// ===== formatPaidBy =====
describe('formatPaidBy', () => {
  it('vous', () => {
    expect(formatPaidBy('vous')).toBe('Vous');
  });

  it('conjointe', () => {
    expect(formatPaidBy('conjointe')).toBe('Conjointe');
  });

  it('partage', () => {
    expect(formatPaidBy('partage')).toBe('Partagé');
  });

  it('joint (alias)', () => {
    expect(formatPaidBy('joint')).toBe('Partagé');
  });

  it('null retourne Inconnu', () => {
    expect(formatPaidBy(null)).toBe('Inconnu');
  });

  it('undefined retourne Inconnu', () => {
    expect(formatPaidBy(undefined)).toBe('Inconnu');
  });

  it('valeur inconnue retournée telle quelle', () => {
    expect(formatPaidBy('autre')).toBe('autre');
  });
});
