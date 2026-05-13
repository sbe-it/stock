// Supabase Configuration
const SUPABASE_URL = 'https://yximjuyryktwkotlxiyr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4aW1qdXlyeWt0d2tvdGx4aXlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0OTI4MjMsImV4cCI6MjA5NDA2ODgyM30.cKwZVRLmOBYhX73KzrXkdVXAMGxFJ7jSX4bIApIB_7k';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let categories = [], tools = [], sites = [], allLogs = [];
let currentView = 'inventory', currentDept = 'ช่างไฟ';

document.addEventListener('DOMContentLoaded', async () => { await refreshData(); if (window.lucide) lucide.createIcons(); });

async function refreshData() {
    await Promise.all([fetchCategories(), fetchSites(), fetchTools(), fetchLogs()]);
    updateStats();
    if (currentView === 'inventory') { renderInventory(); renderSiteSummary(); } else renderMgmtView();
    renderLogs();
    if (window.lucide) lucide.createIcons();
}
async function fetchCategories() { const { data } = await _supabase.from('categories').select('*').order('name'); categories = data || []; }
async function fetchSites() { const { data } = await _supabase.from('sites').select('*').order('name'); sites = data || []; }
async function fetchTools() {
    const { data, error } = await _supabase.from('tools').select('*, categories(name)').order('name');
    if (error) console.error('Fetch Tools Error:', error);
    tools = data || [];
}
async function fetchLogs() {
    const { data } = await _supabase.from('transactions').select('*, tools(name, department), sites(name)').order('timestamp', { ascending: false }).limit(500);
    allLogs = data ? data.map(l => ({ ...l, tool_name: l.tools ? l.tools.name : 'Unknown', department: l.tools ? l.tools.department : '-', site_name: l.sites ? l.sites.name : '-' })) : [];
}

// คำนวณสรุปว่าเครื่องมือแต่ละตัวอยู่ไซไหนบ้าง จากประวัติเบิก/คืน
function getToolLocationSummary(toolId) {
    const logs = allLogs.filter(l => l.tool_id == toolId);
    const siteMap = {}; // key = site_id, value = { name, qty, users: Set }
    logs.forEach(log => {
        const sId = log.site_id || 'unknown';
        const sName = log.site_name || 'ไม่ระบุไซ';
        if (!siteMap[sId]) siteMap[sId] = { name: sName, qty: 0, users: new Set() };
        if (log.type === 'BORROW') { siteMap[sId].qty += log.quantity; siteMap[sId].users.add(log.user_name); }
        else if (log.type === 'RETURN') { siteMap[sId].qty -= log.quantity; }
    });
    // เอาเฉพาะไซที่ยังมีเครื่องมือค้างอยู่ (qty > 0)
    return Object.values(siteMap).filter(s => s.qty > 0).map(s => ({ name: s.name, qty: s.qty, users: [...s.users] }));
}

function updateStats() {
    const ft = tools.filter(t => t.department === currentDept);
    document.getElementById('stat-total').textContent = ft.reduce((a, c) => a + (c.total_stock || 0), 0);
    document.getElementById('stat-available').textContent = ft.reduce((a, c) => a + (c.available_stock || 0), 0);
}

window.switchDept = function(dept) { currentDept = dept; document.querySelectorAll('.dept-tab').forEach(t => t.classList.remove('active')); document.getElementById(`tab-${dept}`).classList.add('active'); refreshData(); }
window.switchView = function(view) {
    currentView = view;
    document.getElementById('view-inventory').style.display = view === 'inventory' ? 'block' : 'none';
    document.getElementById('view-management').style.display = view === 'management' ? 'block' : 'none';
    document.getElementById('nav-inventory').style.background = view === 'inventory' ? 'var(--primary)' : 'transparent';
    document.getElementById('nav-mgmt').style.background = view === 'management' ? 'var(--primary)' : 'transparent';
    refreshData();
}

