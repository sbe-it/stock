// Supabase Configuration
const SUPABASE_URL = 'https://yximjuyryktwkotlxiyr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4aW1qdXlyeWt0d2tvdGx4aXlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0OTI4MjMsImV4cCI6MjA5NDA2ODgyM30.cKwZVRLmOBYhX73KzrXkdVXAMGxFJ7jSX4bIApIB_7k';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let categories = [];
let tools = [];
let sites = [];
let allLogs = [];
let currentView = 'inventory';
let currentDept = 'ช่างไฟ';

document.addEventListener('DOMContentLoaded', async () => {
    await refreshData();
    if (window.lucide) lucide.createIcons();
});

async function refreshData() {
    await fetchCategories();
    await fetchSites();
    await fetchTools();
    await fetchLogs();
    updateStats();
    if (currentView === 'inventory') renderInventory();
    else renderMgmtView();
    renderLogs();
    if (window.lucide) lucide.createIcons();
}

async function fetchCategories() {
    const { data } = await _supabase.from('categories').select('*').order('name');
    categories = data || [];
}

async function fetchSites() {
    const { data } = await _supabase.from('sites').select('*').order('name');
    sites = data || [];
}

async function fetchTools() {
    const { data } = await _supabase.from('tools').select('*, categories(name), sites(name)').order('name');
    tools = data || [];
}

async function fetchLogs() {
    const { data } = await _supabase.from('transactions').select('*, tools(name, department), sites(name)').order('timestamp', { ascending: false }).limit(200);
    allLogs = data ? data.map(l => ({ 
        ...l, 
        tool_name: l.tools ? l.tools.name : 'Unknown', 
        department: l.tools ? l.tools.department : 'ทั่วไป',
        site_name: l.sites ? l.sites.name : '-'
    })) : [];
}

function updateStats() {
    const filteredTools = tools.filter(t => t.department === currentDept);
    const total = filteredTools.reduce((acc, curr) => acc + (curr.total_stock || 0), 0);
    const available = filteredTools.reduce((acc, curr) => acc + (curr.available_stock || 0), 0);
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-available').textContent = available;
}

