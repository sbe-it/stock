const SUPABASE_URL = 'https://yximjuyryktwkotlxiyr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4aW1qdXlyeWt0d2tvdGx4aXlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0OTI4MjMsImV4cCI6MjA5NDA2ODgyM30.cKwZVRLmOBYhX73KzrXkdVXAMGxFJ7jSX4bIApIB_7k';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let categories=[], tools=[], sites=[], allLogs=[], currentView='inventory', currentDept='ช่างไฟ', searchTerm='';

// ===== AUTH =====
// บัญชีเริ่มต้น (ใช้เป็น fallback กรณียังไม่ได้สร้างตาราง app_users ใน Supabase)
const DEFAULT_ACCOUNTS = [
    { username:'admin', password:'admin123', role:'admin', name:'ผู้ดูแลระบบ' },
    { username:'user',  password:'user123',  role:'user',  name:'ผู้ใช้งาน' }
];
let appUsers = [];        // รายชื่อผู้ใช้ที่ใช้ตรวจ login (จากฐานข้อมูลหรือ fallback)
let usersTableReady = false; // true เมื่อโหลดจากตาราง app_users สำเร็จ
let currentUser = null;
const isAdmin = () => currentUser && currentUser.role === 'admin';

async function fetchUsers(){
    try{
        const { data, error } = await _supabase.from('app_users').select('*').order('username');
        if(error || !data){ usersTableReady=false; appUsers=DEFAULT_ACCOUNTS.slice(); return; }
        usersTableReady=true;
        appUsers = data.length ? data : DEFAULT_ACCOUNTS.slice();
    }catch{ usersTableReady=false; appUsers=DEFAULT_ACCOUNTS.slice(); }
}

function getSession(){ try{ return JSON.parse(localStorage.getItem('toolflow_user')); }catch{ return null; } }
function setSession(u){ localStorage.setItem('toolflow_user', JSON.stringify(u)); }
function clearSession(){ localStorage.removeItem('toolflow_user'); }

function applyRoleUI(){
    const admin = isAdmin();
    document.body.classList.toggle('role-user', !admin);
    document.body.classList.toggle('role-admin', admin);
    const badge = document.getElementById('user-badge');
    if(badge && currentUser) badge.textContent = `${currentUser.name} (${admin?'แอดมิน':'ดูอย่างเดียว'})`;
    // ถ้า user อยู่หน้าจัดการ ให้เด้งกลับหน้าคลัง
    if(!admin && currentView==='management') switchView('inventory');
}

function showLogin(){ document.getElementById('login-overlay').style.display='flex'; }
function hideLogin(){ document.getElementById('login-overlay').style.display='none'; }

window.logout = ()=>{ clearSession(); currentUser=null; location.reload(); };

document.getElementById('login-form').addEventListener('submit', e=>{
    e.preventDefault();
    const u=document.getElementById('login-username').value.trim();
    const p=document.getElementById('login-password').value;
    const acc=appUsers.find(a=>a.username===u && a.password===p);
    const err=document.getElementById('login-error');
    if(!acc){ err.textContent='❌ ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'; return; }
    err.textContent='';
    currentUser={ username:acc.username, role:acc.role, name:acc.name };
    setSession(currentUser);
    startApp();
});

async function startApp(){
    hideLogin();
    applyRoleUI();
    await refreshData();
}

document.addEventListener('DOMContentLoaded', async()=>{
    await fetchUsers();
    const s=getSession();
    if(s && appUsers.some(a=>a.username===s.username && a.role===s.role)){
        currentUser=s;
        await startApp();
    } else {
        clearSession();
        showLogin();
    }
});

