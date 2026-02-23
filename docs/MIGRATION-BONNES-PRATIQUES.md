# Plan de Migration vers les Bonnes Pratiques

> **Date de création** : 2026-01-31
> **Objectif** : Transformer l'architecture hybride (legacy + modules) vers une architecture 100% modulaire conforme aux bonnes pratiques

---

## 🎯 Objectifs

1. **Single Source of Truth** : Tout l'état dans `js/state.js`
2. **Modules purs** : Aucune dépendance à `window.*`
3. **Séparation UI/Logique** : HTML pour structure, JS pour comportement
4. **Testabilité** : Fonctions pures avec paramètres explicites
5. **Maintenabilité** : Code facile à comprendre et modifier

---

## 📊 État actuel (Phase 1 : COMPLÉTÉE ✅)

### ✅ Ce qui a été fait

1. **Fonction centralisée de synchronisation** (`syncQuickAddState()`)
   - Empêche les oublis de synchronisation
   - Simplifie les appels (1 ligne au lieu de 10+)
   - Logs automatiques pour debugging

2. **Tous les appels convertis**
   - `selectCategory()` → utilise `syncQuickAddState()`
   - `updateSplitToggle()` → utilise `syncQuickAddState()`
   - `showQuickAddModal()` → utilise `syncQuickAddState()`
   - `startGPSDetection()` → utilise `syncQuickAddState()`
   - Fermeture modale → utilise `syncQuickAddState()`

### ⚠️ Limitations actuelles

- `window.quickAddState` existe toujours (pollution namespace)
- Modules dépendent de variables globales
- Synchronisation manuelle nécessaire (via fonction, mais reste fragile)
- Code legacy dans FairSplit-Test.html (~2000 lignes)

---

## 🚀 Phase 2 : Migration Progressive (À FAIRE)

### Étape 2.1 : Créer le point d'entrée modulaire

**Fichier** : `js/app.js`

```javascript
/**
 * Point d'entrée principal de l'application
 * Initialise tous les modules
 */
import { initAuth } from './modules/auth.js';
import { initPeriod } from './modules/period.js';
import { initQuickAdd } from './modules/quick-add.js';
import { initMap } from './modules/map.js';
import { setState } from './state.js';

export async function initApp() {
  console.log('🚀 Initialisation de l\'application...');

  // Initialiser l'état global
  setState('quickAddState', {
    selectedCategory: null,
    splitMode: 'prorata',
    gpsLocation: null
  });

  // Initialiser les modules dans l'ordre
  await initAuth();
  await initPeriod();
  initQuickAdd();
  initMap();

  console.log('✅ Application initialisée');
}
```

**Modification** : `FairSplit-Test.html`

```html
<!-- Remplacer tout le <script> par : -->
<script type="module">
  import { initApp } from './js/app.js';

  // Attendre que le DOM soit chargé
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
</script>
```

**Bénéfices** :
- Plus de code legacy dans HTML
- Chargement modulaire propre
- Ordre d'initialisation contrôlé

---

### Étape 2.2 : Refactorer les gestionnaires d'événements

**Créer** : `js/ui/quick-add-modal.js`

```javascript
import { getState, setState } from '../state.js';
import { CATEGORIES } from '../constants.js';

/**
 * Initialise la modale de saisie rapide
 */
export function initQuickAddModal() {
  const modal = document.getElementById('modalQuickAdd');

  // Bouton d'ouverture
  document.getElementById('btnQuickAddOpen')?.addEventListener('click', showQuickAddModal);

  // Boutons de catégorie
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectCategory(btn.dataset.categoryId);
    });
  });

  // Boutons de split mode
  document.getElementById('quickSplitProrata')?.addEventListener('click', () => {
    setSplitMode('prorata');
  });
  document.getElementById('quickSplit5050')?.addEventListener('click', () => {
    setSplitMode('50-50');
  });

  // Montant (validation en temps réel)
  document.getElementById('quickAddAmount')?.addEventListener('input', validateQuickAddForm);

  // Bouton de soumission
  document.getElementById('btnQuickAdd')?.addEventListener('click', handleQuickAddSubmit);
}

function showQuickAddModal() {
  // Reset state
  setState('quickAddState', {
    selectedCategory: null,
    splitMode: 'prorata',
    gpsLocation: null
  });

  // Afficher modale
  const modal = document.getElementById('modalQuickAdd');
  modal.style.display = 'block';

  // Démarrer GPS
  startGPSDetection();
}

function selectCategory(categoryId) {
  const category = CATEGORIES.find(c => c.id === categoryId);
  if (!category) return;

  // Mettre à jour state
  setState('quickAddState.selectedCategory', category);

  // Mettre à jour UI
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.categoryId === categoryId);
  });

  validateQuickAddForm();
}

// ... etc
```

**Bénéfices** :
- Séparation UI / Logique claire
- Plus facile à tester
- Pas de pollution `window.*`

---

### Étape 2.3 : Supprimer `window.quickAddState`

**Avant** :
```javascript
// quick-add.js
const category = window.quickAddState?.selectedCategory;
```

**Après** :
```javascript
// quick-add.js
import { getState } from '../state.js';
const category = getState('quickAddState.selectedCategory');
```

