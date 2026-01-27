#!/bin/bash

# Migration script: Structure actuelle → Branches séparées main/develop
# FairSplit v3.0.0

set -e  # Exit on error

echo "🚀 Migration FairSplit vers architecture branches séparées"
echo "=========================================================="
echo ""

# Vérifier qu'on est dans un repo git
if [ ! -d .git ]; then
    echo "❌ Erreur : Ce n'est pas un repository Git"
    echo "   Exécutez d'abord : git init"
    exit 1
fi

# Sauvegarder l'état actuel
echo "📦 Sauvegarde de l'état actuel..."
git add .
git commit -m "backup: sauvegarde avant migration branches" || echo "Rien à sauvegarder"

# Créer la branche main (PROD)
echo ""
echo "🔵 Création de la branche main (PRODUCTION)..."
git checkout -b main 2>/dev/null || git checkout main

# Nettoyer les fichiers TEST de main
echo "   → Suppression des fichiers TEST..."
rm -f FairSplit-Test.html
rm -f manifest-test.json
rm -rf develop/

# S'assurer que index.html pointe vers PROD
cat > index.html << 'EOF'
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="0; url=FairSplit-Prod.html" />
  <title>FairSplit - Redirection...</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea, #764ba2);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: white;
    }
    .container {
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>💰 FairSplit</h1>
    <p>Redirection en cours...</p>
  </div>
  <script>
    window.location.href = 'FairSplit-Prod.html';
  </script>
</body>
</html>
EOF

# Commit branche main
git add .
git commit -m "chore(deploy): préparer branche main (PROD uniquement)"

echo "   ✅ Branche main prête"

# Créer la branche develop (TEST)
echo ""
echo "🟠 Création de la branche develop (TEST)..."

# Récupérer les fichiers depuis l'état sauvegardé
git checkout -b develop

# Supprimer les fichiers PROD
rm -f FairSplit-Prod.html

# Renommer manifest-test.json en manifest.json (s'il existe)
if [ -f manifest-test.json ]; then
    mv manifest-test.json manifest.json
fi

# Créer index.html pour TEST
cat > index.html << 'EOF'
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="0; url=FairSplit-Test.html" />
  <title>FairSplit TEST - Redirection...</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #ff9800, #ff5722);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: white;
    }
    .badge {
      background: rgba(255, 255, 255, 0.2);
      padding: 20px 40px;
      border-radius: 12px;
      backdrop-filter: blur(10px);
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="badge">
    <h1>🔧 ENVIRONNEMENT DE TEST</h1>
    <p>Redirection en cours...</p>
  </div>
  <script>
    window.location.href = 'FairSplit-Test.html';
  </script>
</body>
</html>
EOF

# Commit branche develop
git add .
git commit -m "chore(deploy): préparer branche develop (TEST uniquement)"

echo "   ✅ Branche develop prête"

# Résumé
echo ""
echo "=========================================================="
echo "✅ Migration terminée !"
echo ""
echo "📋 Prochaines étapes :"
echo ""
echo "1. Pousser les branches sur GitHub :"
echo "   git push -u origin main"
echo "   git push -u origin develop"
echo ""
echo "2. Configurer GitHub Pages :"
echo "   - Aller sur Settings → Pages"
echo "   - Source: Deploy from a branch"
echo "   - Branch: gh-pages / (root)"
echo ""
echo "3. Attendre le premier déploiement (30-60 secondes)"
echo ""
echo "4. Vérifier les URLs :"
echo "   - PROD: https://USERNAME.github.io/REPO/"
echo "   - TEST: https://USERNAME.github.io/REPO/test/"
echo ""
echo "📖 Documentation complète : DEPLOYMENT.md"
echo "=========================================================="
