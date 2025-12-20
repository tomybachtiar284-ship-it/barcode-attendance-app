/* loginapp.js — SmartAttend (offline-first + optional Supabase) */

(() => {
  const $ = (s, r = document) => r.querySelector(s);

  // Jika sudah login & token masih valid -> lempar ke index
  try {
    const a = JSON.parse(localStorage.getItem('SA_AUTH') || 'null');
    if (a && a.expiresAt && a.expiresAt > Date.now()) {
      location.replace('index.html');
      return;
    }
  } catch {}

  const LOCAL = { user: 'admin', pass: '12345' }; // akun demo offline

  // UI helpers
  const msgEl = () => $('#msg');
  const setMsg = (text, ok = false) => {
    const m = msgEl(); if (!m) return;
    if (!text) { m.style.display = 'none'; m.textContent = ''; return; }
    m.className = 'msg' + (ok ? ' ok' : '');
    m.textContent = text;
    m.style.display = 'block';
  };
  const setLoading = (yes) => {
    const b = $('#btnLogin'); if (!b) return;
    b.classList.toggle('loading', !!yes);
    b.disabled = !!yes;
  };

  // SA_AUTH writer
  function writeAuth({ uid, role = 'admin', remember = false }) {
    const ttl = remember ? 7 * 24 * 3600e3 : 3 * 3600e3; // 7 hari / 3 jam
    const SA_AUTH = { uid, role, expiresAt: Date.now() + ttl };
    localStorage.setItem('SA_AUTH', JSON.stringify(SA_AUTH));
  }

  // ===== Optional Supabase =====
  async function getSupabase() {
    // Hanya inisialisasi jika config tersedia
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
    if (window.supabase) return window.supabase;
    try {
      const mod = await import('https://esm.sh/@supabase/supabase-js@2');
      window.supabase = mod.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      return window.supabase;
    } catch (e) {
      console.warn('[login] gagal init supabase:', e);
      return null;
    }
  }
  async function fetchRole(sb, uid) {
    try {
      const { data, error } = await sb.from('app_users').select('role').eq('id', uid).maybeSingle();
      if (error) console.warn('[login] role error', error);
      return (data && data.role) || 'admin';
    } catch {
      return 'admin';
    }
  }

  // ===== Wire form =====
  function wire() {
    const form = $('#loginForm');
    const email = $('#email');
    const pass = $('#password');
    const peek = $('#btnPeek');
    const remember = $('#remember');

    if (!form) return;

    peek?.addEventListener('click', () => {
      pass.type = pass.type === 'password' ? 'text' : 'password';
      peek.textContent = pass.type === 'password' ? 'Lihat' : 'Sembunyi';
      pass.focus();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setMsg('');
      setLoading(true);

      const u = (email.value || '').trim();
      const p = (pass.value || '').trim();
      const rem = !!remember?.checked;

      // 1) Offline admin selalu tersedia
      if (u === LOCAL.user && p === LOCAL.pass) {
        writeAuth({ uid: 'local-admin', role: 'admin', remember: rem });
        location.replace('index.html');
        return;
      }

      // 2) Coba Supabase bila dikonfigurasi
      const sb = await getSupabase();
      if (!sb) {
        setLoading(false);
        setMsg('Supabase tidak dikonfigurasi. Gunakan akun offline: admin / 12345.');
        return;
      }

      try {
        // Supabase auth wajib pakai email
        if (!u.includes('@')) {
          setLoading(false);
          setMsg('Untuk login Supabase, isi email yang valid. Untuk lokal, pakai admin/12345.');
          return;
        }

        const { data, error } = await sb.auth.signInWithPassword({ email: u, password: p });
        if (error || !data?.user) {
          setLoading(false);
          setMsg('Login gagal. Periksa email/password.');
          return;
        }
        const role = await fetchRole(sb, data.user.id);
        writeAuth({ uid: data.user.id, role, remember: rem });
        location.replace('index.html');
      } catch (err) {
        console.error(err);
        setLoading(false);
        setMsg('Terjadi kesalahan saat login.');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', wire);
})();
