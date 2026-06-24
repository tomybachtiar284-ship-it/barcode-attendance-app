-- ============================================================================
-- TEMPLATE SQL UNTUK MENETAPKAN ROLE PENGGUNA (SUPABASE USER METADATA)
-- ============================================================================
-- Petunjuk Penggunaan:
-- 1. Cari blok role yang ingin Anda berikan kepada user baru.
-- 2. Ganti email 'email_user_baru@gmail.com' dengan email asli user tersebut.
-- 3. Blok perintah tersebut, lalu klik RUN di SQL Editor Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ROLE: ADMIN (Akses Penuh Seluruh Fitur)
-- ----------------------------------------------------------------------------
UPDATE auth.users 
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
WHERE email = 'email_user_baru@gmail.com';


-- ----------------------------------------------------------------------------
-- 2. ROLE: SECURITY (Akses Scan Barcode, Shift Setting, Keluar Masuk Barang)
-- ----------------------------------------------------------------------------
UPDATE auth.users 
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"role": "security"}'::jsonb
WHERE email = 'email_user_baru@gmail.com';


-- ----------------------------------------------------------------------------
-- 3. ROLE: GUDANG (Akses Hanya Keluar Masuk Barang)
-- ----------------------------------------------------------------------------
UPDATE auth.users 
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"role": "gudang"}'::jsonb
WHERE email = 'email_user_baru@gmail.com';


-- ----------------------------------------------------------------------------
-- 4. ROLE: STAF GUDANG (Sama dengan Gudang - Alternatif Penulisan)
-- ----------------------------------------------------------------------------
UPDATE auth.users 
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"role": "staf_gudang"}'::jsonb
WHERE email = 'email_user_baru@gmail.com';