async function refreshData() {
    await Promise.all([fetchCategories(), fetchSites(), fetchTools(), fetchLogs(), fetchUsers()]);
    updateStats(); render();
    if(window.lucide) lucide.createIcons();
}
async function fetchCategories(){ const{data}=await _supabase.from('categories').select('*').order('name'); categories=data||[]; }
async function fetchSites(){ const{data}=await _supabase.from('sites').select('*').order('name'); sites=data||[]; }
async function fetchTools(){ const{data}=await _supabase.from('tools').select('*, categories(name)').order('tool_code',{ascending:true}); tools=(data||[]).sort((a,b)=>(a.tool_code||'').localeCompare(b.tool_code||'','th',{numeric:true})); }
async function fetchLogs(){
    const{data}=await _supabase.from('transactions').select('*, tools(name,department), sites(name)').order('timestamp',{ascending:false}).limit(500);
    allLogs=data?data.map(l=>({...l, tool_name:l.tools?l.tools.name:'?', department:l.tools?l.tools.department:'-', site_name:l.sites?l.sites.name:'-'})):[];
}

// คำนวณว่าเครื่องมือแต่ละตัวอยู่ไซไหนบ้าง
function getToolLocations(toolId) {
    const map={};
    allLogs.filter(l=>l.tool_id==toolId).forEach(l=>{
        const k=l.site_id||'none', n=l.site_name||'ไม่ระบุ';
        if(!map[k]) map[k]={name:n, qty:0, users:new Set()};
        if(l.type==='BORROW'){ map[k].qty+=l.quantity; map[k].users.add(l.user_name); }
        else{ map[k].qty-=l.quantity; }
    });
    return Object.values(map).filter(s=>s.qty>0).map(s=>({name:s.name,qty:s.qty,users:[...s.users]}));
}

function updateStats() {
    const ft=tools.filter(t=>t.department===currentDept);
    const total=ft.reduce((a,c)=>a+(c.total_stock||0),0);
    const avail=ft.reduce((a,c)=>a+(c.available_stock||0),0);
    document.getElementById('stat-total').textContent=total;
    document.getElementById('stat-available').textContent=avail;
    document.getElementById('stat-borrowed').textContent=total-avail;
}

function render() {
    if(currentView==='inventory') renderInventory();
    else if(currentView==='sites') renderSites();
    else renderMgmt();
    if(window.lucide) lucide.createIcons();
}

// ===== VIEW SWITCHING =====
const viewNavMap = {inventory:'nav-inventory', sites:'nav-sites', management:'nav-mgmt'};
window.switchView = v => {
    if(v==='management' && !isAdmin()) v='inventory';
    currentView=v;
    ['inventory','sites','management'].forEach(id=>{
        document.getElementById('view-'+id).style.display=id===v?'block':'none';
        document.getElementById(viewNavMap[id]).classList.toggle('active',id===v);
    });
    render();
};
window.switchDept = d => {
    currentDept=d;
    document.querySelectorAll('.dept-tab').forEach(t=>t.classList.remove('active'));
    document.getElementById('tab-'+d).classList.add('active');
    refreshData();
};
window.toggleEl = (id,chId) => {
    const el=document.getElementById(id), ch=document.getElementById(chId), h=getComputedStyle(el).display==='none';
    el.style.display=h?'block':'none'; if(ch) ch.style.transform=h?'rotate(180deg)':'rotate(0)';
};

// ===== ค้นหาเครื่องมือ =====
// ทำให้ข้อความเทียบกันได้แบบไม่สนตัวพิมพ์เล็ก/ใหญ่ และรวมรูปสระ/วรรณยุกต์ไทยให้เป็นมาตรฐานเดียว (NFC)
function normText(s){ return (s==null?'':String(s)).normalize('NFC').toLowerCase().trim(); }
function toolMatchesSearch(tool, term){
    if(!term) return true;
    return normText(tool.tool_code).includes(term) || normText(tool.name).includes(term);
}
let searchTimer=null;
window.onToolSearch=v=>{
    document.getElementById('search-clear').style.display = v ? 'inline-flex' : 'none';
    // debounce: รอให้พิมพ์เสร็จก่อนค่อย render กันการ render ถี่จนค้าง (รวมถึงตอนพิมพ์สระ/วรรณยุกต์ไทย)
    clearTimeout(searchTimer);
    searchTimer=setTimeout(()=>{
        searchTerm=normText(v);
        renderInventory();
        if(window.lucide) lucide.createIcons();
    },200);
};
window.clearToolSearch=()=>{
    const inp=document.getElementById('tool-search');
    inp.value=''; searchTerm=''; document.getElementById('search-clear').style.display='none';
    renderInventory(); if(window.lucide) lucide.createIcons(); inp.focus();
};

