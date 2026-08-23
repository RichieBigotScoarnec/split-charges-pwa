import { describe, it, expect } from 'vitest';
import { messageErreurAuth, estUnGesteUtilisateur } from '../../public/js/utils/auth-errors.js';

/**
 * Le cas signalé à l'usage, sur téléphone :
 *
 *   « Erreur Google : Firebase: Unable to establish a connection with the
 *     popup. It may have been blocked by the browser. (auth/popup-blocked). »
 *
 * Le message dit vrai. Il ne dit pas quoi faire, et il le dit en anglais, dans
 * une application entièrement française. Or c'est l'écran de connexion : la
 * personne est dehors, et rien ne lui indique comment rentrer.
 */

describe('Message d\'échec d\'authentification', () => {
  it('le blocage de fenêtre nomme le geste qui débloque', () => {
    const message = messageErreurAuth({
      code: 'auth/popup-blocked',
      message: 'Firebase: Unable to establish a connection with the popup.'
    });

    expect(message).toContain('pop-up');
    expect(message).toMatch(/Autorisez/);
    // Le geste concret, tel qu'il apparaît dans le bandeau du navigateur.
    expect(message).toContain('Toujours afficher');
  });

  it('ne laisse passer aucun message en anglais pour les cas prévus', () => {
    const codes = [
      'auth/popup-blocked',
      'auth/operation-not-supported-in-this-environment',
      'auth/web-storage-unsupported',
      'auth/network-request-failed',
      'auth/too-many-requests',
      'auth/invalid-email',
      'auth/user-disabled',
      'auth/invalid-credential',
      'auth/wrong-password',
      'auth/user-not-found',
      'auth/weak-password',
      'auth/email-already-in-use'
    ];

    for (const code of codes) {
      const message = messageErreurAuth({ code, message: 'Firebase: something went wrong.' });
      expect(message, `${code} laisse passer le texte Firebase`).not.toContain('Firebase');
      expect(message.length, `${code} sans message`).toBeGreaterThan(10);
    }
  });

  it('ne révèle pas si l\'adresse existe', () => {
    // Firebase a cessé de distinguer les deux cas pour cette raison ; le
    // message ne doit pas rétablir la distinction.
    const inconnue = messageErreurAuth({ code: 'auth/user-not-found' });
    const mauvaisMotDePasse = messageErreurAuth({ code: 'auth/wrong-password' });

    expect(inconnue).toBe(mauvaisMotDePasse);
  });

  it('un code non prévu conserve le texte d\'origine et son code', () => {
    // Un « une erreur est survenue » générique ne permet de comprendre ni sur
    // le moment, ni à distance, ni après coup.
    const message = messageErreurAuth({
      code: 'auth/inconnu-de-cette-liste',
      message: 'Firebase: quelque chose de nouveau.'
    });

    expect(message).toContain('auth/inconnu-de-cette-liste');
    expect(message).toContain('quelque chose de nouveau');
  });

  it('ne lève pas sur une erreur sans code ni message', () => {
    expect(() => messageErreurAuth(undefined)).not.toThrow();
    expect(() => messageErreurAuth({})).not.toThrow();
    expect(messageErreurAuth({})).toMatch(/Connexion impossible/);
  });
});

describe('Gestes de l\'utilisateur', () => {
  it('fermer la fenêtre n\'est pas une panne', () => {
    expect(estUnGesteUtilisateur({ code: 'auth/popup-closed-by-user' })).toBe(true);
    expect(estUnGesteUtilisateur({ code: 'auth/cancelled-popup-request' })).toBe(true);
  });

  it('une fenêtre bloquée en est une : elle exige une action', () => {
    // Le blocage ne vient pas de la personne, et ne se règle pas en réessayant.
    expect(estUnGesteUtilisateur({ code: 'auth/popup-blocked' })).toBe(false);
  });

  it('ne lève pas sur une erreur sans code', () => {
    expect(estUnGesteUtilisateur(undefined)).toBe(false);
    expect(estUnGesteUtilisateur({})).toBe(false);
  });
});
