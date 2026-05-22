$appJsPath = "app.js"
$content = Get-Content -Path $appJsPath -Raw

# Fix 1: Reduce compression size to prevent QuotaExceededError
$content = $content.Replace(
    "imgDataUrl = await compressImage(fileInput.files[0], 800, 800, 0.8);",
    "imgDataUrl = await compressImage(fileInput.files[0], 400, 400, 0.6);"
)

# Fix 2: Wrap save locally in try/catch to alert user of memory limits
$oldSave = @"
    save(LS_EMP, employees); syncGlobals();

    // Save locally first
    renderEmployees(); renderDashboard(); `$('#empModal')?.close();
    toast('Data tersimpan di lokal. Mengirim ke server...');
"@

$newSave = @"
    try {
      save(LS_EMP, employees); syncGlobals();
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.message.includes('quota')) {
        alert("Penyimpanan Gagal: Memori browser penuh!\nFoto terlalu besar atau data karyawan terlalu banyak. Silakan gunakan resolusi kamera/foto yang lebih kecil, atau hapus foto lama.");
      } else {
        alert("Penyimpanan Gagal: " + e.message);
      }
      return; // Stop here, keep modal open
    }

    // Save locally first
    renderEmployees(); renderDashboard(); `$('#empModal')?.close();
    toast('Data tersimpan di lokal. Mengirim ke server...');
"@
$content = $content.Replace($oldSave, $newSave)

# Fix 3: Don't erase photos on Sync
$oldSync = @"
      if (emps) {
        // Map data, keeping existing photo if available locally, or null
        employees = emps.map(x => ({
          nid: x.nid, name: x.name, title: x.title, company: x.company,
          shift: x.shift,
          photo: null // Photo disabled in sync to save bandwidth
        }));
        save(LS_EMP, employees);
      }
"@

$newSync = @"
      if (emps) {
        // Map data, keeping existing photo if available locally
        const oldMap = new Map();
        if (typeof employees !== 'undefined' && Array.isArray(employees)) {
            employees.forEach(e => { if (e.photo) oldMap.set(e.nid, e.photo); });
        }
        
        employees = emps.map(x => ({
          nid: x.nid, name: x.name, title: x.title, company: x.company,
          shift: x.shift,
          photo: oldMap.get(x.nid) || null // keep existing photo
        }));
        save(LS_EMP, employees);
      }
"@
$content = $content.Replace($oldSync, $newSync)

Set-Content -Path $appJsPath -Value $content
Write-Host "app.js patched successfully for edit/save bugs."