// ===== RENDER: INVENTORY =====
function renderInventory() {
    const c=document.getElementById('inventory-content'); c.innerHTML='';
    const cats=categories.filter(x=>x.department===currentDept);
    if(!cats.length){ c.innerHTML='<div class="glass-panel" style="padding:2rem;text-align:center;color:var(--muted);">ไม่พบกลุ่มเครื่องมือ</div>'; return; }
    let shown=0;
    cats.forEach(cat=>{
        const ct=tools.filter(t=>t.category_id==cat.id && toolMatchesSearch(t,searchTerm)); if(!ct.length) return;
        shown+=ct.length;
        // ขณะค้นหา ให้เปิดกลุ่มที่มีผลลัพธ์ค้างไว้เลย จะได้เห็นทันทีไม่ต้องกดขยาย
        const openStyle = searchTerm ? 'style="display:block;"' : '', chevRot = searchTerm ? 'transform:rotate(180deg);' : '';
        const d=document.createElement('div');
        d.innerHTML=`<div class="glass-panel accordion-header" style="border-left:4px solid var(--primary);margin-bottom:4px;" onclick="toggleEl('ig-${cat.id}','ic-${cat.id}')"><span style="font-weight:700;">${cat.name} (${ct.length})</span><i data-lucide="chevron-down" id="ic-${cat.id}" style="width:16px;transition:0.3s;${chevRot}"></i></div><div id="ig-${cat.id}" class="accordion-body" ${openStyle}><div class="tools-grid" id="tg-${cat.id}"></div></div>`;
        c.appendChild(d);
        const grid=document.getElementById('tg-'+cat.id);
        ct.forEach(tool=>{
            const oos=tool.available_stock<=0, locs=getToolLocations(tool.id);
            let locHtml='';
            if(locs.length) locHtml='<div class="card-badges">'+locs.map(l=>`<span class="badge badge-site">📍 ${l.name} (${l.qty})</span><span class="badge badge-user">👤 ${l.users.join(', ')}</span>`).join('')+'</div>';
            const card=document.createElement('div'); card.className='glass-panel tool-card';
            card.innerHTML=`<div class="card-btns"><button class="card-btn" onclick="event.stopPropagation();openLocationModal(${tool.id})" title="ดูสถานที่">📍</button><button class="card-btn" onclick="event.stopPropagation();openHistoryModal(${tool.id})" title="ดูประวัติ">🕐</button></div><img src="${tool.image_url||'https://images.unsplash.com/photo-1530124560676-587cabee147a?q=80&w=400'}" class="tool-image"><div class="tool-info"><div style="font-size:0.7rem;color:var(--primary);font-weight:800;">${tool.tool_code||'NO-CODE'}</div><div class="tool-name">${tool.name}</div><div class="tool-meta"><span class="badge-stock ${oos?'badge-out':'badge-ok'}">${oos?'เบิกหมด':'คงเหลือ '+tool.available_stock}</span><span style="color:var(--muted)">/ ${tool.total_stock}</span></div>${locHtml}</div><div class="tool-actions"><button class="btn-primary" onclick="openActionModal(${tool.id},'BORROW')" ${oos?'disabled':''}>เบิก</button><button class="btn-outline" onclick="openActionModal(${tool.id},'RETURN')">คืน</button></div>`;
            grid.appendChild(card);
        });
    });
    if(!shown){
        c.innerHTML=`<div class="glass-panel" style="padding:2rem;text-align:center;color:var(--muted);">${searchTerm?`ไม่พบเครื่องมือที่ตรงกับ "${document.getElementById('tool-search').value}"`:'ยังไม่มีเครื่องมือในแผนกนี้'}</div>`;
    }
}

