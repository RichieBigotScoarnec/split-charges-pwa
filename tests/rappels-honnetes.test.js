import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Trois bascules qui ne faisaient rien sur le téléphone visé
 *
 * Les rappels passaient par `new Notification(...)`. Chrome sur Android refuse
 * ce constructeur pour une application installée — il lève « Illegal
 * constructor » — et l'exception était avalée par un `catch` qui se contentait
 * de journaliser. Le panneau annonçait « 🔔 Notifications activées » pendant
 * que rien ne partait.
 *
 * Deux exigences, donc : passer par le service worker, le seul chemin
 * qu'Android accepte ; et ne plus laisser un échec sans témoin.
 */

const RACINE = process.cwd();
const source = readFileSync(resolve(RACINE, 'public/js/modules/notifications.js'), 'utf8');

describe('Le chemin d\'envoi', () => {
  it('passe par le service worker', () => {
    // `showNotification` sur l'inscription est la seule voie qu'accepte Chrome
    // sur Android pour une application installée.
    expect(source).toMatch(/serviceWorker\?*\.ready/);
    expect(source).toMatch(/showNotification\(/);
  });

  it('garde le constructeur en repli, pas en premier recours', () => {
    const posSW = source.indexOf('showNotification(');
    const posConstructeur = source.indexOf('new Notification(title');

    expect(posConstructeur, 'le repli direct a disparu').toBeGreaterThan(-1);
    expect(posSW, 'le service worker doit être tenté en premier').toBeLessThan(posConstructeur);
  });

  it('éprouve ce chemin dès la demande d\'autorisation', () => {
    // La notification de confirmation était écrite en direct : elle levait sur
    // Android sans rien dire, et le panneau annonçait des rappels actifs.
    const demande = source.slice(source.indexOf('requestPermission'), source.indexOf('renderNotificationStatus();'));
    expect(demande, 'la confirmation court-circuite encore le chemin réel')
      .not.toMatch(/new Notification\('FairSplit/);
  });
});

describe('Un échec ne reste pas sans témoin', () => {
  it('est retenu, et non seulement journalisé', () => {
    expect(source).toMatch(/_dernierEchec/);
    expect(source).toMatch(/export function envoiEnEchec/);
  });

  it('l\'écran des réglages le dit', () => {
    const rendu = source.slice(source.indexOf('export function renderNotificationStatus'));
    expect(rendu, 'le panneau ignore l\'échec du dernier envoi').toMatch(/_dernierEchec/);
  });
});

describe('Ce que le panneau promet', () => {
  it('annonce la portée réelle : application ouverte', () => {
    // Les minuteurs vivent dans la page ; un téléphone suspend l'onglet
    // quelques minutes après qu'on l'a quitté. Promettre des rappels de fond
    // exigerait un serveur d'envoi, que ce projet n'a pas.
    expect(source, 'le panneau laisse croire à des rappels de fond')
      .toMatch(/tant que FairSplit est ouvert/);
  });
});
