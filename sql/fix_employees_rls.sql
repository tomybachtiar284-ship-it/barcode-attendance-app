-- SCRIPT PERBAIKAN IZIN TABEL EMPLOYEES
-- Jalankan ini di SQL Editor Supabase

-- 1. Pastikan tabel employees ada
CREATE TABLE IF NOT EXISTS public.employees (
    nid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    title TEXT,
    company TEXT,
    shift TEXT,
    photo TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Aktifkan Row Level Security (RLS)
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- 3. Hapus policy lama jika ada (untuk reset)
DROP POLICY IF EXISTS "Public Full Access employees" ON public.employees;
DROP POLICY IF EXISTS "Public Read employees" ON public.employees;
DROP POLICY IF EXISTS "Public Write employees" ON public.employees;

-- 4. Buat Policy Baru: Boleh BACA, TULIS, EDIT, HAPUS untuk semua orang (Anon)
-- (Sesuai kebutuhan aplikasi tanpa login user database)
CREATE POLICY "Public Full Access employees"
ON public.employees
FOR ALL
USING (true)
WITH CHECK (true);

-- 5. Cek Ulang: Grant usage schema
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON TABLE public.employees TO anon;
GRANT ALL ON TABLE public.employees TO authenticated;
