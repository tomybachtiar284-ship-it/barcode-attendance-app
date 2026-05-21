$htmlPath = "index.html"
$htmlContent = Get-Content -Path $htmlPath -Raw

# 1. Fix the mangled bottom nav bar at the end of the file
$badNavRegex = '(?s)  <!-- MOBILE BOTTOM NAV \(5 Items\) -->\s*<nav class="mobile-bottom-nav">.*?</nav>'
# Wait, the nav might be mangled so it doesn't even close properly.
$replaceTarget = '(?s)  <!-- MOBILE BOTTOM NAV \(5 Items\) -->.*<script src="js/utils.js">'

$fixedNav = @"
  <!-- MOBILE BOTTOM NAV (5 Items) -->
  <nav class="mobile-bottom-nav">
    <div class="mb-item active" data-route="dashboard" onclick="window.appRoute('dashboard')">
      <div class="icon">🏠</div><span>Beranda</span>
    </div>
    <div class="mb-item" data-route="scan" onclick="window.appRoute('scan')">
      <div class="icon">📸</div><span>Absen</span>
    </div>
    <div class="mb-item" data-route="employees" onclick="window.appRoute('employees')">
      <div class="icon">👥</div><span>Karyawan</span>
    </div>
    <div class="mb-item" data-route="inventory" onclick="window.appRoute('inventory')">
      <div class="icon">📦</div><span>Logistik</span>
    </div>
    <div class="mb-item" onclick="window.toggleMobileMenu()">
      <div class="icon">☰</div><span>Menu</span>
    </div>
  </nav>

  <script src="js/utils.js">
"@

$htmlContent = $htmlContent -replace $replaceTarget, $fixedNav

# 2. Insert scanSuccessModal right before </section> of route-scan
$modalHTML = @"
      <!-- ============================================== -->
      <!-- CENTER-STAGE POP-UP MODAL UNTUK HASIL SCAN     -->
      <!-- ============================================== -->
      <div id="scanSuccessModal" class="hidden">
        <div class="ss-modal-overlay"></div>
        <div class="ss-modal-card">
          <div class="ss-modal-header">
            <div class="ss-modal-logo">AMAN-S APP</div>
            <div class="ss-modal-time" id="ssModalTime">--:--</div>
          </div>
          <div class="ss-modal-body">
            <div class="ss-photo-wrap">
              <div id="ssPhoto" class="ss-photo"></div>
              <div id="ssStatusBadge" class="ss-status-badge">✅ MASUK</div>
            </div>
            <div class="ss-info-wrap">
              <h2 id="ssName">Nama Karyawan</h2>
              <p id="ssNID" class="ss-nid">NID: -</p>
              <div class="ss-divider"></div>
              <p id="ssTitle" class="ss-title">-</p>
              <p id="ssCompany" class="ss-company">-</p>
            </div>
          </div>
          <div class="ss-modal-footer">
            <div id="ssNote" class="ss-note">Scan Berhasil</div>
          </div>
        </div>
      </div>
    </section>
"@

$htmlContent = $htmlContent -replace '(?s)    </section>\s*<!-- EMPLOYEES -->', "$modalHTML`r`n    <!-- EMPLOYEES -->"

Set-Content -Path $htmlPath -Value $htmlContent
Write-Host "Fixed Navigation and Modal successfully."
