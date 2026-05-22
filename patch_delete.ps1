$appJsPath = "app.js"
$content = Get-Content -Path $appJsPath -Raw

# 1. Update delAttendance to alert on error
$oldDel = @"
  async function delAttendance(ts) {
    if (!sb) return;
    // Try delete from both to be safe
    await sb.from('attendance').delete().eq('ts', ts);
    await sb.from('breaks').delete().eq('ts', ts);
  }
"@

$newDel = @"
  async function delAttendance(ts) {
    if (!sb) return;
    // Try delete from both to be safe
    const { error: err1 } = await sb.from('attendance').delete().eq('ts', ts);
    if (err1) {
      console.error('Supabase Delete Error (attendance):', err1);
      alert('Gagal menghapus data dari Supabase (Cek Policy DELETE RLS Anda!). Pesan: ' + err1.message);
      throw err1;
    }
    const { error: err2 } = await sb.from('breaks').delete().eq('ts', ts);
    if (err2) {
      console.error('Supabase Delete Error (breaks):', err2);
    }
  }
"@

if ($content.Contains("async function delAttendance(ts) {")) {
    # We use regex replace to handle slight whitespace variations
    $content = $content -replace '(?s)  async function delAttendance\(ts\) \{.*?\}', $newDel
}

# 2. Add window.deleteAttendance globally so the inline onclick works
$globalDelete = @"

  // ==========================================
  // GLOBAL DELETE ATTENDANCE (FIX HAPUS INLINE)
  // ==========================================
  window.deleteAttendance = async function(ts) {
    if (!confirm('Hapus baris kehadiran ini? Data akan terhapus dari server.')) return;
    
    // Hapus dari cloud
    try {
      await delAttendance(ts);
    } catch(err) {
      return; // Berhenti jika gagal di cloud (misal karena RLS)
    }

    // Jika sukses di cloud, baru hapus di memori lokal
    const idx = attendance.findIndex(a => a.ts === ts);
    if (idx >= 0) {
      attendance.splice(idx, 1);
      save(LS_ATT, attendance); 
      syncGlobals(); 
      if (typeof filterAttendance === 'function') filterAttendance();
      toast('Data berhasil dihapus selamanya.');
    }
  };

"@

# Append to the end of app.js
$content = $content + $globalDelete

Set-Content -Path $appJsPath -Value $content
Write-Host "app.js patched successfully for delete functions."