// DEPT SWITCHING
window.switchDept = function(dept) {
    currentDept = dept;
    document.querySelectorAll('.dept-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${dept}`).classList.add('active');
    refreshData();
}

window.switchView = function(view) {
    currentView = view;
    document.getElementById('view-inventory').style.display = view === 'inventory' ? 'block' : 'none';
    document.getElementById('view-management').style.display = view === 'management' ? 'block' : 'none';
    document.getElementById('nav-inventory').style.background = view === 'inventory' ? 'var(--primary)' : 'transparent';
    document.getElementById('nav-mgmt').style.background = view === 'management' ? 'var(--primary)' : 'transparent';
    refreshData();
}

// RENDERERS: INVENTORY
function renderInventory() {
    const container = document.getElementById('inventory-content');
    container.innerHTML = '';
    const filteredCats = categories.filter(c => c.department === currentDept);
    
    if (filteredCats.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">ไม่พบกลุ่มเครื่องมือในส่วนงานนี้</div>';
        return;
    }

    filteredCats.forEach(cat => {
        const catTools = tools.filter(t => t.category_id == cat.id);
        const groupWrapper = document.createElement('div');
        groupWrapper.className = 'category-group';
        groupWrapper.style.gridColumn = '1/-1';
        groupWrapper.innerHTML = `
            <div class="glass-panel" style="padding: 1rem 1.5rem; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid var(--primary); margin-bottom: 0.5rem;" onclick="toggleElement('group-content-${cat.id}', 'chevron-cat-${cat.id}')">
                <span style="font-size: 1.1rem; font-weight: 700;">${cat.name} (${catTools.length})</span>
                <i data-lucide="chevron-down" id="chevron-cat-${cat.id}"></i>
            </div>
            <div id="group-content-${cat.id}" style="display: none; padding: 1rem 0;">
                <div class="tools-grid" id="tools-grid-${cat.id}"></div>
            </div>
        `;
        container.appendChild(groupWrapper);
        const toolsGrid = document.getElementById(`tools-grid-${cat.id}`);
        catTools.forEach(tool => {
            const isOutOfStock = tool.available_stock <= 0;
            const card = document.createElement('div');
            card.className = 'glass-panel tool-card';
            
            // Location Badge logic
            let locationHtml = '';
            if (tool.sites && tool.current_user_name) {
                locationHtml = `
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span class="location-badge"><i data-lucide="map-pin" style="width:10px;"></i> ${tool.sites.name}</span>
                        <span class="user-badge"><i data-lucide="user" style="width:10px;"></i> ${tool.current_user_name}</span>
                    </div>
                `;
            } else if (tool.available_stock < tool.total_stock && tool.current_user_name) {
                 locationHtml = `
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span class="user-badge"><i data-lucide="user" style="width:10px;"></i> ${tool.current_user_name}</span>
                    </div>
                `;
            }

            card.innerHTML = `
                <div style="position: absolute; top: 10px; right: 10px; z-index: 10;">
                    <button class="btn-outline" style="padding: 4px; border-radius: 50%; width: 32px; height: 32px; background: rgba(0,0,0,0.5);" onclick="event.stopPropagation(); openHistoryModal(${tool.id})">
                        <i data-lucide="clock" style="width: 16px;"></i>
                    </button>
                </div>
                <img src="${tool.image_url || 'https://images.unsplash.com/photo-1530124560676-587cabee147a?q=80&w=400'}" class="tool-image">
                <div class="tool-info">
                    <div style="font-size: 0.7rem; color: var(--primary); font-weight: 800; margin-bottom: 2px;">${tool.tool_code || 'NO-CODE'}</div>
                    <div class="tool-name">${tool.name}</div>
                    <div class="tool-meta">
                        <span class="stock-badge ${isOutOfStock ? 'stock-empty' : 'stock-available'}">${isOutOfStock ? 'เบิกเต็มจำนวน' : `คงเหลือ ${tool.available_stock}`}</span>
                        <span style="color: var(--text-muted)">/ ${tool.total_stock}</span>
                    </div>
                    ${locationHtml}
                </div>
                <div class="tool-actions">
                    <button class="btn-primary" onclick="openActionModal(${tool.id}, 'BORROW')" ${isOutOfStock ? 'disabled' : ''}>เบิก</button>
                    <button class="btn-outline" onclick="openActionModal(${tool.id}, 'RETURN')">คืน</button>
                </div>
            `;
            toolsGrid.appendChild(card);
        });
    });
    if (window.lucide) lucide.createIcons();
}

function renderLogs() {
    const logSection = document.getElementById('recent-logs-section');
    logSection.innerHTML = '<h2 class="section-title"><i data-lucide="history"></i> ประวัติการทำรายการ (เฉพาะแผนกนี้)</h2>';
    
    const filteredLogs = allLogs.filter(l => l.department === currentDept);
    if (filteredLogs.length === 0) {
        logSection.innerHTML += '<div class="glass-panel" style="padding: 2rem; text-align: center; color: var(--text-muted);">ไม่มีประวัติการทำรายการในแผนกนี้</div>';
        return;
    }

    const grouped = {};
    filteredLogs.forEach(log => {
        if (!grouped[log.tool_id]) grouped[log.tool_id] = { name: log.tool_name, items: [] };
        grouped[log.tool_id].items.push(log);
    });

    Object.keys(grouped).forEach(id => {
        const group = grouped[id];
        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = '0.5rem';
        wrapper.innerHTML = `
            <div class="glass-panel" style="padding: 0.75rem 1.25rem; cursor: pointer; display: flex; justify-content: space-between; align-items: center;" onclick="toggleElement('log-content-${id}', 'chevron-log-${id}')">
                <span style="font-weight: 600;">${group.name} (${group.items.length})</span>
                <i data-lucide="chevron-down" id="chevron-log-${id}" style="width: 16px;"></i>
            </div>
            <div id="log-content-${id}" style="display: none; padding: 1rem 0;">
                <div class="log-table-container">
                    <table style="font-size: 0.8rem;">
                        <thead><tr><th>วันเวลา</th><th>ผู้เบิก/คืน</th><th>ไซงาน</th><th>ผู้รับ</th><th>ประเภท</th><th>จำนวน</th></tr></thead>
                        <tbody>${group.items.map(i => `<tr><td>${new Date(i.timestamp).toLocaleString()}</td><td>${i.user_name}</td><td>${i.site_name}</td><td>${i.receiver_name||'-'}</td><td><span class="${i.type==='BORROW'?'type-borrow':'type-return'}">${i.type==='BORROW'?'เบิก':'คืน'}</span></td><td>${i.quantity}</td></tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>
        `;
        logSection.appendChild(wrapper);
    });
    if (window.lucide) lucide.createIcons();
}

function renderMgmtView() {
    // Render Sites
    const siteBody = document.getElementById('mgmt-sites-body');
    siteBody.innerHTML = '';
    sites.forEach(site => {
        siteBody.innerHTML += `<tr><td><b>${site.name}</b></td><td style="text-align:right;"><button class="btn-outline" style="padding:4px;" onclick="openSiteModal(${site.id})"><i data-lucide="edit-2" style="width:14px;"></i></button> <button class="btn-outline" style="padding:4px;color:var(--danger);" onclick="deleteSite(${site.id})"><i data-lucide="trash" style="width:14px;"></i></button></td></tr>`;
    });

    // Render Categories
    const catBody = document.getElementById('mgmt-cats-body');
    catBody.innerHTML = '';
    categories.forEach(cat => {
        catBody.innerHTML += `<tr><td><b>${cat.name}</b></td><td><span class="stock-badge stock-available">${cat.department}</span></td><td style="text-align:right;"><button class="btn-outline" style="padding:4px;" onclick="openCategoryModal(${cat.id})"><i data-lucide="edit-2" style="width:14px;"></i></button> <button class="btn-outline" style="padding:4px;color:var(--danger);" onclick="deleteCategory(${cat.id})"><i data-lucide="trash" style="width:14px;"></i></button></td></tr>`;
    });

    // Render Tools
    const toolBody = document.getElementById('mgmt-tools-body');
    toolBody.innerHTML = '';
    tools.forEach(tool => {
        const locationStr = tool.sites ? `${tool.sites.name} (${tool.current_user_name})` : (tool.current_user_name ? tool.current_user_name : '-');
        toolBody.innerHTML += `<tr>
            <td><img src="${tool.image_url}" style="width:32px;height:32px;border-radius:4px;"></td>
            <td style="font-family:monospace;font-weight:700;">${tool.tool_code || '-'}</td>
            <td style="font-weight:600;">${tool.name}</td>
            <td><span class="stock-badge stock-available">${tool.department}</span></td>
            <td>${tool.total_stock}</td>
            <td>${tool.available_stock}</td>
            <td style="font-size:0.75rem; color:var(--text-muted);">${locationStr}</td>
            <td style="text-align:right;">
                <button class="btn-outline" style="padding:4px;" onclick="openHistoryModal(${tool.id})"><i data-lucide="clock" style="width:14px;"></i></button> 
                <button class="btn-outline" style="padding:4px;" onclick="openToolModal(${tool.id})"><i data-lucide="edit-2" style="width:14px;"></i></button> 
                <button class="btn-outline" style="padding:4px;color:var(--danger);" onclick="deleteTool(${tool.id})"><i data-lucide="trash" style="width:14px;"></i></button>
            </td>
        </tr>`;
    });
    if (window.lucide) lucide.createIcons();
}

window.toggleElement = (elId, chevId) => {
    const el = document.getElementById(elId);
    const chev = document.getElementById(chevId);
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? 'block' : 'none';
    if(chev) chev.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
}

// SITE MODAL logic
window.openSiteModal = (id = null) => {
    document.getElementById('site-form').reset();
    document.getElementById('edit-site-id').value = id || '';
    if(id) {
        const site = sites.find(s => s.id == id);
        document.getElementById('site-name').value = site.name;
    }
    document.getElementById('site-modal').style.display = 'flex';
}
window.closeSiteModal = () => document.getElementById('site-modal').style.display = 'none';
document.getElementById('site-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-site-id').value;
    const name = document.getElementById('site-name').value;
    if(id) await _supabase.from('sites').update({ name }).eq('id', id);
    else await _supabase.from('sites').insert([{ name }]);
    await refreshData(); closeSiteModal();
});
window.deleteSite = async (id) => { if(confirm('ลบไซงาน?')) { await _supabase.from('sites').delete().eq('id', id); await refreshData(); } }

// CATEGORY MODAL logic
window.openCategoryModal = (id=null) => {
    document.getElementById('category-form').reset();
    document.getElementById('edit-cat-id').value = id || '';
    if(id) {
        const cat = categories.find(c => c.id == id);
        document.getElementById('cat-name').value = cat.name;
        document.getElementById('cat-dept').value = cat.department;
        document.getElementById('cat-image-url').value = cat.image_url;
    }
    document.getElementById('category-modal').style.display = 'flex';
}
window.closeCategoryModal = () => document.getElementById('category-modal').style.display = 'none';
document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-cat-id').value;
    const file = document.getElementById('cat-image-file').files[0];
    let url = document.getElementById('cat-image-url').value;

    if(file) {
        const ext = file.name.split('.').pop();
        const path = `${Date.now()}.${ext}`;
        const { data, error } = await _supabase.storage.from('category-images').upload(path, file);
        if (error) {
            console.error('Upload error:', error);
            alert('ไม่สามารถอัปโหลดรูปภาพได้: ' + error.message);
            return;
        }
        url = _supabase.storage.from('category-images').getPublicUrl(path).data.publicUrl;
    }

    const data = { 
        name: document.getElementById('cat-name').value, 
        department: document.getElementById('cat-dept').value, 
        image_url: url 
    };

    if(id) await _supabase.from('categories').update(data).eq('id', id);
    else await _supabase.from('categories').insert([data]);
    await refreshData(); closeCategoryModal();
});

// TOOL MODAL logic
window.openToolModal = (id=null) => {
    document.getElementById('tool-form').reset();
    document.getElementById('edit-tool-id').value = id || '';
    if(id) {
        const t = tools.find(x => x.id == id);
        document.getElementById('tool-code').value = t.tool_code || '';
        document.getElementById('tool-name').value = t.name;
        document.getElementById('tool-dept').value = t.department;
        document.getElementById('tool-total').value = t.total_stock;
        document.getElementById('tool-available').value = t.available_stock;
        document.getElementById('tool-image-url').value = t.image_url;
    }
    updateToolCatList();
    document.getElementById('tool-modal').style.display = 'flex';
}
window.updateToolCatList = () => {
    const dept = document.getElementById('tool-dept').value;
    const sel = document.getElementById('tool-category-id');
    sel.innerHTML = '<option value="">-- เลือกกลุ่ม --</option>';
    categories.filter(c => c.department === dept).forEach(c => sel.innerHTML += `<option value="${c.id}">${c.name}</option>`);
    const id = document.getElementById('edit-tool-id').value;
    if(id) {
        const t = tools.find(x => x.id == id);
        if(t.department === dept) sel.value = t.category_id || '';
    }
}
window.closeToolModal = () => document.getElementById('tool-modal').style.display = 'none';
document.getElementById('tool-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-tool-id').value;
    const toolCode = document.getElementById('tool-code').value.trim();
    
    const isDuplicate = tools.some(t => t.tool_code === toolCode && t.id != id);
    if (isDuplicate) {
        alert('❌ รหัสเครื่องมือนี้มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น');
        return;
    }

    const file = document.getElementById('tool-image-file').files[0];
    let url = document.getElementById('tool-image-url').value;

    if(file) {
        const ext = file.name.split('.').pop();
        const path = `${Date.now()}.${ext}`;
        const { data, error } = await _supabase.storage.from('tool-images').upload(path, file);
        if (error) {
            console.error('Upload error:', error);
            alert('ไม่สามารถอัปโหลดรูปภาพได้: ' + error.message);
            return;
        }
        url = _supabase.storage.from('tool-images').getPublicUrl(path).data.publicUrl;
    }

    const data = { 
        tool_code: toolCode,
        name: document.getElementById('tool-name').value, 
        department: document.getElementById('tool-dept').value, 
        category_id: document.getElementById('tool-category-id').value || null, 
        image_url: url, 
        total_stock: parseInt(document.getElementById('tool-total').value), 
        available_stock: parseInt(document.getElementById('tool-available').value) 
    };

    if(id) await _supabase.from('tools').update(data).eq('id', id);
    else await _supabase.from('tools').insert([data]);
    await refreshData(); closeToolModal();
});

// Common Action & History logic
window.openActionModal = (id, type) => {
    const tool = tools.find(t => t.id == id);
    document.getElementById('action-tool-id').value = id;
    document.getElementById('action-type').value = type;
    document.getElementById('modal-tool-name').value = tool.name;
    document.getElementById('label-user-name').textContent = type === 'BORROW' ? 'ชื่อผู้เบิก' : 'ชื่อผู้คืน';
    document.getElementById('label-receiver-name').textContent = type === 'BORROW' ? 'ชื่อผู้ให้เบิก' : 'ชื่อผู้รับคืน';
    
    // Site selection
    const siteSel = document.getElementById('action-site-id');
    const siteGroup = document.getElementById('site-selection-group');
    if (type === 'BORROW') {
        siteGroup.style.display = 'block';
        siteSel.innerHTML = '<option value="">-- เลือกไซงาน --</option>';
        sites.forEach(s => siteSel.innerHTML += `<option value="${s.id}">${s.name}</option>`);
    } else {
        siteGroup.style.display = 'none';
    }

    document.getElementById('action-modal').style.display = 'flex';
}
window.closeActionModal = () => document.getElementById('action-modal').style.display = 'none';
document.getElementById('action-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('action-tool-id').value;
    const type = document.getElementById('action-type').value;
    const siteId = document.getElementById('action-site-id').value || null;
    const userName = document.getElementById('user-name').value;
    const tool = tools.find(t => t.id == id);
    const qty = parseInt(document.getElementById('quantity').value);
    
    let newStock = type === 'BORROW' ? tool.available_stock - qty : tool.available_stock + qty;
    if (newStock < 0 || newStock > tool.total_stock) return alert('จำนวนไม่ถูกต้อง');
    
    // Update Tool Status
    const toolUpdates = { available_stock: newStock };
    if (type === 'BORROW') {
        toolUpdates.current_site_id = siteId;
        toolUpdates.current_user_name = userName;
    } else {
        // If everything is returned, clear location
        if (newStock === tool.total_stock) {
            toolUpdates.current_site_id = null;
            toolUpdates.current_user_name = null;
        }
    }

    await _supabase.from('tools').update(toolUpdates).eq('id', id);
    await _supabase.from('transactions').insert([{ 
        tool_id: id, 
        site_id: siteId,
        user_name: userName, 
        receiver_name: document.getElementById('receiver-name').value, 
        type: type, 
        quantity: qty 
    }]);
    
    await refreshData(); closeActionModal();
});

window.openHistoryModal = (id) => {
    const t = tools.find(x => x.id == id);
    document.getElementById('history-modal-title').textContent = `ประวัติ: ${t.name}`;
    const list = document.getElementById('tool-history-list');
    list.innerHTML = '';
    allLogs.filter(l => l.tool_id == id).forEach(log => {
        list.innerHTML += `<div class="glass-panel" style="padding:0.75rem; font-size:0.8rem; margin-bottom:0.5rem;">
            <div style="display:flex;justify-content:space-between;">
                <b>${log.type==='BORROW'?'เบิก':'คืน'} ${log.quantity}</b>
                <small style="color:var(--text-muted)">${new Date(log.timestamp).toLocaleString()}</small>
            </div>
            <div>${log.user_name} / ${log.receiver_name||'-'}</div>
            <div style="color:var(--primary); font-size:0.7rem; font-weight:700;">${log.site_name !== '-' ? `📍 ${log.site_name}` : ''}</div>
        </div>`;
    });
    document.getElementById('history-modal').style.display = 'flex';
}
window.closeHistoryModal = () => document.getElementById('history-modal').style.display = 'none';
window.deleteCategory = async (id) => { if(confirm('ลบกลุ่ม?')) { await _supabase.from('categories').delete().eq('id', id); await refreshData(); } }
window.deleteTool = async (id) => { if(confirm('ลบเครื่องมือ?')) { await _supabase.from('tools').delete().eq('id', id); await refreshData(); } }
