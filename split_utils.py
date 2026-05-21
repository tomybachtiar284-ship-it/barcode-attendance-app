import os
import re

app_js_path = 'app.js'
utils_js_path = 'js/utils.js'
html_path = 'index.html'

if not os.path.exists('js'):
    os.makedirs('js')

with open(app_js_path, 'r', encoding='utf-8') as f:
    app_lines = f.readlines()

utils_code = """// Utility Functions Extracted from app.js
window.$ = (s, r = document) => r.querySelector(s);
window.$$ = (s, r = document) => [...r.querySelectorAll(s)];
window.now = () => new Date();
window.pad = n => String(n).padStart(2, '0');
window.fmtTs = ts => { const d = new Date(ts); return `${d.getFullYear()}-${window.pad(d.getMonth() + 1)}-${window.pad(d.getDate())} ${window.pad(d.getHours())}:${window.pad(d.getMinutes())}:${window.pad(d.getSeconds())}`; }
window.todayISO = () => { const d = window.now(); return `${d.getFullYear()}-${window.pad(d.getMonth() + 1)}-${window.pad(d.getDate())}`; }
window.capStatus = s => { if (s === 'datang') return 'Masuk'; if (s === 'break_out') return 'Izin'; if (s === 'break_in') return 'Kembali'; if (s === 'alpha') return 'Tanpa Ket.'; return 'Keluar'; };
window.load = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
window.save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
window.loadEdu = () => { try { return JSON.parse(localStorage.getItem('SA_EDUCATION') || '[]'); } catch { return []; } };
window.saveEdu = (arr) => localStorage.setItem('SA_EDUCATION', JSON.stringify(arr));
window.esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
window.toast = function(m) { const t = document.createElement('div'); t.textContent = m; t.style.position = 'fixed'; t.style.right = '18px'; t.style.bottom = '18px'; t.style.background = 'rgba(12,18,32,.95)'; t.style.border = '1px solid #1f2636'; t.style.padding = '10px 14px'; t.style.borderRadius = '12px'; t.style.color = '#e8edf3'; t.style.zIndex = 999999; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
"""

with open(utils_js_path, 'w', encoding='utf-8') as f:
    f.write(utils_code)

# Remove these lines from app.js
new_app_lines = []
skip = False
for line in app_lines:
    if line.strip().startswith('const $ ='):
        skip = True
    
    if skip and line.strip().startswith('function toast(m)'):
        skip = False
        continue # skip the toast line too
        
    if not skip:
        new_app_lines.append(line)

with open(app_js_path, 'w', encoding='utf-8') as f:
    f.writelines(new_app_lines)

# Inject script into index.html
with open(html_path, 'r', encoding='utf-8') as f:
    html_content = f.read()

# find <script src="config.local.js"></script> and insert right before it, or before app.js
if '<script src="app.js"></script>' in html_content:
    html_content = html_content.replace('<script src="app.js"></script>', '<script src="js/utils.js"></script>\n  <script src="app.js"></script>')
elif '<script src="config.local.js"></script>' in html_content:
    html_content = html_content.replace('<script src="config.local.js"></script>', '<script src="js/utils.js"></script>\n  <script src="config.local.js"></script>')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html_content)

print("Extraction 1 (Utils) Complete.")
