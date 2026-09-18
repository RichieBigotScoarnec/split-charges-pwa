/**
 * FairSplit — Repère du bac à sable
 *
 * Sans marque visible, rien ne distingue un essai des vraies données. Le
 * repère est posé à deux moments : au démarrage quand l'URL porte
 * `?sandbox=1`, et après connexion quand le compte est cantonné au bac à
 * sable — cas qu'on ne connaît qu'une fois l'adresse connue.
 *
 * Deux appels, une seule définition : dupliquer un signal de cette nature,
 * c'est accepter qu'il finisse par diverger.
 */

/** Le titre ne doit être préfixé qu'une fois, quel que soit le nombre d'appels */
let titrePrefixe = false;

/**
 * Affiche le repère du bac à sable
 */
export function showSandboxBanner() {
  const banner = document.getElementById('sandboxBanner');
  if (banner) banner.hidden = false;

  if (!titrePrefixe) {
    document.title = `[Bac à sable] ${document.title}`;
    titrePrefixe = true;
  }
}