**Fichiers à modifier** :
- `js/modules/quick-add.js`
- `js/modules/map.js`
- Supprimer `window.quickAddState` de `FairSplit-Test.html`

---

### Étape 2.4 : Tests automatisés

**Créer** : `tests/quick-add.test.js`

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { setState, getState, resetState } from '../js/state.js';
import { selectCategory } from '../js/ui/quick-add-modal.js';

describe('Quick Add - Sélection catégorie', () => {
  beforeEach(() => {
    resetState();
  });

  it('devrait mettre à jour le state quand une catégorie est sélectionnée', () => {
    const category = { id: 'restaurant', label: 'Restaurant', icon: '🍽️' };

    selectCategory(category.id);

    const selected = getState('quickAddState.selectedCategory');
    expect(selected.id).toBe('restaurant');
  });

  it('devrait valider le formulaire après sélection catégorie', () => {
    setState('quickAddAmount', 25.50);
    selectCategory('restaurant');

    const isValid = getState('quickAddForm.isValid');
    expect(isValid).toBe(true);
  });
});
```

---

## 🎯 Phase 3 : Refonte complète (Long terme)

### Architecture cible

```
js/
├── app.js                    # Point d'entrée unique
├── state.js                  # État global (déjà existant ✅)
├── constants.js              # Constantes (CATEGORIES, etc.)
├── modules/                  # Logique métier
│   ├── auth.js
│   ├── period.js
│   ├── quick-add.js
│   ├── fixed-charges.js
│   ├── variable-charges.js
│   ├── reimbursements.js
│   ├── summary.js
│   └── map.js
├── ui/                       # Gestion de l'interface
│   ├── modals.js
│   ├── quick-add-modal.js
│   ├── category-selector.js
│   ├── gps-location.js
│   └── toast.js
├── utils/                    # Utilitaires
│   ├── date.js
│   ├── format.js
│   └── validation.js
└── services/                 # Services externes
    ├── firebase.js
    └── geocoding.js
```

---

## 📝 Mise à jour de la documentation

### Fichiers à mettre à jour après Phase 2

1. **CLAUDE.md**
   - Section architecture : Documenter nouvelle structure modulaire
   - Bonnes pratiques : Ajouter règles import/export ES6
   - Exemples : Montrer comment créer nouveaux modules

2. **docs/claude/prompts/prompt_html_troubleshooting_v2.md**
   - Mise à jour du contexte architecture
   - Nouveaux patterns de debugging
   - Workflow modification features

3. **docs/claude/prompts/prompt_html_troubleshooting.md**
   - Idem v2

4. **README.md**
   - Architecture : Diagramme de la nouvelle structure
   - Guide développeur : Comment ajouter une feature
   - Tests : Comment lancer les tests

---

## ✅ Checklist de migration

### Phase 1 : Stabilisation (✅ FAIT)
- [x] Créer `syncQuickAddState()`
- [x] Convertir `selectCategory()`
- [x] Convertir `updateSplitToggle()`
- [x] Convertir `showQuickAddModal()`
- [x] Convertir `startGPSDetection()`
- [x] Convertir fermeture modale
- [x] Tester que tout fonctionne

### Phase 2 : Migration progressive (À FAIRE)
- [ ] Créer `js/app.js`
- [ ] Créer `js/ui/quick-add-modal.js`
- [ ] Migrer gestionnaires d'événements
- [ ] Supprimer `window.quickAddState`
- [ ] Convertir `quick-add.js` pour lire depuis state
- [ ] Ajouter tests Vitest
- [ ] Tester GPS + catégories + soumission

### Phase 3 : Refonte (Optionnel)
- [ ] Créer structure `js/ui/`
- [ ] Créer structure `js/services/`
- [ ] Migrer tous les modules
- [ ] Supprimer code legacy de FairSplit-Test.html
- [ ] 100% couverture tests
- [ ] Documentation complète

---

## 📊 Métriques de progression

| Critère | Avant | Phase 1 | Phase 2 | Phase 3 |
|---------|-------|---------|---------|---------|
| **Lignes HTML** | ~2500 | ~2500 | ~500 | ~200 |
| **Variables `window.*`** | 15+ | 1 (`quickAddState`) | 0 | 0 |
| **Fonctions globales** | 50+ | 50+ | 0 | 0 |
| **Modules purs** | 30% | 30% | 70% | 100% |
| **Couverture tests** | 0% | 0% | 40% | 90% |
| **Dette technique** | Élevée | Moyenne | Faible | Nulle |

---

## 🎓 Ressources

### Bonnes pratiques ES6 Modules
- [MDN - JavaScript Modules](https://developer.mozilla.org/fr/docs/Web/JavaScript/Guide/Modules)
- [Clean Code JavaScript](https://github.com/ryanmcdermott/clean-code-javascript)

### Testing avec Vitest
- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)

### Architecture
- [Single Source of Truth Pattern](https://en.wikipedia.org/wiki/Single_source_of_truth)
- [Observer Pattern](https://refactoring.guru/design-patterns/observer)

---

## 📞 Support

Pour toute question sur la migration :
1. Consulter ce document
2. Lire les exemples de code dans les phases
3. Vérifier la checklist de progression

**Dernière mise à jour** : 2026-01-31
