-- 1. Hapus SEMUA policy lama yang membingungkan secara otomatis
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN ('app_users', 'attendance', 'breaks', 'education', 'employees', 'inventory', 'news', 'settings', 'shift_monthly', 'shifts')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END
$$;

-- 2. Pastikan RLS menyala (Aktif) di semua tabel
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- 3. Buat 1 Policy baru yang bersih: HANYA izinkan admin yang sudah login (authenticated)
CREATE POLICY "Akses penuh khusus admin login" ON public.app_users FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Akses penuh khusus admin login" ON public.attendance FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Akses penuh khusus admin login" ON public.breaks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Akses penuh khusus admin login" ON public.education FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Akses penuh khusus admin login" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Akses penuh khusus admin login" ON public.inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Akses penuh khusus admin login" ON public.news FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Akses penuh khusus admin login" ON public.settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Akses penuh khusus admin login" ON public.shift_monthly FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Akses penuh khusus admin login" ON public.shifts FOR ALL TO authenticated USING (true) WITH CHECK (true);
