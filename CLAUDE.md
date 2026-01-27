# CLAUDE.md - Optimisé v5.2 (avec Model Routing)

> **Version**: 5.2 | **Mise à jour**: 2026-01-12 | **Usage**: Claude Code CLI | **Context**: ~5.5KB

---

## 🛡️ Règles Prioritaires (JAMAIS OUBLIER)

@docs/claude/anti-hallucination.md
@docs/claude/compatibility.md

### Critiques
1. JAMAIS surcharger cmdlets natifs (pas de Write-Log, Format-Table)
2. TOUJOURS paramètres nommés (-Path, -Destination)
3. JAMAIS WhatIf/Confirm manuels avec SupportsShouldProcess (ajoutés auto)
4. Set-StrictMode APRÈS param, AVANT logique
5. Aucune variable inutilisée (PSScriptAnalyzer détecte)
6. JAMAIS créer scripts dupliqués (étendre existants avec paramètres)
7. TOUJOURS mettre à jour README après modifications

---

## 📂 Placement Automatique des Scripts

| Mots-clés | Dossier |
|-----------|---------|
| AD, Active Directory, tiering, utilisateur, groupe, OU | `infrastructure/active-directory/` |
| GPO, Group Policy, lecteur réseau | `infrastructure/active-directory/gpo/` |
| Azure, Entra, Az, cloud | `infrastructure/azure/` |
| DNS, zone, enregistrement | `infrastructure/dns/` |
| VMware, vSphere, ESXi, PowerCLI | `infrastructure/virtualization/vmware/` |
| réseau, IP, firewall, VLAN, NIC, DHCP | `infrastructure/network/` |
| RDS, Remote Desktop Services, FSLogix | `applications/rds/` |
| SQL, base de données, query | `applications/sql-server/` |
| WSUS, update, patch | `applications/wsus/` |
| KMS, activation, licence | `applications/kms/` |
| Avamar, backup | `applications/avamar-backup/` |
| RDM, Devolutions | `applications/rdm/` |
| credential, secret, vault | `security/` |
| test, pester, unit test | `tests/` |
| outil, utilitaire | `tools/` |

---

## 🏗️ Architecture Modulaire AUTOMATIQUE

### ✅ Règle : TOUJOURS Utiliser New-ModularScript.ps1

**IMPORTANT** : Lors de la création d'un nouveau script, Claude Code DOIT **automatiquement** utiliser `New-ModularScript.ps1` au lieu de créer manuellement.

### Critères de Modularité

| Critère | Monolithique | Modulaire (Private/) |
|---------|--------------|----------------------|
| **Lignes de code** | < 300 | > 300 |
| **Nombre de fonctions** | ≤ 2 | > 3 |
| **HTML/CSS/JS inline** | Non | Oui → Templates/ |
| **Configuration** | ≤ 5 params | > 5 → config.psd1 |
| **Connexions distantes** | Non | Oui |
| **Réutilisabilité** | Non | Oui |

### Workflow Automatique Création Script

**AVANT (manuel, interdit) :**
```powershell
# ❌ NE PLUS FAIRE
Write-Output "Creation de Get-StaleUsers.ps1..."
# Écrire manuellement le script avec fonctions inline...
```

**MAINTENANT (automatique, obligatoire) :**
```powershell
# ✅ TOUJOURS FAIRE
.\tools\New-ModularScript.ps1 `
    -ScriptName "Get-StaleUsers" `
    -Description "Audit des comptes utilisateurs inactifs" `
    -Domain AD `
    -IncludeFunctions Logging,Export
```

**Résultat automatique :**
```
get-stale-users/
├── Get-StaleUsers.ps1              # Wrapper avec dot-sourcing
├── Private/
│   ├── Write-StaleUsersLog.ps1     # Logging auto-configuré
│   └── Export-StaleUsersReport.ps1 # Export auto-configuré
├── output/                         # Logs et rapports
├── README.md                       # Documentation pré-remplie
└── .gitignore                      # Exclusions
```

### Fonctions Templates Disponibles