function renderInventory() {
    const container = document.getElementById('inventory-content');
    container.innerHTML = '';
    const filteredCats = categories.filter(c => c.department === currentDept);
    if (filteredCats.length === 0) { container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem;">ไม่พบกลุ่มเครื่องมือในส่วนงานนี้</div>'; return; }

    filteredCats.forEach(cat => {
        const catTools = tools.filter(t => t.category_id == cat.id);
        if (catTools.length === 0) return;
        const gw = document.createElement('div');
        gw.className = 'category-group'; gw.style.gridColumn = '1/-1';
        gw.innerHTML = `<div class="glass-panel" style="padding:1rem 1.5rem;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-left:4px solid var(--primary);margin-bottom:0.5rem;" onclick="toggleElement('gc-${cat.id}','ch-${cat.id}')"><span style="font-size:1.1rem;font-weight:700;">${cat.name} (${catTools.length})</span><i data-lucide="chevron-down" id="ch-${cat.id}"></i></div><div id="gc-${cat.id}" style="display:none;padding:1rem 0;"><div class="tools-grid" id="tg-${cat.id}"></div></div>`;
        container.appendChild(gw);
        const tg = document.getElementById(`tg-${cat.id}`);
        catTools.forEach(tool => {
            const oos = tool.available_stock <= 0;
            const locs = getToolLocationSummary(tool.id);
            let locHtml = '';
            if (locs.length > 0) {
                locHtml = '<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px;">' +
                    locs.map(l => `<div style="display:flex;gap:4px;flex-wrap:wrap;"><span class="location-badge">📍 ${l.name} (${l.qty})</span><span class="user-badge">👤 ${l.users.join(', ')}</span></div>`).join('') + '</div>';
            }
            const card = document.createElement('div');
            card.className = 'glass-panel tool-card';
            card.innerHTML = `
                <div style="position:absolute;top:10px;right:10px;z-index:10;display:flex;gap:4px;">
                    <button class="btn-outline" style="padding:4px;border-radius:50%;width:32px;height:32px;background:rgba(0,0,0,0.5);" onclick="event.stopPropagation();openLocationModal(${tool.id})"><i data-lucide="map-pin" style="width:16px;"></i></button>
                    <button class="btn-outline" style="padding:4px;border-radius:50%;width:32px;height:32px;background:rgba(0,0,0,0.5);" onclick="event.stopPropagation();openHistoryModal(${tool.id})"><i data-lucide="clock" style="width:16px;"></i></button>
                </div>
                <img src="${tool.image_url || 'https://images.unsplash.com/photo-1530124560676-587cabee147a?q=80&w=400'}" class="tool-image">
                <div class="tool-info">
                    <div style="font-size:0.7rem;color:var(--primary);font-weight:800;margin-bottom:2px;">${tool.tool_code || 'NO-CODE'}</div>
                    <div class="tool-name">${tool.name}</div>
                    <div class="tool-meta"><span class="stock-badge ${oos ? 'stock-empty' : 'stock-available'}">${oos ? 'เบิกเต็มจำนวน' : `คงเหลือ ${tool.available_stock}`}</span><span style="color:var(--text-muted)">/ ${tool.total_stock}</span></div>
                    ${locHtml}
                </div>
                <div class="tool-actions">
                    <button class="btn-primary" onclick="openActionModal(${tool.id},'BORROW')" ${oos ? 'disabled' : ''}>เบิก</button>
                    <button class="btn-outline" onclick="openActionModal(${tool.id},'RETURN')">คืน</button>
                </div>`;
            tg.appendChild(card);
        });
    });
    if (window.lucide) lucide.createIcons();
}

function renderLogs() {
    const ls = document.getElementById('recent-logs-section');
    ls.innerHTML = '<h2 class="section-title"><i data-lucide="history"></i> ประวัติการทำรายการ (เฉพาะแผนกนี้)</h2>';
    const fl = allLogs.filter(l => l.department === currentDept);
    if (fl.length === 0) { ls.innerHTML += '<div class="glass-panel" style="padding:2rem;text-align:center;color:var(--text-muted);">ไม่มีประวัติ</div>'; return; }
    const grouped = {};
    fl.forEach(log => { if (!grouped[log.tool_id]) grouped[log.tool_id] = { name: log.tool_name, items: [] }; grouped[log.tool_id].items.push(log); });
    Object.keys(grouped).forEach(id => {
        const g = grouped[id], w = document.createElement('div');
        w.style.marginBottom = '0.5rem';
        w.innerHTML = `<div class="glass-panel" style="padding:0.75rem 1.25rem;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="toggleElement('lc-${id}','cl-${id}')"><span style="font-weight:600;">${g.name} (${g.items.length})</span><i data-lucide="chevron-down" id="cl-${id}" style="width:16px;"></i></div><div id="lc-${id}" style="display:none;padding:1rem 0;"><div class="log-table-container"><table style="font-size:0.8rem;"><thead><tr><th>วันเวลา</th><th>ผู้เบิก/คืน</th><th>ไซงาน</th><th>ผู้รับ</th><th>ประเภท</th><th>จำนวน</th></tr></thead><tbody>${g.items.map(i => `<tr><td>${new Date(i.timestamp).toLocaleString()}</td><td>${i.user_name}</td><td>${i.site_name}</td><td>${i.receiver_name||'-'}</td><td><span class="${i.type==='BORROW'?'type-borrow':'type-return'}">${i.type==='BORROW'?'เบิก':'คืน'}</span></td><td>${i.quantity}</td></tr>`).join('')}</tbody></table></div></div>`;
        ls.appendChild(w);
    });
    if (window.lucide) lucide.createIcons();
}

function renderMgmtView() {
    const sb = document.getElementById('mgmt-sites-body'); sb.innerHTML = '';
    sites.forEach(s => { sb.innerHTML += `<tr><td><b>${s.name}</b></td><td style="text-align:right;"><button class="btn-outline" style="padding:4px;" onclick="openSiteModal(${s.id})"><i data-lucide="edit-2" style="width:14px;"></i></button> <button class="btn-outline" style="padding:4px;color:var(--danger);" onclick="deleteSite(${s.id})"><i data-lucide="trash" style="width:14px;"></i></button></td></tr>`; });
    const cb = document.getElementById('mgmt-cats-body'); cb.innerHTML = '';
    categories.forEach(c => { cb.innerHTML += `<tr><td><b>${c.name}</b></td><td><span class="stock-badge stock-available">${c.department}</span></td><td style="text-align:right;"><button class="btn-outline" style="padding:4px;" onclick="openCategoryModal(${c.id})"><i data-lucide="edit-2" style="width:14px;"></i></button> <button class="btn-outline" style="padding:4px;color:var(--danger);" onclick="deleteCategory(${c.id})"><i data-lucide="trash" style="width:14px;"></i></button></td></tr>`; });
    const tb = document.getElementById('mgmt-tools-body'); tb.innerHTML = '';
    tools.forEach(tool => {
        const locs = getToolLocationSummary(tool.id);
        const locStr = locs.length > 0 ? locs.map(l => `${l.name}(${l.qty}) - ${l.users.join(',')}`).join(' | ') : 'อยู่ในคลัง';
        tb.innerHTML += `<tr><td><img src="${tool.image_url}" style="width:32px;height:32px;border-radius:4px;"></td><td style="font-family:monospace;font-weight:700;">${tool.tool_code||'-'}</td><td style="font-weight:600;">${tool.name}</td><td><span class="stock-badge stock-available">${tool.department}</span></td><td>${tool.total_stock}</td><td>${tool.available_stock}</td><td style="font-size:0.7rem;max-width:200px;">${locStr}</td><td style="text-align:right;"><button class="btn-outline" style="padding:4px;" onclick="openLocationModal(${tool.id})"><i data-lucide="map-pin" style="width:14px;"></i></button> <button class="btn-outline" style="padding:4px;" onclick="openHistoryModal(${tool.id})"><i data-lucide="clock" style="width:14px;"></i></button> <button class="btn-outline" style="padding:4px;" onclick="openToolModal(${tool.id})"><i data-lucide="edit-2" style="width:14px;"></i></button> <button class="btn-outline" style="padding:4px;color:var(--danger);" onclick="deleteTool(${tool.id})"><i data-lucide="trash" style="width:14px;"></i></button></td></tr>`;
    });
    if (window.lucide) lucide.createIcons();
}

window.toggleElement = (elId, chevId) => { const el = document.getElementById(elId), ch = document.getElementById(chevId), h = el.style.display === 'none'; el.style.display = h ? 'block' : 'none'; if(ch) ch.style.transform = h ? 'rotate(180deg)' : 'rotate(0deg)'; }

// Location Summary Modal - แสดงสรุปว่าเครื่องมือนี้อยู่ไซไหนบ้าง
window.openLocationModal = (id) => {
    const t = tools.find(x => x.id == id);
    const locs = getToolLocationSummary(id);
    document.getElementById('location-modal-title').textContent = `📍 สรุปสถานที่: ${t.name}`;
    const list = document.getElementById('tool-location-list');
    list.innerHTML = '';
    if (locs.length === 0) {
        list.innerHTML = '<div class="glass-panel" style="padding:1.5rem;text-align:center;color:var(--text-muted);">✅ เครื่องมือทั้งหมดอยู่ในคลัง</div>';
    } else {
        list.innerHTML = `<div class="glass-panel" style="padding:1rem;margin-bottom:0.5rem;font-size:0.85rem;"><b>รวมเบิกออก:</b> ${locs.reduce((a,l)=>a+l.qty,0)} / ${t.total_stock} | <b>คงเหลือ:</b> ${t.available_stock}</div>`;
        locs.forEach(l => {
            list.innerHTML += `<div class="glass-panel" style="padding:1rem;margin-bottom:0.5rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-weight:700;color:#60a5fa;">📍 ${l.name}</span>
                    <span class="stock-badge stock-empty" style="font-size:0.75rem;">จำนวน ${l.qty}</span>
                </div>
                <div style="margin-top:6px;font-size:0.8rem;color:var(--text-muted);">👤 ผู้เบิก: ${l.users.join(', ')}</div>
            </div>`;
        });
    }
    document.getElementById('location-modal').style.display = 'flex';
}
window.closeLocationModal = () => document.getElementById('location-modal').style.display = 'none';

// SITE MODAL
window.openSiteModal = (id = null) => { document.getElementById('site-form').reset(); document.getElementById('edit-site-id').value = id || ''; if(id) { document.getElementById('site-name').value = sites.find(s => s.id == id).name; } document.getElementById('site-modal').style.display = 'flex'; }
window.closeSiteModal = () => document.getElementById('site-modal').style.display = 'none';
document.getElementById('site-form').addEventListener('submit', async (e) => { e.preventDefault(); const id = document.getElementById('edit-site-id').value, name = document.getElementById('site-name').value; if(id) await _supabase.from('sites').update({name}).eq('id',id); else await _supabase.from('sites').insert([{name}]); await refreshData(); closeSiteModal(); });
window.deleteSite = async (id) => { if(confirm('ลบไซงาน?')) { await _supabase.from('sites').delete().eq('id', id); await refreshData(); } }

// CATEGORY MODAL
window.openCategoryModal = (id=null) => { document.getElementById('category-form').reset(); document.getElementById('edit-cat-id').value = id || ''; if(id) { const c = categories.find(c => c.id == id); document.getElementById('cat-name').value = c.name; document.getElementById('cat-dept').value = c.department; document.getElementById('cat-image-url').value = c.image_url; } document.getElementById('category-modal').style.display = 'flex'; }
window.closeCategoryModal = () => document.getElementById('category-modal').style.display = 'none';
document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const id = document.getElementById('edit-cat-id').value; const file = document.getElementById('cat-image-file').files[0]; let url = document.getElementById('cat-image-url').value;
    if(file) { const ext = file.name.split('.').pop(), path = `${Date.now()}.${ext}`; const { error } = await _supabase.storage.from('category-images').upload(path, file); if (error) { alert('อัปโหลดรูปไม่ได้: ' + error.message); return; } url = _supabase.storage.from('category-images').getPublicUrl(path).data.publicUrl; }
    const data = { name: document.getElementById('cat-name').value, department: document.getElementById('cat-dept').value, image_url: url };
    if(id) await _supabase.from('categories').update(data).eq('id', id); else await _supabase.from('categories').insert([data]);
    await refreshData(); closeCategoryModal();
});

