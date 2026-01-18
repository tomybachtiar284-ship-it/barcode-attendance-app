-- =================================================================
-- SCRIPT PERBAIKAN TABEL BREAKS (AMAN / SAFE MODE)
-- =================================================================
-- Tujuan: Memperbaiki error "Duplicate Key" / "ON CONFLICT".
-- Keamanan: Aman. Data duplikat (jika ada) akan dibersihkan dulu.
-- =================================================================

-- 1. BERSIHKAN DUPLIKAT TERLEBIH DAHULU (PENTING!)
-- Jika ada data 'jam' yang sama persis, kita hapus salah satunya
-- agar saat aturan dibuat, tidak error.
DELETE FROM breaks
WHERE id IN (
    SELECT id
    FROM (
        SELECT id, ROW_NUMBER() OVER (partition BY ts ORDER BY created_at DESC) as rnum
        FROM breaks
    ) t
    WHERE t.rnum > 1
);

-- 2. HAPUS Constraint LAMA (Jika ada, agar bersih)
ALTER TABLE breaks DROP CONSTRAINT IF EXISTS breaks_ts_unique;

-- 3. TAMBAHKAN Aturan "WAJIB UNIK" (Unique Constraint)
-- Ini yang mambuat fitur Sync bekerja benar (replace jika ada, insert jika baru)
ALTER TABLE breaks ADD CONSTRAINT breaks_ts_unique UNIQUE (ts);

-- Selesai! Klik RUN.
