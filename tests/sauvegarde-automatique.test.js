// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * La sauvegarde automatique, vue depuis le dépôt
 *
 * Le foyer n'a qu'un exemplaire de son historique : une base Realtime Database,
 * sans sauvegarde automatique sur le forfait gratuit. Celle de l'application
 * est entièrement manuelle — il faut y penser, et on n'y pense qu'après.
 *
 * Le contrôle qui compte le plus ici n'est pas qu'une archive soit déposée,
 * mais qu'elle soit **restaurable**. Une sauvegarde au mauvais format s'archive
 * aussi bien qu'une autre et ne se découvre inutilisable qu'au pire moment.
 * C'est pourquoi l'enveloppe produite est soumise à la fonction que
 * l'application emploie réellement pour accepter un fichier.
 */

vi.mock('../public/js/components/toast.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}));
vi.mock('../public/js/components/modal.js', () => ({
  showModal: vi.fn(), closeModal: vi.fn(), showConfirmModal: vi.fn()
}));
vi.mock('../public/js/utils/debug.js', () => ({
  log: vi.fn(), warn: vi.fn(), error: vi.fn()
}));

const { validateBackup, FORMAT, FORMAT_VERSION } = await import('../public/js/modules/backup.js');
const outil = await import('../tools/enveloppe-sauvegarde.mjs');

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/sauvegarde.yml'),
  'utf8'
);

/** Vidage plausible du sous-arbre `household`, tel que le rend la CLI Firebase */
const VIDAGE = {
  salaries: { vous: 2500, conjointe: 1800 },
  members: { vous: 'Richie', conjointe: 'Cindy' },
  shareMode: 'prorata',
  periods: {
    '2026-08': {
      variableCharges: { cle1: { description: 'Courses', amount: 85.5, paidBy: 'vous' } }
    }
  }
};

describe('L\'enveloppe produite est restaurable', () => {
  it('passe la validation que l\'application applique à un fichier', () => {
    // Le contrôle central : `validateBackup` est la fonction que
    // « Restaurer depuis un fichier » exécute réellement. Si elle refuse, la
    // sauvegarde n'existe que sur le papier.
    const enveloppe = outil.envelopper(VIDAGE, '2026-08-22T03:17:00.000Z');

    expect(validateBackup(enveloppe)).toBeNull();
  });

  it('survit à un aller-retour par JSON', () => {
    // L'archive est écrite, chiffrée, déchiffrée, puis relue par l'application.
    const enveloppe = outil.envelopper(VIDAGE, '2026-08-22T03:17:00.000Z');
    const relue = JSON.parse(JSON.stringify(enveloppe));

    expect(validateBackup(relue)).toBeNull();
    expect(relue.data.periods['2026-08'].variableCharges.cle1.amount).toBe(85.5);
  });

  it('lit correctement le format déclaré par l\'application', () => {
    // Les deux valeurs viennent du même fichier : elles ne peuvent pas diverger,
    // et ce test ne prétend pas le vérifier. Ce qu'il garde, c'est le procédé
    // d'extraction — si `backup.js` cessait d'exporter ces constantes sous cette
    // forme, l'outil lèverait au chargement plutôt que de produire une enveloppe
    // au format inventé.
    expect(outil.FORMAT).toBe(FORMAT);
    expect(outil.FORMAT_VERSION).toBe(FORMAT_VERSION);
    expect(typeof outil.FORMAT_VERSION).toBe('number');
  });

  it('conserve les données à l\'identique', () => {
    const enveloppe = outil.envelopper(VIDAGE, '2026-08-22T03:17:00.000Z');

    expect(enveloppe.data).toEqual(VIDAGE);
    expect(enveloppe.exportedAt).toBe('2026-08-22T03:17:00.000Z');
  });
});

describe('Un vidage invraisemblable est refusé', () => {
  it('accepte un foyer en service', () => {
    expect(outil.motifDeRefus(VIDAGE)).toBeNull();
  });

  it('refuse une base vide', () => {
    // `database:get` rend `null` sur un chemin absent. Archiver ça écraserait
    // la place d'une bonne sauvegarde par du vide.
    expect(outil.motifDeRefus(null)).toMatch(/vide|illisible/);
  });

  it('refuse un vidage sans aucune période', () => {
    expect(outil.motifDeRefus({ members: { vous: 'Richie' } })).toMatch(/période/);
  });

  it('refuse ce qui n\'est pas un objet', () => {
    expect(outil.motifDeRefus('erreur réseau')).not.toBeNull();
    expect(outil.motifDeRefus([])).not.toBeNull();
  });
});