// TOOL MODAL
window.openToolModal = (id=null) => { document.getElementById('tool-form').reset(); document.getElementById('edit-tool-id').value = id || ''; if(id) { const t = tools.find(x => x.id == id); document.getElementById('tool-code').value = t.tool_code || ''; document.getElementById('tool-name').value = t.name; document.getElementById('tool-dept').value = t.department; document.getElementById('tool-total').value = t.total_stock; document.getElementById('tool-available').value = t.available_stock; document.getElementById('tool-image-url').value = t.image_url; } updateToolCatList(); document.getElementById('tool-modal').style.display = 'flex'; }
window.updateToolCatList = () => { const dept = document.getElementById('tool-dept').value, sel = document.getElementById('tool-category-id'); sel.innerHTML = '<option value="">-- เลือกกลุ่ม --</option>'; categories.filter(c => c.department === dept).forEach(c => sel.innerHTML += `<option value="${c.id}">${c.name}</option>`); const id = document.getElementById('edit-tool-id').value; if(id) { const t = tools.find(x => x.id == id); if(t && t.department === dept) sel.value = t.category_id || ''; } }
window.closeToolModal = () => document.getElementById('tool-modal').style.display = 'none';
document.getElementById('tool-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const id = document.getElementById('edit-tool-id').value, toolCode = document.getElementById('tool-code').value.trim();
    if (tools.some(t => t.tool_code === toolCode && t.id != id)) { alert('❌ รหัสเครื่องมือซ้ำ'); return; }
    const file = document.getElementById('tool-image-file').files[0]; let url = document.getElementById('tool-image-url').value;
    if(file) { const ext = file.name.split('.').pop(), path = `${Date.now()}.${ext}`; const { error } = await _supabase.storage.from('tool-images').upload(path, file); if (error) { alert('อัปโหลดรูปไม่ได้: ' + error.message); return; } url = _supabase.storage.from('tool-images').getPublicUrl(path).data.publicUrl; }
    const data = { tool_code: toolCode, name: document.getElementById('tool-name').value, department: document.getElementById('tool-dept').value, category_id: document.getElementById('tool-category-id').value || null, image_url: url, total_stock: parseInt(document.getElementById('tool-total').value), available_stock: parseInt(document.getElementById('tool-available').value) };
    if(id) await _supabase.from('tools').update(data).eq('id', id); else await _supabase.from('tools').insert([data]);
    await refreshData(); closeToolModal();
});