| Template | Fichier Généré | Usage |
|----------|---------------|-------|
| **Logging** | `Write-*Log.ps1` | Logging structuré (timestamps, niveaux, console + fichier) |
| **Validation** | `Test-*Input.ps1` | Validation paramètres d'entrée |
| **Export** | `Export-*Report.ps1` | Export CSV/Excel avec ImportExcel |
| **Connection** | `Connect-*Remote.ps1` | Connexion PSSession distante |
| **Transform** | `Convert-*Data.ps1` | Transformation données avec pipeline |

### Exemples d'Utilisation

**Script AD Audit (modulaire) :**
```powershell
.\tools\New-ModularScript.ps1 `
    -ScriptName "Audit-StaleComputers" `
    -Description "Audit des ordinateurs inactifs depuis 90 jours" `
    -Domain AD `
    -IncludeFunctions Logging,Export,Validation
```

**Script DNS Simple (monolithique) :**
```powershell
.\tools\New-ModularScript.ps1 `
    -ScriptName "Get-DnsRecord" `
    -Description "Récupère un enregistrement DNS" `
    -Domain DNS `
    -SkipPrivate  # Pas de Private/ car simple < 300 lignes
```

**Script RDS avec connexion distante :**
```powershell
.\tools\New-ModularScript.ps1 `
    -ScriptName "Get-RdsUserSessions" `
    -Description "Liste les sessions utilisateurs RDS actives" `
    -Domain RDS `
    -IncludeFunctions Logging,Connection,Export
```

### Processus Claude Code

**Quand l'utilisateur dit** : "Crée un script pour auditer les groupes AD vides"

**Claude Code DOIT** :
1. **Analyser** : Domaine = AD, Complexité = Medium (audit multi-groupes)
2. **Décider** : Modulaire requis (fonctions validation + export attendues)
3. **Exécuter** :
   ```powershell
   .\tools\New-ModularScript.ps1 `
       -ScriptName "Get-EmptyADGroups" `
       -Description "Audit des groupes Active Directory vides" `
       -Domain AD `
       -IncludeFunctions Logging,Export,Validation
   ```
4. **Compléter** : Ouvrir les fichiers générés et ajouter la logique métier dans les TODO
5. **Informer** : "✅ Structure modulaire créée. Complétez les TODO dans Get-EmptyADGroups.ps1 et Private/\*.ps1"

**JAMAIS créer manuellement** la structure ou les fichiers. L'outil garantit :
- ✅ Respect des conventions CLAUDE.md
- ✅ Comment-based help complet
- ✅ Dot-sourcing automatique
- ✅ Templates fonctions prêts à l'emploi
- ✅ README pré-rempli
- ✅ .gitignore configuré

### Refactorisation Scripts Existants

**Si script existant > 300 lignes sans Private/ :**

1. **Créer structure modulaire** :
   ```powershell
   New-Item -Path ".\mon-script\Private" -ItemType Directory
   ```

2. **Extraire chaque fonction** dans un fichier `Private/Verb-Noun.ps1`

3. **Ajouter dot-sourcing** dans le wrapper :
   ```powershell
   #region Dot-source Private Functions
   $privateFunctions = Get-ChildItem -Path (Join-Path $PSScriptRoot "Private") -Filter "*.ps1"
   foreach ($function in $privateFunctions) {
       . $function.FullName
       Write-Verbose "Fonction chargée : $($function.Name)"
   }
   #endregion
   ```

4. **Supprimer définitions inline** du wrapper

**Guide complet** : Voir section "Guide : Appliquer le Pattern Modulaire aux Autres Scripts" dans cette conversation.

---

## 📚 Modules Réutilisables

**Documentation complète** : @docs/claude/modules.md

### Modules disponibles (24 fonctions)

| Module | Fonctions | Usage |
|--------|-----------|-------|
| **PSADTools** | 4 | Logging AD, validation module, audit sécurité AD |
| **PSDNSTools** | 6 | Opérations DNS, validation zones, audit sécurité |
| **PSRDMTools** | 12 | Automation Remote Desktop Manager (Devolutions) |
| **Utils-Credentials** | 1 | Récupération sécurisée credentials (Credential Manager) |
| **Local-Groups** | 1 | Audit groupes locaux intégrés |

### Quand utiliser un module ?

**Utiliser module existant si** :
- ✅ Fonction déjà existe dans modules/
- ✅ Utilisable dans 3+ scripts différents
- ✅ Aucune dépendance au script appelant

