import { describe, it, expect } from 'vitest';
import { decrireLieu } from '../../public/js/utils/lieu.js';

/**
 * Les réponses ci-dessous reprennent la forme réelle de Nominatim `/reverse`
 * avec `addressdetails=1` : le nom du lieu sous la clé de sa classe, la voie et
 * le numéro séparés, le code postal à part de la commune.
 */

describe('decrireLieu', () => {
  it('nomme le lieu, sa rue et sa commune', () => {
    // Le cas signalé : « Brioche Dorée » seul ne dit pas laquelle.
    const lieu = decrireLieu({
      name: 'Brioche Dorée',
      type: 'bakery',
      display_name: 'Brioche Dorée, 12, Rue Le Bastard, Rennes, 35000, France',
      address: {
        shop: 'Brioche Dorée',
        house_number: '12',
        road: 'Rue Le Bastard',
        city: 'Rennes',
        postcode: '35000'
      }
    });

    expect(lieu.etiquette).toBe('Brioche Dorée, 12 Rue Le Bastard, 35000 Rennes');
    expect(lieu.etiquetteCourte).toBe('Brioche Dorée, 35000 Rennes');
    expect(lieu.commune).toBe('Rennes');
    expect(lieu.codePostal).toBe('35000');
  });

  it('distingue deux enseignes de même nom par leur adresse', () => {
    const premiere = decrireLieu({
      name: 'Brioche Dorée',
      address: { road: 'Rue Le Bastard', city: 'Rennes', postcode: '35000' }
    });
    const seconde = decrireLieu({
      name: 'Brioche Dorée',
      address: { road: 'Avenue Jean Jaurès', city: 'Nantes', postcode: '44000' }
    });

    expect(premiere.etiquette).not.toBe(seconde.etiquette);
    expect(premiere.etiquetteCourte).not.toBe(seconde.etiquetteCourte);
  });

  it('lit le nom sous la clé de la classe du lieu', () => {
    // Nominatim ne remplit pas toujours `name` à la racine.
    const lieu = decrireLieu({
      address: { amenity: 'Le Petit Bistrot', road: 'Rue de la Paix', city: 'Rennes', postcode: '35000' }
    });

    expect(lieu.nom).toBe('Le Petit Bistrot');
    expect(lieu.etiquette).toBe('Le Petit Bistrot, Rue de la Paix, 35000 Rennes');
  });

  it('se contente de l\'adresse quand le lieu n\'a pas de nom', () => {
    const lieu = decrireLieu({
      address: { house_number: '5', road: 'Rue des Lilas', town: 'Vitré', postcode: '35500' }
    });

    expect(lieu.nom).toBe('');
    expect(lieu.etiquette).toBe('5 Rue des Lilas, 35500 Vitré');
    expect(lieu.etiquetteCourte).toBe('5 Rue des Lilas, 35500 Vitré');
  });

  it('accepte une commune rurale sans city ni town', () => {
    const lieu = decrireLieu({
      name: 'Boulangerie du Bourg',
      address: { village: 'Saint-Didier', postcode: '35220' }
    });

    expect(lieu.commune).toBe('Saint-Didier');
    expect(lieu.etiquette).toBe('Boulangerie du Bourg, 35220 Saint-Didier');
  });

  it('ne répète pas la rue quand elle porte le nom du lieu', () => {
    const lieu = decrireLieu({
      name: 'Rue du Marché',
      address: { road: 'Rue du Marché', city: 'Rennes', postcode: '35000' }
    });

    expect(lieu.etiquette).toBe('Rue du Marché, 35000 Rennes');
  });

  it('garde la commune même sans code postal', () => {
    const lieu = decrireLieu({
      name: 'Chez Paul',
      address: { city: 'Rennes' }
    });

    expect(lieu.ville).toBe('Rennes');
    expect(lieu.etiquette).toBe('Chez Paul, Rennes');
  });

  it('garde le nom seul quand rien d\'autre n\'est connu', () => {
    // Repli honnête : c'est l'ancien comportement, il reste juste quand la
    // réponse ne porte effectivement rien de plus.
    const lieu = decrireLieu({ name: 'Brioche Dorée', address: {} });

    expect(lieu.etiquette).toBe('Brioche Dorée');
  });

  it('rend null quand la réponse ne porte rien d\'exploitable', () => {
    expect(decrireLieu({ address: {} })).toBeNull();
    expect(decrireLieu({})).toBeNull();
    expect(decrireLieu(null)).toBeNull();
    expect(decrireLieu(undefined)).toBeNull();
    expect(decrireLieu('erreur')).toBeNull();
  });

  it('ignore une adresse qui n\'est pas un objet', () => {
    expect(decrireLieu({ name: 'Chez Paul', address: 'Rennes' }).etiquette).toBe('Chez Paul');
  });

  it('conserve le type OSM, dont dépend la catégorie automatique', () => {
    const lieu = decrireLieu({ name: 'Super U', type: 'supermarket', address: { city: 'Rennes' } });

    expect(lieu.type).toBe('supermarket');
  });
});