// ACTION MODAL (เบิก/คืน)
window.openActionModal = (id, type) => {
    const tool = tools.find(t => t.id == id);
    document.getElementById('action-tool-id').value = id; document.getElementById('action-type').value = type; document.getElementById('modal-tool-name').value = tool.name;
    document.getElementById('label-user-name').textContent = type === 'BORROW' ? 'ชื่อผู้เบิก' : 'ชื่อผู้คืน';
    document.getElementById('label-receiver-name').textContent = type === 'BORROW' ? 'ชื่อผู้ให้เบิก' : 'ชื่อผู้รับคืน';
    const siteSel = document.getElementById('action-site-id'), siteGroup = document.getElementById('site-selection-group');
    if (type === 'BORROW') {
        siteGroup.style.display = 'block';
        siteSel.innerHTML = '<option value="">-- เลือกไซงาน --</option>';
        sites.forEach(s => siteSel.innerHTML += `<option value="${s.id}">${s.name}</option>`);
    } else {
        siteGroup.style.display = 'none';
        siteSel.value = '';
    }
    document.getElementById('action-modal').style.display = 'flex';
}
window.closeActionModal = () => document.getElementById('action-modal').style.display = 'none';
document.getElementById('action-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('action-tool-id').value, type = document.getElementById('action-type').value;
    const siteId = document.getElementById('action-site-id').value || null, userName = document.getElementById('user-name').value;
    const tool = tools.find(t => t.id == id), qty = parseInt(document.getElementById('quantity').value);
    let newStock = type === 'BORROW' ? tool.available_stock - qty : tool.available_stock + qty;
    if (newStock < 0 || newStock > tool.total_stock) return alert('จำนวนไม่ถูกต้อง');
    await _supabase.from('tools').update({ available_stock: newStock }).eq('id', id);
    await _supabase.from('transactions').insert([{ tool_id: id, site_id: siteId, user_name: userName, receiver_name: document.getElementById('receiver-name').value, type, quantity: qty }]);
    await refreshData(); closeActionModal();
});

