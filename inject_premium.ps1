$cssPath = "styles.css"
$htmlPath = "index.html"

$overrideCSS = @"

/* ============================================================================
   AREA 15: PREMIUM SAAS REDESIGN (OVERRIDE)
   ========================================================================== */

/* 1. Dashboard Top Cards Overhaul */
.card-solid {
  padding: 24px !important;
  border-radius: 24px !important;
  background: rgba(255, 255, 255, 0.8) !important;
  backdrop-filter: blur(24px) !important;
  -webkit-backdrop-filter: blur(24px) !important;
  color: var(--text) !important;
  border: 1px solid rgba(255, 255, 255, 0.8) !important;
  box-shadow: 0 10px 40px rgba(15, 23, 42, 0.06) !important;
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
}

.card-solid:hover {
  transform: translateY(-6px) scale(1.02) !important;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.12) !important;
  border-color: rgba(255, 255, 255, 1) !important;
}

/* Redefining the 4 main stats */
.stat-blue {
  border-bottom: 4px solid #0ea5e9 !important;
  background: linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,249,255,0.95) 100%) !important;
}
.stat-blue .val { color: #0ea5e9 !important; font-size: 3.2rem !important; font-weight: 900 !important; }
.stat-blue .lbl { color: #64748b !important; font-weight: 800 !important; text-transform: uppercase !important; letter-spacing: 1px !important; font-size: 0.85rem !important; }
.stat-blue .pill { background: #bae6fd !important; color: #0369a1 !important; font-weight: 800 !important; }

.stat-orange {
  border-bottom: 4px solid #f43f5e !important;
  background: linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,241,242,0.95) 100%) !important;
}
.stat-orange .val { color: #f43f5e !important; font-size: 3.2rem !important; font-weight: 900 !important; }
.stat-orange .lbl { color: #64748b !important; font-weight: 800 !important; text-transform: uppercase !important; letter-spacing: 1px !important; font-size: 0.85rem !important; }
.stat-orange .pill { background: #fecdd3 !important; color: #be123c !important; font-weight: 800 !important; }

.stat-cyan {
  border-bottom: 4px solid #10b981 !important;
  background: linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(236,253,245,0.95) 100%) !important;
}
.stat-cyan .val { color: #10b981 !important; font-size: 3.2rem !important; font-weight: 900 !important; }
.stat-cyan .lbl { color: #64748b !important; font-weight: 800 !important; text-transform: uppercase !important; letter-spacing: 1px !important; font-size: 0.85rem !important; }
.stat-cyan .pill { background: #a7f3d0 !important; color: #047857 !important; font-weight: 800 !important; }

.stat-green {
  border-bottom: 4px solid #f59e0b !important;
  background: linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(254,243,199,0.95) 100%) !important;
}
.stat-green .val { color: #f59e0b !important; font-size: 3.2rem !important; font-weight: 900 !important; }
.stat-green .lbl { color: #64748b !important; font-weight: 800 !important; text-transform: uppercase !important; letter-spacing: 1px !important; font-size: 0.85rem !important; }
.stat-green .pill { background: #fde68a !important; color: #b45309 !important; font-weight: 800 !important; }

/* 2. Company Pill Cards Overhaul */
.company-card {
  background: rgba(255, 255, 255, 0.7) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  border: 1px solid rgba(255, 255, 255, 0.9) !important;
  border-radius: 18px !important;
  padding: 16px !important;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.04) !important;
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.25s !important;
}
.company-card:hover {
  transform: translateY(-4px) scale(1.03) !important;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.1) !important;
  background: rgba(255, 255, 255, 0.95) !important;
  border-color: #0ea5e9 !important;
}
.company-card .name { font-weight: 800 !important; color: #0f172a !important; font-size: 0.95rem !important; }
.company-card .sub { color: #64748b !important; font-size: 0.75rem !important; font-weight: 600 !important; }
.company-card .badge {
  font-weight: 900 !important;
  font-size: 32px !important;
  background: -webkit-linear-gradient(45deg, #0ea5e9, #6366f1) !important;
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
}
.company-card.live {
  background: rgba(240, 249, 255, 0.85) !important;
  border-color: #7dd3fc !important;
}
.company-card.live .badge {
  background: -webkit-linear-gradient(45deg, #ef4444, #f59e0b) !important;
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
}

/* 3. Main Dashboard Background Overhaul */
body::after {
  background: radial-gradient(circle at 15% 50%, rgba(14, 165, 233, 0.15), transparent 40%),
              radial-gradient(circle at 85% 30%, rgba(244, 63, 94, 0.12), transparent 40%),
              radial-gradient(circle at 50% 80%, rgba(16, 185, 129, 0.1), transparent 40%) !important;
  opacity: 1 !important;
  z-index: -1 !important;
}
"@

Add-Content -Path $cssPath -Value $overrideCSS

# Update version param in index.html
$htmlContent = Get-Content -Path $htmlPath -Raw
$htmlContent = $htmlContent -replace 'styles\.css\?v=[a-zA-Z0-9_]+', 'styles.css?v=extreme_wow_v3'
Set-Content -Path $htmlPath -Value $htmlContent

Write-Host "Premium Overhaul Injected Successfully."
