# 🧹 Vider le cache de l'application

## Procédure COMPLÈTE pour forcer le rechargement

### 1. Désinscrire le Service Worker

1. Ouvrez **DevTools** (F12)
2. Allez dans **Application** → **Service Workers**
3. Cliquez sur **Unregister** pour `sw-test.js`
4. Fermez tous les onglets de l'application

### 2. Vider TOUT le cache

1. **DevTools** (F12) → **Application**
2. **Storage** (panneau gauche)
3. Cliquez sur **Clear site data**
4. Cochez TOUT :
   - ✅ Application cache
   - ✅ Cache storage
   - ✅ Service workers
   - ✅ Local storage
   - ✅ Session storage
   - ✅ IndexedDB
5. Cliquez **Clear site data**

### 3. Hard Refresh

- **Windows/Linux** : `Ctrl + Shift + R` ou `Ctrl + F5`
- **Mac** : `Cmd + Shift + R`

### 4. Vérifier dans la console

Après connexion Google, vous DEVEZ voir :

```
[DB] Current user ID set: abcd1234...
[DB] User is Owner
📅 Gestion périodes initialisée
💾 Mode de partage sauvegardé
📊 0 charges variables chargées
```

### 5. Si ça ne fonctionne toujours pas

Mode navigation privée :
1. `Ctrl + Shift + N` (Chrome/Edge)
2. Ouvrez `http://localhost:5500/FairSplit-Test.html`
3. Testez

---

**Date** : 2026-01-31