**Créer fonction Private/ si** :
- ❌ Spécifique à un seul script
- ❌ Dépend du contexte du script
- ❌ Pas assez générique pour réutilisation

### Convention d'import (DevSecOps)

```powershell
#Requires -Modules PSADTools

try {
    Import-Module PSADTools -ErrorAction Stop
}
catch {
    # Fallback dev : import relatif depuis repository
    $modulePath = Join-Path $PSScriptRoot "..\..\..\..\modules\psad-tools\src\PSADTools.psd1"
    Import-Module $modulePath
}
```

**Logique** :
1. Essai `Import-Module` par nom (cherche dans $env:PSModulePath)
2. Fallback relatif pour environnement dev sans installation

---

## 🎯 Model Routing : Sonnet vs Opus

### Stratégie
- **Défaut** : Sonnet 4.5 (40% moins cher en output)
- **Auto-bascule** : Opus 4.5 si demande complexe (détection par mots-clés)
- **Override manuel** : `/use sonnet` ou `/use opus` pour forcer

### Sonnet 4.5 (par défaut)

**Utiliser Sonnet pour :**
- Refactoring simple (renommage variables, structure)
- Corrections PSScriptAnalyzer (warnings, style)
- Ajout fonctions simples (logging, validation)
- Mise à jour README / CHANGELOG
- Scoring qualité projet (/10)
- Génération tests Pester basiques
- Formatage code, indentation
- Création GPO simples, scripts standard

**Exemples** :
```powershell
"Refactorise Get-ADUser.ps1 pour lisibilité"
"Corrige ces 3 warnings PSScriptAnalyzer"
"Ajoute une fonction Write-ScriptLog"
"Mets à jour le README avec params"
"Analyse la qualité de ce script"
```

### Opus 4.5 (complexe)

**Bascule automatique vers Opus si demande contient :**

| Mot-clé | Contexte | Raison |
|---------|----------|--------|
| **optimise** | "optimise pour 5k événements" | Analyse performance patterns |
| **performance** | "améliore la performance" | Design patterns complexes |
| **parallèle** / **parallel** | "parallélise le traitement" | ForEach -Parallel config |
| **pattern** / **patterns** | "applique le pattern hashtable" | Patterns library + context |
| **architecture** / **refonte** | "rearchitecture le projet" | DevOps 10/10 complet |
| **débogue** / **debug** | "débogue cette erreur" | Analysis multi-couches |
| **gros** / **large** | "traitement 10k+ items" | Volume données énorme |
| **complexe** / **complex** | "refactorise 3 scripts dépendants" | Dépendances croisées |

**Exemples** :
```powershell
"Optimise Export-KMSEvent.ps1 pour 10k événements (utilise patterns)"
"Débogue l'erreur 'ChartTitle not found' dans ImportExcel"
"Refonte complète Get-ServerInventory avec parallélisation adaptative"
"Rearchitecture projet tiering AD suivant DevOps 10/10"
"Analyse performance et crée patterns pour ce traitement"
```

### Override Manuel

**Force Sonnet (même si détecté complexe) :**
```
/use sonnet "Refactorise rapidement, pas besoin d'analyse profonde"
```

**Force Opus (même si simple) :**
```
/use opus "Analyse très fine, j'ai besoin du meilleur"
```

### Impact Économique

**Estimation quotidienne (100 interactions/jour) :**

| Scénario | Répartition | Opus output/jour | Coût |
|----------|-------------|-------------------|------|
| **All Opus** (avant) | 100% Opus | 200k tokens | ~5.00 $ |
| **Hybrid 50/50** | 50% Sonnet, 50% Opus | 100k tokens | ~2.50 $ |
| **Hybrid 70/30** | 70% Sonnet, 30% Opus | 60k tokens | ~1.50 $ |

---

## 🎯 Patterns Disponibles (10 patterns)

**Métadata complète** : @docs/claude/patterns-library-reference.json

