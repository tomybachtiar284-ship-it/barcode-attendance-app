-- =================================================================
-- SCRIPT PEMULIHAN AKSES CLOUD (RESET & FIX RLS)
-- =================================================================
-- Script ini akan:
-- 1. Menghapus policy lama yang mungkin bermasalah (DROP POLICY).
-- 2. Membuka akses penuh (SELECT, INSERT, UPDATE, DELETE) untuk Public.
-- 3. Memastikan Laptop dan HP bisa saling baca-tulis data.
-- =================================================================

-- 1. Tabel ATTENDANCE (Absensi)
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access Attendance" ON attendance;
DROP POLICY IF EXISTS "Enable read access for all users" ON attendance;
DROP POLICY IF EXISTS "Enable insert for all users" ON attendance;
CREATE POLICY "Public Access Attendance" ON attendance FOR ALL USING (true) WITH CHECK (true);

-- 2. Tabel EMPLOYEES (Karyawan)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access Employees" ON employees;
DROP POLICY IF EXISTS "Enable read access for all users" ON employees;
CREATE POLICY "Public Access Employees" ON employees FOR ALL USING (true) WITH CHECK (true);

-- 3. Tabel INVENTORY (Barang)
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access Inventory" ON inventory;
CREATE POLICY "Public Access Inventory" ON inventory FOR ALL USING (true) WITH CHECK (true);

-- 4. Tabel BREAKS (Istirahat/Izin)
ALTER TABLE breaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access Breaks" ON breaks;
CREATE POLICY "Public Access Breaks" ON breaks FOR ALL USING (true) WITH CHECK (true);

-- 5. Tabel NEWS (Informasi)
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access News" ON news;
CREATE POLICY "Public Access News" ON news FOR ALL USING (true) WITH CHECK (true);

-- 6. Tabel EDUCATION (Materi)
ALTER TABLE education ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access Education" ON education;
CREATE POLICY "Public Access Education" ON education FOR ALL USING (true) WITH CHECK (true);

-- 7. Tabel SHIFTS (Pengaturan Shift Waktu)
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access Shifts" ON shifts;
CREATE POLICY "Public Access Shifts" ON shifts FOR ALL USING (true) WITH CHECK (true);

-- 8. Tabel SHIFT_MONTHLY (Jadwal Bulanan)
ALTER TABLE shift_monthly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access Monthly Shifts" ON shift_monthly;
CREATE POLICY "Public Access Monthly Shifts" ON shift_monthly FOR ALL USING (true) WITH CHECK (true);

-- Selesai! Klik RUN untuk menjalankan.