// ===== RENDER: SITES =====
function renderSites() {
    const c=document.getElementById('sites-content'); c.innerHTML='';
    if(!sites.length){ c.innerHTML='<div class="glass-panel" style="padding:2rem;text-align:center;color:var(--muted);">ยังไม่มีไซงาน กรุณาเพิ่มในหน้าจัดการ</div>'; return; }
    const ft=tools.filter(t=>t.department===currentDept);
    sites.forEach(site=>{
        const atSite=[];
        ft.forEach(tool=>{ const l=getToolLocations(tool.id).find(x=>x.name===site.name); if(l) atSite.push({tool,qty:l.qty,users:l.users}); });
        const total=atSite.reduce((a,t)=>a+t.qty,0);
        const hasTools=total>0;
        const rows=atSite.length?atSite.map(t=>`<tr><td style="font-family:monospace;font-weight:700;">${t.tool.tool_code||'-'}</td><td style="font-weight:600;">${t.tool.name}</td><td>${t.qty}</td><td style="color:var(--muted);">${t.users.join(', ')}</td></tr>`).join(''):'<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1.5rem;">✅ ไม่มีเครื่องมือที่ไซนี้</td></tr>';
        const d=document.createElement('div'); d.className='site-card';
        d.innerHTML=`<div class="glass-panel accordion-header site-header ${hasTools?'':'empty'}" onclick="toggleEl('sd-${site.id}','sc-${site.id}')"><span style="font-weight:700;">📍 ${site.name} <span style="font-size:0.85rem;color:${hasTools?'var(--warning)':'var(--success)'}">(${hasTools?total+' ชิ้น':'ว่าง'})</span></span><i data-lucide="chevron-down" id="sc-${site.id}" style="width:16px;transition:0.3s;"></i></div><div id="sd-${site.id}" class="accordion-body"><div class="glass-panel table-wrap"><table><thead><tr><th>รหัส</th><th>ชื่อ</th><th>จำนวน</th><th>ผู้เบิก</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
        c.appendChild(d);
    });
}

// ===== RENDER: MANAGEMENT =====
function renderMgmt() {
    // Sites
    const sb=document.getElementById('mgmt-sites-body'); sb.innerHTML='';
    sites.forEach(s=>{ sb.innerHTML+=`<tr><td><b>${s.name}</b></td><td style="text-align:right;"><button class="btn-outline btn-sm" onclick="openSiteModal(${s.id})">✏️</button> <button class="btn-outline btn-sm btn-danger" onclick="deleteSite(${s.id})">🗑️</button></td></tr>`; });
    // Categories
    const cb=document.getElementById('mgmt-cats-body'); cb.innerHTML='';
    categories.forEach(c=>{ cb.innerHTML+=`<tr><td><b>${c.name}</b></td><td><span class="badge-stock badge-ok">${c.department}</span></td><td style="text-align:right;"><button class="btn-outline btn-sm" onclick="openCategoryModal(${c.id})">✏️</button> <button class="btn-outline btn-sm btn-danger" onclick="deleteCategory(${c.id})">🗑️</button></td></tr>`; });
    // Tools
    const tb=document.getElementById('mgmt-tools-body'); tb.innerHTML='';
    tools.forEach(t=>{
        const locs=getToolLocations(t.id);
        const locStr=locs.length?locs.map(l=>`${l.name}(${l.qty})`).join(', '):'ในคลัง';
        tb.innerHTML+=`<tr><td><img src="${t.image_url||''}" style="width:28px;height:28px;border-radius:4px;"></td><td style="font-family:monospace;font-weight:700;">${t.tool_code||'-'}</td><td style="font-weight:600;">${t.name}</td><td><span class="badge-stock badge-ok" style="font-size:0.7rem;">${t.department}</span></td><td>${t.total_stock}</td><td>${t.available_stock}</td><td style="font-size:0.7rem;max-width:150px;color:var(--muted);">${locStr}</td><td style="text-align:right;white-space:nowrap;"><button class="btn-outline btn-sm" onclick="openLocationModal(${t.id})">📍</button> <button class="btn-outline btn-sm" onclick="openToolModal(${t.id})">✏️</button> <button class="btn-outline btn-sm btn-danger" onclick="deleteTool(${t.id})">🗑️</button></td></tr>`;
    });
    // Users
    const ub=document.getElementById('mgmt-users-body'); if(ub){ ub.innerHTML='';
        if(!usersTableReady){
            ub.innerHTML=`<tr><td colspan="4" style="color:var(--warning);padding:1rem;font-size:0.85rem;">⚠️ ยังไม่ได้สร้างตาราง <b>app_users</b> ในฐานข้อมูล จึงยังเพิ่ม/ลบผู้ใช้ถาวรไม่ได้ (ตอนนี้ใช้บัญชีเริ่มต้น admin/user) — รัน SQL ในไฟล์ <b>add-users-table.sql</b> ที่ Supabase ก่อน</td></tr>`;
        } else if(!appUsers.length){
            ub.innerHTML=`<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1rem;">ยังไม่มีผู้ใช้</td></tr>`;
        } else appUsers.forEach(u=>{
            const isMe=currentUser&&u.username===currentUser.username;
            ub.innerHTML+=`<tr><td style="font-family:monospace;font-weight:700;">${u.username}${isMe?' <span style="color:var(--muted);font-weight:400;">(คุณ)</span>':''}</td><td>${u.name||'-'}</td><td><span class="badge-stock ${u.role==='admin'?'badge-out':'badge-ok'}" style="font-size:0.7rem;">${u.role==='admin'?'แอดมิน':'ดูอย่างเดียว'}</span></td><td style="text-align:right;white-space:nowrap;"><button class="btn-outline btn-sm" onclick="openUserModal(${u.id})">✏️</button> <button class="btn-outline btn-sm btn-danger" onclick="deleteUser(${u.id})">🗑️</button></td></tr>`;
        });
    }
}

