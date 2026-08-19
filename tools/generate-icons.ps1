<#
.SYNOPSIS
    Génère les icônes PWA de FairSplit aux couleurs de la marque.

.DESCRIPTION
    Produit quatre fichiers à la racine du dépôt :
      icon-192.png / icon-512.png                   → purpose "any"
      icon-192-maskable.png / icon-512-maskable.png → purpose "maskable"

    Deux variantes distinctes sont nécessaires. Une icône « maskable » est
    rognée par le système (cercle, squircle, carré arrondi selon le lanceur) :
    son fond doit couvrir tout le canevas et son motif tenir dans la zone sûre
    centrale (cercle de rayon 40 % de la largeur). Une icône « any » est
    affichée telle quelle et doit donc porter sa propre forme.
    Déclarer le même fichier pour les deux rôles donne soit une icône rognée,
    soit une icône flottant dans du vide.

    Le motif — un disque coupé par un intervalle décentré en deux segments
    inégaux — traduit le propos du produit : un partage, proportionnel et non
    à parts égales. Il reste lisible à 48 px, contrairement à des initiales.

.EXAMPLE
    pwsh -NoProfile -File tools/generate-icons.ps1
    Régénère les quatre icônes à la racine du dépôt.
#>
[CmdletBinding()]
param(
    [ValidateNotNullOrEmpty()]
    [string]$OutputPath = (Join-Path $PSScriptRoot '..')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

# Couleurs de marque — alignées sur css/variables.css et manifest.json
$brandFrom = [System.Drawing.Color]::FromArgb(0x4F, 0x46, 0xE5)   # --primary-color
$brandTo   = [System.Drawing.Color]::FromArgb(0x7C, 0x3A, 0xED)   # --secondary-color

function New-RoundedRectPath {
    param([float]$X, [float]$Y, [float]$W, [float]$H, [float]$Radius)

    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $d = $Radius * 2
    $path.AddArc($X, $Y, $d, $d, 180, 90)
    $path.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
    $path.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
    $path.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-Icon {
    param(
        [Parameter(Mandatory)][int]$Size,
        [Parameter(Mandatory)][bool]$Maskable,
        [Parameter(Mandatory)][string]$Destination
    )

    $bmp = [System.Drawing.Bitmap]::new($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $rect = [System.Drawing.RectangleF]::new(0, 0, $Size, $Size)
    # 45° en GDI+ (angle depuis l'axe X, Y vers le bas) équivaut à 135deg en CSS
    # (angle depuis le haut) : haut-gauche → bas-droite, comme le header de l'app.
    $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, $brandFrom, $brandTo, 45.0)

    if ($Maskable) {
        # Fond à fond perdu : le système appliquera sa propre forme
        $g.FillRectangle($gradient, $rect)
        # Zone sûre = cercle de rayon 40 % ; on reste à 28 % pour la marge
        $markDiameter = $Size * 0.56
    }
    else {
        # L'icône porte sa propre forme : carré arrondi façon squircle
        $shape = New-RoundedRectPath -X 0 -Y 0 -W $Size -H $Size -Radius ($Size * 0.22)
        $g.FillPath($gradient, $shape)
        $shape.Dispose()
        $markDiameter = $Size * 0.62
    }

    # Motif : disque scindé en deux segments inégaux par un intervalle vertical
    $markX = ($Size - $markDiameter) / 2
    $markY = ($Size - $markDiameter) / 2

    $disc = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $disc.AddEllipse($markX, $markY, $markDiameter, $markDiameter)

    $previousClip = $g.Clip
    $g.SetClip($disc)

    # Découpe à 58 % : la part gauche est visiblement majoritaire
    $splitX = $markX + ($markDiameter * 0.58)
    $gap = $Size * 0.045

    $solid = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $muted = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(140, 255, 255, 255))

    $g.FillRectangle($solid, $markX - 1, $markY - 1, ($splitX - $gap / 2) - $markX + 1, $markDiameter + 2)
    $g.FillRectangle($muted, $splitX + $gap / 2, $markY - 1, ($markX + $markDiameter) - ($splitX + $gap / 2) + 1, $markDiameter + 2)

    $g.Clip = $previousClip

    $solid.Dispose(); $muted.Dispose(); $disc.Dispose(); $gradient.Dispose(); $g.Dispose()

    $bmp.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()

    Write-Host ("  {0}  ({1}x{1})" -f (Split-Path $Destination -Leaf), $Size)
}

$root = (Resolve-Path $OutputPath).Path
Write-Host 'Génération des icônes FairSplit :'

New-Icon -Size 192 -Maskable $false -Destination (Join-Path $root 'icon-192.png')
New-Icon -Size 512 -Maskable $false -Destination (Join-Path $root 'icon-512.png')
New-Icon -Size 192 -Maskable $true  -Destination (Join-Path $root 'icon-192-maskable.png')
New-Icon -Size 512 -Maskable $true  -Destination (Join-Path $root 'icon-512-maskable.png')

Write-Host 'Terminé.'
