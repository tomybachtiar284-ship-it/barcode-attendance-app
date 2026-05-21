$appJsPath = "app.js"
$utilsJsPath = "js/utils.js"
$htmlPath = "index.html"

if (!(Test-Path "js")) {
    New-Item -ItemType Directory -Force -Path "js" | Out-Null
}

$utilsCode = @"
// Utility Functions Extracted from app.js
window.`$ = (s, r = document) => r.querySelector(s);
window.`$`$ = (s, r = document) => [...r.querySelectorAll(s)];
window.now = () => new Date();
window.pad = n => String(n).padStart(2, '0');
window.fmtTs = ts => { const d = new Date(ts); return ``${d.getFullYear()}-${window.pad(d.getMonth() + 1)}-${window.pad(d.getDate())} ${window.pad(d.getHours())}:${window.pad(d.getMinutes())}:${window.pad(d.getSeconds())}``; }
window.todayISO = () => { const d = window.now(); return ``${d.getFullYear()}-${window.pad(d.getMonth() + 1)}-${window.pad(d.getDate())}``; }
window.capStatus = s => { if (s === 'datang') return 'Masuk'; if (s === 'break_out') return 'Izin'; if (s === 'break_in') return 'Kembali'; if (s === 'alpha') return 'Tanpa Ket.'; return 'Keluar'; };
window.load = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
window.save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
window.loadEdu = () => { try { return JSON.parse(localStorage.getItem('SA_EDUCATION') || '[]'); } catch { return []; } };
window.saveEdu = (arr) => localStorage.setItem('SA_EDUCATION', JSON.stringify(arr));
window.esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
window.toast = function(m) { const t = document.createElement('div'); t.textContent = m; t.style.position = 'fixed'; t.style.right = '18px'; t.style.bottom = '18px'; t.style.background = 'rgba(12,18,32,.95)'; t.style.border = '1px solid #1f2636'; t.style.padding = '10px 14px'; t.style.borderRadius = '12px'; t.style.color = '#e8edf3'; t.style.zIndex = 999999; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
"@

$utilsCode | Set-Content -Path $utilsJsPath -Encoding UTF8

$appLines = Get-Content -Path $appJsPath -Encoding UTF8
$newAppLines = @()
$skip = $false

foreach ($line in $appLines) {
    if ($line.Trim().StartsWith("const `$ =")) {
        $skip = $true
    }
    
    if ($skip -and $line.Trim().StartsWith("function toast(m)")) {
        $skip = $false
        continue
    }
    
    if (-not $skip) {
        $newAppLines += $line
    }
}

$newAppLines | Set-Content -Path $appJsPath -Encoding UTF8

$htmlContent = Get-Content -Path $htmlPath -Raw -Encoding UTF8
if ($htmlContent -match '<script src="app.js"></script>') {
    $htmlContent = $htmlContent -replace '<script src="app.js"></script>', "<script src=`"js/utils.js`"></script>`n  <script src=`"app.js`"></script>"
} elseif ($htmlContent -match '<script src="config.local.js"></script>') {
    $htmlContent = $htmlContent -replace '<script src="config.local.js"></script>', "<script src=`"js/utils.js`"></script>`n  <script src=`"config.local.js`"></script>"
}

$htmlContent | Set-Content -Path $htmlPath -Encoding UTF8

Write-Host "Extraction 1 (Utils) Complete."