// ===== MODALS =====
// Site
window.openSiteModal=(id=null)=>{ if(!isAdmin())return; document.getElementById('site-form').reset(); document.getElementById('edit-site-id').value=id||''; if(id) document.getElementById('site-name').value=sites.find(s=>s.id==id).name; document.getElementById('site-modal').style.display='flex'; };
window.closeSiteModal=()=>document.getElementById('site-modal').style.display='none';
document.getElementById('site-form').addEventListener('submit',async e=>{ e.preventDefault(); if(!isAdmin())return; const id=document.getElementById('edit-site-id').value, n=document.getElementById('site-name').value; if(id) await _supabase.from('sites').update({name:n}).eq('id',id); else await _supabase.from('sites').insert([{name:n}]); await refreshData(); closeSiteModal(); });
window.deleteSite=async id=>{ if(!isAdmin())return; if(confirm('ลบไซงานนี้?')){ await _supabase.from('sites').delete().eq('id',id); await refreshData(); }};

// Category
window.openCategoryModal=(id=null)=>{ if(!isAdmin())return; document.getElementById('category-form').reset(); document.getElementById('edit-cat-id').value=id||''; if(id){ const c=categories.find(x=>x.id==id); document.getElementById('cat-name').value=c.name; document.getElementById('cat-dept').value=c.department; document.getElementById('cat-image-url').value=c.image_url; } document.getElementById('category-modal').style.display='flex'; };
window.closeCategoryModal=()=>document.getElementById('category-modal').style.display='none';
document.getElementById('category-form').addEventListener('submit',async e=>{
    e.preventDefault(); if(!isAdmin())return; const id=document.getElementById('edit-cat-id').value; const file=document.getElementById('cat-image-file').files[0]; let url=document.getElementById('cat-image-url').value;
    if(file){ const p=`${Date.now()}.${file.name.split('.').pop()}`; const{error}=await _supabase.storage.from('category-images').upload(p,file); if(error){alert('อัปโหลดไม่ได้');return;} url=_supabase.storage.from('category-images').getPublicUrl(p).data.publicUrl; }
    const d={name:document.getElementById('cat-name').value,department:document.getElementById('cat-dept').value,image_url:url};
    if(id) await _supabase.from('categories').update(d).eq('id',id); else await _supabase.from('categories').insert([d]); await refreshData(); closeCategoryModal();
});
window.deleteCategory=async id=>{ if(!isAdmin())return; if(confirm('ลบกลุ่ม?')){ await _supabase.from('categories').delete().eq('id',id); await refreshData(); }};

