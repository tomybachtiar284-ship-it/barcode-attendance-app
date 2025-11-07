// SmartAttend app.js — FINAL v1.4 (polished, Supabase-integrated, with robust supabase fallback + queued push/retry)
window.addEventListener('DOMContentLoaded', () => {
  const LS_EMP='SA_EMPLOYEES', LS_ATT='SA_ATTENDANCE', LS_SHIFTS='SA_SHIFTS',
        LS_NEWS='SA_NEWS', LS_SCHED='SA_SHIFT_MONTHLY', PUSH_QUEUE_KEY='SA_PUSH_QUEUE';

  const BLINK_ALL_COMPANY_CARDS = true;

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const now=()=>new Date();
  const pad=n=>String(n).padStart(2,'0');
  const fmtTs=ts=>{const d=new Date(ts);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
  const todayISO=()=>{const d=now();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
  const capStatus=s=>s==='datang'?'Masuk':'Keluar';
  const load=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f;}catch{return f;}}; 
  const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[m]));
  function toast(m){const t=document.createElement('div');t.textContent=m;t.style.position='fixed';t.style.right='18px';t.style.bottom='18px';t.style.background='rgba(12,18,32,.95)';t.style.border='1px solid #1f2636';t.style.padding='10px 14px';t.style.borderRadius='12px';t.style.color='#e8edf3';t.style.zIndex=999999;document.body.appendChild(t);setTimeout(()=>t.remove(),2200);} 

  let employees=load(LS_EMP,[]),
      attendance=load(LS_ATT,[]),
      shifts=load(LS_SHIFTS,{
        A:{start:'08:00',end:'16:00'},
        B:{start:'16:00',end:'24:00'},
        C:{start:'24:00',end:'07:00'},
        D:{start:'19:00',end:'07:00'},
        DAYTIME:{start:'08:00',end:'16:00'}
      }),
      news=load(LS_NEWS,[]),
      sched=load(LS_SCHED,{}),
      pushQueue=load(PUSH_QUEUE_KEY,[]); // persisted queue of payloads to push (attendance/employees/etc)

  // expose ke window agar script lain dapat ikut pakai
  function syncGlobals(){
    window.employees = employees;
    window.attendance = attendance;
    window.shifts = shifts;
    window.sched = sched;
  }
  syncGlobals();

  function setTextAndBump(sel, val){
    const el = $(sel); if(!el) return;
    const newStr = String(val);
    if(el.textContent !== newStr){
      el.textContent = newStr;
      const target = el.classList.contains('stat-value') ? el : (el.closest('.card')?.querySelector('.stat-value') || el);
      if(target){
        target.classList.add('changed');
        setTimeout(()=>target.classList.remove('changed'), 700);
      }
    }else el.textContent = newStr;
  }

  // -----------------------------------------------------------------------
  // Supabase integration helpers + robust fallback + queued push + retries
  // -----------------------------------------------------------------------
  function isSupabaseEnabled(){ return !!(window && window.supabase && typeof window.supabase.from === 'function'); }

  // Try to create a fallback window.supabase client synchronously if possible.
  // Accepts window.SUPABASE_ANON_KEY or window.SUPABASE_ANON for compatibility.
  function ensureSupabaseClientFallback(){
    try{
      if(isSupabaseEnabled()){
        console.info('[Supabase] already initialized');
        return true;
      }
      // Read many possible names from HTML (some users use SUPABASE_ANON_KEY)
      const URL = window.SUPABASE_URL || window.SUPABASE_URL === '' ? window.SUPABASE_URL : (window.SUPABASE_URL || null);
      const ANON = window.SUPABASE_ANON_KEY || window.SUPABASE_ANON || window.SUPABASE_ANON_KEY === '' ? (window.SUPABASE_ANON_KEY || window.SUPABASE_ANON) : null;

      if(!URL || !ANON){
        console.warn('[Supabase fallback] missing SUPABASE_URL / SUPABASE_ANON_KEY on window. Skipping fallback.');
        console.debug('Detected window keys:', { SUPABASE_URL: window.SUPABASE_URL, SUPABASE_ANON_KEY: window.SUPABASE_ANON_KEY, SUPABASE_ANON: window.SUPABASE_ANON });
        return false;
      }

      // Try common UMD or global names exported by various supabase builds
      if(typeof window.supabase === 'undefined'){
        if(typeof supabase !== 'undefined' && typeof supabase.createClient === 'function'){
          window.supabase = supabase.createClient(URL, ANON);
          console.info('[Supabase fallback] created client via global supabase.createClient');
        } else if(typeof createClient === 'function'){
          window.supabase = createClient(URL, ANON);
          console.info('[Supabase fallback] created client via createClient() global');
        } else if(window?.Supabase?.createClient){
          window.supabase = window.Supabase.createClient(URL, ANON);
          console.info('[Supabase fallback] created client via window.Supabase.createClient');
        } else if(window?.supabasejs?.createClient){
          window.supabase = window.supabasejs.createClient(URL, ANON);
          console.info('[Supabase fallback] created client via window.supabasejs.createClient');
        } else {
          console.warn('[Supabase fallback] UMD supabase not found as global; ensure supabase client script (UMD) or module import is loaded before app.js');
          return false;
        }
      } else {
        // if window.supabase exists but may be an uninitialized module, just try to use it
        try{
          if(typeof window.supabase.from !== 'function'){
            console.warn('[Supabase fallback] window.supabase exists but does not expose .from() - it may be a module object. Attempting to create client if createClient available.');
            if(typeof createClient === 'function') {
              window.supabase = createClient(URL, ANON);
              console.info('[Supabase fallback] created client via createClient() because existing window.supabase lacked .from()');
            }
          }
        }catch(e){ /* ignore */ }
      }
      return isSupabaseEnabled();
    }catch(err){
      console.error('[Supabase fallback] error creating client', err);
      return false;
    }
  }

  // Try fallback at startup (if module import failed)
  ensureSupabaseClientFallback();

  // Wrapped supa utilities that return standardized objects
  const supa = {
    async select(table, builder){
      if(!isSupabaseEnabled()) return {data:null, error:{message:'OFFLINE'}};
      try{
        let q = window.supabase.from(table).select('*');
        if(typeof builder==='function'){ const maybe = builder(q); if(maybe) q = maybe; }
        const { data, error } = await q;
        if(error) console.warn('[Supabase select]', table, error);
        return { data, error };
      }catch(err){ console.warn('[Supabase select ex]', err); return {data:null,error:err}; }
    },
    async upsert(table, payload, conflict){
      if(!isSupabaseEnabled()) return {data:null, error:{message:'OFFLINE'}};
      try{
        const { data, error } = await window.supabase.from(table).upsert(payload, { onConflict: conflict }).select();
        if(error) console.warn('[Supabase upsert]', table, error);
        return { data, error };
      }catch(err){ console.warn('[Supabase upsert ex]', err); return {data:null,error:err}; }
    },
    async insert(table, payload){
      if(!isSupabaseEnabled()) return {data:null, error:{message:'OFFLINE'}};
      try{
        const { data, error } = await window.supabase.from(table).insert(payload).select();
        if(error) console.warn('[Supabase insert]', table, error);
        return { data, error };
      }catch(err){ console.warn('[Supabase insert ex]', err); return {data:null,error:err}; }
    },
    async del(table, builder){
      if(!isSupabaseEnabled()) return {data:null, error:{message:'OFFLINE'}};
      try{
        let q = window.supabase.from(table).delete();
        if(typeof builder==='function'){ const maybe = builder(q); if(maybe) q = maybe; }
        const { data, error } = await q;
        if(error) console.warn('[Supabase delete]', table, error);
        return { data, error };
      }catch(err){ console.warn('[Supabase delete ex]', err); return {data:null,error:err}; }
    }
  };

  // make supa available for console debugging
  window.supa = supa;
  // debug flag
  window._SA_DEBUG_PUSH = window._SA_DEBUG_PUSH || false;

  // queue management: enqueue payloads on failure, persist to localStorage, flush later
  // Enhanced: items should include __table to identify destination (T_ATT, T_EMP, T_NEWS, etc)
  function enqueuePush(item){
    try{
      if(!item || typeof item !== 'object') {
        console.warn('[PushQueue] cannot enqueue non-object item', item);
        return;
      }
      // set heuristics default if missing
      if(!item.__table){
        if(item.status || item.ts) item.__table = 'attendance';
        else item.__table = 'employees';
      }
      pushQueue.push(item);
      save(PUSH_QUEUE_KEY, pushQueue);
      console.info('[PushQueue] enqueued', { table: item.__table, sample: item });
    }catch(err){ console.error('[PushQueue] enqueue failed', err); }
  }

  async function flushPushQueue() {
    console.info('[PushQueue] flush start, queue len:', pushQueue.length);
    if(!pushQueue || !pushQueue.length) { console.info('[PushQueue] queue empty'); return; }
    if(!isSupabaseEnabled()){
      // Try to create client if credentials present
      ensureSupabaseClientFallback();
      if(!isSupabaseEnabled()){ console.warn('[PushQueue] supabase not available, abort flush'); return; }
    }

    // process queue in FIFO order, small batch
    const batch = pushQueue.splice(0, 20);
    save(PUSH_QUEUE_KEY, pushQueue); // optimistic remove; will re-enqueue on failure

    for(const item of batch){
      try{
        const table = item.__table || 'attendance';
        const payload = Object.assign({}, item);
        delete payload.__table;

        let res = null;
        if(table === T_ATT || table === 'attendance'){
          res = await supa.insert(T_ATT, payload);
        } else if(table === T_EMP || table === 'employees') {
          const p = Array.isArray(payload) ? payload : [payload];
          res = await supa.upsert(T_EMP, p, 'nid');
        } else if(table === T_NEWS || table === 'news'){
          const p = Array.isArray(payload) ? payload : [payload];
          res = await supa.upsert(T_NEWS, p, 'ts');
        } else if(table === T_SHIFTS || table === 'shifts_cfg'){
          res = await supa.upsert(T_SHIFTS, payload, 'id');
        } else if(table === T_SCHED || table === 'shift_monthly'){
          res = await supa.upsert(T_SCHED, payload, 'id');
        } else {
          // fallback generic insert
          res = await supa.insert(table, payload);
        }

        if(res && res.error){
          console.warn('[PushQueue] item failed to push', table, res.error);
          pushQueue.unshift(item);
          save(PUSH_QUEUE_KEY, pushQueue);
          const emsg = String((res.error && (res.error.message || res.error.details || res.error.msg)) || '');
          if(res.error.status === 401 || res.error.status === 403 || /permission|r.l.s|row-level|forbidden|unauthorized/i.test(emsg)){
            console.error('[PushQueue] permission error while flushing queue:', res.error);
            toast('Gagal menyinkronkan antrean: izin ditolak. Periksa konfigurasi Supabase (RLS/policy).');
            break; // stop to avoid infinite loop on permission errors
          }
          // transient error: break to retry later
          break;
        } else {
          console.info('[PushQueue] item flushed ok', table, res?.data || '(ok)');
          if(table === T_EMP && res && res.data){
            try{ mergeEmployees(res.data); }catch(e){/* ignore */ }
          }
        }
      }catch(err){
        console.error('[PushQueue] exception while flushing, re-enqueueing', err);
        pushQueue.unshift(item);
        save(PUSH_QUEUE_KEY, pushQueue);
        break;
      }
    }
  }

  // schedule periodic flush + on online
  const PUSH_FLUSH_INTERVAL = 10 * 1000; // every 10s
  setInterval(flushPushQueue, PUSH_FLUSH_INTERVAL);
  window.addEventListener('online', () => { ensureSupabaseClientFallback(); flushPushQueue(); });

  // --- Table names ---
  const T_EMP='employees';
  const T_ATT='attendance';
  const T_NEWS='news';
  const T_SHIFTS='shifts_cfg';
  const T_SCHED='shift_monthly';

  // --- Merge helpers (last-write-wins) ---
  const parseIso = s => {
    if(!s) return 0;
    if(typeof s === 'number') return s;
    const p = Date.parse(s);
    return isNaN(p) ? 0 : p;
  };

  function mergeEmployees(remote=[]){
    let changed=false;
    remote.forEach(r=>{
      const i = employees.findIndex(e=>e.nid==r.nid);
      const rec = { nid:r.nid, name:r.name, title:r.title, company:r.company, shift:r.shift, photo:r.photo||'', updated_at:r.updated_at||null };
      if(i>=0){
        const lv = parseIso(employees[i].updated_at);
        const rv = parseIso(rec.updated_at);
        if(rv && rv >= lv){ employees[i]=rec; changed=true; }
      }else{ employees.push(rec); changed=true; }
    });
    if(changed){ save(LS_EMP,employees); syncGlobals(); renderEmployees(); renderDashboard(); initMonthlyScheduler(); }
  }
  function mergeNews(remote=[]){
    const map = new Map(news.map(n=>[Number(n.ts), n]));
    let changed=false;
    remote.forEach(n=>{
      const ts = Number(n.ts||0); if(!ts) return;
      if(!map.has(ts)){ map.set(ts, { ts, title:n.title, body:n.body||'', link:n.link||'' }); changed=true; }
      else{
        const cur = map.get(ts);
        if(cur.title!==n.title || (cur.body||'')!==(n.body||'') || (cur.link||'')!==(n.link||'')){
          map.set(ts,{ ts, title:n.title, body:n.body||'', link:n.link||'' }); changed=true;
        }
      }
    });
    if(changed){ news = Array.from(map.values()); save(LS_NEWS,news); renderLatest(); renderNewsWidgets(); }
  }
  function mergeAttendance(remote=[]){
    const have = new Set(attendance.map(a=>Number(a.ts)));
    let add=0;
    remote.forEach(r=>{
      const ts=Number(r.ts); if(!ts || have.has(ts)) return;
      attendance.push({
        ts, status:r.status, nid:r.nid, name:r.name, title:r.title, company:r.company,
        shift:r.shift, okShift: !!r.okShift, note:r.note||'', late: !!r.late
      });
      add++;
    });
    if(add){ save(LS_ATT,attendance); syncGlobals(); renderDashboard(); renderScanTable(); renderScanStats(); updateScanLiveCircle(); }
  }
  function applyRemoteShiftsRow(row){
    if(!row || !row.data) return false;
    shifts = row.data;
    save(LS_SHIFTS, shifts); syncGlobals();
    renderShiftForm(); renderDashboard(); renderCurrentShiftPanel();
    return true;
  }
  function applyRemoteSchedRow(row){
    if(!row) return false;
    const id=row.id, data=row.data||{};
    if(!id) return false;
    sched[id]=data;
    save(LS_SCHED,sched); syncGlobals();
    renderSchedTable(); renderCurrentShiftPanel();
    return true;
  }

  // --- Pullers ---
  async function pullEmployees(){ 
    const { data, error } = await supa.select(T_EMP, q=>q.order('updated_at', {ascending:false}));
    if(error) { /* ignore offline */ }
    if(data) mergeEmployees(data);
  }
  async function pullNews(){
    const { data, error } = await supa.select(T_NEWS, q=>q.order('ts', {ascending:false}).limit(100));
    if(error) { /* ignore offline */ }
    if(data) mergeNews(data);
  }
  async function pullRecentAttendance(days=3){
    const since = Date.now() - days*24*3600*1000;
    const { data, error } = await supa.select(T_ATT, q=>q.gte('ts', since).order('ts', {ascending:true}).limit(5000));
    if(error) { /* ignore offline */ }
    if(data) mergeAttendance(data);
  }
  async function pullShifts(){
    const { data, error } = await supa.select(T_SHIFTS, q=>q.eq('id','global').single());
    if(data) applyRemoteShiftsRow(data);
  }
  async function pullSched(monthId){
    if(!monthId) return;
    const { data, error } = await supa.select(T_SCHED, q=>q.eq('id', monthId).single());
    if(data) applyRemoteSchedRow(data);
  }

  // --- Pushers ---
  async function pushEmployee(emp){
    // emp can be single object or array
    const payload = Array.isArray(emp) ? emp.map(e=>({...e, updated_at: e.updated_at || new Date().toISOString(), __table: T_EMP})) : {...emp, updated_at: emp.updated_at || new Date().toISOString(), __table: T_EMP};
    if(!isSupabaseEnabled()){
      console.warn('[pushEmployee] supabase offline. Enqueueing employee sync.', payload);
      enqueuePush(payload);
      toast('Data karyawan disimpan lokal (antrian). Akan disinkron saat online.');
      return { data:null, error:{ message:'OFFLINE' } };
    }
    try{
      const res = await supa.upsert(T_EMP, Array.isArray(emp)? emp.map(e=>({...e, updated_at: e.updated_at || new Date().toISOString()})) : {...emp, updated_at: emp.updated_at || new Date().toISOString()}, 'nid');
      if(res && res.error){
        console.warn('[pushEmployee] error:', res.error);
        enqueuePush(payload);
        return { data: null, error: res.error };
      } else {
        console.log('[pushEmployee] ok:', res.data);
        if(res && res.data) mergeEmployees(res.data);
        return res;
      }
    }catch(err){
      console.warn('[pushEmployee] ex', err);
      enqueuePush(payload);
      return { data:null, error:err };
    }
  }
  async function deleteEmployeeRemote(nid){
    const { data, error } = await supa.del(T_EMP, q=>q.eq('nid', nid));
    if (error) console.warn('[deleteEmployeeRemote] error:', error);
    return { data, error };
  }

  // Updated pushAttendance: tries immediate push, on error enqueues and retries later
  async function pushAttendance(rec){
    // ensure ts number & late boolean
    const payload = { ...rec, ts: Number(rec.ts), late: !!rec.late, created_at: rec.created_at || new Date().toISOString() };
    // If supabase not ready, enqueue and return
    if(!isSupabaseEnabled()){
      console.warn('[pushAttendance] supabase offline or not initialized. Enqueueing payload.', payload);
      enqueuePush(Object.assign({ __table: T_ATT }, payload));
      toast('Kehadiran disimpan lokal (antrian) — akan disinkron saat online.');
      return { data: null, error: { message: 'OFFLINE' } };
    }
    try{
      const res = await supa.insert(T_ATT, payload);
      if(res && res.error){
        console.warn('[pushAttendance] error from supabase insert:', res.error, 'payload:', payload);
        enqueuePush(Object.assign({ __table: T_ATT }, payload));
        const emsg = String((res.error && (res.error.message || res.error.details || res.error.msg)) || '');
        if(res.error.status === 401 || res.error.status === 403 || /permission|r.l.s|row-level|forbidden|unauthorized/i.test(emsg)){
          console.error('[pushAttendance] Permission error inserting to Supabase:', res.error);
          toast('Gagal menyimpan ke server — disimpan dalam antrean. Periksa policy RLS/permissions (cek console).');
          console.info('Hint (dev): untuk debugging sementara, jalankan SQL berikut di Supabase SQL editor (development only):');
          console.info("ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY; CREATE POLICY allow_insert_on_attendance ON public.attendance FOR INSERT USING (true) WITH CHECK (true);");
          return res;
        }
        toast('Gagal menyimpan ke server — disimpan dalam antrean (cek console).');
        return res;
      } else {
        console.log('[pushAttendance] inserted:', res?.data || res);
        return res;
      }
    }catch(err){
      console.error('[pushAttendance] ex', err, 'payload:', payload);
      // network or runtime error -> enqueue for retry
      enqueuePush(Object.assign({ __table: T_ATT }, payload));
      toast('Error jaringan saat sinkron. Kehadiran disimpan di antrean.');
      return { data:null, error:err };
    }
  }

  async function deleteAttendanceRemote(ts){
    const { data, error } = await supa.del(T_ATT, q=>q.eq('ts', ts));
    if (error) console.warn('[deleteAttendanceRemote] error:', error);
    return { data, error };
  }
  async function pushNews(item){
    if(!isSupabaseEnabled()) { 
      enqueuePush(Object.assign({ __table: T_NEWS }, item));
      console.warn('[pushNews] supabase offline'); 
      return {error:{message:'OFFLINE'}}; 
    }
    const { data, error } = await supa.upsert(T_NEWS, item, 'ts');
    if (error) console.warn('[pushNews] error:', error);
    return { data, error };
  }
  async function deleteNewsRemote(ts){
    const { data, error } = await supa.del(T_NEWS, q=>q.eq('ts', ts));
    if (error) console.warn('[deleteNewsRemote] error:', error);
    return { data, error };
  }
  async function pushShiftsCfg(){
    if(!isSupabaseEnabled()) { 
      enqueuePush({ __table: T_SHIFTS, id: 'global', data: shifts, updated_at: new Date().toISOString() });
      console.warn('[pushShiftsCfg] supabase offline'); 
      return {error:{message:'OFFLINE'}}; 
    }
    const { data, error } = await supa.upsert(T_SHIFTS, { id: 'global', data: shifts, updated_at: new Date().toISOString() }, 'id');
    if (error) console.warn('[pushShiftsCfg] error:', error);
    return { data, error };
  }
  async function pushSchedMonth(id){
    if(!isSupabaseEnabled()) { 
      enqueuePush({ __table: T_SCHED, id, data: sched[id]||{}, updated_at: new Date().toISOString() });
      console.warn('[pushSchedMonth] supabase offline'); 
      return {error:{message:'OFFLINE'}}; 
    }
    const { data, error } = await supa.upsert(T_SCHED, { id, data: sched[id]||{}, updated_at: new Date().toISOString() }, 'id');
    if (error) console.warn('[pushSchedMonth] error:', error);
    return { data, error };
  }
  async function deleteSchedMonthRemote(id){
    const { data, error } = await supa.del(T_SCHED, q=>q.eq('id', id));
    if (error) console.warn('[deleteSchedMonthRemote] error:', error);
    return { data, error };
  }

  // helper: push all local employees to supabase (batch)
  async function syncAllLocalEmployeesToSupabase(){
    if(!isSupabaseEnabled()){ 
      enqueuePush({ __table: T_EMP, payload: employees });
      console.warn('Supabase not enabled'); return {error:{message:'OFFLINE'}}; 
    }
    if(!employees || !employees.length){ console.warn('No local employees to sync'); return; }
    const payload = employees.map(e => ({ ...e, updated_at: e.updated_at || new Date().toISOString() }));
    try{
      const res = await supa.upsert(T_EMP, payload, 'nid');
      if(res.error) console.warn('[syncAllLocalEmployeesToSupabase] error', res.error);
      else console.log('[syncAllLocalEmployeesToSupabase] ok rows', (res.data||[]).length);
      return res;
    }catch(err){ console.warn('[syncAllLocalEmployeesToSupabase] ex', err); return {error:err}; }
  }

  // Expose key functions to window for debugging/console use
  window.pullEmployees = pullEmployees;
  window.pullRecentAttendance = pullRecentAttendance;
  window.pullNews = pullNews;
  window.pushEmployee = pushEmployee;
  window.pushAttendance = pushAttendance;
  window.deleteAttendanceRemote = deleteAttendanceRemote;
  window.syncAllLocalEmployeesToSupabase = syncAllLocalEmployeesToSupabase;
  window._SA_flushPushQueue = flushPushQueue;
  window._SA_getPushQueue = () => load(PUSH_QUEUE_KEY, []);

  // --- Bootstrap/periodic sync ---
  async function supaBootstrap(){
    if(!isSupabaseEnabled()){
      // try fallback once more
      ensureSupabaseClientFallback();
      if(!isSupabaseEnabled()) return;
    }
    try{
      await Promise.all([
        pullEmployees(),
        pullNews(),
        pullShifts(),
        pullRecentAttendance(3)
      ]);
      const mp=$('#schedMonth'); const id = (mp?.value) || monthKey(new Date());
      pullSched(id);
      // flush any queued pushes now that we're online
      flushPushQueue();
    }catch(err){ console.warn('[supaBootstrap] failed', err); }
  }
  if(isSupabaseEnabled()){
    supaBootstrap();
    window.addEventListener('online', supaBootstrap);
    setInterval(()=>{ pullRecentAttendance(1); pullNews(); }, 60000); // refresh ringan
  } else {
    const watcher = setInterval(()=>{
      if(isSupabaseEnabled()){
        clearInterval(watcher);
        supaBootstrap();
        window.addEventListener('online', supaBootstrap);
      } else {
        // attempt fallback creation periodically
        ensureSupabaseClientFallback();
      }
    }, 800);
  }

  // -----------------------------------------------------------------------
  // End supabase / queue code
  // -----------------------------------------------------------------------

  // Router
  $$('.navlink').forEach(btn=>btn.addEventListener('click',()=>{ 
    $$('.navlink').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
    const route=btn.dataset.route; $$('.route').forEach(s=>s.classList.add('hidden'));
    $('#route-'+route)?.classList.remove('hidden');
    if(route==='dashboard'){ renderDashboard(); }
    if(route==='employees') renderEmployees();
    if(route==='attendance') renderAttendance();
    if(route==='scan'){ renderScanPage(); $('#scanInput')?.focus(); }
    if(route==='latest') renderLatest();
    if(route==='shifts'){ renderShiftForm(); initMonthlyScheduler(); }
    if(route==='education'){ /* static */ }
  }));

  // Clock
  function tick(){ $('#liveClock') && ($('#liveClock').textContent = fmtTs(Date.now()).split(' ')[1]); }
  setInterval(tick,1000); tick();

  // Shift helpers
  const SHIFT_KEYS = ['A','B','C','D','DAYTIME'];
  const CODE_TO_LABEL={A:'P', B:'S', C:'M', D:'D', DAYTIME:'DAY', OFF:'L'};
  const LABEL_TO_CODE={ 'a':'A','p':'A','pagi':'A','b':'B','s':'B','sore':'B','c':'C','m':'C','malam':'C','d':'D','shift d':'D','day':'DAYTIME','daytime':'DAYTIME','siang':'DAYTIME','off':'OFF','l':'OFF','libur':'OFF' };
  function normalizeTime(s){
    s=String(s||'').trim(); if(!s) return '';
    s=s.replace(/[.,\-h ]/g,':');
    if(/^\d{3,4}$/.test(s)){ const t=s.length===3?`0${s}`:s; return `${t.slice(0,2)}:${t.slice(2)}`;}
    const m=s.match(/^(\d{1,2})(?::(\d{1,2}))?$/); if(!m) return s;
    const H=Math.min(24,parseInt(m[1]||'0',10)), M=Math.min(59,parseInt(m[2]||'0',10));
    return `${pad(H)}:${pad(M)}`;
  }
  const hmToMin = (hm) => { hm=normalizeTime(hm); if (!hm || !hm.includes(':')) return 0; let [h, m] = hm.split(':').map(Number); if (h === 24) return 24 * 60 + m; return h * 60 + m; };
  const monthKey=d=>d.toISOString().slice(0,7);
  const minutesOf=d=>{ const D=new Date(d); return D.getHours()*60+D.getMinutes(); };
  const shiftWindow=(code)=>{ const s=shifts[code]; if(!s) return null; return {start:hmToMin(s.start), end:hmToMin(s.end)}; };
  const isInWindow=(min,win)=> win.end>win.start ? (min>=win.start && min<win.end) : (min>=win.start || min<win.end);

  function effectiveShiftFor(emp, date){
    const group = emp.shift;
    if(!group) return 'OFF';
    const id = monthKey(date), day = date.getDate();
    return (sched[id]?.[group]?.[day]) || 'OFF';
  }
  function scheduleDateFor(code, dt){
    const D = new Date(dt);
    const win = shiftWindow(code); if(!win) return D;
    if(win.end>win.start) return D;
    const m=minutesOf(D);
    if(m<win.end){ const y=new Date(D); y.setDate(D.getDate()-1); return y; }
    return D;
  }
  function toDateFromHM(baseDate, hm){
    const d = new Date(baseDate); d.setHours(0,0,0,0);
    const nt = normalizeTime(hm) || '00:00';
    const [hRaw,mRaw] = nt.split(':').map(Number);
    let h=hRaw, m=mRaw||0;
    if(h>=24){ d.setDate(d.getDate()+1); h=h-24; }
    d.setHours(h,m,0,0);
    return d;
  }
  function groupsScheduled(code, dateFor){
    const id=dateFor.toISOString().slice(0,7); const day=dateFor.getDate(); const out=[];
    SHIFT_KEYS.forEach(g=>{ if((sched[id]?.[g]?.[day]||'')===code) out.push(g); });
    return out;
  }
  function activeShiftsNow(){
    const n=new Date(); const m=minutesOf(n); const arr=[];
    ['A','B','C','D','DAYTIME'].forEach(code=>{
      const win=shiftWindow(code); if(!win) return;
      if(isInWindow(m,win)){ const df=scheduleDateFor(code,n); const gs=groupsScheduled(code,df); if(gs.length) arr.push({code,groups:gs,win}); }
    });
    return arr;
  }
  function ensureCurrentShiftUI(){
    const stat = document.getElementById('statScan24h'); if(!stat) return null;
    const card = stat.closest('.card') || stat.parentElement; if(!card) return null;
    if(!card.querySelector('.scan-two-col')){
      const wrap = document.createElement('div'); wrap.className = 'scan-two-col';
      const left = document.createElement('div'); left.id = 'scanLeftCol';
      while (card.firstChild) left.appendChild(card.firstChild);
      const right = document.createElement('div'); right.id = 'scanRightCol';
      right.innerHTML = `<div class="card-subtitle">Shift yang sedang bertugas </div><div id="statCurrentShift"></div>`;
      card.appendChild(wrap); wrap.appendChild(left); wrap.appendChild(right);
    }
    return document.getElementById('statCurrentShift');
  }
  function renderCurrentShiftPanel(){
    const host = ensureCurrentShiftUI(); if(!host) return;
    const rows = activeShiftsNow();
    if(rows.length === 0){ host.innerHTML = `<div class="muted">Tidak ada shift berjalan saat ini.</div>`; return; }
    const CODE_FULL = {A:'Pagi (P)', B:'Sore (S)', C:'Malam (M)', D:'Shift D', DAYTIME:'Daytime'};
    host.innerHTML = rows.map(r=>{
      const time = `${shifts[r.code].start}–${shifts[r.code].end}`;
      const chips = r.groups.map(g=>`<span class="chip">Grup ${g}</span>`).join(' ');
      return `<div class="row"><b>${CODE_FULL[r.code]||r.code}</b>&nbsp;<small>${time}</small>&nbsp;•&nbsp;${chips}</div>`;
    }).join('');
  }
  setInterval(renderCurrentShiftPanel, 30000);

  // News widgets
  function renderNewsWidgets(){
    ['#newsGridDash','#newsGridScan'].forEach(sel=>{
      const host=$(sel); if(!host) return; host.innerHTML='';
      const arr=[...news].sort((a,b)=>b.ts-a.ts);
      if(arr.length===0){ const d=document.createElement('div'); d.style.color='#64748b'; d.textContent='Belum ada informasi.'; host.appendChild(d); return; }
      arr.forEach(n=>{
        const card=document.createElement('div'); card.className='news-card';
        card.innerHTML=`<div class="title">${esc(n.title)}</div><div class="meta">${fmtTs(n.ts)}</div>
                        <div class="body">${esc(n.body||'')}${n.link?` • <a href="${esc(n.link)}" target="_blank" rel="noopener">Link</a>`:''}</div>`;
        host.appendChild(card);
      });
    });
  }

  // ===== Company Presence today (map) =====
  function presentMapToday(){
    const sod = new Date(todayISO()+'T00:00:00').getTime();
    const todays = attendance.filter(a => a.ts >= sod).sort((a,b)=>a.ts-b.ts);

    const lastByNid = new Map();
    todays.forEach(r => lastByNid.set(r.nid, r));

    const presentNids = [];
    lastByNid.forEach((rec, nid) => { if(rec.status === 'datang') presentNids.push(nid); });

    const totals = {};
    employees.forEach(e=>{
      const c=(e.company||'—').trim(); totals[c]=(totals[c]||0)+1;
    });

    const counts = {};
    presentNids.forEach(nid=>{
      const emp = employees.find(e=>e.nid===nid);
      const last = lastByNid.get(nid);
      const comp = (emp?.company || last?.company || '—').trim();
      counts[comp] = (counts[comp]||0) + 1;
    });

    return {counts, totals};
  }

  // Live chips above grid on dashboard
  function ensureLiveStatsUI(){
    const grid = document.getElementById('companyPresenceGrid');
    if(!grid) return null;
    const parent = grid.parentElement || grid;
    let bar = parent.querySelector('#liveCompanyStats');
    if(!bar){
      bar = document.createElement('div');
      bar.id = 'liveCompanyStats';
      bar.className = 'toolbar';
      bar.style.margin = '4px 0 10px';
      parent.insertBefore(bar, grid);
    }
    return bar;
  }
  function renderLiveCompanyStats(){
    const host = ensureLiveStatsUI(); if(!host) return;
    const {counts, totals} = presentMapToday();
    const companies = Object.keys(totals);
    if(companies.length===0){ host.innerHTML = `<span class="muted">Belum ada data kehadiran.</span>`; return; }
    companies.sort((a,b)=> (counts[b]||0)-(counts[a]||0) || a.localeCompare(b));
    const chips = companies.map(c=>{
      const hadir = counts[c]||0, total = totals[c]||0;
      const title = `${hadir} hadir dari ${total} karyawan`;
      return `<span class="stat-chip" title="${esc(title)}">${esc(c)}: <b>${hadir}</b> / ${total}</span>`;
    }).join(' ');
    const t = new Date();
    const ts = `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
    host.innerHTML = `<div class="live-row"><b>Statistik Kehadiran Langsung</b> <span class="muted">(${ts})</span></div>
                      <div class="chip-wrap">${chips}</div>`;
  }

  function renderCompanyPresence(){
    const grid = document.getElementById('companyPresenceGrid'); if(!grid) return;
    const {counts, totals} = presentMapToday();
    const companies = Object.keys(totals);
    if(companies.length === 0){
      grid.innerHTML = '<div class="muted">Belum ada data karyawan.</div>';
      renderLiveCompanyStats();
      return;
    }
    companies.sort((a,b)=> (counts[b]||0) - (counts[a]||0));

    grid.innerHTML = companies.map(c=>{
      const hadir = counts[c]||0;
      const total = totals[c]||0;
      const live = BLINK_ALL_COMPANY_CARDS || (hadir>0);
      const stateCls = live ? 'live' : 'empty';
      return `
        <div class="company-card ${stateCls}" data-company="${esc(c)}" data-count="${hadir}">
          <div>
            <div class="name">${esc(c)}</div>
            <div class="sub">Total karyawan: ${total}</div>
          </div>
          <div class="badge">${hadir}</div>
        </div>`;
    }).join('');

    renderLiveCompanyStats();
    window.dispatchEvent(new Event('attendance:update'));
  }

  // ===== Dashboard render =====
  function renderDashboard(){
    setTextAndBump('#statTotalEmp', employees.length);

    const byGroup=employees.reduce((a,e)=>(a[e.shift]=(a[e.shift]||0)+1,a),{});
    const breakdown = Object.entries(byGroup).map(([k,v])=>`Grup ${k}:${v}`).join(' • ')||'—';
    $('#statShiftBreakdown') && ($('#statShiftBreakdown').textContent=breakdown);

    const since=Date.now()-24*3600*1000; const last24=attendance.filter(a=>a.ts>=since);
    setTextAndBump('#statScan24h', last24.length);
    setTextAndBump('#statIn24h',  last24.filter(a=>a.status==='datang').length);
    setTextAndBump('#statOut24h', last24.filter(a=>a.status==='pulang').length);

    const sod=new Date(todayISO()+'T00:00:00').getTime();
    const today=attendance.filter(a=>a.ts>=sod);
    const ontime=today.filter(a=>a.status==='datang'&&!a.late).length;
    const late=today.filter(a=>a.status==='datang'&&a.late).length;
    setTextAndBump('#statOnTime', ontime);
    setTextAndBump('#statLate', late);
    const pct = (ontime+late? (ontime/(ontime+late))*100 : 0);
    const bar = $('#onTimeBar'); if(bar) bar.style.width = pct + '%';

    const tb=$('#tableRecent tbody');
    if(tb){
      tb.innerHTML='';
      today.sort((a,b)=>b.ts-a.ts).slice(0,3).forEach(r=>{
        const tr=document.createElement('tr');
        const emp = employees.find(e => e.nid === r.nid);
        const groupLabel = emp ? `(Grup ${emp.shift})` : '';
        tr.innerHTML=`<td>${fmtTs(r.ts)}</td><td>${capStatus(r.status)}</td><td>${r.nid}</td><td>${r.name}</td>
                      <td>${CODE_TO_LABEL[r.shift] || r.shift || '-'} ${groupLabel}</td>`;
        tb.appendChild(tr);
      });
    }
    renderCurrentShiftPanel();
    renderNewsWidgets();
    renderCompanyPresence();
    renderLiveCompanyStats();
  }
  renderDashboard();
  setInterval(renderLiveCompanyStats, 30000);

  // Fullscreen
  function fs(btnSel,targetSel){ const b=$(btnSel); if(!b) return; const t=$(targetSel)||document.documentElement;
    const sync=()=>{ b.textContent=document.fullscreenElement?'⛶ Keluar Penuh':'⛶ Layar Penuh'; };
    b.addEventListener('click',()=>{ if(!document.fullscreenElement) t.requestFullscreen?.(); else document.exitFullscreen?.(); });
    document.addEventListener('fullscreenchange',sync); sync();
  }
  fs('#btnFull','#route-scan'); fs('#btnFullDash','#route-dashboard');

  // ===== Scan table + preview =====
  function renderScanTable(){
    const tb=$('#tableScan tbody'); if(!tb) return;
    const sod=new Date(todayISO()+'T00:00:00').getTime();
    const rows=attendance.filter(a=>a.ts>=sod).sort((a,b)=>b.ts-a.ts).slice(0,5);
    tb.innerHTML=''; rows.forEach(r=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${fmtTs(r.ts)}</td><td>${capStatus(r.status)}</td><td>${r.nid}</td>
                    <td>${r.name}</td><td>${r.title}</td><td>${r.company}</td>
                    <td>${CODE_TO_LABEL[r.shift] || r.shift || ''}</td><td>${r.note||''}</td>`;
      tb.appendChild(tr);
    });
  }
  function renderScanPreview(emp, rec){
    $('#scanName')&&($('#scanName').textContent=emp?.name||'—');
    $('#scanNID')&&($('#scanNID').textContent=emp?.nid||'—');
    $('#scanTitle')&&($('#scanTitle').textContent=emp?.title||'—');
    $('#scanCompany')&&($('#scanCompany').textContent=emp?.company||'—');
    const shiftLabel = rec ? (CODE_TO_LABEL[rec.shift] || rec.shift) : (emp?.shift ? `Grup ${emp.shift}` : '—');
    $('#scanShift')&&($('#scanShift').textContent=shiftLabel);

    const sp = $('#scanPhoto');
    if(sp && sp.style){
      if(emp && emp.photo){
        sp.style.backgroundImage = `url("${emp.photo}")`;
        sp.style.backgroundSize = 'cover';
        sp.style.backgroundPosition = 'center';
      } else {
        sp.style.backgroundImage = 'none';
      }
    }

    const pill=$('#scanShiftCheck');
    if(pill){
      if(rec){ pill.textContent=rec.note; pill.className='pill light '+(rec.okShift?(rec.late?'warn':''):'danger'); $('#scanTs')&&($('#scanTs').textContent=fmtTs(rec.ts)); }
      else{ pill.textContent='—'; pill.className='pill light'; $('#scanTs')&&($('#scanTs').textContent='—'); }
    }
  }
  function nextStatusFor(nid){ const sod=new Date(todayISO()+'T00:00:00').getTime(); const cnt=attendance.filter(a=>a.nid===nid && a.ts>=sod).length; return (cnt%2===0)?'datang':'pulang'; }
  function parseRaw(s){ if(!s) return null; const p=s.split('|'); return (p.length>=4)?{nid:p[0],name:p[1],title:p[2],company:p[3]}:{nid:s}; }
  function findEmp(p){ if(!p) return null; let e=employees.find(x=>x.nid==p.nid); if(!e && p.name){ e=employees.find(x=>x.name.toLowerCase()===p.name.toLowerCase()); } return e; }

  // ====== SCAN INPUT: clear otomatis & anti-menumpuk ======
  const SCAN_DEBOUNCE=150, SCAN_WINDOW=500; let scanTimer=null, lastScan={v:'',t:0};
  function clearScanInputNow(){
    const inp=$('#scanInput'); if(!inp) return;
    try{ inp.value=''; inp.blur(); setTimeout(()=>inp.focus(), 30); }catch(e){}
  }
  function tryScan(v){
    const t=Date.now();
    if(v===lastScan.v && (t-lastScan.t)<SCAN_WINDOW){lastScan.t=t;return;}
    lastScan={v,t};
    handleScan(v);
    clearScanInputNow();
  }
  $('#scanInput')?.addEventListener('input',e=>{
    const v=e.target.value.trim();
    if(scanTimer)clearTimeout(scanTimer);
    if(!v)return;
    scanTimer=setTimeout(()=>{ tryScan(v); },SCAN_DEBOUNCE);
  });
  $('#scanInput')?.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      if(scanTimer){clearTimeout(scanTimer);scanTimer=null;}
      const v=$('#scanInput').value.trim();
      if(v){ tryScan(v); }
    }
  });
  window.addEventListener('load',()=>{$('#scanInput')?.focus();});

  async function handleScan(raw){
    const parsed=parseRaw(raw); const ts=now(); const emp=findEmp(parsed);
    if(!emp){
      toast('Karyawan tidak ditemukan di database.');
      renderScanPreview({nid:parsed?.nid||'—', name:'Tidak ditemukan', title:'—', company:'—', shift:'—', photo:''}, null);
      const pill=$('#scanShiftCheck'); if(pill){ pill.textContent='Belum terdaftar'; pill.className='pill light danger'; }
      $('#scanTs')&&($('#scanTs').textContent=fmtTs(ts)); return;
    }
    let effShift = effectiveShiftFor(emp, ts);
    let noteOverride=''; if(effShift==='OFF'){ noteOverride='Libur'; }

    const status=nextStatusFor(emp.nid);
    const sWin = effShift==='OFF' ? null : shiftWindow(effShift);
    const inWin = sWin ? isInWindow(minutesOf(ts), sWin) : false;

    // === Late calc akurat (tanggal basis shift) ===
    let late=false;
    if(effShift!=='OFF' && status==='datang' && sWin){
      const baseDay = scheduleDateFor(effShift, ts);
      const startDate = toDateFromHM(baseDay, shifts[effShift]?.start || '00:00');
      late = ts.getTime() >= (startDate.getTime() + 5*60*1000);
    }

    const rec={ ts:ts.getTime(), status,
      nid:emp.nid, name:emp.name, title:emp.title, company:emp.company,
      shift:effShift, okshift:inWin,
      note: noteOverride || (status==='datang'?(late?'Terlambat':'On-time'):'—') + (inWin?'':' • Di luar jam shift'),
      late:!!late
    };
    attendance.push(rec); save(LS_ATT,attendance); syncGlobals();
    renderScanPreview(emp,rec); renderScanTable(); renderDashboard(); updateScanLiveCircle(true);
    window.dispatchEvent(new Event('scan:saved'));
    window.dispatchEvent(new Event('attendance:changed'));
    window.dispatchEvent(new Event('attendance:update'));
    renderScanStats();

    // Supabase push (uses queued mechanism on failure)
    pushAttendance({
      ...rec,
      created_at: new Date().toISOString()
    });
  }

  // ===== Employees =====
  const empTBody=$('#tableEmp tbody'); let editIdx=-1;
  function renderEmployees(){
    if(!empTBody) return;
    const q=$('#searchEmp')?.value?.toLowerCase()||''; empTBody.innerHTML='';
    employees.filter(e=>(e.nid+' '+e.name).toLowerCase().includes(q)).forEach(e=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td><div style="width:44px;height:44px;border-radius:10px;background:#eef4ff url('${e.photo||''}') center/cover no-repeat"></div></td>
                    <td>${e.nid}</td><td>${e.name}</td><td>${e.title}</td><td>${e.company}</td><td>Grup ${e.shift||'-'}</td>
                    <td><button class='btn' data-act='edit' data-id='${e.nid}'>✏️</button>
                        <button class='btn' data-act='barcode' data-id='${e.nid}'>🏷️</button>
                        <button class='btn ghost' data-act='del' data-id='${e.nid}'>🗑️</button></td>`;
      empTBody.appendChild(tr);
    });
  }
  $('#searchEmp')?.addEventListener('input',renderEmployees);

  function setCompanyUI(companyText=''){
    const sel=$('#fCompanySel'); const wrap=$('#wrapCompanyOther'); const other=$('#fCompanyOther');
    if(!sel) return;
    const options=[...sel.options].map(o=>o.value||o.textContent);
    const norm = s=>String(s||'').trim().toLowerCase();
    if(!companyText){ sel.value=''; wrap.classList.add('hidden'); other.value=''; return; }
    const match = options.find(v=>norm(v)===norm(companyText));
    if(match && match!=='OTHER'){ sel.value=match; wrap.classList.add('hidden'); other.value=''; }
    else{ sel.value='OTHER'; wrap.classList.remove('hidden'); other.value=companyText; }
  }
  function readCompanyFromUI(){
    const sel=$('#fCompanySel'); if(!sel) return '';
    if(sel.value==='OTHER') return $('#fCompanyOther').value.trim();
    return sel.value || '';
  }
  $('#fCompanySel')?.addEventListener('change',()=>{
    const wrap=$('#wrapCompanyOther');
    if($('#fCompanySel').value==='OTHER'){ wrap.classList.remove('hidden'); }
    else{ wrap.classList.add('hidden'); $('#fCompanyOther').value=''; }
  });

  // Camera
  let camStream=null, camFacing='user', camDataUrl=null;
  function stopCam(){ camStream?.getTracks()?.forEach(t=>t.stop()); camStream=null; }
  async function startCam(facing='user'){
    stopCam();
    camFacing = facing;
    const base = { width:{ideal:1280}, height:{ideal:720}, facingMode:{ideal:facing} };
    try{ camStream = await navigator.mediaDevices.getUserMedia({video:{...base, facingMode:{exact:facing}}, audio:false}); }
    catch{ camStream = await navigator.mediaDevices.getUserMedia({video:base, audio:false}); }
    const v = $('#camVideo'); if(v){ v.srcObject = camStream; await v.play(); }
  }
  function ensureCamDialog(){
    let dlg = $('#camDialog');
    if(dlg) return dlg;
    dlg = document.createElement('dialog'); dlg.id='camDialog'; dlg.className='camdlg';
    dlg.innerHTML = `
      <div class="cam-box">
        <div class="cam-head"><span>Ambil Foto</span><button class="btn" id="camClose">Tutup</button></div>
        <div class="cam-view"><video id="camVideo" autoplay playsinline muted></video></div>
        <div class="cam-actions">
          <div style="display:flex;gap:8px">
            <button class="btn" id="camSwitch">🔁 Tukar Kamera</button>
            <button class="btn warn" id="camRetry">↺ Muat Ulang</button>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn" id="camCancel">Batal</button>
            <button class="btn primary" id="camCapture">📸 Ambil</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', stopCam);
    dlg.addEventListener('cancel', (e)=>{ e.preventDefault(); dlg.close(); });
    dlg.querySelector('#camClose').onclick = ()=> dlg.close();
    dlg.querySelector('#camCancel').onclick = ()=> dlg.close();
    dlg.querySelector('#camRetry').onclick  = ()=>startCam(camFacing).catch(()=>toast('Gagal memulai kamera.'));
    dlg.querySelector('#camSwitch').onclick = ()=>startCam(camFacing==='user'?'environment':'user').catch(()=>toast('Tidak bisa beralih kamera.'));
    dlg.querySelector('#camCapture').onclick = ()=>{
      const v=$('#camVideo'); if(!v || !v.videoWidth){ toast('Video belum siap.'); return; }
      const c=document.createElement('canvas'); c.width=v.videoWidth; c.height=v.videoHeight;
      const ctx=c.getContext('2d'); ctx.drawImage(v,0,0,c.width,c.height);
      camDataUrl = c.toDataURL('image/jpeg',0.92);
      dlg.close();
      let thumb=$('#empPhotoPreview');
      if(!thumb){
        thumb=document.createElement('img');
        thumb.id='empPhotoPreview';
        thumb.className='cam-thumb';
        const anchor = $('#btnCamBack')?.parentElement || $('#btnCamFront')?.parentElement || $('#fPhotoFile')?.parentElement;
        anchor?.appendChild(thumb);
      }
      thumb.src = camDataUrl;
      toast('Foto diambil. Akan dipakai saat Simpan.');
    };
    return dlg;
  }
  async function openCamera(facing='user'){
    if(!navigator.mediaDevices?.getUserMedia){ toast('Kamera tidak didukung di browser ini.'); return; }
    const dlg = ensureCamDialog();
    try{ await dlg.showModal?.(); await startCam(facing); }
    catch(err){
      toast('Gagal membuka kamera. Coba izinkan akses kamera atau gunakan Upload.');
      dlg.open && dlg.close();
      $('#fPhotoFile')?.click();
    }
  }
  $('#btnCamFront')?.addEventListener('click',()=>openCamera('user'));
  $('#btnCamBack') ?.addEventListener('click',()=>openCamera('environment'));

  function readImageFromAny(){
    return new Promise(res=>{
      if(camDataUrl) return res(camDataUrl);
      const f=$('#fPhotoFile')?.files?.[0];
      if(!f) return res(null);
      const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(f);
    });
  }

  // Employees open/save/delete
  empTBody?.addEventListener('click',async e=>{
    const b=e.target.closest('button'); if(!b) return; const nid=b.dataset.id; const idx=employees.findIndex(x=>x.nid==nid); if(idx<0) return;
    if(b.dataset.act==='edit'){ openEmp(employees[idx],idx); }
    else if(b.dataset.act==='del'){
      if(confirm(`Hapus karyawan ${employees[idx].name}?`)){
        const removed = employees[idx];
        employees.splice(idx,1); save(LS_EMP,employees); syncGlobals();
        renderEmployees(); renderDashboard(); toast('Data karyawan dihapus.'); initMonthlyScheduler();
        if(isSupabaseEnabled()) deleteEmployeeRemote(removed.nid);
      }
    }
    else if(b.dataset.act==='barcode'){ dlBarcode(employees[idx]); }
  });
  $('#btnAddEmp')?.addEventListener('click',()=>openEmp());

  function openEmp(data=null,index=-1){
    editIdx=index;
    camDataUrl=null;
    $('#empPhotoPreview')?.remove();

    $('#empModalTitle').textContent=index>=0?'Edit Karyawan':'Tambah Karyawan';
    $('#fNid').value=data?.nid||''; $('#fName').value=data?.name||'';
    $('#fTitle').value=data?.title||'';
    setCompanyUI(data?.company||'');
    $('#fShift').value=(data?.shift && SHIFT_KEYS.includes(data.shift))?data.shift:'A';
    $('#fPhoto').value=data?.photo||'';
    $('#fPhotoFile').value='';
    $('#empModal')?.showModal();
  }
  function closeEmp(){ $('#empModal')?.close(); }
  $('#btnCloseEmp')?.addEventListener('click', closeEmp);
  $('#btnExitEmp')?.addEventListener('click', closeEmp);

  $('#btnSaveEmp')?.addEventListener('click',async e=>{
    e.preventDefault();
    const imgDataUrl = await readImageFromAny();
    const emp={
      nid:$('#fNid').value.trim(),
      name:$('#fName').value.trim(),
      title:$('#fTitle').value.trim(),
      company:readCompanyFromUI(),
      shift:$('#fShift').value,
      photo: imgDataUrl || $('#fPhoto').value.trim() || ''
    };
    if(!emp.nid||!emp.name) return toast('NID & Nama wajib diisi.');
    if(editIdx>=0){ employees[editIdx]=emp; }
    else {
      if(employees.some(e=>e.nid==emp.nid)) return toast('NID sudah ada.');
      employees.push(emp);
    }
    save(LS_EMP,employees); syncGlobals();
    renderEmployees(); renderDashboard(); $('#empModal')?.close(); toast('Data karyawan disimpan.');
    initMonthlyScheduler();

    if(isSupabaseEnabled()) pushEmployee(emp);
  });

  // Import/Export employees
  $('#btnImportEmp')?.addEventListener('click',()=>$('#fileImportEmp').click());
  // ===== Import/Export employees (patched import handler w/ robust supabase attempt + enqueue) =====
$('#fileImportEmp')?.addEventListener('change', async ev => {
  const file = ev.target.files?.[0];
  if (!file) return;
  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    const toPush = [];
    let added = 0, updated = 0;
    rows.forEach(r => {
      const emp = {
        nid: String(r.NID ?? r.nid ?? '').trim(),
        name: String(r.Nama ?? r.name ?? '').trim(),
        title: String(r.Jabatan ?? r.title ?? '').trim(),
        company: String(r.Perusahaan ?? r.company ?? '').trim(),
        shift: String(r.Grup ?? r.Shift ?? r.grup ?? r.shift ?? 'A').trim(),
        photo: String(r.FotoURL ?? r.photo ?? '').trim()
      };
      if (!emp.nid || !emp.name) return;
      toPush.push(emp);
    });

    if (!toPush.length) {
      toast('File tidak berisi data karyawan yang valid.');
      ev.target.value = '';
      return;
    }

    // Bulk push: try to upsert in one call
    console.info('[Import] sending batch to pushEmployee, rows:', toPush.length);
    const res = await pushEmployee(toPush);
    if (res?.error) {
  console.warn('[Import] pushEmployee returned error, will enqueue locally if needed', res.error);

  // --- TAMBAHKAN BARIS INI ---
  alert('GAGAL SINKRON! Error dari Supabase: ' + JSON.stringify(res.error));
  // --- SELESAI ---

  // fallback: store locally (already saved by import?) and enqueue each row
  toPush.forEach(i => enqueuePush({ ...i, created_at: new Date().toISOString(), ts: Date.now() }));
  // toast('Import: data disimpan lokal dan dimasukkan ke antrean sinkronisasi.'); // Kita nonaktifkan toast
} else {
      console.info('[Import] pushEmployee OK, rows:', (res.data || []).length);
      toast('Import selesai dan dikirim ke server.');
    }

    // update UI
    save(LS_EMP, employees); // make sure local employees persistent (if you mutated employees)
    renderEmployees(); renderDashboard();
    ev.target.value = '';
  } catch (err) {
    console.error('[Import] exception', err);
    toast('Gagal mengimpor file: lihat console.');
    ev.target.value = '';
  }
});


  $('#btnExportEmp')?.addEventListener('click',()=>{
    const rows=employees.map(e=>({NID:e.nid,Nama:e.name,Jabatan:e.title,Perusahaan:e.company,Grup:e.shift,FotoURL:e.photo}));
    const ws=XLSX.utils.json_to_sheet(rows); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Karyawan'); XLSX.writeFile(wb,'karyawan.xlsx');
  });
  $('#btnTemplateEmp')?.addEventListener('click',()=>{
    const rows=[{NID:'EMP001',Nama:'Nama Lengkap',Jabatan:'Operator',Perusahaan:'PT PLN NPS',Grup:'A',FotoURL:'https://…'}];
    const ws=XLSX.utils.json_to_sheet(rows); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Template'); XLSX.writeFile(wb,'template_karyawan.xlsx');
  });

  // QR code download
  async function dlBarcode(emp){
    const payload = `${emp.nid}|${emp.name}|${emp.title}|${emp.company}`;
    if (typeof QRCode === 'undefined') { toast('Library QRCode belum dimuat. Tambahkan <script qrcode.min.js> di HTML.'); return; }
    const tmp = document.createElement('div'); tmp.style.position='fixed'; tmp.style.left='-9999px'; document.body.appendChild(tmp);
    new QRCode(tmp, { text: payload, width: 260, height: 260, correctLevel: QRCode.CorrectLevel.M });
    let qCanvas = tmp.querySelector('canvas');
    if (!qCanvas) {
      const img = tmp.querySelector('img');
      if (img) {
        await new Promise(res => { if (img.complete) res(); else img.onload = res; });
        qCanvas = document.createElement('canvas');
        qCanvas.width  = img.naturalWidth; qCanvas.height = img.naturalHeight;
        qCanvas.getContext('2d').drawImage(img, 0, 0);
      }
    }
    document.body.removeChild(tmp);
    if (!qCanvas) { toast('Gagal membuat QR.'); return; }
    const W=560,H=300,PAD=16, out=document.createElement('canvas'); out.width=W; out.height=H; const ctx=out.getContext('2d');
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
    const qrSize = H - 2*PAD; ctx.drawImage(qCanvas, PAD, PAD, qrSize, qrSize);
    const xText = PAD*2 + qrSize, y0 = PAD + 26, lh = 24;
    ctx.fillStyle='#000'; ctx.font='bold 22px Inter, Arial, sans-serif'; ctx.fillText(emp.name||'', xText, y0);
    ctx.font='16px Inter, Arial, sans-serif'; ctx.fillText(`NID: ${emp.nid||''}`, xText, y0+lh);
    ctx.fillText(emp.title||'', xText, y0+lh*2); ctx.fillText(emp.company||'', xText, y0+lh*3);
    const a=document.createElement('a'); a.download=`QR_${emp.nid||'EMP'}.png`; a.href=out.toDataURL('image/png'); a.click();
  }

  // ===== Pengaturan Shift =====
  function tryReadAltShiftRows(){
    const map={};
    const rows=[...document.querySelectorAll('tr, .shift-row')];
    rows.forEach(row=>{
      const sel=row.querySelector('select');
      if(!sel) return;
      const label=(sel.value || sel.options?.[sel.selectedIndex]?.text || '').toLowerCase();
      let code=null;
      if(label.includes('pagi') || label.includes('(p)')) code='A';
      else if(label.includes('sore') || label.includes('(s)')) code='B';
      else if(label.includes('malam')|| label.includes('(m)')) code='C';
      else if(label.includes('day')  ) code='DAYTIME';
      else if(label.includes('libur')|| label.includes('(l)')) code='OFF';
      if(!code) return;
      const inputs=[...row.querySelectorAll('input')];
      const start = normalizeTime(inputs[0]?.value||'');
      const end   = normalizeTime(inputs[1]?.value||'');
      if(code!=='OFF' && start && end) map[code]={start,end};
    });
    return Object.keys(map).length?map:null;
  }
  function pickVal(id1, id2) {
    const a = document.querySelector(id1);
    if (a && a.value) return normalizeTime(a.value);
    const b = document.querySelector(id2);
    return b ? normalizeTime(b.value) : '';
  }
  function getShiftInputs(){
    const alt=tryReadAltShiftRows();
    if(alt){
      return {
        pagi:  alt.A || {start:'08:00',end:'16:00'},
        sore:  alt.B || {start:'16:00',end:'24:00'},
        malam: alt.C || {start:'24:00',end:'07:00'},
        day:   alt.DAYTIME || alt.A || {start:'08:00',end:'16:00'}
      };
    }
    const pagi  = { start: pickVal('#shiftPagiStart',  '#shiftAStart') || '08:00',
                    end:   pickVal('#shiftPagiEnd',    '#shiftAEnd')   || '16:00' };
    const sore  = { start: pickVal('#shiftSoreStart',  '#shiftBStart') || '16:00',
                    end:   pickVal('#shiftSoreEnd',    '#shiftBEnd')   || '24:00' };
    const malam = { start: pickVal('#shiftMalamStart', '#shiftCStart') || '24:00',
                    end:   pickVal('#shiftMalamEnd',   '#shiftCEnd')   || '07:00' };
    const day   = { start: pickVal('#shiftDayStart',   '') || '08:00',
                    end:   pickVal('#shiftDayEnd',     '') || '16:00' };
    return {pagi,sore,malam,day};
  }
  function renderShiftForm(){
    const pagi  = shifts.A || { start: '08:00', end: '16:00' };
    const sore  = shifts.B || { start: '16:00', end: '24:00' };
    const malam = shifts.C || { start: '24:00', end: '07:00' };
    const day   = shifts.DAYTIME || { start: pagi.start, end: pagi.end };

    $('#shiftPagiStart')  && ($('#shiftPagiStart').value  = pagi.start);
    $('#shiftPagiEnd')    && ($('#shiftPagiEnd').value    = pagi.end);
    $('#shiftSoreStart')  && ($('#shiftSoreStart').value  = sore.start);
    $('#shiftSoreEnd')    && ($('#shiftSoreEnd').value    = sore.end);
    $('#shiftMalamStart') && ($('#shiftMalamStart').value = malam.start);
    $('#shiftMalamEnd')   && ($('#shiftMalamEnd').value   = malam.end);
    $('#shiftDayStart')   && ($('#shiftDayStart').value   = day.start);
    $('#shiftDayEnd')     && ($('#shiftDayEnd').value     = day.end);

    $('#shiftAStart') && ($('#shiftAStart').value = pagi.start);
    $('#shiftAEnd')   && ($('#shiftAEnd').value   = pagi.end);
    $('#shiftBStart') && ($('#shiftBStart').value = sore.start);
    $('#shiftBEnd')   && ($('#shiftBEnd').value   = sore.end);
    $('#shiftCStart') && ($('#shiftCStart').value = malam.start);
    $('#shiftCEnd')   && ($('#shiftCEnd').value   = malam.end);
    $('#shiftDStart') && ($('#shiftDStart').value = (shifts.D?.start || '19:00'));
    $('#shiftDEnd')   && ($('#shiftDEnd').value   = (shifts.D?.end   || '07:00'));
  }
  $('#btnSaveShift')?.addEventListener('click',()=>{
    const { pagi, sore, malam, day } = getShiftInputs();
    shifts={
      A:{start:normalizeTime(pagi.start),end:normalizeTime(pagi.end)},
      B:{start:normalizeTime(sore.start),end:normalizeTime(sore.end)},
      C:{start:normalizeTime(malam.start),end:normalizeTime(malam.end)},
      D: shifts.D || {start:'19:00',end:'07:00'},
      DAYTIME:{start:normalizeTime(day.start),end:normalizeTime(day.end)}
    };
    save(LS_SHIFTS,shifts); syncGlobals();
    toast('Pengaturan shift disimpan.');
    renderDashboard(); renderCurrentShiftPanel();

    if(isSupabaseEnabled()) pushShiftsCfg();
  });

  // ===== Attendance (laporan) =====
  function renderAttendance(){ 
    const to=new Date(), from=new Date(to.getTime()-24*3600*1000);
    $('#attFrom').value=from.toISOString().slice(0,10); $('#attTo').value=to.toISOString().slice(0,10);
    filterAttendance();
  }
  function filterAttendance(){
    const tb=$('#tableAtt tbody'); if(!tb) return;
    const from=new Date($('#attFrom').value+'T00:00:00').getTime(), to=new Date($('#attTo').value+'T23:59:59').getTime();
    const rows=attendance.filter(a=>a.ts>=from&&a.ts<=to).sort((a,b)=>b.ts-a.ts); tb.innerHTML='';
    rows.forEach(r=>{
      const tr=document.createElement('tr');
      tr.dataset.ts=r.ts;
      tr.innerHTML=`<td>${fmtTs(r.ts)}</td><td>${capStatus(r.status)}</td><td>${r.nid}</td><td>${r.name}</td>
                    <td>${r.title}</td><td>${r.company}</td>
                    <td>${CODE_TO_LABEL[r.shift] || r.shift || ''}</td><td>${r.note||''}</td>
                    <td><button class="btn danger" data-act="del-att">Hapus</button></td>`;
      tb.appendChild(tr);
    });
    $('#btnExportAtt').dataset.count=rows.length;
  }
  $('#btnFilterAtt')?.addEventListener('click',filterAttendance);
  $('#tableAtt tbody')?.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-act="del-att"]'); if(!btn) return;
    const tr = btn.closest('tr'); const ts = Number(tr?.dataset.ts||'0'); if(!ts) return;
    if(confirm('Hapus baris kehadiran ini?')){
      const idx = attendance.findIndex(a=>a.ts===ts);
      if(idx>=0){ 
        attendance.splice(idx,1); save(LS_ATT,attendance); syncGlobals();
        filterAttendance(); renderDashboard(); renderScanTable(); renderScanStats(); toast('Baris dihapus.');
        if(isSupabaseEnabled()) deleteAttendanceRemote(ts);
      }
    }
  });
  $('#btnExportAtt')?.addEventListener('click',()=>{
    const from=new Date($('#attFrom').value+'T00:00:00').getTime(), to=new Date($('#attTo').value+'T23:59:59').getTime();
    const rows=attendance.filter(a=>a.ts>=from&&a.ts<=to).map(r=>({Waktu:fmtTs(r.ts),Status:capStatus(r.status),NID:r.nid,Nama:r.name,Jabatan:r.title,Perusahaan:r.company,Shift:CODE_TO_LABEL[r.shift] || r.shift || '',Keterangan:r.note||''}));
    const ws=XLSX.utils.json_to_sheet(rows); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Kehadiran'); XLSX.writeFile(wb,`kehadiran_${$('#attFrom').value}_sd_${$('#attTo').value}.xlsx`);
  });

  // ===== Latest info =====
  function renderLatest(){
    const tb=$('#tableNews tbody'); if(!tb) return; tb.innerHTML='';
    const sorted=[...news].sort((a,b)=>b.ts-a.ts);
    sorted.forEach(n=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${fmtTs(n.ts)}</td><td>${esc(n.title)}</td><td>${esc(n.body||'')}${n.link?` • <a href="${esc(n.link)}" target="_blank">Link</a>`:''}</td>
                    <td>
                      <button class="btn" data-act="edit-news" data-ts="${n.ts}">✏️</button>
                      <button class="btn ghost" data-act="del-news" data-ts="${n.ts}">🗑️</button>
                    </td>`;
      tb.appendChild(tr);
    });
  }
  function openNews(data=null, ts=null){
    const d=$('#newsModal'); if(!d) return;
    d.dataset.ts = ts ? String(ts) : '';
    $('#nTitle').value=data?.title||'';
    $('#nBody').value=data?.body||'';
    $('#nLink').value=data?.link||'';
    d.showModal();
  }
  $('#btnAddNews')?.addEventListener('click', () => openNews(null, null));
  $('#btnBackNews')?.addEventListener('click', (e) => { e.preventDefault(); $('#newsModal')?.close(); });
  $('#newsModal')?.addEventListener('close', () => { const d=$('#newsModal'); if(d) d.dataset.ts=''; });
  $('#btnSaveNews')?.addEventListener('click',async e=>{
    e.preventDefault();
    const d=$('#newsModal'); if(!d) return;
    const tsStr=d.dataset.ts || '';
    const tsVal = tsStr ? Number(tsStr) : Date.now();
    const item={ts:tsVal, title:$('#nTitle').value.trim(), body:$('#nBody').value.trim(), link:$('#nLink').value.trim()};
    if(!item.title) return toast('Judul wajib diisi.');
    const idx=news.findIndex(n=>n.ts===tsVal);
    if(idx>=0){ news[idx]=item; } else { news.push(item); }
    save(LS_NEWS,news); renderLatest(); renderNewsWidgets(); toast('Info tersimpan.');

    if(isSupabaseEnabled()) pushNews(item);
  });
  $('#tableNews')?.addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b) return; const ts=Number(b.dataset.ts||'0'); if(!ts) return;
    const idx=news.findIndex(n=>n.ts===ts); if(idx<0) return;
    if(b.dataset.act==='edit-news') openNews(news[idx], ts);
    if(b.dataset.act==='del-news'){
      if(confirm('Hapus info ini?')){ 
        news.splice(idx,1); save(LS_NEWS,news); renderLatest(); renderNewsWidgets(); toast('Info dihapus.');
        if(isSupabaseEnabled()) deleteNewsRemote(ts);
      }
    }
  });

  // ===== Scheduler =====
  function daysIn(y,m0){ return new Date(y,m0+1,0).getDate(); }
  function ensureMonth(id){ if(!sched[id]) sched[id]={}; }
  function renderSchedTable(){
  const host=$('#tableSched'); if(!host) return;
  host.classList.add('compact');
  const mp=$('#schedMonth'); if(!mp.value) mp.value = monthKey(new Date());
  const id = mp.value;
  const [yy,mm]=id.split('-').map(Number); const dim=daysIn(yy,mm-1);
  ensureMonth(id);

  let headCells = '';
  for(let i=0; i<dim; i++){
    const day = i+1;
    const d = new Date(yy, mm-1, day);
    const wd = d.toLocaleDateString('id-ID', { weekday: 'short' });
    headCells += '<th>' + day + '<br><small>' + esc(wd) + '</small></th>';
  }

  host.innerHTML = '<thead><tr><th style="min-width:80px">Shift</th>' + headCells + '</tr></thead><tbody></tbody>';
  const tb=host.querySelector('tbody');
  const opts=Object.entries(CODE_TO_LABEL).map(([code,label])=>`<option value="${code}">${label}</option>`).join('');
  const optsHtml = `<option value="">—</option>${opts}`;

  tb.innerHTML = '';
  SHIFT_KEYS.forEach(groupName => {
    const tr=document.createElement('tr');
    let cells = '<td><b>' + esc(groupName) + '</b></td>';
    for(let d=1; d<=dim; d++){
      cells += `<td><select class="sched" data-group="${esc(groupName)}" data-day="${d}" title="Jadwal Grup ${esc(groupName)} tgl ${d}">${optsHtml}</select></td>`;
    }
    tr.innerHTML = cells;
    tb.appendChild(tr);
    tr.querySelectorAll('select.sched').forEach(sel => {
      const day = sel.dataset.day;
      const curValue = sched[id]?.[groupName]?.[day] || '';
      sel.value = curValue;
    });
  });

  tb.querySelectorAll('select.sched').forEach(sel=>{
    sel.addEventListener('change',e=>{
      const group=e.target.dataset.group, day=+e.target.dataset.day, val=e.target.value;
      const monthId = $('#schedMonth').value;
      ensureMonth(monthId);
      if(!sched[monthId][group]) sched[monthId][group]={};
      if(val) sched[monthId][group][day]=val; else delete sched[monthId][group][day];
    });
  });
}

  function initMonthlyScheduler(){ 
    if(!$('#schedMonth')) return; 
    if(!$('#schedMonth').value) $('#schedMonth').value=monthKey(new Date()); 
    ensureMonth($('#schedMonth').value); 
    renderSchedTable(); 
    if(isSupabaseEnabled()){ pullSched($('#schedMonth').value).then(()=>renderSchedTable()); }
  }
  $('#schedMonth')?.addEventListener('change',()=>{ renderSchedTable(); if(isSupabaseEnabled) pullSched($('#schedMonth').value).then(()=>renderSchedTable()); });
  $('#btnSchedSave')?.addEventListener('click',()=>{ 
    const id=$('#schedMonth').value || monthKey(new Date());
    save(LS_SCHED,sched); syncGlobals(); toast('Jadwal bulan ini disimpan.'); renderCurrentShiftPanel(); 
    if(isSupabaseEnabled()) pushSchedMonth(id);
  });
  $('#btnSchedReset')?.addEventListener('click',()=>{
    const id=$('#schedMonth').value; if(!id) return;
    if(confirm('Kosongkan jadwal untuk bulan ini?')){ 
      sched[id]={}; save(LS_SCHED,sched); syncGlobals(); renderSchedTable(); toast('Bulan dikosongkan.'); renderCurrentShiftPanel();
      if(isSupabaseEnabled()) deleteSchedMonthRemote(id);
    }
  });
  $('#btnSchedDownload')?.addEventListener('click',()=>{
    const id=$('#schedMonth').value||monthKey(new Date()); const [yy,mm]=id.split('-').map(Number); const dim=daysIn(yy,mm-1); ensureMonth(id);
    const rows = SHIFT_KEYS.map(group => {
      const row = {Grup: group};
      for(let d=1; d<=dim; d++){
        const code = sched[id]?.[group]?.[d] || '';
        row['D'+d] = (CODE_TO_LABEL[code] || code);
      }
      return row;
    });
    const headers=['Grup', ...Array.from({length:dim},(_,i)=>'D'+(i+1))];
    const ws=XLSX.utils.json_to_sheet(rows,{header:headers}); const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,`Jadwal_${id}`); XLSX.writeFile(wb,`jadwal_grup_${id}.xlsx`);
  });
  $('#btnSchedImport')?.addEventListener('click',()=>$('#fileImportSched').click());
  $('#fileImportSched')?.addEventListener('change',async ev=>{
    const file=ev.target.files[0]; if(!file) return;
    const id=$('#schedMonth').value||monthKey(new Date()); const [yy,mm]=id.split('-').map(Number); const dim=daysIn(yy,mm-1); ensureMonth(id);
    const data=await file.arrayBuffer(); const wb=XLSX.read(data); const ws=wb.Sheets[wb.SheetNames[0]];
    const rows=XLSX.utils.sheet_to_json(ws,{defval:''});
    let applied=0;
    rows.forEach(r=>{
      const group=String(r.Grup || r.grup || '').trim();
      if(!group || !SHIFT_KEYS.includes(group)) return;
      if(!sched[id][group]) sched[id][group]={};
      for(let d=1; d<=dim; d++){
        let v=String(r['D'+d]||'').trim(); if(!v){ delete sched[id][group][d]; continue; }
        const key=LABEL_TO_CODE[v.toLowerCase()] || (['A','B','C','D','DAYTIME','OFF'].includes(v)?v : null) || (v.toLowerCase()==='l'?'OFF':null);
        if(key){ sched[id][group][d]=key; applied++; }
      }
    });
    save(LS_SCHED,sched); syncGlobals(); renderSchedTable(); toast(`Import jadwal: ${applied} sel terisi.`); ev.target.value=''; renderCurrentShiftPanel();
    if(isSupabaseEnabled()) pushSchedMonth(id);
  });

  // ===== Seeds (DISABLED) =====
  // NOTE: seeding demo employees is disabled in production build to prevent phantom rows.
  // If you need local demo data, set localStorage.setItem('SA_ALLOW_SEED','1') in console and
  // re-enable a small seed block here OR call a helper that inserts demo rows.
  // (No automatic seed performed.)

  // ===== Scan stats proxy (pakai script inline) =====
  function renderScanStats(){
    if (typeof window.refreshScanStats === 'function') {
      try { window.refreshScanStats(); } catch {}
    }
  }

  // ===== LIVE CIRCLE di kanan hasil scan =====
  function ensureScanLiveCircle(){
    const right = document.querySelector('#scanResult');
    if(!right || document.getElementById('scanLiveCircle')) return;
    const style = document.createElement('style');
    style.textContent = `
      #scanLiveCircle{width:160px; height:160px; margin:6px auto 12px; position:relative}
      #scanLiveCircle svg{width:100%; height:100%}
      #scanLiveCircle .bg{fill:none; stroke:#e6eefc; stroke-width:10}
      #scanLiveCircle .fg{fill:none; stroke:var(--primary-500,#4a8cff); stroke-width:10; stroke-linecap:round; transform:rotate(-90deg); transform-origin:center; transition:stroke-dasharray .6s}
      #scanLiveCircle .big{font:700 28px/1 Inter,system-ui,Arial; fill:var(--text,#0b2545)}
      #scanLiveCircle .sub{font:500 12px/1 Inter,system-ui,Arial; fill:#64748b}
      #scanLiveCircle.pulse{animation:sl_pulse .8s ease}
      @keyframes sl_pulse{0%{transform:scale(1)}50%{transform:scale(1.04)}100%{transform:scale(1)}}
      .scan-hero-right .circle-wrap{display:flex;flex-direction:column;align-items:center;gap:6px}
      .circle-legend{font:600 12px Inter,system-ui,Arial;color:#334155}
    `;
    document.head.appendChild(style);
    const wrap=document.createElement('div');
    wrap.className='circle-wrap';
    wrap.innerHTML=`
      <div id="scanLiveCircle">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" class="bg"></circle>
          <circle cx="60" cy="60" r="52" class="fg" stroke-dasharray="0 327"></circle>
          <text x="60" y="58" text-anchor="middle" class="big">0</text>
          <text x="60" y="78" text-anchor="middle" class="sub">hadir</text>
        </svg>
      </div>
      <div class="circle-legend"><span id="lcLabel">0 / 0</span></div>`;
    right.prepend(wrap);
  }

  function updateScanLiveCircle(pulse=false){
    ensureScanLiveCircle();
    const node = document.getElementById('scanLiveCircle');
    if(!node) return;
    const fg = node.querySelector('.fg');
    const big = node.querySelector('.big');
    const lab = $('#lcLabel');

    const pm = presentMapToday();
    const counts = pm.counts || {};
    const totals = pm.totals || {};

    const present = Object.values(counts).reduce((a,b)=>a+(b||0),0);
    const total = Object.values(totals).reduce((a,b)=>a+(b||0),0);

    const r = 52;
    const circ = 2 * Math.PI * r;
    const pct = total ? (present / total) : 0;

    if(fg) fg.setAttribute('stroke-dasharray', `${circ * pct} ${circ * (1 - pct)}`);
    if(big) big.textContent = String(present);
    if(lab) lab.textContent = `${present} / ${total}`;

    if(pulse){
      node.classList.remove('pulse');
      void node.offsetWidth;
      node.classList.add('pulse');
    }
  }

  // update scan live circle when attendance changes
  window.addEventListener('attendance:update', () => { updateScanLiveCircle(true); renderScanStats(); });

  // ===== Init page sections =====
  function renderScanPage(){
    renderScanTable();
    renderScanPreview(null,null);
    renderNewsWidgets();
    ensureScanLiveCircle();
    updateScanLiveCircle(false);
    renderScanStats();
  }

  renderEmployees();
  renderDashboard();
  renderScanPage();
  renderLatest();

  const routeShifts = $('#route-shifts');
  if(routeShifts && !routeShifts.classList.contains('hidden')){
    renderShiftForm();
    initMonthlyScheduler();
  }

  // Compact stat cards
  (function injectCompactCards(){
    const st = document.createElement('style');
    st.textContent = `.grid-3 .card.stat{padding:12px 14px;border-radius:16px}.card.stat .stat-value{font-size:28px}.card.stat .progress-bar{height:10px}`;
    document.head.appendChild(st);
  })();

  // periodic
  window.addEventListener('attendance:update', renderLiveCompanyStats);
  setInterval(() => { updateScanLiveCircle(false); renderScanStats(); }, 15000);


  // -----------------------------
  // DEVELOPER: Clear Local Data helper + UI button
  // -----------------------------
  function clearLocalData(opts = {}) {
    const defaults = {
      confirm: true,
      reload: true,
      keys: [
        'SA_EMPLOYEES','SA_ATTENDANCE','SA_SHIFTS','SA_NEWS','SA_SHIFT_MONTHLY',
        'SA_AUTH','SA_EDUCATION','SA_ALLOW_SEED','SA_CONFIG', PUSH_QUEUE_KEY
      ]
    };
    const o = Object.assign({}, defaults, opts || {});
    if(o.confirm){
      const proceed = confirm(
        'Reset Data Lokal (Developer)\n\n' +
        'Ini akan menghapus data lokal penting (karyawan, absensi, shift, news, sched, dll).\n' +
        'Sebaiknya ekspor data terlebih dahulu jika diperlukan.\n\n' +
        'Lanjutkan?'
      );
      if(!proceed) return false;
    }
    try{
      for(const k of o.keys){
        localStorage.removeItem(k);
      }
      if(o.removeAllSA){
        Object.keys(localStorage).forEach(k=>{ if(k && k.startsWith('SA_')) localStorage.removeItem(k); });
      }
      employees = []; attendance = []; shifts = {}; news = []; sched = {}; pushQueue = [];
      save(PUSH_QUEUE_KEY, pushQueue);
      syncGlobals();
      renderEmployees(); renderDashboard(); renderScanPage(); renderLatest();
      toast('Data lokal telah dihapus.');
      if(o.reload) {
        setTimeout(()=>{ location.reload(); }, 600);
      }
      return true;
    }catch(err){
      console.error('clearLocalData failed', err);
      alert('Gagal menghapus data lokal. Periksa console.');
      return false;
    }
  }
  window.clearLocalData = clearLocalData;

  // inject small button in sidebar-footer for devs
  (function injectResetButton(){
    try{
      const footer = document.querySelector('.sidebar-footer');
      if(!footer) return;
      if(document.getElementById('btnResetLocal')) return;
      const btn = document.createElement('button');
      btn.id = 'btnResetLocal';
      btn.className = 'btn ghost';
      btn.type = 'button';
      btn.title = 'Reset Data Lokal (Developer)';
      btn.textContent = '🧹 Reset Data Lokal (Dev)';
      btn.style.gap = '8px';
      btn.addEventListener('click', ()=> {
        const ok = confirm('🧹 Reset Data Lokal (Developer)\n\n' +
                           'Aksi ini akan menghapus data lokal (employees, attendance, shifts, news, schedules, auth, education).\n' +
                           'Pastikan sudah melakukan backup (Export). Klik OK untuk melanjutkan.');
        if(!ok) return;
        clearLocalData({ confirm: false, reload: true, removeAllSA: true });
      });
      footer.insertBefore(btn, footer.firstChild || footer.childNodes[0]);
    }catch(e){ console.warn('injectResetButton failed', e); }
  })();

}); // end DOMContentLoaded
