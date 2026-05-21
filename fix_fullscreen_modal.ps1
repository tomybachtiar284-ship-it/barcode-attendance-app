$cssPath = "styles.css"
$htmlPath = "index.html"

$overrideCSS = @"

/* ============================================================================
   AREA 17: FIX FULLSCREEN MODAL Z-INDEX
   ========================================================================== */

#route-scan:fullscreen > #scanSuccessModal,
#route-scan:-webkit-full-screen > #scanSuccessModal {
  position: fixed !important;
  z-index: 99999 !important;
}

#scanSuccessModal {
  position: fixed !important;
  z-index: 99999 !important;
}

"@

Add-Content -Path $cssPath -Value $overrideCSS

# Update version param in index.html to clear cache
$htmlContent = Get-Content -Path $htmlPath -Raw
$htmlContent = $htmlContent -replace 'styles\.css\?v=[a-zA-Z0-9_]+', 'styles.css?v=fullscreen_fix_v4'
Set-Content -Path $htmlPath -Value $htmlContent

Write-Host "Fullscreen CSS Fix Injected Successfully."