// Tool
window.openToolModal=(id=null)=>{ if(!isAdmin())return; document.getElementById('tool-form').reset(); document.getElementById('edit-tool-id').value=id||''; if(id){ const t=tools.find(x=>x.id==id); document.getElementById('tool-code').value=t.tool_code||''; document.getElementById('tool-name').value=t.name; document.getElementById('tool-dept').value=t.department; document.getElementById('tool-total').value=t.total_stock; document.getElementById('tool-available').value=t.available_stock; document.getElementById('tool-image-url').value=t.image_url; } updateToolCatList(); document.getElementById('tool-modal').style.display='flex'; };
window.updateToolCatList=()=>{ const d=document.getElementById('tool-dept').value, s=document.getElementById('tool-category-id'); s.innerHTML='<option value="">-- เลือก --</option>'; categories.filter(c=>c.department===d).forEach(c=>s.innerHTML+=`<option value="${c.id}">${c.name}</option>`); const id=document.getElementById('edit-tool-id').value; if(id){ const t=tools.find(x=>x.id==id); if(t&&t.department===d) s.value=t.category_id||''; }};
window.closeToolModal=()=>document.getElementById('tool-modal').style.display='none';
document.getElementById('tool-form').addEventListener('submit',async e=>{
    e.preventDefault(); if(!isAdmin())return; const id=document.getElementById('edit-tool-id').value, tc=document.getElementById('tool-code').value.trim();
    if(tools.some(t=>t.tool_code===tc&&t.id!=id)){alert('❌ รหัสซ้ำ');return;}
    const file=document.getElementById('tool-image-file').files[0]; let url=document.getElementById('tool-image-url').value;
    if(file){ const p=`${Date.now()}.${file.name.split('.').pop()}`; const{error}=await _supabase.storage.from('tool-images').upload(p,file); if(error){alert('อัปโหลดไม่ได้');return;} url=_supabase.storage.from('tool-images').getPublicUrl(p).data.publicUrl; }
    const d={tool_code:tc,name:document.getElementById('tool-name').value,department:document.getElementById('tool-dept').value,category_id:document.getElementById('tool-category-id').value||null,image_url:url,total_stock:parseInt(document.getElementById('tool-total').value),available_stock:parseInt(document.getElementById('tool-available').value)};
    if(id) await _supabase.from('tools').update(d).eq('id',id); else await _supabase.from('tools').insert([d]); await refreshData(); closeToolModal();
});
window.deleteTool=async id=>{ if(!isAdmin())return; if(confirm('ลบเครื่องมือ?')){ await _supabase.from('tools').delete().eq('id',id); await refreshData(); }};

// User (จัดการผู้ใช้)
window.openUserModal=(id=null)=>{
    if(!isAdmin())return;
    if(!usersTableReady){ alert('⚠️ ยังเพิ่ม/แก้ผู้ใช้ไม่ได้ ต้องสร้างตาราง app_users ใน Supabase ก่อน (ดู add-users-table.sql)'); return; }
    document.getElementById('user-form').reset();
    document.getElementById('edit-user-id').value=id||'';
    const hint=document.getElementById('user-pass-hint'), passField=document.getElementById('user-password');
    if(id){ const u=appUsers.find(x=>x.id==id); document.getElementById('user-username').value=u.username; document.getElementById('user-displayname').value=u.name||''; document.getElementById('user-role').value=u.role; hint.textContent='(เว้นว่าง = ใช้รหัสเดิม)'; passField.required=false; }
    else { hint.textContent=''; passField.required=true; }
    document.getElementById('user-modal').style.display='flex';
};
window.closeUserModal=()=>document.getElementById('user-modal').style.display='none';
document.getElementById('user-form').addEventListener('submit',async e=>{
    e.preventDefault(); if(!isAdmin()||!usersTableReady)return;
    const id=document.getElementById('edit-user-id').value;
    const username=document.getElementById('user-username').value.trim();
    const name=document.getElementById('user-displayname').value.trim();
    const password=document.getElementById('user-password').value;
    const role=document.getElementById('user-role').value;
    if(appUsers.some(u=>u.username===username && u.id!=id)){ alert('❌ ชื่อผู้ใช้นี้มีอยู่แล้ว'); return; }
    // กันไม่ให้เผลอถอดสิทธิ์แอดมินคนสุดท้าย
    if(id){ const u=appUsers.find(x=>x.id==id); if(u.role==='admin' && role!=='admin' && appUsers.filter(a=>a.role==='admin').length<=1){ alert('❌ ต้องมีแอดมินอย่างน้อย 1 คน'); return; } }
    const d={ username, name, role };
    if(password) d.password=password;
    if(id) await _supabase.from('app_users').update(d).eq('id',id);
    else await _supabase.from('app_users').insert([d]);
    await fetchUsers(); renderMgmt(); closeUserModal();
});
window.deleteUser=async id=>{
    if(!isAdmin()||!usersTableReady)return;
    const u=appUsers.find(x=>x.id==id); if(!u)return;
    if(currentUser && u.username===currentUser.username){ alert('❌ ลบบัญชีที่กำลังใช้งานอยู่ไม่ได้'); return; }
    if(u.role==='admin' && appUsers.filter(a=>a.role==='admin').length<=1){ alert('❌ ต้องมีแอดมินอย่างน้อย 1 คน'); return; }
    if(confirm(`ลบผู้ใช้ "${u.username}"?`)){ await _supabase.from('app_users').delete().eq('id',id); await fetchUsers(); renderMgmt(); }
};

