# Migration script: Structure actuelle → Branches séparées main/develop
# FairSplit v3.0.0

$ErrorActionPreference = "Stop"

Write-Host "🚀 Migration FairSplit vers architecture branches séparées" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier qu'on est dans un repo git
if (-not (Test-Path .git)) {
    Write-Host "❌ Erreur : Ce n'est pas un repository Git" -ForegroundColor Red
    Write-Host "   Exécutez d'abord : git init" -ForegroundColor Yellow
    exit 1
}

# Sauvegarder l'état actuel
Write-Host "📦 Sauvegarde de l'état actuel..." -ForegroundColor Yellow
git add .
git commit -m "backup: sauvegarde avant migration branches" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "   Rien à sauvegarder" -ForegroundColor Gray
}

# Créer la branche main (PROD)
Write-Host ""
Write-Host "🔵 Création de la branche main (PRODUCTION)..." -ForegroundColor Blue
git checkout -b main 2>$null
if ($LASTEXITCODE -ne 0) {
    git checkout main
}

# Nettoyer les fichiers TEST de main
Write-Host "   → Suppression des fichiers TEST..." -ForegroundColor Gray
Remove-Item -Path "FairSplit-Test.html" -ErrorAction SilentlyContinue
Remove-Item -Path "manifest-test.json" -ErrorAction SilentlyContinue
Remove-Item -Path "develop" -Recurse -ErrorAction SilentlyContinue

# S'assurer que index.html pointe vers PROD
$indexProdContent = @'
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
'@

Set-Content -Path "index.html" -Value $indexProdContent -Encoding UTF8

# Commit branche main
git add .
git commit -m "chore(deploy): préparer branche main (PROD uniquement)"

Write-Host "   ✅ Branche main prête" -ForegroundColor Green

# Créer la branche develop (TEST)
Write-Host ""
Write-Host "🟠 Création de la branche develop (TEST)..." -ForegroundColor DarkYellow

# Créer branche develop
git checkout -b develop

# Supprimer les fichiers PROD
Remove-Item -Path "FairSplit-Prod.html" -ErrorAction SilentlyContinue

# Renommer manifest-test.json en manifest.json (s'il existe)
if (Test-Path "manifest-test.json") {
    Move-Item -Path "manifest-test.json" -Destination "manifest.json" -Force
}

# Créer index.html pour TEST
$indexTestContent = @'
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
'@

Set-Content -Path "index.html" -Value $indexTestContent -Encoding UTF8

# Commit branche develop
git add .
git commit -m "chore(deploy): préparer branche develop (TEST uniquement)"

Write-Host "   ✅ Branche develop prête" -ForegroundColor Green

# Résumé
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "✅ Migration terminée !" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Prochaines étapes :" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Pousser les branches sur GitHub :" -ForegroundColor White
Write-Host "   git push -u origin main" -ForegroundColor Gray
Write-Host "   git push -u origin develop" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Configurer GitHub Pages :" -ForegroundColor White
Write-Host "   - Aller sur Settings → Pages" -ForegroundColor Gray
Write-Host "   - Source: Deploy from a branch" -ForegroundColor Gray
Write-Host "   - Branch: gh-pages / (root)" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Attendre le premier déploiement (30-60 secondes)" -ForegroundColor White
Write-Host ""
Write-Host "4. Vérifier les URLs :" -ForegroundColor White
Write-Host "   - PROD: https://USERNAME.github.io/REPO/" -ForegroundColor Gray
Write-Host "   - TEST: https://USERNAME.github.io/REPO/test/" -ForegroundColor Gray
Write-Host ""
Write-Host "📖 Documentation complète : DEPLOYMENT.md" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
