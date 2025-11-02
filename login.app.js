// SmartAttend • Login (hard-coded)
// Kredensial: username=admin, password=12345
(() => {
  const USERNAME    = 'admin';
  const PASSWORD    = '12345';
  const SESSION_KEY = 'SA_SESSION';

  const $ = (s,el=document)=>el.querySelector(s);

  function showMsg(t, ok=false){
    const m = $('#msg'); if(!m) return;
    m.textContent = t;
    m.classList.remove('hidden','err','ok');
    m.classList.add(ok ? 'ok' : 'err');
  }
  function hideMsg(){ $('#msg')?.classList.add('hidden'); }

  // Redirect ke "folder ini" supaya server menayangkan index.html
  function redirectHome(){
    const dirUrl = location.href.replace(/[^/]+$/, ''); // berlaku untuk http(s) dan file://
    location.replace(dirUrl);
  }
  function isLoggedIn(){ try { return !!localStorage.getItem(SESSION_KEY); } catch { return false; } }
  function setSession(name='Administrator', role='admin', remember=false){
    const payload = { uid:'admin', name, role, at:Date.now(), remember:!!remember };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(payload)); } catch {}
  }

  function bind(){
    if(isLoggedIn()) { redirectHome(); return; }

    $('#btnPeek')?.addEventListener('click', ()=>{
      const p=$('#password'); if(!p) return;
      p.type = p.type === 'password' ? 'text' : 'password';
      $('#btnPeek').textContent = p.type === 'password' ? 'Lihat' : 'Sembunyi';
      p.focus();
    });

    $('#forgot')?.addEventListener('click', e=>{ e.preventDefault(); alert('Hubungi Admin untuk reset password.'); });

    $('#form')?.addEventListener('submit', e=>{
      e.preventDefault(); hideMsg();
      const u = ($('#login')?.value||'').trim();
      const p = ($('#password')?.value||'').trim();
      const remember = $('#remember')?.checked || false;

      if(!u || !p){ showMsg('Email/Username dan Password wajib diisi.'); return; }
      if(u !== USERNAME || p !== PASSWORD){ showMsg('Username atau password salah.'); return; }

      setSession('Administrator','admin',remember);
      showMsg('Login berhasil. Mengalihkan…', true);
      setTimeout(redirectHome, 300);
    });
  }
  document.addEventListener('DOMContentLoaded', bind);
})();