// Action (เบิก/คืน)
window.openActionModal=(id,type)=>{
    if(!isAdmin())return;
    const t=tools.find(x=>x.id==id);
    document.getElementById('action-form').reset();
    document.getElementById('action-tool-id').value=id; document.getElementById('action-type').value=type;
    document.getElementById('modal-tool-name').value=t.name;
    document.getElementById('action-modal-title').textContent=type==='BORROW'?'เบิกเครื่องมือ':'คืนเครื่องมือ (เข้าส่วนกลาง)';
    document.getElementById('label-user-name').textContent=type==='BORROW'?'ชื่อผู้เบิก':'ชื่อผู้คืน';
    document.getElementById('label-receiver-name').textContent=type==='BORROW'?'ชื่อผู้ให้เบิก':'ชื่อผู้รับคืน';
    const sg=document.getElementById('site-selection-group'), ss=document.getElementById('action-site-id');
    if(type==='BORROW'){ sg.style.display='block'; ss.innerHTML='<option value="">-- เลือกไซงาน --</option>'; sites.forEach(s=>ss.innerHTML+=`<option value="${s.id}">${s.name}</option>`); }
    else { sg.style.display='none'; ss.value=''; }
    // จำกัดจำนวนสูงสุดที่เบิกได้ = ของที่เหลือจริง (กันการพิมพ์เกิน)
    const qtyInput=document.getElementById('quantity');
    if(type==='BORROW'){ qtyInput.max=t.available_stock; } else { qtyInput.removeAttribute('max'); }
    document.getElementById('action-modal').style.display='flex';
};
window.closeActionModal=()=>document.getElementById('action-modal').style.display='none';
let actionSubmitting=false; // กันการกดยืนยันซ้ำ (double-submit)
document.getElementById('action-form').addEventListener('submit',async e=>{
    e.preventDefault(); if(!isAdmin())return;
    if(actionSubmitting) return; // กำลังทำรายการอยู่ ห้ามกดซ้ำ
    const id=document.getElementById('action-tool-id').value, type=document.getElementById('action-type').value;
    const siteId=document.getElementById('action-site-id').value||null, un=document.getElementById('user-name').value;
    const t=tools.find(x=>x.id==id), qty=parseInt(document.getElementById('quantity').value);
    if(!Number.isInteger(qty)||qty<1) return alert('จำนวนไม่ถูกต้อง');
    const submitBtn=e.submitter||document.querySelector('#action-form button[type="submit"]');
    actionSubmitting=true; if(submitBtn) submitBtn.disabled=true;
    try{
        // อ่านค่าคงเหลือล่าสุดจากฐานข้อมูล (กันค่าใน cache ไม่ตรงกับของจริง)
        const{data:fresh,error:fErr}=await _supabase.from('tools').select('available_stock,total_stock').eq('id',id).single();
        if(fErr||!fresh){ alert('ดึงข้อมูลล่าสุดไม่ได้ ลองใหม่อีกครั้ง'); return; }
        const cur=fresh.available_stock, ns=type==='BORROW'?cur-qty:cur+qty;
        if(ns<0||ns>fresh.total_stock){ alert(type==='BORROW'?`เบิกได้ไม่เกิน ${cur} ชิ้น (ของเหลือจริง)`:'จำนวนคืนเกินกว่าที่เบิกออก'); return; }
        // อัปเดตแบบมีเงื่อนไข: เขียนได้ก็ต่อเมื่อค่าคงเหลือยังเท่ากับที่เราเพิ่งอ่าน (optimistic lock)
        const{data:updated,error:uErr}=await _supabase.from('tools')
            .update({available_stock:ns}).eq('id',id).eq('available_stock',cur).select();
        if(uErr||!updated||!updated.length){ alert('มีคนทำรายการนี้ไปก่อนแล้ว กรุณาลองใหม่'); await refreshData(); return; }
        await _supabase.from('transactions').insert([{tool_id:id,site_id:type==='BORROW'?siteId:null,user_name:un,receiver_name:document.getElementById('receiver-name').value,type,quantity:qty}]);
        await refreshData(); closeActionModal();
    } finally {
        actionSubmitting=false; if(submitBtn) submitBtn.disabled=false;
    }
});

