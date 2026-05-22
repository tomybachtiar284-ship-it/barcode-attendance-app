$htmlPath = "index.html"
$content = Get-Content -Path $htmlPath -Raw

$modalHTML = @"
  </main>

  <!-- MODAL: STATISTIK AKTIF / DAFTAR HADIR -->
  <dialog id="activePersonnelModal" style="border: none; border-radius: 16px; padding: 20px; max-width: 500px; width: 95%; background: #ffffff; box-shadow: 0 20px 50px rgba(0,0,0,0.3);">
    <style>
      #activePersonnelModal::backdrop { background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(5px); }
      #activePersonnelList::-webkit-scrollbar { width: 6px; }
      #activePersonnelList::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
    </style>
    <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 1.1rem; color: #0f172a; font-weight: 800; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f8fafc; padding-bottom: 12px; font-family: 'Outfit', sans-serif;">
      Personil Aktif 
      <button onclick="document.getElementById('activePersonnelModal').close()" style="background: none; border: none; font-size: 1.5rem; color: #94a3b8; cursor: pointer; transition: 0.2s;">&times;</button>
    </h3>
    <div id="activePersonnelList" style="max-height: 65vh; overflow-y: auto; padding-right: 8px;">
      <!-- List injected by JS -->
    </div>
  </dialog>

"@

# Replace </main> with the modal included
$content = $content -replace '</main>', $modalHTML

Set-Content -Path $htmlPath -Value $content
Write-Host "Modal List injected successfully."
