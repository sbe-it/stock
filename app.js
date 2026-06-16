const SUPABASE_URL = 'https://yximjuyryktwkotlxiyr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4aW1qdXlyeWt0d2tvdGx4aXlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0OTI4MjMsImV4cCI6MjA5NDA2ODgyM30.cKwZVRLmOBYhX73KzrXkdVXAMGxFJ7jSX4bIApIB_7k';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let categories=[], tools=[], sites=[], allLogs=[], repairs=[], currentView='inventory', currentDept='ช่างไฟ', searchTerm='';

// ===== AUTH =====
// บัญชีเริ่มต้น (ใช้เป็น fallback กรณียังไม่ได้สร้างตาราง app_users ใน Supabase)
const DEFAULT_ACCOUNTS = [
    { username:'admin', password:'admin123', role:'admin', name:'ผู้ดูแลระบบ' },
    { username:'user',  password:'user123',  role:'user',  name:'ผู้ใช้งาน' }
];
let appUsers = [];        // รายชื่อผู้ใช้ที่ใช้ตรวจ login (จากฐานข้อมูลหรือ fallback)
let usersTableReady = false; // true เมื่อโหลดจากตาราง app_users สำเร็จ
let repairsTableReady = false; // true เมื่อโหลดจากตาราง repairs สำเร็จ (ต้องรัน add-repairs-system.sql ก่อน)
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
    // ถ้า user อยู่หน้าจัดการ/งานซ่อม ให้เด้งกลับหน้าคลัง
    if(!admin && (currentView==='management'||currentView==='repairs')) switchView('inventory');
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

let refreshing=false, refreshQueued=false;
async function refreshData() {
    // กันการเรียกซ้อน: ถ้ากำลังโหลดอยู่ ให้จดไว้แล้วโหลดต่อรอบเดียว (กันยิง query ถี่จนค้าง)
    if(refreshing){ refreshQueued=true; return; }
    refreshing=true;
    try{
        await Promise.all([fetchCategories(), fetchSites(), fetchTools(), fetchLogs(), fetchUsers(), fetchRepairs()]);
        buildToolLocations();
        updateStats(); render();
        if(window.lucide) lucide.createIcons();
        autoOptimizeImages(); // ย่อรูปเก่าเบื้องหลัง (ไม่รอ ไม่บล็อกหน้าจอ)
    }catch(err){
        console.error('โหลดข้อมูลไม่สำเร็จ:', err);
        const c=document.getElementById('inventory-content');
        if(c && !tools.length) c.innerHTML='<div class="glass-panel" style="padding:2rem;text-align:center;color:var(--warning);">⚠️ โหลดข้อมูลไม่สำเร็จ (เครือข่ายช้าหรือเซิร์ฟเวอร์ไม่ตอบ) <button class="btn-outline btn-sm" onclick="refreshData()">ลองใหม่</button></div>';
    }finally{
        refreshing=false;
        if(refreshQueued){ refreshQueued=false; refreshData(); }
    }
}
async function fetchCategories(){ const{data}=await _supabase.from('categories').select('*').order('name'); categories=data||[]; }
async function fetchSites(){ const{data}=await _supabase.from('sites').select('*').order('name'); sites=data||[]; }
async function fetchTools(){
    const{data}=await _supabase.from('tools').select('*, categories(name)').order('tool_code',{ascending:true});
    let list=data||[];
    // กันการ์ดซ้ำ: ถ้ามีหลายแถวรหัสเดียวกัน (ไม่สนพิมพ์เล็ก/ใหญ่/ช่องว่าง) แสดงแค่ใบเดียว
    const seen=new Map(), dups=[];
    list=list.filter(t=>{ const k=(t.tool_code||'').trim().toLowerCase(); if(!k) return true; if(seen.has(k)){ dups.push(t.tool_code); return false; } seen.set(k,t.id); return true; });
    if(dups.length) console.warn('พบรหัสเครื่องมือซ้ำในฐานข้อมูล (แสดงใบเดียว) — ควรลบตัวซ้ำออก:', dups);
    tools=list.sort((a,b)=>(a.tool_code||'').localeCompare(b.tool_code||'','th',{numeric:true}));
}
async function fetchLogs(){
    const{data}=await _supabase.from('transactions').select('*, tools(name,department), sites(name)').order('timestamp',{ascending:false}).limit(500);
    allLogs=data?data.map(l=>({...l, tool_name:l.tools?l.tools.name:'?', department:l.tools?l.tools.department:'-', site_name:l.sites?l.sites.name:'-'})):[];
}
async function fetchRepairs(){
    const{data,error}=await _supabase.from('repairs').select('*, tools(name,tool_code,department)').order('created_at',{ascending:false});
    if(error){ repairsTableReady=false; repairs=[]; return; }
    repairsTableReady=true;
    repairs=data?data.map(r=>({...r, tool_name:r.tools?r.tools.name:'?', tool_code:r.tools?r.tools.tool_code:'-', department:r.tools?r.tools.department:'-'})):[];
}

// คำนวณ "เครื่องมือแต่ละตัวอยู่ไซไหนบ้าง" ครั้งเดียวต่อการโหลดข้อมูล
// (เดิมคำนวณใหม่ทุกครั้งที่ render ทำให้ช้ามากเมื่อมีเครื่องมือ/ประวัติเยอะ)
let toolLocCache=null;
function buildToolLocations(){
    const m={};
    for(const l of allLogs){
        const tid=l.tool_id; let g=m[tid]; if(!g){ g=m[tid]={}; }
        const k=l.site_id||'none', n=l.site_name||'ไม่ระบุ';
        let s=g[k]; if(!s){ s=g[k]={name:n, qty:0, users:new Set()}; }
        if(l.type==='BORROW'){ s.qty+=l.quantity; s.users.add(l.user_name); }
        else{ s.qty-=l.quantity; }
    }
    toolLocCache=m;
}
function getToolLocations(toolId) {
    if(!toolLocCache) buildToolLocations();
    const g=toolLocCache[toolId]; if(!g) return [];
    return Object.values(g).filter(s=>s.qty>0).map(s=>({name:s.name,qty:s.qty,users:[...s.users]}));
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
    updateRepairsNavBadge();
    if(currentView==='inventory') renderInventory();
    else if(currentView==='sites') renderSites();
    else renderMgmt();
    if(window.lucide) lucide.createIcons();
}
function updateRepairsNavBadge(){
    const navBadge=document.getElementById('nav-repairs-count'); if(!navBadge) return;
    const pendingCount=repairs.filter(r=>r.status==='pending').length;
    if(pendingCount){ navBadge.textContent=pendingCount; navBadge.style.display='inline-block'; } else navBadge.style.display='none';
}

