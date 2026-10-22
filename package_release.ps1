# PowerShell Script to Package barcode-attendance-app Cleanly

$ProjectDir = Get-Location
$ReleaseDirName = "barcode-attendance-release"
$ReleasePath = Join-Path $ProjectDir $ReleaseDirName
$ZipPath = Join-Path $ProjectDir "$ReleaseDirName.zip"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Mulai memaketkan barcode-attendance-app..." -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Bersihkan folder rilis lama jika ada
if (Test-Path $ReleasePath) {
    Write-Host "Menghapus folder rilis lama..." -ForegroundColor Yellow
    Remove-Item -Path $ReleasePath -Recurse -Force
}

# 2. Hapus file zip lama jika ada
if (Test-Path $ZipPath) {
    Write-Host "Menghapus file zip lama..." -ForegroundColor Yellow
    Remove-Item -Path $ZipPath -Force
}

# 3. Buat folder rilis bersih
Write-Host "Membuat folder rilis baru..." -ForegroundColor Green
New-Item -ItemType Directory -Force -Path $ReleasePath | Out-Null

# 4. Daftar file utama di root yang akan disalin
$FilesToCopy = @(
    "index.html",
    "app.js",
    "styles.css",
    "login.html",
    "login.css",
    "login.app.js",
    "scan.html",
    "scan_logic.js",
    "scan-styles.css",
    "mobile.html",
    "mobile-stats.js",
    "manifest.json",
    "service-worker.js",
    "config.local.js",
    "readme.txt"
)

# 5. Salin file root
foreach ($File in $FilesToCopy) {
    $SrcFile = Join-Path $ProjectDir $File
    if (Test-Path $SrcFile) {
        $DestFile = Join-Path $ReleasePath $File
        Write-Host "Menyalin: $File"
        Copy-Item -Path $SrcFile -Destination $DestFile -Force
    } else {
        Write-Host "Peringatan: File $File tidak ditemukan!" -ForegroundColor Yellow
    }
}

# 6. Daftar folder yang akan disalin
$FoldersToCopy = @("js", "assets", "sql")

# 7. Salin folder
foreach ($Folder in $FoldersToCopy) {
    $SrcFolder = Join-Path $ProjectDir $Folder
    if (Test-Path $SrcFolder) {
        $DestFolder = Join-Path $ReleasePath $Folder
        Write-Host "Menyalin folder: $Folder"
        Copy-Item -Path $SrcFolder -Destination $DestFolder -Recurse -Force
    } else {
        Write-Host "Peringatan: Folder $Folder tidak ditemukan!" -ForegroundColor Yellow
    }
}

# 8. Kompres menjadi file ZIP
Write-Host "Mengompres menjadi ZIP..." -ForegroundColor Green
Compress-Archive -Path "$ReleasePath\*" -DestinationPath $ZipPath -Force

# 9. Bersihkan folder sementara
Write-Host "Membersihkan folder sementara..." -ForegroundColor Yellow
Remove-Item -Path $ReleasePath -Recurse -Force

Write-Host "=============================================" -ForegroundColor Green
Write-Host "BERHASIL!" -ForegroundColor Green
Write-Host "File penyerahan siap di: $ZipPath" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