// HISTORY MODAL
window.openHistoryModal = (id) => {
    const t = tools.find(x => x.id == id);
    document.getElementById('history-modal-title').textContent = `ประวัติ: ${t.name}`;
    const list = document.getElementById('tool-history-list'); list.innerHTML = '';
    allLogs.filter(l => l.tool_id == id).forEach(log => {
        list.innerHTML += `<div class="glass-panel" style="padding:0.75rem;font-size:0.8rem;margin-bottom:0.5rem;"><div style="display:flex;justify-content:space-between;"><b>${log.type==='BORROW'?'เบิก':'คืน'} ${log.quantity}</b><small style="color:var(--text-muted)">${new Date(log.timestamp).toLocaleString()}</small></div><div>${log.user_name} / ${log.receiver_name||'-'}</div><div style="color:var(--primary);font-size:0.7rem;font-weight:700;">${log.site_name!=='-'?`📍 ${log.site_name}`:''}</div></div>`;
    });
    document.getElementById('history-modal').style.display = 'flex';
}
window.closeHistoryModal = () => document.getElementById('history-modal').style.display = 'none';
window.deleteCategory = async (id) => { if(confirm('ลบกลุ่ม?')) { await _supabase.from('categories').delete().eq('id', id); await refreshData(); } }
window.deleteTool = async (id) => { if(confirm('ลบเครื่องมือ?')) { await _supabase.from('tools').delete().eq('id', id); await refreshData(); } }