// ===== VIEW SWITCHING =====
const viewNavMap = {inventory:'nav-inventory', sites:'nav-sites', management:'nav-mgmt', repairs:'nav-repairs'};
window.switchView = v => {
    if((v==='management'||v==='repairs') && !isAdmin()) v='inventory';
    currentView=v;
    ['inventory','sites','management','repairs'].forEach(id=>{
        document.getElementById('view-'+id).style.display=id===v?'block':'none';
        document.getElementById(viewNavMap[id]).classList.toggle('active',id===v);
    });
    const deptTabs=document.querySelector('.dept-tabs');
    if(deptTabs) deptTabs.style.display=(v==='inventory'||v==='sites')?'flex':'none';
    render();
};
window.switchDept = d => {
    currentDept=d;
    document.querySelectorAll('.dept-tab').forEach(t=>t.classList.remove('active'));
    document.getElementById('tab-'+d).classList.add('active');
    // ข้อมูลทุกแผนกโหลดมาแล้ว แค่ render ใหม่ ไม่ต้องยิง query ซ้ำ (กันเซิร์ฟเวอร์โหลดหนักตอนหลายคนสลับแท็บ)
    updateStats(); render();
    if(window.lucide) lucide.createIcons();
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
// ===== ค้นหาในหน้าจัดการเครื่องมือ =====
let mgmtToolSearch='', mgmtSearchTimer=null;
window.onMgmtToolSearch=v=>{
    document.getElementById('mgmt-search-clear').style.display = v ? 'inline-flex' : 'none';
    clearTimeout(mgmtSearchTimer);
    mgmtSearchTimer=setTimeout(()=>{ mgmtToolSearch=normText(v); renderMgmt(); if(window.lucide) lucide.createIcons(); },200);
};
window.clearMgmtToolSearch=()=>{
    const inp=document.getElementById('mgmt-tool-search');
    inp.value=''; mgmtToolSearch=''; document.getElementById('mgmt-search-clear').style.display='none';
    renderMgmt(); if(window.lucide) lucide.createIcons(); inp.focus();
};

// ===== RENDER: INVENTORY =====
function renderInventory() {
    const c=document.getElementById('inventory-content'); c.innerHTML='';
    // ขณะค้นหา: ค้นข้ามทุกแผนก (ไม่กรองตามแท็บที่เปิดอยู่) จะได้ไม่พลาดของที่อยู่อีกแผนก
    const cats = searchTerm ? categories.slice() : categories.filter(x=>x.department===currentDept);
    if(!cats.length && !searchTerm){ c.innerHTML='<div class="glass-panel" style="padding:2rem;text-align:center;color:var(--muted);">ไม่พบกลุ่มเครื่องมือ</div>'; return; }
    let shown=0;
    cats.forEach(cat=>{
        const ct=tools.filter(t=>t.category_id==cat.id && toolMatchesSearch(t,searchTerm)); if(!ct.length) return;
        shown+=ct.length;
        // ขณะค้นหา ให้เปิดกลุ่มที่มีผลลัพธ์ค้างไว้เลย จะได้เห็นทันทีไม่ต้องกดขยาย
        const openStyle = searchTerm ? 'style="display:block;"' : '', chevRot = searchTerm ? 'transform:rotate(180deg);' : '';
        // ตอนค้นข้ามแผนก แสดงชื่อแผนกกำกับไว้ที่หัวกลุ่มด้วย
        const deptTag = searchTerm ? ` <span style="font-size:0.78rem;color:var(--muted);font-weight:500;">· ${cat.department}</span>` : '';
        const d=document.createElement('div');
        d.innerHTML=`<div class="glass-panel accordion-header" style="border-left:4px solid var(--primary);margin-bottom:4px;" onclick="toggleEl('ig-${cat.id}','ic-${cat.id}')"><span style="font-weight:700;">${cat.name} (${ct.length})${deptTag}</span><i data-lucide="chevron-down" id="ic-${cat.id}" style="width:16px;transition:0.3s;${chevRot}"></i></div><div id="ig-${cat.id}" class="accordion-body" ${openStyle}><div class="tools-grid" id="tg-${cat.id}"></div></div>`;
        c.appendChild(d);
        const grid=document.getElementById('tg-'+cat.id);
        ct.forEach(tool=>{
            const oos=tool.available_stock<=0, locs=getToolLocations(tool.id);
            const repairing=tool.status==='repairing', retired=tool.status==='retired';
            let locHtml='';
            if(locs.length) locHtml='<div class="card-badges">'+locs.map(l=>`<span class="badge badge-site"><i data-lucide="map-pin"></i> ${l.name} (${l.qty})</span><span class="badge badge-user"><i data-lucide="user"></i> ${l.users.join(', ')}</span>`).join('')+'</div>';
            const card=document.createElement('div'); card.className='glass-panel tool-card'+(repairing?' tool-card-repairing':'')+(retired?' tool-card-retired':'');
            const stockBadge=retired?`<span class="badge-stock badge-retired"><i data-lucide="ban"></i> ปลดระวาง</span>`:repairing?`<span class="badge-stock badge-repair"><i data-lucide="wrench"></i> กำลังซ่อม</span>`:`<span class="badge-stock ${oos?'badge-out':'badge-ok'}">${oos?'เบิกหมด':'คงเหลือ '+tool.available_stock}</span>`;
            const borrowBtn=retired?`<button class="btn-primary" disabled title="เครื่องมือถูกปลดระวาง">ปลดระวาง</button>`:repairing?`<button class="btn-primary" disabled title="กำลังซ่อมอยู่ เบิกไม่ได้">ซ่อมอยู่</button>`:`<button class="btn-primary" onclick="openActionModal(${tool.id},'BORROW')" ${oos?'disabled':''}>เบิก</button>`;
            card.innerHTML=`<div class="card-btns"><button class="card-btn" onclick="event.stopPropagation();openRepairModal(${tool.id})" title="แจ้งซ่อม"><i data-lucide="wrench"></i></button><button class="card-btn" onclick="event.stopPropagation();openLocationModal(${tool.id})" title="ดูสถานที่"><i data-lucide="map-pin"></i></button><button class="card-btn" onclick="event.stopPropagation();openHistoryModal(${tool.id})" title="ดูประวัติ"><i data-lucide="history"></i></button></div><img src="${tool.image_url||'https://images.unsplash.com/photo-1530124560676-587cabee147a?q=80&w=400'}" class="tool-image" loading="lazy" decoding="async"><div class="tool-info"><div style="font-size:0.7rem;color:var(--primary);font-weight:800;">${tool.tool_code||'NO-CODE'}</div><div class="tool-name">${tool.name}</div><div class="tool-meta">${stockBadge}<span style="color:var(--muted)">/ ${tool.total_stock}</span></div>${locHtml}</div><div class="tool-actions">${borrowBtn}<button class="btn-outline" onclick="openActionModal(${tool.id},'RETURN')">คืน</button></div>`;
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
    const sb=document.getElementById('mgmt-sites-body');
    sb.innerHTML=sites.map(s=>`<tr><td><b>${s.name}</b></td><td style="text-align:right;"><button class="btn-outline btn-sm" onclick="openSiteModal(${s.id})"><i data-lucide="pencil"></i></button> <button class="btn-outline btn-sm btn-danger" onclick="deleteSite(${s.id})"><i data-lucide="trash-2"></i></button></td></tr>`).join('');
    // Categories
    const cb=document.getElementById('mgmt-cats-body');
    cb.innerHTML=categories.map(c=>`<tr><td><b>${c.name}</b></td><td><span class="badge-stock badge-ok">${c.department}</span></td><td style="text-align:right;"><button class="btn-outline btn-sm" onclick="openCategoryModal(${c.id})"><i data-lucide="pencil"></i></button> <button class="btn-outline btn-sm btn-danger" onclick="deleteCategory(${c.id})"><i data-lucide="trash-2"></i></button></td></tr>`).join('');
    // Tools
    const tb=document.getElementById('mgmt-tools-body');
    const mtFiltered=tools.filter(t=>toolMatchesSearch(t,mgmtToolSearch));
    if(!mtFiltered.length){ tb.innerHTML=`<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:1rem;">${mgmtToolSearch?'ไม่พบเครื่องมือที่ตรงกับคำค้น':'ยังไม่มีเครื่องมือ'}</td></tr>`; }
    else tb.innerHTML=mtFiltered.map(t=>{
        const locs=getToolLocations(t.id);
        const locStr=locs.length?locs.map(l=>`${l.name}(${l.qty})`).join(', '):'ในคลัง';
        const repairing=t.status==='repairing', retired=t.status==='retired';
        const statusBadge=retired?'<span class="badge-stock badge-retired"><i data-lucide="ban"></i> ปลดระวาง</span>':repairing?'<span class="badge-stock badge-repair"><i data-lucide="wrench"></i> กำลังซ่อม</span>':'<span class="badge-stock badge-ok">ปกติ</span>';
        // ปุ่มสถานะ: ปลดระวางอยู่ -> กู้คืน, ซ่อมอยู่ -> ปลดสถานะ, ปกติ -> ตั้งเป็นกำลังซ่อม + ปลดระวาง
        const statusBtns=retired
            ? `<button class="btn-outline btn-sm" onclick="toggleToolStatus(${t.id})" title="กู้คืนจากปลดระวาง"><i data-lucide="rotate-ccw"></i></button>`
            : `<button class="btn-outline btn-sm" onclick="toggleToolStatus(${t.id})" title="${repairing?'ปลดสถานะซ่อม':'ตั้งเป็นกำลังซ่อม'}">${repairing?'<i data-lucide="check"></i>':'<i data-lucide="wrench"></i>'}</button> <button class="btn-outline btn-sm btn-danger" onclick="retireTool(${t.id})" title="ปลดระวาง"><i data-lucide="ban"></i></button>`;
        return `<tr><td><img src="${t.image_url||''}" loading="lazy" decoding="async" style="width:28px;height:28px;border-radius:4px;"></td><td style="font-family:monospace;font-weight:700;">${t.tool_code||'-'}</td><td style="font-weight:600;">${t.name}</td><td><span class="badge-stock badge-ok" style="font-size:0.7rem;">${t.department}</span></td><td>${t.total_stock}</td><td>${t.available_stock}</td><td>${statusBadge}</td><td style="font-size:0.7rem;max-width:150px;color:var(--muted);">${locStr}</td><td style="text-align:right;white-space:nowrap;">${statusBtns} <button class="btn-outline btn-sm" onclick="openLocationModal(${t.id})"><i data-lucide="map-pin"></i></button> <button class="btn-outline btn-sm" onclick="openToolModal(${t.id})"><i data-lucide="pencil"></i></button> <button class="btn-outline btn-sm btn-danger" onclick="deleteTool(${t.id})"><i data-lucide="trash-2"></i></button></td></tr>`;
    }).join('');
    // Users
    const ub=document.getElementById('mgmt-users-body'); if(ub){ ub.innerHTML='';
        if(!usersTableReady){
            ub.innerHTML=`<tr><td colspan="4" style="color:var(--warning);padding:1rem;font-size:0.85rem;"><i data-lucide="alert-triangle" style="vertical-align:-3px;"></i> ยังไม่ได้สร้างตาราง <b>app_users</b> ในฐานข้อมูล จึงยังเพิ่ม/ลบผู้ใช้ถาวรไม่ได้ (ตอนนี้ใช้บัญชีเริ่มต้น admin/user) — รัน SQL ในไฟล์ <b>add-users-table.sql</b> ที่ Supabase ก่อน</td></tr>`;
        } else if(!appUsers.length){
            ub.innerHTML=`<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1rem;">ยังไม่มีผู้ใช้</td></tr>`;
        } else ub.innerHTML=appUsers.map(u=>{
            const isMe=currentUser&&u.username===currentUser.username;
            return `<tr><td style="font-family:monospace;font-weight:700;">${u.username}${isMe?' <span style="color:var(--muted);font-weight:400;">(คุณ)</span>':''}</td><td>${u.name||'-'}</td><td><span class="badge-stock ${u.role==='admin'?'badge-out':'badge-ok'}" style="font-size:0.7rem;">${u.role==='admin'?'แอดมิน':'ดูอย่างเดียว'}</span></td><td style="text-align:right;white-space:nowrap;"><button class="btn-outline btn-sm" onclick="openUserModal(${u.id})"><i data-lucide="pencil"></i></button> <button class="btn-outline btn-sm btn-danger" onclick="deleteUser(${u.id})"><i data-lucide="trash-2"></i></button></td></tr>`;
        }).join('');
    }
    // Repairs
    const rb=document.getElementById('mgmt-repairs-body'); const pendingBadge=document.getElementById('repairs-pending-count');
    if(rb){ rb.innerHTML='';
        const pendingCount=repairs.filter(r=>r.status==='pending').length;
        if(pendingBadge){ if(pendingCount){ pendingBadge.textContent=`${pendingCount} รอดำเนินการ`; pendingBadge.style.display='inline-block'; } else pendingBadge.style.display='none'; }
        if(!repairsTableReady){
            rb.innerHTML=`<tr><td colspan="7" style="color:var(--warning);padding:1rem;font-size:0.85rem;"><i data-lucide="alert-triangle" style="vertical-align:-3px;"></i> ยังไม่ได้สร้างตาราง <b>repairs</b> ในฐานข้อมูล จึงยังใช้ระบบแจ้งซ่อมไม่ได้ — รัน SQL ในไฟล์ <b>add-repairs-system.sql</b> ที่ Supabase ก่อน (และสร้าง bucket "repair-images" แบบ Public)</td></tr>`;
        } else if(!repairs.length){
            rb.innerHTML=`<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:1rem;">ยังไม่มีใบแจ้งซ่อม</td></tr>`;
        } else rb.innerHTML=repairs.map(r=>{
            const statusMap={pending:['badge-out','รอดำเนินการ'],repairing:['badge-repair','<i data-lucide="wrench"></i> กำลังซ่อม'],done:['badge-ok','<i data-lucide="check"></i> ซ่อมเสร็จ'],rejected:['badge-out','ปฏิเสธ'],scrapped:['badge-retired','<i data-lucide="ban"></i> ซ่อมไม่ได้ (ปลดระวาง)']};
            const[badgeCls,badgeTxt]=statusMap[r.status]||['badge-ok',r.status];
            const filesHtml=renderAttachments(r);
            // สรุปงานซ่อม: หมายเหตุ + ค่าใช้จ่าย (ถ้ามี)
            let summary='';
            if(r.admin_note) summary+=`<div style="font-size:0.72rem;color:var(--muted);margin-top:3px;"><i data-lucide="clipboard-check" style="width:12px;vertical-align:-2px;"></i> ${r.admin_note}</div>`;
            if(r.cost!=null) summary+=`<div style="font-size:0.72rem;color:var(--warning);font-weight:700;margin-top:2px;">฿ ${Number(r.cost).toLocaleString()}</div>`;
            let actions='';
            const stop='event.stopPropagation();';
            if(r.status==='pending') actions=`<button class="btn-primary btn-sm" onclick="${stop}startRepair(${r.id})">เริ่มซ่อม</button> <button class="btn-outline btn-sm btn-danger" onclick="${stop}rejectRepair(${r.id})">ปฏิเสธ</button>`;
            else if(r.status==='repairing') actions=`<button class="btn-primary btn-sm" onclick="${stop}openCompleteRepairModal(${r.id})">ปิดงาน</button>`;
            else actions=`<button class="btn-outline btn-sm btn-danger" onclick="${stop}deleteRepair(${r.id})"><i data-lucide="trash-2"></i></button>`;
            return `<tr onclick="openRepairDetail(${r.id})" style="cursor:pointer;"><td style="font-weight:600;">${r.tool_name}<br><span style="font-family:monospace;font-size:0.7rem;color:var(--muted);">${r.tool_code}</span></td><td>${r.reported_by}</td><td style="max-width:220px;font-size:0.8rem;">${r.issue}${summary}</td><td>${filesHtml}</td><td><span class="badge-stock ${badgeCls}" style="font-size:0.7rem;">${badgeTxt}</span></td><td style="font-size:0.75rem;color:var(--muted);white-space:nowrap;">${new Date(r.created_at).toLocaleString()}</td><td style="text-align:right;white-space:nowrap;">${actions}</td></tr>`;
        }).join('');
    }
}

// ===== บีบอัด/ย่อรูปก่อนอัปโหลด (ลด Egress / Storage ให้อยู่ในโควต้าฟรี) =====
// ย่อให้ด้านยาวสุดไม่เกิน maxDim px แล้วบีบเป็น webp/jpeg คุณภาพ ~0.72
async function compressImage(file, maxDim=600, quality=0.72){
    try{
        if(!file || !file.type || !file.type.startsWith('image/')) return {blob:file, ext:(file.name.split('.').pop()||'jpg'), type:file.type};
        const dataUrl=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
        const img=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=dataUrl; });
        let w=img.naturalWidth, h=img.naturalHeight;
        if(w>maxDim || h>maxDim){ const s=Math.min(maxDim/w, maxDim/h); w=Math.round(w*s); h=Math.round(h*s); }
        const canvas=document.createElement('canvas'); canvas.width=w; canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        let type='image/webp';
        let blob=await new Promise(r=>canvas.toBlob(r,type,quality));
        if(!blob){ type='image/jpeg'; blob=await new Promise(r=>canvas.toBlob(r,type,quality)); }
        // ถ้าบีบแล้วไม่เล็กลง (รูปเล็กอยู่แล้ว) ใช้ไฟล์เดิม
        if(!blob || blob.size>=file.size) return {blob:file, ext:(file.name.split('.').pop()||'jpg'), type:file.type};
        return {blob, ext:(type==='image/webp'?'webp':'jpg'), type};
    }catch(err){ console.warn('ย่อรูปไม่สำเร็จ ใช้ไฟล์เดิม:', err); return {blob:file, ext:(file.name.split('.').pop()||'jpg'), type:file.type}; }
}

// ดึง "path ในถัง" ออกจาก public URL เพื่อใช้สั่งลบไฟล์
function storagePathFromUrl(url, bucket){
    if(!url || typeof url!=='string') return null;
    const marker=`/storage/v1/object/public/${bucket}/`;
    const i=url.indexOf(marker);
    if(i<0) return null;
    return decodeURIComponent(url.slice(i+marker.length).split('?')[0]);
}
// ลบไฟล์ใน Storage ตาม URL (ข้ามเงียบ ๆ ถ้าลบไม่ได้ จะได้ไม่บล็อกการลบ record)
async function deleteStorageFiles(bucket, urls){
    const paths=(urls||[]).map(u=>storagePathFromUrl(u,bucket)).filter(Boolean);
    if(!paths.length) return;
    try{ const{error}=await _supabase.storage.from(bucket).remove(paths); if(error) console.warn('ลบไฟล์ Storage ไม่สำเร็จ:',error.message); }
    catch(e){ console.warn('ลบไฟล์ Storage ผิดพลาด (ข้าม):',e); }
}
// อัปโหลดไฟล์แนบใบซ่อมหลายไฟล์ (รูป -> ย่อก่อน, PDF/อื่น ๆ -> อัปตรง)
// คืน array ของ {url,name,type,kind} หรือ null ถ้ามีไฟล์ใดอัปไม่สำเร็จ
async function uploadRepairFiles(files, kind){
    const out=[];
    for(const f of files){
        const isImg=f.type && f.type.startsWith('image/');
        let blob=f, ext=(f.name.split('.').pop()||'bin'), type=f.type;
        if(isImg){ const c=await compressImage(f); blob=c.blob; ext=c.ext; type=c.type; }
        const p=`${Date.now()}-${Math.random().toString(36).slice(2,7)}${isImg?'-opt':''}.${ext}`;
        const{error}=await _supabase.storage.from('repair-images').upload(p,blob,{cacheControl:'604800',contentType:type||undefined});
        if(error){ alert('อัปโหลดไฟล์ไม่สำเร็จ: '+error.message); return null; }
        out.push({url:_supabase.storage.from('repair-images').getPublicUrl(p).data.publicUrl, name:f.name, type:type||'', kind});
    }
    return out;
}
// แสดงไฟล์แนบขนาดใหญ่ในหน้ารายละเอียด (กรองตาม kind: 'report'/'doc')
function renderAttachmentsLarge(list){
    if(!list.length) return '<div style="color:var(--muted);font-size:0.85rem;">— ไม่มีไฟล์แนบ —</div>';
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;">'+list.map(a=>{
        const isImg=(a.type||'').startsWith('image/');
        return isImg
            ? `<a href="${a.url}" target="_blank" rel="noopener" title="${a.name||''}"><img src="${a.url}" loading="lazy" decoding="async" style="width:100px;height:100px;border-radius:8px;object-fit:cover;border:1px solid var(--border);"></a>`
            : `<a href="${a.url}" target="_blank" rel="noopener" class="btn-outline" style="display:inline-flex;align-items:center;gap:6px;padding:10px 14px;"><i data-lucide="file-text"></i> ${a.name||'เอกสาร'}</a>`;
    }).join('')+'</div>';
}
// เปิดหน้ารายละเอียดงานซ่อม (คลิกจากแถวในตาราง)
window.openRepairDetail=id=>{
    const r=repairs.find(x=>x.id==id); if(!r)return;
    const statusMap={pending:'รอดำเนินการ',repairing:'กำลังซ่อม',done:'ซ่อมเสร็จ',rejected:'ปฏิเสธ',scrapped:'ซ่อมไม่ได้ (ปลดระวาง)'};
    let all=Array.isArray(r.attachments)?r.attachments.slice():[];
    if(!all.length && r.image_url) all.push({url:r.image_url,name:'รูป',type:'image/',kind:'report'});
    const reportFiles=all.filter(a=>a.kind!=='doc'), docFiles=all.filter(a=>a.kind==='doc');
    const row=(label,val)=>val?`<div style="margin-bottom:0.75rem;"><div style="font-size:0.72rem;color:var(--muted);font-weight:600;margin-bottom:2px;">${label}</div><div>${val}</div></div>`:'';
    document.getElementById('repair-detail-body').innerHTML=
        row('เครื่องมือ', `<b>${r.tool_name}</b> <span style="font-family:monospace;color:var(--muted);">${r.tool_code||''}</span>`)
        + row('ผู้แจ้ง', r.reported_by)
        + row('วันที่แจ้ง', new Date(r.created_at).toLocaleString())
        + row('สถานะ', `<span class="badge-stock badge-ok">${statusMap[r.status]||r.status}</span>`)
        + row('อาการเสีย / รายละเอียด', `<div style="white-space:pre-wrap;">${r.issue||'-'}</div>`)
        + `<div style="margin-bottom:0.75rem;"><div style="font-size:0.72rem;color:var(--muted);font-weight:600;margin-bottom:4px;">เอกสาร / รูปก่อนซ่อม</div>${renderAttachmentsLarge(reportFiles)}</div>`
        + (r.admin_note?row('หมายเหตุการซ่อม', `<div style="white-space:pre-wrap;">${r.admin_note}</div>`):'')
        + (r.cost!=null?row('ค่าใช้จ่ายซ่อม', `<b style="color:var(--warning);">฿ ${Number(r.cost).toLocaleString()}</b>`):'')
        + (r.resolved_by?row('ผู้ปิดงาน', r.resolved_by):'')
        + ((docFiles.length||['done','scrapped'].includes(r.status))?`<div style="margin-bottom:0.5rem;"><div style="font-size:0.72rem;color:var(--muted);font-weight:600;margin-bottom:4px;">เอกสารปิดงาน / ใบเสร็จ</div>${renderAttachmentsLarge(docFiles)}</div>`:'');
    document.getElementById('repair-detail-modal').style.display='flex';
    if(window.lucide) lucide.createIcons();
};
window.closeRepairDetail=()=>document.getElementById('repair-detail-modal').style.display='none';
// แสดงไฟล์แนบในตาราง: รูป -> thumbnail, ไฟล์อื่น -> ลิงก์ไอคอน
function renderAttachments(r){
    const list=Array.isArray(r.attachments)?r.attachments.slice():[];
    if(!list.length && r.image_url) list.push({url:r.image_url,name:'รูป',type:'image/',kind:'report'}); // เผื่อใบเก่า
    if(!list.length) return '-';
    return '<div style="display:flex;gap:3px;flex-wrap:wrap;align-items:center;">'+list.map(a=>{
        const isImg=(a.type||'').startsWith('image/');
        const ring=(a.kind&&a.kind!=='report')?'outline:2px solid var(--primary);outline-offset:-2px;':'';
        return isImg
            ? `<a href="${a.url}" target="_blank" rel="noopener" title="${a.name||''}"><img src="${a.url}" loading="lazy" decoding="async" style="width:34px;height:34px;border-radius:4px;object-fit:cover;${ring}"></a>`
            : `<a href="${a.url}" target="_blank" rel="noopener" title="${a.name||'เอกสาร'}" class="btn-outline btn-sm" style="padding:4px 6px;display:inline-flex;align-items:center;gap:2px;"><i data-lucide="file-text" style="width:14px;"></i></a>`;
    }).join('')+'</div>';
}

// ===== ย่อรูปเก่าอัตโนมัติเบื้องหลัง (แอดมินไม่ต้องทำอะไร) =====
// ทำงานเงียบ ๆ ตอนแอดมินเปิดแอป: ดึงรูปเก่าที่ยังไม่ถูกย่อ มาย่อแล้วอัปทับ
// - ทำเครื่องหมายไฟล์ที่ย่อแล้วด้วย "-opt." จะได้ไม่ทำซ้ำ
// - เก็บไฟล์เดิมไว้ (ไม่ลบ) เผื่อย้อนกลับ
let autoOptRunning=false;
async function autoOptimizeImages(){
    if(autoOptRunning || !isAdmin()) return;
    autoOptRunning=true;
    let changed=0;
    try{
        const isOld=u=>u && u.includes('/storage/v1/object/public/') && !u.includes('-opt.');
        const jobs=[
            ...tools.filter(t=>isOld(t.image_url)).map(t=>({table:'tools',bucket:'tool-images',row:t})),
            ...categories.filter(c=>isOld(c.image_url)).map(c=>({table:'categories',bucket:'category-images',row:c})),
        ];
        for(const j of jobs){
            try{
                const resp=await fetch(j.row.image_url); if(!resp.ok) continue;
                const blob=await resp.blob(); if(!blob.type || !blob.type.startsWith('image/')) continue;
                const file=new File([blob],'old',{type:blob.type});
                const {blob:cblob,ext,type}=await compressImage(file);
                const p=`${Date.now()}-${Math.random().toString(36).slice(2,7)}-opt.${ext}`;
                const{error}=await _supabase.storage.from(j.bucket).upload(p,cblob,{cacheControl:'604800',contentType:type||undefined});
                if(error){ console.warn('อัปรูปย่อไม่ได้ ข้ามไป:',error.message); continue; }
                const newUrl=_supabase.storage.from(j.bucket).getPublicUrl(p).data.publicUrl;
                const{error:uErr}=await _supabase.from(j.table).update({image_url:newUrl}).eq('id',j.row.id);
                if(uErr){ console.warn('อัปเดต URL ไม่ได้ ข้ามไป:',uErr.message); continue; }
                j.row.image_url=newUrl; changed++;
            }catch(e){ /* รูปนี้ดึง/ย่อไม่ได้ (เช่นติด CORS) ข้ามไปเงียบ ๆ */ }
        }
    } finally {
        autoOptRunning=false;
        if(changed){ console.log(`✅ ย่อรูปเก่าอัตโนมัติแล้ว ${changed} รูป`); buildToolLocations(); render(); if(window.lucide) lucide.createIcons(); }
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
    if(file){ const {blob,ext,type}=await compressImage(file); const p=`${Date.now()}-opt.${ext}`; const{error}=await _supabase.storage.from('category-images').upload(p,blob,{cacheControl:'604800',contentType:type||undefined}); if(error){alert('อัปโหลดไม่ได้');return;} url=_supabase.storage.from('category-images').getPublicUrl(p).data.publicUrl; }
    const d={name:document.getElementById('cat-name').value,department:document.getElementById('cat-dept').value,image_url:url};
    if(id) await _supabase.from('categories').update(d).eq('id',id); else await _supabase.from('categories').insert([d]); await refreshData(); closeCategoryModal();
});
window.deleteCategory=async id=>{ if(!isAdmin())return; if(confirm('ลบกลุ่ม?')){ const c=categories.find(x=>x.id==id); await _supabase.from('categories').delete().eq('id',id); if(c) await deleteStorageFiles('category-images',[c.image_url]); await refreshData(); }};

// Tool
window.openToolModal=(id=null)=>{ if(!isAdmin())return; document.getElementById('tool-form').reset(); document.getElementById('edit-tool-id').value=id||''; if(id){ const t=tools.find(x=>x.id==id); document.getElementById('tool-code').value=t.tool_code||''; document.getElementById('tool-name').value=t.name; document.getElementById('tool-dept').value=t.department; document.getElementById('tool-total').value=t.total_stock; document.getElementById('tool-available').value=t.available_stock; document.getElementById('tool-image-url').value=t.image_url; } updateToolCatList(); document.getElementById('tool-modal').style.display='flex'; };
window.updateToolCatList=()=>{ const d=document.getElementById('tool-dept').value, s=document.getElementById('tool-category-id'); s.innerHTML='<option value="">-- เลือก --</option>'; categories.filter(c=>c.department===d).forEach(c=>s.innerHTML+=`<option value="${c.id}">${c.name}</option>`); const id=document.getElementById('edit-tool-id').value; if(id){ const t=tools.find(x=>x.id==id); if(t&&t.department===d) s.value=t.category_id||''; }};
window.closeToolModal=()=>document.getElementById('tool-modal').style.display='none';
document.getElementById('tool-form').addEventListener('submit',async e=>{
    e.preventDefault(); if(!isAdmin())return; const id=document.getElementById('edit-tool-id').value, tc=document.getElementById('tool-code').value.trim();
    // เทียบรหัสซ้ำแบบไม่สนตัวพิมพ์เล็ก/ใหญ่และช่องว่าง กันรหัสซ้ำเล็ดลอด (เช่น "md003" กับ "MD003")
    const tcKey=tc.toLowerCase();
    if(tools.some(t=>(t.tool_code||'').trim().toLowerCase()===tcKey&&t.id!=id)){alert('❌ รหัสซ้ำ');return;}
    const file=document.getElementById('tool-image-file').files[0]; let url=document.getElementById('tool-image-url').value;
    if(file){ const {blob,ext,type}=await compressImage(file); const p=`${Date.now()}-opt.${ext}`; const{error}=await _supabase.storage.from('tool-images').upload(p,blob,{cacheControl:'604800',contentType:type||undefined}); if(error){alert('อัปโหลดไม่ได้');return;} url=_supabase.storage.from('tool-images').getPublicUrl(p).data.publicUrl; }
    const d={tool_code:tc,name:document.getElementById('tool-name').value,department:document.getElementById('tool-dept').value,category_id:document.getElementById('tool-category-id').value||null,image_url:url,total_stock:parseInt(document.getElementById('tool-total').value),available_stock:parseInt(document.getElementById('tool-available').value)};
    if(id) await _supabase.from('tools').update(d).eq('id',id); else await _supabase.from('tools').insert([d]); await refreshData(); closeToolModal();
});
window.deleteTool=async id=>{ if(!isAdmin())return; if(confirm('ลบเครื่องมือ?')){ const t=tools.find(x=>x.id==id); await _supabase.from('tools').delete().eq('id',id); if(t) await deleteStorageFiles('tool-images',[t.image_url]); await refreshData(); }};

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
    if(type==='BORROW' && t.status==='repairing'){ alert('🛠️ เครื่องมือนี้กำลังซ่อมอยู่ เบิกไม่ได้'); return; }
    if(type==='BORROW' && t.status==='retired'){ alert('⛔ เครื่องมือนี้ถูกปลดระวางแล้ว เบิกไม่ได้'); return; }
    document.getElementById('action-form').reset();
    document.getElementById('action-tool-id').value=id; document.getElementById('action-type').value=type;
    document.getElementById('modal-tool-name').value=t.name;
    document.getElementById('action-modal-title').textContent=type==='BORROW'?'เบิกเครื่องมือ':'คืนเครื่องมือ (เข้าส่วนกลาง)';
    document.getElementById('label-user-name').textContent=type==='BORROW'?'ชื่อผู้เบิก':'ชื่อผู้คืน';
    document.getElementById('label-receiver-name').textContent=type==='BORROW'?'ชื่อผู้ให้เบิก':'ชื่อผู้รับคืน';
    const sg=document.getElementById('site-selection-group'), ss=document.getElementById('action-site-id'), sl=document.getElementById('label-site');
    if(type==='BORROW'){
        sg.style.display='block'; sl.textContent='ไซงานที่จะส่งไป';
        ss.innerHTML='<option value="">-- เลือกไซงาน --</option>'; sites.forEach(s=>ss.innerHTML+=`<option value="${s.id}">${s.name}</option>`);
    } else {
        // คืน: ต้องบอกว่าคืนมาจากไซไหน เพื่อให้หักจำนวนออกจากไซนั้นถูกต้อง
        // แสดงเฉพาะไซที่เครื่องมือนี้ยังออกไปอยู่จริง
        const locs=getToolLocations(id).filter(l=>l.name!=='ไม่ระบุ');
        sg.style.display='block'; sl.textContent='ไซงานที่คืนมาจาก';
        ss.innerHTML='<option value="">-- เลือกไซงาน --</option>';
        locs.forEach(l=>{ const s=sites.find(x=>x.name===l.name); if(s) ss.innerHTML+=`<option value="${s.id}">${s.name} (เบิกไป ${l.qty})</option>`; });
        ss.innerHTML+='<option value="__central">คืนจากส่วนกลาง / ไม่ระบุไซ</option>';
    }
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
    const siteRaw=document.getElementById('action-site-id').value;
    const siteId=(!siteRaw||siteRaw==='__central')?null:siteRaw, un=document.getElementById('user-name').value;
    const t=tools.find(x=>x.id==id), qty=parseInt(document.getElementById('quantity').value);
    if(!Number.isInteger(qty)||qty<1) return alert('จำนวนไม่ถูกต้อง');
    if(type==='RETURN' && !siteRaw) return alert('กรุณาเลือกว่าคืนมาจากไซงานไหน');
    // คืนจากไซที่ระบุ: จำนวนคืนต้องไม่เกินที่เบิกออกไปจากไซนั้น
    if(type==='RETURN' && siteId){ const loc=getToolLocations(id).find(l=>{const s=sites.find(x=>x.name===l.name);return s&&String(s.id)===String(siteId);}); if(loc&&qty>loc.qty) return alert(`ไซนี้เบิกไปแค่ ${loc.qty} ชิ้น คืนเกินไม่ได้`); }
    const submitBtn=e.submitter||document.querySelector('#action-form button[type="submit"]');
    actionSubmitting=true; if(submitBtn) submitBtn.disabled=true;
    try{
        // อ่านค่าคงเหลือล่าสุดจากฐานข้อมูล (กันค่าใน cache ไม่ตรงกับของจริง)
        const{data:fresh,error:fErr}=await _supabase.from('tools').select('available_stock,total_stock,status').eq('id',id).single();
        if(fErr||!fresh){ alert('ดึงข้อมูลล่าสุดไม่ได้ ลองใหม่อีกครั้ง'); return; }
        if(type==='BORROW' && fresh.status==='repairing'){ alert('🛠️ เครื่องมือนี้กำลังซ่อมอยู่ เบิกไม่ได้'); await refreshData(); return; }
        if(type==='BORROW' && fresh.status==='retired'){ alert('⛔ เครื่องมือนี้ถูกปลดระวางแล้ว เบิกไม่ได้'); await refreshData(); return; }
        const cur=fresh.available_stock, ns=type==='BORROW'?cur-qty:cur+qty;
        if(ns<0||ns>fresh.total_stock){ alert(type==='BORROW'?`เบิกได้ไม่เกิน ${cur} ชิ้น (ของเหลือจริง)`:'จำนวนคืนเกินกว่าที่เบิกออก'); return; }
        // อัปเดตแบบมีเงื่อนไข: เขียนได้ก็ต่อเมื่อค่าคงเหลือยังเท่ากับที่เราเพิ่งอ่าน (optimistic lock)
        const{data:updated,error:uErr}=await _supabase.from('tools')
            .update({available_stock:ns}).eq('id',id).eq('available_stock',cur).select();
        if(uErr||!updated||!updated.length){ alert('มีคนทำรายการนี้ไปก่อนแล้ว กรุณาลองใหม่'); await refreshData(); return; }
        await _supabase.from('transactions').insert([{tool_id:id,site_id:siteId,user_name:un,receiver_name:document.getElementById('receiver-name').value,type,quantity:qty}]);
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

// ===== แจ้งซ่อม =====
window.openRepairModal=id=>{
    if(!repairsTableReady){ alert('⚠️ ยังเปิดใช้งานระบบแจ้งซ่อมไม่ได้ ต้องรัน SQL ในไฟล์ add-repairs-system.sql ที่ Supabase ก่อน'); return; }
    const t=tools.find(x=>x.id==id);
    if(t.status==='repairing'){ alert('🛠️ เครื่องมือนี้มีใบแจ้งซ่อมที่กำลังดำเนินการอยู่แล้ว'); return; }
    if(t.status==='retired'){ alert('⛔ เครื่องมือนี้ถูกปลดระวางแล้ว'); return; }
    document.getElementById('repair-form').reset();
    document.getElementById('repair-tool-id').value=id;
    document.getElementById('repair-tool-name').value=t.name;
    document.getElementById('repair-modal').style.display='flex';
};
window.closeRepairModal=()=>document.getElementById('repair-modal').style.display='none';
let repairSubmitting=false;
document.getElementById('repair-form').addEventListener('submit',async e=>{
    e.preventDefault(); if(repairSubmitting) return;
    const id=document.getElementById('repair-tool-id').value;
    const issue=document.getElementById('repair-issue').value.trim();
    const imgFiles=[...document.getElementById('repair-image-file').files];
    const docFiles=[...document.getElementById('repair-predoc-file').files];
    const submitBtn=e.submitter||document.querySelector('#repair-form button[type="submit"]');
    repairSubmitting=true; if(submitBtn) submitBtn.disabled=true;
    try{
        const imgAtt=await uploadRepairFiles(imgFiles,'report');
        if(imgAtt===null) return; // อัปโหลดล้มเหลว (แจ้ง error ในฟังก์ชันแล้ว)
        const docAtt=await uploadRepairFiles(docFiles,'predoc');
        if(docAtt===null) return;
        const attachments=imgAtt.concat(docAtt);
        const imageUrl=attachments.find(a=>a.type&&a.type.startsWith('image/'))?.url||null; // เผื่อโค้ดเก่าที่อ่าน image_url
        const{error:iErr}=await _supabase.from('repairs').insert([{
            tool_id:id, reported_by:currentUser.name, issue, image_url:imageUrl, attachments, status:'pending'
        }]);
        if(iErr){ alert('ส่งใบแจ้งซ่อมไม่สำเร็จ: '+iErr.message); return; }
        await refreshData(); closeRepairModal();
        alert('✅ ส่งใบแจ้งซ่อมเรียบร้อย รอแอดมินตรวจสอบ');
    } finally {
        repairSubmitting=false; if(submitBtn) submitBtn.disabled=false;
    }
});

// แอดมิน: เริ่มซ่อม (อนุมัติใบแจ้ง -> ล็อกเครื่องมือเป็น "กำลังซ่อม")
window.startRepair=async repairId=>{
    if(!isAdmin())return;
    const r=repairs.find(x=>x.id==repairId); if(!r)return;
    if(!confirm(`ยืนยันเริ่มซ่อม "${r.tool_name}"? เครื่องมือนี้จะถูกล็อกไม่ให้เบิกจนกว่าจะซ่อมเสร็จ`))return;
    await _supabase.from('tools').update({status:'repairing'}).eq('id',r.tool_id);
    await _supabase.from('repairs').update({status:'repairing',updated_at:new Date().toISOString()}).eq('id',repairId);
    await refreshData();
};
// แอดมิน: ปฏิเสธใบแจ้งซ่อม (ไม่ล็อกเครื่องมือ)
window.rejectRepair=async repairId=>{
    if(!isAdmin())return;
    if(!confirm('ปฏิเสธใบแจ้งซ่อมนี้?'))return;
    await _supabase.from('repairs').update({status:'rejected',resolved_by:currentUser.name,updated_at:new Date().toISOString()}).eq('id',repairId);
    await refreshData();
};
// แอดมิน: เปิดหน้าสรุป/ปิดงานซ่อม (กรอกหมายเหตุ ค่าใช้จ่าย แนบเอกสาร แล้วเลือก ซ่อมเสร็จ/ซ่อมไม่ได้)
window.openCompleteRepairModal=repairId=>{
    if(!isAdmin())return;
    const r=repairs.find(x=>x.id==repairId); if(!r)return;
    document.getElementById('complete-repair-form').reset();
    document.getElementById('complete-repair-id').value=repairId;
    document.getElementById('complete-repair-tool').value=r.tool_name;
    document.getElementById('complete-repair-note').value=r.admin_note||'';
    if(r.cost!=null) document.getElementById('complete-repair-cost').value=r.cost;
    document.getElementById('complete-repair-modal').style.display='flex';
};
window.closeCompleteRepairModal=()=>document.getElementById('complete-repair-modal').style.display='none';
let finishingRepair=false;
// outcome: 'done' = ซ่อมเสร็จ (เครื่องกลับมาเบิกได้) | 'scrapped' = ซ่อมไม่ได้ (ปลดระวางเครื่อง)
window.finishRepair=async outcome=>{
    if(!isAdmin()||finishingRepair)return;
    const repairId=document.getElementById('complete-repair-id').value;
    const r=repairs.find(x=>x.id==repairId); if(!r)return;
    const msg=outcome==='scrapped'
        ? `ยืนยันว่า "${r.tool_name}" ซ่อมไม่ได้? เครื่องมือจะถูก "ปลดระวาง" และเบิกไม่ได้อีก (กู้คืนได้ภายหลัง)`
        : `ยืนยันว่าซ่อม "${r.tool_name}" เสร็จแล้ว? เครื่องมือจะกลับมาเบิกได้ตามปกติ`;
    if(!confirm(msg))return;
    finishingRepair=true;
    try{
        const note=document.getElementById('complete-repair-note').value.trim();
        const costRaw=document.getElementById('complete-repair-cost').value;
        const cost=costRaw===''?null:Number(costRaw);
        const files=[...document.getElementById('complete-repair-files').files];
        const docs=await uploadRepairFiles(files,'doc');
        if(docs===null) return;
        const attachments=(Array.isArray(r.attachments)?r.attachments:[]).concat(docs);
        await _supabase.from('tools').update({status:outcome==='scrapped'?'retired':'normal'}).eq('id',r.tool_id);
        await _supabase.from('repairs').update({
            status:outcome==='scrapped'?'scrapped':'done',
            admin_note:note||null, cost, attachments,
            resolved_by:currentUser.name, updated_at:new Date().toISOString()
        }).eq('id',repairId);
        await refreshData(); closeCompleteRepairModal();
    } finally { finishingRepair=false; }
};
// แอดมิน: ลบใบแจ้งซ่อมที่จบงานแล้วออกจากรายการ
window.deleteRepair=async repairId=>{
    if(!isAdmin())return;
    if(!confirm('ลบใบแจ้งซ่อมนี้ออกจากรายการ?'))return;
    const r=repairs.find(x=>x.id==repairId);
    await _supabase.from('repairs').delete().eq('id',repairId);
    if(r){ const urls=[...(Array.isArray(r.attachments)?r.attachments.map(a=>a.url):[]), r.image_url]; await deleteStorageFiles('repair-images',urls); }
    await refreshData();
};
// แอดมิน: สลับสถานะเครื่องมือด้วยตนเอง (เผื่อกรณีไม่ได้มาจากใบแจ้งซ่อม)
window.toggleToolStatus=async toolId=>{
    if(!isAdmin())return;
    const t=tools.find(x=>x.id==toolId); if(!t)return;
    let ns, msg;
    if(t.status==='retired'){ ns='normal'; msg=`กู้คืน "${t.name}" จากการปลดระวาง กลับมาใช้งานได้ตามปกติ?`; }
    else if(t.status==='repairing'){ ns='normal'; msg=`ปลดสถานะ "ซ่อม" ของ "${t.name}" กลับเป็นปกติ?`; }
    else { ns='repairing'; msg=`ตั้ง "${t.name}" เป็น "กำลังซ่อม"? จะเบิกไม่ได้จนกว่าจะปลดสถานะ`; }
    if(!confirm(msg))return;
    await _supabase.from('tools').update({status:ns}).eq('id',toolId);
    await refreshData();
};
// แอดมิน: ปลดระวางเครื่องมือโดยตรง (ไม่ผ่านใบแจ้งซ่อม)
window.retireTool=async toolId=>{
    if(!isAdmin())return;
    const t=tools.find(x=>x.id==toolId); if(!t)return;
    if(!confirm(`ปลดระวาง "${t.name}"? เครื่องมือจะเบิกไม่ได้อีก (กู้คืนได้ภายหลัง)`))return;
    await _supabase.from('tools').update({status:'retired'}).eq('id',toolId);
    await refreshData();
};
