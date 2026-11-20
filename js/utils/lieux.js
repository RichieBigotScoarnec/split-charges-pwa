/**
 * FairSplit — Ce que le mois dit des lieux
 *
 * La planche 1 rend, dans « 📍 Où vous dépensez » : « 184,04 € à Landivisiau ·
 * 92,02 € par passage, sur 2 passages », puis « Saint-Goazec · 45,00 € ». La
 * donnée existait déjà — chaque charge peut porter un `location` avec son nom,
 * et `map.js` s'en sert pour ses marqueurs — mais rien ne l'agrégeait : la
 * carte n'affichait qu'un bouton, et son contenu attendait un clic.
 *
 * ## Ce que cette fabrique ne sait pas, et ne doit pas savoir
 *
 * **Le périmètre.** Une dépense solo appartient à une personne, pas au foyer,
 * et c'est à l'appelant de l'écarter — comme `trends.js` le fait déjà pour ses
 * totaux. Une fabrique de lieux qui filtrerait le solo deviendrait une seconde
 * définition de « ce qui pèse sur le commun », et les deux finiraient par
 * diverger.
 *
 * **Les coordonnées.** Une charge localisée sans nom existe — la carte la
 * montre, elle a un point. Cette liste, elle, nomme des lieux : sans nom, il
 * n'y a rien à écrire, et un « Lieu sans nom · 30,00 € » n'apprendrait rien.
 */

/**
 * Ce que chaque lieu a coûté ce mois-ci
 *
 * Les noms sont comparés sans leurs espaces de bord : « Landivisiau » saisi
 * deux fois, une fois avec une espace, reste un seul lieu.
 *
 * Un montant illisible vaut zéro, jamais `NaN` — même règle que `computeSummary`
 * et que le récap des virements. Le passage, lui, est compté : la dépense a eu
 * lieu, c'est son montant qui est cassé.
 *
 * @param {Array<Object>} charges - Charges déjà filtrées par l'appelant
 * @returns {Array<{lieu: string, total: number, passages: number, parPassage: number}>}
 *   Trié par total décroissant
 */
export function depensesParLieu(charges) {
  if (!Array.isArray(charges)) return [];

  const parLieu = new Map();

  for (const charge of charges) {
    const nom = typeof charge?.location?.name === 'string' ? charge.location.name.trim() : '';
    if (!nom) continue;

    const montant = Number.isFinite(charge.amount) ? charge.amount : 0;
    const deja = parLieu.get(nom) || { lieu: nom, total: 0, passages: 0 };
    deja.total += montant;
    deja.passages += 1;
    parLieu.set(nom, deja);
  }

  return [...parLieu.values()]
    .map(({ lieu, total, passages }) => {
      const arrondi = Math.round(total * 100) / 100;
      return {
        lieu,
        total: arrondi,
        passages,
        parPassage: passages > 0 ? Math.round((arrondi / passages) * 100) / 100 : 0
      };
    })
    .sort((a, b) => b.total - a.total);
}
