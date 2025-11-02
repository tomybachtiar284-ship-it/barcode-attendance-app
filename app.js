// SmartAttend app.js — FINAL v1.4 (polished)
// - Sinkron dengan HTML terbaru (scan stats pakai script inline -> kita panggil via window.refreshScanStats jika ada)
// - Perbaikan “late” untuk shift lintas tengah malam menggunakan tanggal basis shift
// - Hapus duplikasi mini calendar & scan stats internal yang tak terpakai
// - Event refresh terpadu: scan:saved, attendance:update, attendance:changed
// - Sync ke window.* agar script lain bisa membaca data langsung
// - Hapus satu baris attendance saja (bukan semua)
//
window.addEventListener('DOMContentLoaded', () => {
  const LS_EMP='SA_EMPLOYEES', LS_ATT='SA_ATTENDANCE', LS_SHIFTS='SA_SHIFTS',
        LS_NEWS='SA_NEWS', LS_SCHED='SA_SHIFT_MONTHLY';

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
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
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
      sched=load(LS_SCHED,{});

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
      target.classList.add('changed');
      setTimeout(()=>target.classList.remove('changed'), 700);
    }else el.textContent = newStr;
  }

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
  }));

  // Clock
  function tick(){ $('#liveClock') && ($('#liveClock').textContent = fmtTs(Date.now()).split(' ')[1]); }
  setInterval(tick,1000); tick();

  // Shift helpers
  const SHIFT_KEYS = ['A','B','C','D','DAYTIME'];
  const CODE_TO_LABEL={A:'P', B:'S', C:'M', D:'D', DAYTIME:'DAY', OFF:'L'};
  const LABEL_TO_CODE={
    'a':'A','p':'A','pagi':'A',
    'b':'B','s':'B','sore':'B',
    'c':'C','m':'C','malam':'C',
    'd':'D','shift d':'D',
    'day':'DAYTIME','daytime':'DAYTIME','siang':'DAYTIME',
    'off':'OFF','l':'OFF','libur':'OFF'
  };
  function normalizeTime(s){
    s=String(s||'').trim(); if(!s) return '';
    s=s.replace(/[.,\\-h ]/g,':');
    if(/^\\d{3,4}$/.test(s)){ const t=s.length===3?`0${s}`:s; return `${t.slice(0,2)}:${t.slice(2)}`;}
    const m=s.match(/^(\\d{1,2})(?::(\\d{1,2}))?$/); if(!m) return s;
    const H=Math.min(24,parseInt(m[1]||'0',10)), M=Math.min(59,parseInt(m[2]||'0',10));
    return `${pad(H)}:${pad(M)}`;
  }
  const hmToMin = (hm) => { hm=normalizeTime(hm); if (!hm || !hm.includes(':')) return 0; let [h, m] = hm.split(':').map(Number); if (h === 24) return 24 * 60 + m; return h * 60 + m; };
  const monthKey=d=>d.toISOString().slice(0,7);
  const minutesOf=d=>d.getHours()*60+d.getMinutes();
  const shiftWindow=(code)=>{ const s=shifts[code]; if(!s) return null; return {start:hmToMin(s.start), end:hmToMin(s.end)}; };
  const isInWindow=(min,win)=> win.end>win.start ? (min>=win.start && min<win.end) : (min>=win.start || min<win.end);

  function effectiveShiftFor(emp, date){
    const group = emp.shift;
    if(!group) return 'OFF';
    const id = monthKey(date), day = date.getDate();
    return (sched[id]?.[group]?.[day]) || 'OFF';
  }
  function scheduleDateFor(code, dt){
    const win = shiftWindow(code); if(!win) return dt;
    if(win.end>win.start) return dt;
    const m=minutesOf(dt);
    if(m<win.end){ const y=new Date(dt); y.setDate(dt.getDate()-1); return y; }
    return dt;
  }
  function toDateFromHM(baseDate, hm){
    const d = new Date(baseDate); d.setHours(0,0,0,0);
    const [hRaw,mRaw] = normalizeTime(hm).split(':').map(Number);
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
    $('#scanPhoto')&&($('#scanPhoto').style && ($('#scanPhoto').style.backgroundImage=emp?.photo?`url(${emp.photo})`:'' ));
    const pill=$('#scanShiftCheck');
    if(pill){
      if(rec){ pill.textContent=rec.note; pill.className='pill light '+(rec.okShift?(rec.late?'warn':''):'danger'); $('#scanTs')&&($('#scanTs').textContent=fmtTs(rec.ts)); }
      else{ pill.textContent='—'; $('#scanTs')&&($('#scanTs').textContent='—'); }
    }
  }
  function nextStatusFor(nid){ const sod=new Date(todayISO()+'T00:00:00').getTime(); const cnt=attendance.filter(a=>a.nid===nid && a.ts>=sod).length; return (cnt%2===0)?'datang':'pulang'; }
  function parseRaw(s){ if(!s) return null; const p=s.split('|'); return (p.length>=4)?{nid:p[0],name:p[1],title:p[2],company:p[3]}:{nid:s}; }
  function findEmp(p){ if(!p) return null; let e=employees.find(x=>x.nid==p.nid); if(!e && p.name){ e=employees.find(x=>x.name.toLowerCase()===p.name.toLowerCase()); } return e; }

  // ====== SCAN INPUT: clear otomatis & anti-menumpuk ======
  const SCAN_DEBOUNCE=150, SCAN_WINDOW=500; let scanTimer=null, lastScan={v:'',t:0};
  function clearScanInputNow(){
    const inp=$('#scanInput'); if(!inp) return;
    inp.value=''; inp.blur(); setTimeout(()=>inp.focus(), 30);
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

  function handleScan(raw){
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

    // === Late calc yang akurat (berdasarkan tanggal basis shift) ===
    let late=false;
    if(effShift!=='OFF' && status==='datang' && sWin){
      const baseDay = scheduleDateFor(effShift, ts);
      const startDate = toDateFromHM(baseDay, shifts[effShift]?.start || '00:00');
      late = ts.getTime() >= (startDate.getTime() + 5*60*1000);
    }

    const rec={ ts:ts.getTime(), status,
      nid:emp.nid, name:emp.name, title:emp.title, company:emp.company,
      shift:effShift, okShift:inWin,
      note: noteOverride || (status==='datang'?(late?'Terlambat':'On-time'):'—') + (inWin?'':' • Di luar jam shift'),
      late:!!late
    };
    attendance.push(rec); save(LS_ATT,attendance); syncGlobals();
    renderScanPreview(emp,rec); renderScanTable(); renderDashboard(); updateScanLiveCircle(true);
    window.dispatchEvent(new Event('scan:saved'));
    window.dispatchEvent(new Event('attendance:changed'));
    window.dispatchEvent(new Event('attendance:update'));
    renderScanStats();
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
    const v = $('#camVideo'); v.srcObject = camStream; await v.play();
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
      const v=$('#camVideo'); if(!v.videoWidth){ toast('Video belum siap.'); return; }
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
  empTBody?.addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b) return; const nid=b.dataset.id; const idx=employees.findIndex(x=>x.nid==nid); if(idx<0) return;
    if(b.dataset.act==='edit'){ openEmp(employees[idx],idx); }
    else if(b.dataset.act==='del'){
      if(confirm(`Hapus karyawan ${employees[idx].name}?`)){
        employees.splice(idx,1); save(LS_EMP,employees); syncGlobals();
        renderEmployees(); renderDashboard(); toast('Data karyawan dihapus.'); initMonthlyScheduler();
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
  });

  // Import/Export employees
  $('#btnImportEmp')?.addEventListener('click',()=>$('#fileImportEmp').click());
  $('#fileImportEmp')?.addEventListener('change',async ev=>{
    const file=ev.target.files[0]; if(!file) return;
    const data=await file.arrayBuffer(); const wb=XLSX.read(data);
    const ws=wb.Sheets[wb.SheetNames[0]]; const rows=XLSX.utils.sheet_to_json(ws);
    let up=0, add=0;
    rows.forEach(r=>{
      const emp={ nid:String(r.NID??r.nid??'').trim(), name:String(r.Nama??r.name??'').trim(), title:String(r.Jabatan??r.title??''), company:String(r.Perusahaan??r.company??''),
                  shift:String(r.Grup??r.Shift??'A'), photo:String(r.FotoURL??r.photo??'') };
      if(!emp.nid||!emp.name) return;
      const i=employees.findIndex(e=>e.nid==emp.nid);
      if(i>=0){employees[i]=emp; up++;} else {employees.push(emp); add++;}
    });
    save(LS_EMP,employees); syncGlobals(); renderEmployees(); renderDashboard(); initMonthlyScheduler();
    toast(`Import selesai. Tambah ${add}, Update ${up}.`); ev.target.value='';
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
  $('#tableAtt tbody')?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-act="del-att"]'); if(!btn) return;
    const tr = btn.closest('tr'); const ts = Number(tr?.dataset.ts||'0'); if(!ts) return;
    if(confirm('Hapus baris kehadiran ini?')){
      const idx = attendance.findIndex(a=>a.ts===ts);
      if(idx>=0){ attendance.splice(idx,1); save(LS_ATT,attendance); syncGlobals(); filterAttendance(); renderDashboard(); renderScanTable(); renderScanStats(); toast('Baris dihapus.'); }
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
  $('#btnSaveNews')?.addEventListener('click',e=>{
    e.preventDefault();
    const d=$('#newsModal'); if(!d) return;
    const tsStr=d.dataset.ts || '';
    const tsVal = tsStr ? Number(tsStr) : Date.now();
    const item={ts:tsVal, title:$('#nTitle').value.trim(), body:$('#nBody').value.trim(), link:$('#nLink').value.trim()};
    if(!item.title) return toast('Judul wajib diisi.');
    const idx=news.findIndex(n=>n.ts===tsVal);
    if(idx>=0){ news[idx]=item; } else { news.push(item); }
    save(LS_NEWS,news); renderLatest(); renderNewsWidgets(); toast('Info tersimpan.');
  });
  $('#tableNews')?.addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b) return; const ts=Number(b.dataset.ts||'0'); if(!ts) return;
    const idx=news.findIndex(n=>n.ts===ts); if(idx<0) return;
    if(b.dataset.act==='edit-news') openNews(news[idx], ts);
    if(b.dataset.act==='del-news'){
      if(confirm('Hapus info ini?')){ news.splice(idx,1); save(LS_NEWS,news); renderLatest(); renderNewsWidgets(); toast('Info dihapus.'); }
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
    const head=[...Array(dim)].map((_,i)=>{const d=new Date(yy,mm-1,i+1); const wd=d.toLocaleDateString('id-ID',{weekday:'short'}); return `<th>${i+1}<br><small>${wd}</small></th>`;}).join('');
    host.innerHTML=`<thead><tr><th style="min-width:80px">Shift</th>${head}</tr></thead><tbody></tbody>`;
    const tb=host.querySelector('tbody');
    const opts=Object.entries(CODE_TO_LABEL).map(([code,label])=>`<option value="${code}">${label}</option>`).join('');
    const optsHtml = `<option value="">—</option>${opts}`;
    SHIFT_KEYS.forEach(groupName => {
      const tr=document.createElement('tr');
      let cells=`<td><b>${esc(groupName)}</b></td>`;
      for(let d=1; d<=dim; d++){
        cells+=`<td><select class="sched" data-group="${groupName}" data-day="${d}" title="Jadwal Grup ${groupName} tgl ${d}">${optsHtml}</select></td>`;
      }
      tr.innerHTML=cells; tb.appendChild(tr);
      tr.querySelectorAll('select.sched').forEach(sel => {
        const day = sel.dataset.day; const curValue = sched[id]?.[groupName]?.[day] || ''; sel.value = curValue;
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
  function initMonthlyScheduler(){ if(!$('#schedMonth')) return; if(!$('#schedMonth').value) $('#schedMonth').value=monthKey(new Date()); ensureMonth($('#schedMonth').value); renderSchedTable(); }
  $('#schedMonth')?.addEventListener('change',()=>renderSchedTable());
  $('#btnSchedSave')?.addEventListener('click',()=>{ save(LS_SCHED,sched); syncGlobals(); toast('Jadwal bulan ini disimpan.'); renderCurrentShiftPanel(); });
  $('#btnSchedReset')?.addEventListener('click',()=>{
    const id=$('#schedMonth').value; if(!id) return;
    if(confirm('Kosongkan jadwal untuk bulan ini?')){ sched[id]={}; save(LS_SCHED,sched); syncGlobals(); renderSchedTable(); toast('Bulan dikosongkan.'); renderCurrentShiftPanel(); }
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
  });

  // ===== Seeds =====
  if(employees.length===0){
    employees=[
      {nid:'EMP001',name:'Chris Jonathan',title:'General Manager',company:'PT PLN NPS',shift:'A',photo:'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?q=80&w=300&auto=format&fit=crop'},
      {nid:'EMP002',name:'Syafranah San',title:'Designer',company:'PT PLN NPS',shift:'A',photo:'https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?q=80&w=300&auto=format&fit=crop'},
      {nid:'EMP003',name:'Devon Lane',title:'Developer',company:'PT PLN NPS',shift:'B',photo:'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=300&auto=format&fit=crop'}
    ];
    save(LS_EMP,employees); syncGlobals();
  }
  if(news.length===0){
    news=[
      {ts:Date.now()-2*60*60*1000, title:'Sosialisasi K3', body:'Briefing K3 pukul 08:30 di ruang meeting.'},
      {ts:Date.now()-1*60*60*1000, title:'Maintenance', body:'Pemeliharaan unit 2 (shift malam).'}
    ];
    save(LS_NEWS,news);
  }

  // ===== Scan stats proxy (pakai script inline yang sudah ada) =====
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
    const node=document.getElementById('scanLiveCircle'); if(!node) return;
    const fg=node.querySelector('.fg'); const big=node.querySelector('.big'); const lab=$('#lcLabel');
    const {counts, totals}=presentMapToday();
    const present=Object.values(counts).reduce((a,b)=>a+b,0);
    const total=Object.values(totals).reduce((a,b)=>a+b,0);
    const r=52, circ=2*Math.PI*r;
    const pct= total? present/total : 0;
    fg.setAttribute('stroke-dasharray', `${circ*pct} ${circ*(1-pct)}`);
    big.textContent=present;
    if(lab) lab.textContent=`${present} / ${total}`;
    if(pulse){ node.classList.remove('pulse'); void node.offsetWidth; node.classList.add('pulse'); }
  }
  window.addEventListener('attendance:update', ()=>{ updateScanLiveCircle(true); renderScanStats(); });

  // ===== Init page sections =====
  function renderScanPage(){ renderScanTable(); renderScanPreview(null,null); renderNewsWidgets(); ensureScanLiveCircle(); updateScanLiveCircle(false); renderScanStats(); }
  renderEmployees(); renderDashboard(); renderScanPage(); renderLatest();

  const routeShifts = $('#route-shifts');
  if(routeShifts && !routeShifts.classList.contains('hidden')){
    renderShiftForm(); initMonthlyScheduler();
  }

  // Compact stat cards
  (function injectCompactCards(){
    const st=document.createElement('style');
    st.textContent=`.grid-3 .card.stat{padding:12px 14px;border-radius:16px}.card.stat .stat-value{font-size:28px}.card.stat .progress-bar{height:10px}`;
    document.head.appendChild(st);
  })();

  // periodic
  window.addEventListener('attendance:update', renderLiveCompanyStats);
  setInterval(()=>{ updateScanLiveCircle(false); renderScanStats(); }, 15000);
});
