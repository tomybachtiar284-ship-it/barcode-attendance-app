$cssPath = "styles.css"
$htmlPath = "index.html"

$overrideCSS = @"

/* ============================================================================
   AREA 16: CENTER-STAGE POP-UP MODAL (SCAN RESULT)
   ========================================================================== */

#scanSuccessModal {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

#scanSuccessModal.hidden {
  display: none !important;
}

.ss-modal-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: -1;
  animation: ssFadeIn 0.3s ease-out forwards;
}

.ss-modal-card {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 1);
  border-radius: 32px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 25px 60px rgba(15, 23, 42, 0.2);
  overflow: hidden;
  animation: ssPopUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  display: flex;
  flex-direction: column;
}

.ss-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: rgba(255, 255, 255, 0.5);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.ss-modal-logo {
  font-family: 'Outfit', sans-serif;
  font-weight: 800;
  color: #0f172a;
  font-size: 1.1rem;
  letter-spacing: -0.5px;
}

.ss-modal-time {
  font-family: monospace;
  font-weight: 700;
  color: #64748b;
  background: #f1f5f9;
  padding: 4px 10px;
  border-radius: 99px;
  font-size: 0.9rem;
}

.ss-modal-body {
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;
}

.ss-photo-wrap {
  position: relative;
  margin-bottom: 24px;
}

.ss-photo {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background-color: #e2e8f0;
  background-size: cover;
  background-position: center;
  border: 4px solid #fff;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
}

.ss-status-badge {
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
  font-weight: 800;
  font-family: 'Outfit', sans-serif;
  padding: 6px 16px;
  border-radius: 99px;
  font-size: 0.9rem;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  border: 2px solid #fff;
}
.ss-status-badge.late {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
}
.ss-status-badge.danger {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.ss-info-wrap h2 {
  font-size: 1.6rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 4px 0;
  line-height: 1.2;
}

.ss-nid {
  font-size: 0.9rem;
  color: #64748b;
  font-weight: 600;
  margin: 0;
}

.ss-divider {
  width: 40px;
  height: 4px;
  background: #cbd5e1;
  border-radius: 2px;
  margin: 16px auto;
}

.ss-title {
  font-size: 1rem;
  font-weight: 700;
  color: #334155;
  margin: 0 0 4px 0;
}

.ss-company {
  font-size: 0.85rem;
  color: #94a3b8;
  font-weight: 600;
  margin: 0;
}

.ss-modal-footer {
  background: #f8fafc;
  padding: 16px 24px;
  text-align: center;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.ss-note {
  font-size: 0.95rem;
  font-weight: 700;
  color: #0284c7;
}

@keyframes ssFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes ssPopUp {
  from { opacity: 0; transform: translateY(40px) scale(0.9); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

"@

Add-Content -Path $cssPath -Value $overrideCSS

# Update version param in index.html to clear cache
$htmlContent = Get-Content -Path $htmlPath -Raw
$htmlContent = $htmlContent -replace 'styles\.css\?v=[a-zA-Z0-9_]+', 'styles.css?v=scan_modal_v1'
Set-Content -Path $htmlPath -Value $htmlContent

Write-Host "Modal CSS Injected Successfully."