// SITE SUMMARY - แสดงแถบไซงาน กดแล้วเห็นว่าไซนี้มีเครื่องมืออะไรอยู่
function renderSiteSummary() {
    const section = document.getElementById('site-summary-section');
    section.innerHTML = '<h2 class="section-title"><i data-lucide="map-pin"></i> สรุปเครื่องมือตามไซงาน</h2>';
    if (sites.length === 0) { section.innerHTML += '<div class="glass-panel" style="padding:2rem;text-align:center;color:var(--text-muted);">ยังไม่มีไซงาน</div>'; return; }
    const filteredTools = tools.filter(t => t.department === currentDept);
    sites.forEach(site => {
        // หาเครื่องมือที่อยู่ไซนี้
        const toolsAtSite = [];
        filteredTools.forEach(tool => {
            const locs = getToolLocationSummary(tool.id);
            const atSite = locs.find(l => l.name === site.name);
            if (atSite) toolsAtSite.push({ tool, qty: atSite.qty, users: atSite.users });
        });
        const totalAtSite = toolsAtSite.reduce((a, t) => a + t.qty, 0);
        const w = document.createElement('div');
        w.style.marginBottom = '0.5rem';
        let tableRows = '';
        if (toolsAtSite.length > 0) {
            tableRows = toolsAtSite.map(t => `<tr><td style="font-family:monospace;font-weight:700;font-size:0.75rem;">${t.tool.tool_code||'-'}</td><td style="font-weight:600;">${t.tool.name}</td><td>${t.qty}</td><td style="color:var(--text-muted);">${t.users.join(', ')}</td></tr>`).join('');
        } else {
            tableRows = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">ไม่มีเครื่องมือที่ไซนี้</td></tr>';
        }
        w.innerHTML = `<div class="glass-panel" style="padding:0.75rem 1.25rem;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-left:4px solid ${totalAtSite > 0 ? '#f59e0b' : 'var(--success)'};" onclick="toggleElement('site-detail-${site.id}','chev-site-${site.id}')">
            <span style="font-weight:700;">📍 ${site.name} <span style="font-size:0.8rem;color:${totalAtSite > 0 ? '#f59e0b' : 'var(--success)'}">(${totalAtSite > 0 ? totalAtSite + ' ชิ้น' : 'ว่าง'})</span></span>
            <i data-lucide="chevron-down" id="chev-site-${site.id}" style="width:16px;"></i>
        </div>
        <div id="site-detail-${site.id}" style="display:none;padding:0.5rem 0;">
            <div class="log-table-container glass-panel"><table style="font-size:0.8rem;"><thead><tr><th>รหัส</th><th>ชื่อเครื่องมือ</th><th>จำนวน</th><th>ผู้เบิก</th></tr></thead><tbody>${tableRows}</tbody></table></div>
        </div>`;
        section.appendChild(w);
    });
    if (window.lucide) lucide.createIcons();
}
