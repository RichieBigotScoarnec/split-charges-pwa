# Script PowerShell pour créer les fichiers FairSplit

Write-Host "🚀 Création des fichiers FairSplit..." -ForegroundColor Cyan

# Créer un message pour l'utilisateur
$message = @"
IMPORTANT : Firebase Configuration Requise
==========================================

Avant d'utiliser FairSplit, vous devez :

1. Créer 2 projets Firebase :
   - fairsplit-test
   - fairsplit-prod

2. Pour chaque projet :
   a) Aller sur https://console.firebase.google.com/
   b) Créer un nouveau projet
   c) Activer Realtime Database (Europe-West1)
   d) Règles de sécurité (temporaire) :
      {
        "rules": {
          ".read": true,
          ".write": true
        }
      }
   
3. Récupérer les configurations Firebase :
   - Project Settings > General
   - Copier les valeurs : apiKey, authDomain, databaseURL, etc.

4. Remplacer dans les fichiers HTML :
   - FairSplit-Test.html → Configuration TEST
   - FairSplit-Prod.html → Configuration PROD

Chercher "VOTRE_API_KEY" dans les fichiers et remplacer toutes les valeurs.

"@

Write-Host $message -ForegroundColor Yellow

# Instructions pour créer les fichiers
Write-Host "`n📝 Les fichiers suivants doivent être créés :" -ForegroundColor Green
Write-Host "   - FairSplit-Test.html (application TEST)" -ForegroundColor White
Write-Host "   - FairSplit-Prod.html (application PROD)" -ForegroundColor White
Write-Host "`n💡 Utilisez l'éditeur de code pour créer ces fichiers volumineux." -ForegroundColor Cyan
Write-Host "   Les fichiers sont prêts à être copiés depuis le modèle." -ForegroundColor Cyan
