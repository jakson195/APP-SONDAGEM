# Instala ResIPy 3.6.6 a partir da pasta local e cria venv Python 3.12.
# Uso:
#   powershell -File scripts/install_resipy_local.ps1
#   powershell -File scripts/install_resipy_local.ps1 -ResipyPath "C:\Users\jakso\Downloads\resipy-3.6.6\resipy-3.6.6"

param(
    [string]$ResipyPath = "C:\Users\jakso\Downloads\resipy-3.6.6\resipy-3.6.6"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Venv = Join-Path $Root ".venv-geophysics"

if (-not (Test-Path (Join-Path $ResipyPath "setup.py"))) {
    throw "ResIPy não encontrado em: $ResipyPath"
}

$py312 = $null
foreach ($line in (& py -0p 2>$null)) {
    if ($line -match "3\.12") {
        $py312 = ($line -split "\s+")[-1]
        break
    }
}
if (-not $py312) {
    Write-Host "Python 3.12 não encontrado. A instalar via winget..."
    winget install Python.Python.3.12 --source winget --accept-package-agreements --accept-source-agreements
    foreach ($line in (& py -0p 2>$null)) {
        if ($line -match "3\.12") {
            $py312 = ($line -split "\s+")[-1]
            break
        }
    }
}
if (-not $py312) { throw "Python 3.12 obrigatório (ResIPy exige numpy<2)." }

if (Test-Path $Venv) { Remove-Item -Recurse -Force $Venv }
& $py312 -m venv $Venv
$pip = Join-Path $Venv "Scripts\pip.exe"
$py = Join-Path $Venv "Scripts\python.exe"

& $pip install "numpy>=1.26,<2" --only-binary=:all:
& $pip install -r (Join-Path $Root "requirements.txt")
& $pip install pandas matplotlib scipy psutil chardet requests pyvista gmsh
& $pip install -e $ResipyPath

& $py -c "from resipy import Project; print('ResIPy OK', Project.__name__)"
Write-Host ""
Write-Host "Venv pronto: $Venv"
Write-Host "Arranque o motor: npm run geophysics:engine (na pasta app-web)"