| Pattern | Gain | Doc | Utilisé dans |
|---------|------|-----|------|
| **FilterHashtable Server-Side** | 50-100x | @docs/claude/patterns/performance/filterhash-server-side.md | Get-ServerReboots.ps1 |
| **Hashtable Lookup** | 40-70% | @docs/claude/patterns/performance/hashtable-lookup.md | Export-KMSEvent.ps1 |
| **Direct Get-WinEvent** | 20-40% | @docs/claude/patterns/performance/direct-get-winevent.md | Export-KMSEvent.ps1 |
| **ForEach-Object -Parallel Adaptatif** | 30-60% | @docs/claude/patterns/performance/foreach-parallel-adaptive.md | Export-KMSEvent.ps1 |
| **CIM Session Fallback** | +30% success | @docs/claude/patterns/domain-specific/cimsession-fallback.md | Audit-RdsUserProfiles.ps1 |
| **SID-Based Group Resolution** | International | @docs/claude/patterns/domain-specific/sid-based-group-resolution.md | Get-TieringAccountsAudit.ps1 |
| **Structured Logging** | Traceability | @docs/claude/patterns/structure/structured-logging.md | Tous scripts prod |
| **Error Handling by Type** | 3-5x faster debug | @docs/claude/patterns/debugging/error-handling-by-type.md | Export-KMSEvent.ps1 |
| **ValidateScript Test-Path** | Fail-fast | @docs/claude/patterns/debugging/validatescript-test-path.md | Get-EmptyADGroups.ps1 |
| **ImportExcel Pitfalls** | Évite debugging | @docs/claude/patterns/reporting/importexcel-pitfalls.md | Export-KMSEvent.ps1 |

---

## 🏆 Standard DevOps 10/10

Tous les projets doivent viser 10/10.

### Outils automatiques

```powershell
# Analyser complexité → modularisation requise ?
.\tools\Test-ScriptComplexity.ps1 -Path ".\chemin"

# Générer structure DevOps complète
.\tools\Initialize-DevOpsStructure.ps1 -ScriptPath ".\chemin\Script.ps1"

# Évaluer qualité projet (note /10)
.\tools\Test-ProjectQuality.ps1 -Path ".\chemin\projet" -Detailed
```

### Grille notation /10

| Critère | Points |
|---------|--------|
| Structure DevOps | /1.5 |
| Tests Pester exécutables | /2.0 |
| PSScriptAnalyzer (0 Error, ≤3 Warnings) | /1.0 |
| README complet | /1.5 |
| CHANGELOG.md | /0.5 |
| Documentation avancée | /1.0 |
| Config externalisée | /0.5 |

---

## 🚀 Patterns & Optimisation

### Capitalisation Automatique des Erreurs (OBLIGATOIRE)

Dès que 3+ erreurs du même type/module identifiées :

1. ✅ Créer pattern dans `docs/claude/patterns/[catégorie]/[nom].md`
2. ✅ Indexer dans `patterns-library.json`
3. ✅ Notifier : "🔔 **Pattern détecté** : [chemin]"

### Templates Disponibles

| Fichier | Usage |
|---------|-------|
| @docs/claude/prompts/create-script.md | Nouveau script (placement auto) |
| @docs/claude/prompts/analyze-code.md | Audit qualité scoring /10 |
| @docs/claude/prompts/analyze-security.md | Audit sécurité |
| @docs/claude/prompts/debug-script.md | Diagnostic structuré |
| @docs/claude/prompts/universalize-script.md | Rendre portable |

---

## 📚 Contexte Repository

**Objectif** : Scripts PowerShell enterprise-grade

**Environnement** : PS 7.4+, Windows Server 2019/2022, AD, Azure, Entra, DNS, VMware, RDS, WSUS, SQL, Avamar, Semperis, Jira, KMS

**Statistiques** : 155+ scripts, 119 READMEs, 5 modules, 13+ tests Pester

---

## 🔄 Git Workflow

- Branches : `feature/*`, `fix/*`
- JAMAIS push sur main
- Commits français : `feat(dns): ...`, `fix(ad): ...`
- Fichiers exclus : `.env`, `Credentials.xml`, `*.log`, `.vscode/settings.json`

---

## 📚 Références Officielles

- [PowerShell Learn](https://learn.microsoft.com/powershell/)
- [PSScriptAnalyzer](https://github.com/PowerShell/PSScriptAnalyzer)
- [Pester](https://pester.dev/)
- [PowerShell Style Guide](https://poshcode.gitbook.io/powershell-practice-and-style/)

---

**Maintainer**: Richie Bigot-Scoarnec avec Claude Code