describe('Le workflow de sauvegarde', () => {
  it('tourne tous les jours et se déclenche aussi à la demande', () => {
    // Le déclenchement manuel se fait depuis l'onglet Actions, donc depuis un
    // téléphone — avant une manipulation risquée, par exemple.
    expect(workflow).toMatch(/cron:\s*'[^']+'/);
    expect(workflow).toContain('workflow_dispatch:');
  });

  it('n\'obtient aucun droit d\'écriture sur le dépôt', () => {
    expect(workflow).toMatch(/permissions:\s*\n\s*contents:\s*read/);
    expect(workflow).not.toContain('contents: write');
  });

  it('échoue quand un secret manque, au lieu de passer en silence', () => {
    // Un déploiement manqué se rattrape à la fusion suivante ; une sauvegarde
    // manquée ne se rattrape pas. C'est le seul job du dépôt qui doit échouer
    // bruyamment plutôt que poser un avertissement.
    expect(workflow).toContain('FIREBASE_SERVICE_ACCOUNT');
    expect(workflow).toContain('SAUVEGARDE_PASSPHRASE');
    expect(workflow).toMatch(/Sauvegarde impossible/);
    expect(workflow).toMatch(/exit 1/);
  });

  it('ne passe jamais un secret par la ligne de commande', () => {
    // Les journaux d'exécution conservent les lignes de commande. Le compte de
    // service comme la phrase secrète transitent par un fichier.
    expect(workflow).toContain('--passphrase-file');
    expect(workflow).toContain('GOOGLE_APPLICATION_CREDENTIALS');
    expect(workflow).not.toMatch(/--passphrase\s+["$]/);
  });

  it('chiffre avant de déposer l\'archive', () => {
    // Le dépôt est public : ses artefacts sont téléchargeables par qui peut le
    // lire. Sans chiffrement, l'historique financier du foyer serait publié.
    const chiffrement = workflow.indexOf('--symmetric');
    const depot = workflow.indexOf('upload-artifact');

    expect(chiffrement).toBeGreaterThan(-1);
    expect(workflow).toContain('AES256');
    expect(chiffrement).toBeLessThan(depot);
    expect(workflow).toContain('sauvegarde.json.gpg');
  });

  it('efface le clair et les secrets du disque après usage', () => {
    // Découpé par étape plutôt que cherché au fil du texte : les fichiers sont
    // désignés par des variables, un motif sur leur nom ne prouverait rien.
    const etape = (titre) => {
      const debut = workflow.indexOf(`- name: ${titre}`);
      const suite = workflow.indexOf('      - name:', debut + 1);
      return workflow.slice(debut, suite === -1 ? undefined : suite);
    };

    expect(etape('Extraire la base'), 'le compte de service reste sur le disque')
      .toMatch(/rm -f/);
    expect(etape('Chiffrer'), 'la phrase secrète ou le clair restent sur le disque')
      .toMatch(/rm -f .*sauvegarde\.json.*vidage\.json/);
  });

  it('n\'exporte que l\'espace du foyer', () => {
    // Le bac à sable ne contient que des données d'essai, qu'il serait
    // trompeur de conserver aux côtés des vraies.
    expect(workflow).toContain('database:get /household');
    expect(workflow).not.toContain('database:get /sandbox');
  });

  it('passe par l\'outil d\'enveloppe plutôt que d\'archiver le vidage brut', () => {
    expect(workflow).toContain('tools/enveloppe-sauvegarde.mjs');
  });

  it('échoue si aucune archive n\'a été produite', () => {
    // Sans cela, une archive absente donnerait un job vert et une sauvegarde
    // inexistante — exactement la panne qu'on cherche à supprimer.
    expect(workflow).toContain('if-no-files-found: error');
  });

  it('conserve les archives aussi longtemps que GitHub le permet', () => {
    expect(workflow).toContain('retention-days: 90');
  });

  it('épingle ses actions par SHA', () => {
    // Une action référencée par étiquette peut changer sous nos pieds ; celle-ci
    // manipule le contenu de la base.
    const actions = [...workflow.matchAll(/uses:\s*([^\s]+)/g)].map(m => m[1]);

    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action, `${action} n'est pas épinglée par SHA`).toMatch(/@[0-9a-f]{40}$/);
    }
  });

  it('dit comment restaurer', () => {
    // Une sauvegarde dont personne ne connaît le chemin de retour n'en est pas
    // une. Le résumé d'exécution porte la marche à suivre.
    expect(workflow).toContain('gpg --decrypt');
    expect(workflow).toMatch(/Restaurer depuis un fichier/);
  });
});
