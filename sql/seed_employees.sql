-- SCRIPT SEED DATA KARYAWAN (DUMMY)
-- Jalankan script ini di SQL Editor Supabase untuk mengisi data karyawan

INSERT INTO public.employees (nid, name, title, company, shift, photo) VALUES
('EMP001', 'Budi Santoso', 'Teknisi Senior', 'PT. PLN NPS', 'A', ''),
('EMP002', 'Siti Aminah', 'Admin Logistik', 'PT. PLN NPS', 'A', ''),
('EMP003', 'Agus Setiawan', 'Operator Lapangan', 'PT. PLN NPS', 'B', ''),
('EMP004', 'Rudi Hartono', 'Security', 'PT. PLN NPS', 'C', ''),
('EMP005', 'Dewi Lestari', 'Staff Keuangan', 'PT. PLN NPS', 'D', ''),
('EMP006', 'Eko Prasetyo', 'Manager Area', 'PT. PLN NPS', 'DAYTIME', ''),
('EMP007', 'Fajar Nugraha', 'Teknisi Junior', 'PT. PLN NPS', 'B', ''),
('EMP008', 'Gita Pertiwi', 'Sekretaris', 'PT. PLN NPS', 'DAYTIME', ''),
('EMP009', 'Hendra Gunawan', 'Driver', 'PT. PLN NPS', 'C', ''),
('EMP010', 'Indah Sari', 'Cleaning Service', 'PT. PLN NPS', 'A', '')
ON CONFLICT (nid) DO NOTHING;

-- Opsional: Tambahkan data kehadiran dummy untuk tes grafik (30 hari terakhir)
-- Hati-hati: Script ini agak kompleks untuk SQL Editor sederhana, tapi bisa dicoba.
