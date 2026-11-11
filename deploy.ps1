$APP_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$SRC_DIR = Join-Path $APP_DIR "src"
$DOWNLOADS = Join-Path $env:USERPROFILE "Downloads"
Set-Location $APP_DIR
$files = @("App.jsx", "firebase.js", "main.jsx", "index.html")
$copied = @()
foreach ($file in $files) {
    $src = Join-Path $DOWNLOADS $file
    $dst = if ($file -eq "index.html") { Join-Path $APP_DIR $file } else { Join-Path $SRC_DIR $file }
    if (Test-Path $src) {
        Move-Item $src $dst -Force
        $copied += $file
        Write-Host "Copied: $file" -ForegroundColor Green
    }
}
if ($copied.Count -eq 0) {
    Write-Host "No files in Downloads." -ForegroundColor Yellow
    Read-Host "Press Enter"
    exit
}
$status = git status --porcelain
if (-not $status) { Write-Host "Nothing to commit."; Read-Host "Press Enter"; exit }
$msg = Read-Host "Commit message"
if (-not $msg) { $msg = "update app" }
git add .
git commit -m $msg
git push
Write-Host "Done!" -ForegroundColor Green
Read-Host "Press Enter"
