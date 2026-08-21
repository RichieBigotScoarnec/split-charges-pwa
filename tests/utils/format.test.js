// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatCurrencyShort,
  formatPercentage,
  formatNumber,
  parseCurrency,
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

// ===== formatCurrencyShort =====
describe('formatCurrencyShort', () => {
  it('sous 1000 : affiche les décimales', () => {
    const result = formatCurrencyShort(500);
    expect(result).toMatch(/500/);
    expect(result).toMatch(/€/);
  });

  it('au-dessus de 1000 : pas de décimales', () => {
    const result = formatCurrencyShort(1500);
    expect(result).not.toMatch(/,00/);
    expect(result).toMatch(/1\s?500/);
  });

  it('exactement 1000 : pas de décimales', () => {
    const result = formatCurrencyShort(1000);
    expect(result).not.toMatch(/,00/);
  });

  it('999.99 : affiche les décimales', () => {
    const result = formatCurrencyShort(999.99);
    expect(result).toMatch(/999/);
  });

  it('-1500 : pas de décimales', () => {
    const result = formatCurrencyShort(-1500);
    expect(result).not.toMatch(/,00/);
  });
});

// ===== formatPercentage =====
describe('formatPercentage', () => {
  it('valeur 0-100 par défaut', () => {
    expect(formatPercentage(60)).toBe('60.0%');
  });

  it('valeur décimale 0-1 avec isDecimal=true', () => {
    expect(formatPercentage(0.6, true)).toBe('60.0%');
  });

  it('0%', () => {
    expect(formatPercentage(0)).toBe('0.0%');
  });

  it('100%', () => {
    expect(formatPercentage(100)).toBe('100.0%');
  });

  it('valeur décimale avec arrondi', () => {
    expect(formatPercentage(33.33)).toBe('33.3%');
  });

  it('0.5 decimal = 50%', () => {
    expect(formatPercentage(0.5, true)).toBe('50.0%');
  });
});

// ===== formatNumber =====
describe('formatNumber', () => {
  it('formate avec 2 décimales par défaut', () => {
    const result = formatNumber(1234.567);
    expect(result).toMatch(/1\s?234/);
    expect(result).toMatch(/57/); // arrondi
  });

  it('formate avec 0 décimales', () => {
    const result = formatNumber(1234.7, 0);
    expect(result).toMatch(/1\s?235/); // arrondi
  });

  it('null retourne 0', () => {
    expect(formatNumber(null)).toMatch(/0/);
  });

  it('formate 0', () => {
    expect(formatNumber(0)).toMatch(/0/);
  });
});

// ===== parseCurrency =====
describe('parseCurrency', () => {
  it('parse un nombre directement', () => {
    expect(parseCurrency(150)).toBe(150);
  });

  it('parse une chaîne simple', () => {
    expect(parseCurrency('150.99')).toBeCloseTo(150.99);
  });

  it('parse avec virgule française', () => {
    expect(parseCurrency('150,99')).toBeCloseTo(150.99);
  });

  it('parse avec symbole €', () => {
    expect(parseCurrency('150 €')).toBeCloseTo(150);
  });

  it('null retourne 0', () => {
    expect(parseCurrency(null)).toBe(0);
  });

  it('chaîne vide retourne 0', () => {
    expect(parseCurrency('')).toBe(0);
  });

  it('chaîne non numérique retourne 0', () => {
    expect(parseCurrency('abc')).toBe(0);
  });

  it('parse un montant formaté fr-FR', () => {
    // "1 234,50 €" → 1234.50
    const result = parseCurrency('1 234,50 €');
    // Retire €, espaces, remplace , par .
    // "1234.50" → 1234.5
    expect(result).toBeCloseTo(1234.5, 1);
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
