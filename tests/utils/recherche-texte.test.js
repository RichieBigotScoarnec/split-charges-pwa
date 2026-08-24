import { describe, it, expect } from 'vitest';
import { plier, contient } from '../../public/js/utils/recherche-texte.js';

/**
 * Chercher sans les accents
 *
 * La recherche comparait `champ.toLowerCase().includes(requete.toLowerCase())`,
 * ce qui en français revient à exiger les accents. Sur un clavier de téléphone
 * l'accent demande un appui long, que personne ne fait pour chercher :
 * l'application répondait « 0 résultat » sur des charges bien présentes — ce
 * qui se lit comme une donnée perdue.
 */

describe('Le pliage d\'un texte', () => {
  it('retire les accents du français', () => {
    expect(plier('Intermarché')).toBe('intermarche');
    expect(plier('Électricité')).toBe('electricite');
    expect(plier('Crèche')).toBe('creche');
    expect(plier('Noël')).toBe('noel');
    expect(plier('Déjà vu')).toBe('deja vu');
  });

  it('conserve la longueur, pour qu\'un surlignage retombe sur ses indices', () => {
    expect(plier('Café')).toHaveLength('Café'.length);
  });

  it('ne lève sur aucune valeur inexploitable', () => {
    expect(plier(null)).toBe('');
    expect(plier(undefined)).toBe('');
    expect(plier(42)).toBe('');
  });
});

describe('La correspondance à l\'usage', () => {
  it('trouve ce que le doigt sait taper', () => {
    // Les cinq cas relevés à la revue, mesurés en échec avant correction.
    expect(contient('Courses Intermarché', 'intermarche')).toBe(true);
    expect(contient('Électricité', 'electricite')).toBe(true);
    expect(contient('Crèche', 'creche')).toBe(true);
    expect(contient('Café de la Gare', 'cafe')).toBe(true);
    expect(contient('Restaurant crêperie', 'creperie')).toBe(true);
  });

  it('trouve aussi quand l\'accent est bien tapé', () => {
    // Le correctif ne doit rien retirer : la saisie accentuée marchait déjà.
    expect(contient('Intermarché', 'Intermarché')).toBe(true);
    expect(contient('Café de la Gare', 'café')).toBe(true);
  });

  it('reste insensible à la casse', () => {
    expect(contient('LOYER', 'loyer')).toBe(true);
    expect(contient('loyer', 'LOYER')).toBe(true);
  });

  it('ne rend pas tout sur une requête vide', () => {
    // `includes('')` est toujours vrai : la liste entière remonterait dès que
    // le champ est effacé.
    expect(contient('Loyer', '')).toBe(false);
    expect(contient('Loyer', '   ')).toBe(false);
  });

  it('ne trouve pas ce qui n\'y est pas', () => {
    expect(contient('Loyer', 'essence')).toBe(false);
    expect(contient(null, 'loyer')).toBe(false);
  });
});