// History
window.openHistoryModal=id=>{
    const t=tools.find(x=>x.id==id);
    document.getElementById('history-modal-title').textContent='ประวัติ: '+t.name;
    const list=document.getElementById('tool-history-list'); list.innerHTML='';
    const logs=allLogs.filter(l=>l.tool_id==id);
    if(!logs.length){ list.innerHTML='<div style="text-align:center;color:var(--muted);padding:2rem;">ไม่มีประวัติ</div>'; }
    else logs.forEach(l=>{ list.innerHTML+=`<div class="glass-panel" style="padding:0.75rem;font-size:0.8rem;margin-bottom:0.5rem;"><div style="display:flex;justify-content:space-between;"><b class="${l.type==='BORROW'?'type-borrow':'type-return'}">${l.type==='BORROW'?'เบิก':'คืน'} ${l.quantity}</b><small style="color:var(--muted)">${new Date(l.timestamp).toLocaleString()}</small></div><div>${l.user_name} / ${l.receiver_name||'-'}</div>${l.site_name!=='-'?`<div style="color:var(--primary);font-size:0.7rem;font-weight:700;">📍 ${l.site_name}</div>`:''}</div>`; });
    document.getElementById('history-modal').style.display='flex';
};
window.closeHistoryModal=()=>document.getElementById('history-modal').style.display='none';

// Location Summary
window.openLocationModal=id=>{
    const t=tools.find(x=>x.id==id), locs=getToolLocations(id);
    document.getElementById('location-modal-title').textContent='📍 '+t.name+' อยู่ที่ไหน?';
    const list=document.getElementById('tool-location-list'); list.innerHTML='';
    if(!locs.length) list.innerHTML='<div class="glass-panel" style="padding:1.5rem;text-align:center;color:var(--muted);">✅ เครื่องมือทั้งหมดอยู่ในคลัง</div>';
    else {
        list.innerHTML=`<div class="glass-panel" style="padding:0.75rem;margin-bottom:0.5rem;font-size:0.85rem;"><b>เบิกออก:</b> ${locs.reduce((a,l)=>a+l.qty,0)} / ${t.total_stock} | <b>คงเหลือ:</b> ${t.available_stock}</div>`;
        locs.forEach(l=>{ list.innerHTML+=`<div class="glass-panel" style="padding:0.75rem;margin-bottom:0.5rem;"><div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-weight:700;color:#60a5fa;">📍 ${l.name}</span><span class="badge-stock badge-out" style="font-size:0.75rem;">${l.qty} ชิ้น</span></div><div style="margin-top:4px;font-size:0.8rem;color:var(--muted);">👤 ${l.users.join(', ')}</div></div>`; });
    }
    document.getElementById('location-modal').style.display='flex';
};
window.closeLocationModal=()=>document.getElementById('location-modal').style.display='none';
