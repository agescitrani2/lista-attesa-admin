// ============================================================
//  AGESCI Gruppo Trani 2 — Pannello Admin Capi Scout
// ============================================================

// ---- Stato applicazione ----
let allData        = [];
let filteredData   = [];
let currentPage    = 1;
const PAGE_SIZE    = 20;
let sortField      = 'created_at';
let sortAsc        = false;
let currentEditId  = null;
let currentDetailId= null;
let deleteTargetId = null;
let importRows     = [];
let unsubscribe    = null;

// ---- Login ----
function doLogin() {
    const pass = document.getElementById('loginPass').value;
    const err  = document.getElementById('loginError');
    if (pass === ADMIN_PASSWORD) {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('app').style.display        = 'flex';
        document.getElementById('app').style.flexDirection  = 'column';
        startRealtimeListener();
    } else {
        err.textContent = '❌ Password errata. Riprova.';
        document.getElementById('loginPass').classList.add('error');
        setTimeout(() => {
            err.textContent = '';
            document.getElementById('loginPass').classList.remove('error');
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    startRealtimeListener();
});

function doLogout() {
    if (unsubscribe) unsubscribe();
    document.getElementById('app').style.display        = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginPass').value = '';
    allData = []; filteredData = [];
}

// ---- Sidebar (mobile) ----
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('open');
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('open');
}

// ---- Navigazione pagine ----
function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`page-${name}`).style.display = 'block';
    const navBtn = document.getElementById(`nav-${name}`);
    if (navBtn) navBtn.classList.add('active');
    closeSidebar();
}

// ---- Listener realtime Firestore ----
function startRealtimeListener() {
    document.getElementById('tableBody').innerHTML =
        '<tr class="loading-row"><td colspan="9"><div class="spinner"></div></td></tr>';

    unsubscribe = db.collection('lista_attesa')
        .orderBy('created_at', 'desc')
        .onSnapshot(snapshot => {
            allData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            applyFilters();
            updateBadges();
            populateYearFilter();
        }, err => {
            console.error(err);
            showToast('Errore connessione Firebase: ' + err.message, true);
        });
}

// ---- Filtri e ricerca ----
function applyFilters() {
    const q      = document.getElementById('searchInput').value.toLowerCase();
    const stato  = document.getElementById('filterStato').value;
    const anno   = document.getElementById('filterAnno').value;

    filteredData = allData.filter(r => {
        const b = r.bambino || {};
        const g = r.genitore1 || {};
        const text = `${b.nome} ${b.cognome} ${b.codice_fiscale} ${g.email} ${g.nome} ${g.cognome} ${r.registrationId || ''}`.toLowerCase();

        if (q && !text.includes(q)) return false;
        if (stato && r.stato !== stato) return false;
        if (anno) {
            const y = (b.data_nascita || '').substring(0, 4);
            if (y !== anno) return false;
        }
        return true;
    });

    // Ordinamento
    filteredData.sort((a, b) => {
        let va = getNestedVal(a, sortField) || '';
        let vb = getNestedVal(b, sortField) || '';
        if (va && vb && typeof va === 'object' && va.seconds) {
            va = va.seconds; vb = vb.seconds;
        }
        if (va < vb) return sortAsc ? -1 : 1;
        if (va > vb) return sortAsc ?  1 : -1;
        return 0;
    });

    currentPage = 1;
    renderTable();
    updateSubCount();
    updateDashboard();
}

function resetFilters() {
    document.getElementById('searchInput').value    = '';
    document.getElementById('filterStato').value    = '';
    document.getElementById('filterAnno').value     = '';
    applyFilters();
}

function sortBy(field) {
    if (sortField === field) sortAsc = !sortAsc;
    else { sortField = field; sortAsc = true; }
    applyFilters();
}

function getNestedVal(obj, path) {
    return path.split('.').reduce((o, k) => o?.[k], obj);
}

function populateYearFilter() {
    const years = new Set(allData.map(r => (r.bambino?.data_nascita || '').substring(0, 4)).filter(Boolean));
    const sel = document.getElementById('filterAnno');
    const cur = sel.value;
    sel.innerHTML = '<option value="">Tutti gli anni</option>';
    [...years].sort().reverse().forEach(y => {
        sel.innerHTML += `<option value="${y}" ${cur===y?'selected':''}>${y}</option>`;
    });
}

// ---- Render tabella ----
function renderTable() {
    const tbody = document.getElementById('tableBody');
    const start = (currentPage - 1) * PAGE_SIZE;
    const slice = filteredData.slice(start, start + PAGE_SIZE);

    if (filteredData.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="9">
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <p>Nessuna iscrizione trovata</p>
                </div>
            </td></tr>`;
        renderPagination();
        return;
    }

    tbody.innerHTML = slice.map(r => {
        const b = r.bambino  || {};
        const g = r.genitore1|| {};
        const g2 = r.genitore2|| {};
        const dataNascita = formatDate(b.data_nascita);
        const dataIscr    = formatTimestamp(r.created_at);
        const tel = [g.telefono, g2.telefono].filter(Boolean).join(' / ');
        const fr = r.fratelli_agesci || {};
        const noteDefault = r.note_admin || (fr.presente ? `Parente nel gruppo: ${fr.nome || ''}`.trim() : '');

        return `
        <tr>
            <td style="font-family:monospace;font-size:0.75rem;color:#5A2D9E">${esc(r.registrationId || r.id)}</td>
            <td class="td-name">${esc(b.cognome || '—')} ${esc(b.nome || '')}</td>
            <td class="td-date">${dataNascita}</td>
            <td class="td-date">${dataIscr}</td>
            <td>${esc(r.parrocchia || '—')}</td>
            <td style="font-size:0.82rem">${esc(tel || '—')}</td>
            <td>
                <select class="filter-select" style="padding:4px 6px;font-size:0.75rem"
                        onchange="updateStato('${r.id}',this.value)">
                    <option value="in_attesa"   ${r.stato==='in_attesa'   ?'selected':''}>⏳ In attesa</option>
                    <option value="contattato"  ${r.stato==='contattato'  ?'selected':''}>📞 Contattato</option>
                    <option value="iscritto"    ${r.stato==='iscritto'    ?'selected':''}>✅ Iscritto</option>
                    <option value="rifiutato"   ${r.stato==='rifiutato'   ?'selected':''}>❌ Rifiutato</option>
                </select>
            </td>
            <td>
                <textarea class="note-cell" rows="2"
                    onblur="saveNote('${r.id}', this)"
                    onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.blur()}"
                    placeholder="…">${esc(noteDefault)}</textarea>
            </td>
            <td>
                <div class="action-btns">
                    <button class="action-btn view"   onclick="viewDetail('${r.id}')">👁</button>
                    <button class="action-btn edit"   onclick="openEdit('${r.id}')">✏️</button>
                    <button class="action-btn delete" onclick="askDelete('${r.id}')">🗑</button>
                </div>
            </td>
        </tr>`;
    }).join('');

    renderPagination();
}

function renderPagination() {
    const total = filteredData.length;
    const pages = Math.ceil(total / PAGE_SIZE);
    const bar   = document.getElementById('paginationBar');

    if (pages <= 1) { bar.innerHTML = `<span>${total} iscrizioni</span>`; return; }

    let btns = '';
    for (let i = 1; i <= pages; i++) {
        btns += `<button class="page-btn ${i===currentPage?'active':''}" onclick="goPage(${i})">${i}</button>`;
    }
    bar.innerHTML = `
        <span>${total} iscrizioni · pagina ${currentPage} di ${pages}</span>
        <div class="page-btns">
            <button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>
            ${btns}
            <button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage===pages?'disabled':''}>›</button>
        </div>`;
}

function goPage(n) {
    currentPage = n;
    renderTable();
    document.querySelector('.main-content').scrollTo({ top: 0, behavior: 'smooth' });
}

// ---- Update stato direttamente dalla tabella ----
async function updateStato(id, stato) {
    try {
        await db.collection('lista_attesa').doc(id).update({ stato });
        showToast('Stato aggiornato ✓');
    } catch (e) {
        showToast('Errore: ' + e.message, true);
    }
}

// ---- Salva nota inline ----
async function saveNote(id, el) {
    const nota = el.value.trim();
    const r = allData.find(x => x.id === id);
    if (!r || nota === (r.note_admin || '')) return;
    try {
        await db.collection('lista_attesa').doc(id).update({ note_admin: nota });
        el.classList.add('note-saved');
        setTimeout(() => el.classList.remove('note-saved'), 1000);
    } catch (e) {
        showToast('Errore salvataggio nota: ' + e.message, true);
    }
}

// ---- Visualizza dettaglio ----
function viewDetail(id) {
    currentDetailId = id;
    const r = allData.find(x => x.id === id);
    if (!r) return;

    const b  = r.bambino  || {};
    const g1 = r.genitore1|| {};
    const g2 = r.genitore2|| null;
    const fr = r.fratelli_agesci || {};
    const pr = r.privacy  || {};

    document.getElementById('detailModalTitle').textContent =
        `👤 ${b.nome || ''} ${b.cognome || ''}`;

    document.getElementById('detailModalBody').innerHTML = `
        <div class="detail-section">
            <div class="detail-section-title">🧒 Ragazzo/a</div>
            <dl class="detail-grid">
                <dt>Nome</dt><dd>${esc(b.nome||'—')}</dd>
                <dt>Cognome</dt><dd>${esc(b.cognome||'—')}</dd>
                <dt>Nato/a a</dt><dd>${esc(b.luogo_nascita||'—')}</dd>
                <dt>Data nascita</dt><dd>${formatDate(b.data_nascita)}</dd>
                <dt>Codice fiscale</dt><dd>${esc(b.codice_fiscale||'—')}</dd>
                <dt>Residente a</dt><dd>${esc(b.residente_a||'—')}</dd>
                <dt>Via/Piazza</dt><dd>${esc(b.via||'—')}</dd>
                <dt>Parrocchia</dt><dd>${esc(r.parrocchia||'—')}</dd>
            </dl>
        </div>
        ${fr.presente ? `<div class="detail-section"><div class="detail-section-title">👨‍👩‍👧 Fratelli/Sorelle AGESCI</div><p style="font-size:0.84rem">Sì — ${esc(fr.nome||'')}</p></div>` : ''}
        <div class="detail-section">
            <div class="detail-section-title">👤 Genitore 1</div>
            <dl class="detail-grid">
                <dt>Nome</dt><dd>${esc(g1.nome||'—')}</dd>
                <dt>Cognome</dt><dd>${esc(g1.cognome||'—')}</dd>
                <dt>Email</dt><dd>${esc(g1.email||'—')}</dd>
                <dt>Telefono</dt><dd>${esc(g1.telefono||'—')}</dd>
                <dt>Nato/a a</dt><dd>${esc(g1.luogo_nascita||'—')}</dd>
                <dt>Data nascita</dt><dd>${formatDate(g1.data_nascita)}</dd>
                <dt>Codice fiscale</dt><dd>${esc(g1.codice_fiscale||'—')}</dd>
                <dt>Indirizzo</dt><dd>${esc(g1.via||'')} ${esc(g1.numero||'')} — ${esc(g1.citta||'')} (${esc(g1.provincia||'')}) ${esc(g1.cap||'')}</dd>
            </dl>
        </div>
        ${g2 ? `
        <div class="detail-section">
            <div class="detail-section-title">👤 Genitore 2</div>
            <dl class="detail-grid">
                <dt>Nome</dt><dd>${esc(g2.nome||'—')}</dd>
                <dt>Cognome</dt><dd>${esc(g2.cognome||'—')}</dd>
                <dt>Email</dt><dd>${esc(g2.email||'—')}</dd>
                <dt>Telefono</dt><dd>${esc(g2.telefono||'—')}</dd>
            </dl>
        </div>` : ''}
        ${r.motivazione ? `<div class="detail-section"><div class="detail-section-title">💬 Motivazione</div><p style="font-size:0.84rem;color:#555">${esc(r.motivazione)}</p></div>` : ''}
        ${r.hobby ? `<div class="detail-section"><div class="detail-section-title">🎯 Hobby</div><p style="font-size:0.84rem;color:#555">${esc(r.hobby)}</p></div>` : ''}
        ${r.altre_info ? `<div class="detail-section"><div class="detail-section-title">📌 Altre info</div><p style="font-size:0.84rem;color:#555">${esc(r.altre_info)}</p></div>` : ''}
        <div class="detail-section">
            <div class="detail-section-title">🔒 Privacy & Stato</div>
            <dl class="detail-grid">
                <dt>Consenso</dt><dd>${pr.consenso ? '✅ Dato' : '❌ Negato'}</dd>
                <dt>Data domanda</dt><dd>${pr.data_presentazione || formatDate(r.created_at?.toDate?.()?.toISOString?.()?.split('T')[0])}</dd>
                <dt>Stato</dt><dd>${badgeHtml(r.stato||'in_attesa')}</dd>
                <dt>ID</dt><dd style="font-family:monospace;font-size:0.78rem">${r.registrationId||r.id}</dd>
            </dl>
        </div>
        ${r.note_admin ? `<div class="detail-section"><div class="detail-section-title">📝 Note admin</div><p style="font-size:0.84rem;color:#555">${esc(r.note_admin)}</p></div>` : ''}
    `;

    openModal('detailModal');
}

function openEditFromDetail() {
    closeModal('detailModal');
    openEdit(currentDetailId);
}

// ---- Modifica iscrizione ----
function openEdit(id) {
    currentEditId = id;
    const r = allData.find(x => x.id === id);
    if (!r) return;
    const b  = r.bambino  || {};
    const g1 = r.genitore1|| {};
    const g2 = r.genitore2|| {};

    document.getElementById('editModalBody').innerHTML = `
        <h4 style="font-size:0.82rem;color:#888;margin-bottom:12px">Modifica dati principali</h4>
        <div class="edit-grid">
            <div class="form-group">
                <label>Nome bambino</label>
                <input id="e_bNome" value="${esc(b.nome||'')}">
            </div>
            <div class="form-group">
                <label>Cognome bambino</label>
                <input id="e_bCognome" value="${esc(b.cognome||'')}">
            </div>
            <div class="form-group">
                <label>Data nascita bambino</label>
                <input type="date" id="e_bData" value="${b.data_nascita||''}">
            </div>
            <div class="form-group">
                <label>Luogo nascita</label>
                <input id="e_bLuogo" value="${esc(b.luogo_nascita||'')}">
            </div>
            <div class="form-group">
                <label>Codice fiscale bambino</label>
                <input id="e_bCF" value="${esc(b.codice_fiscale||'')}" maxlength="16" style="text-transform:uppercase">
            </div>
            <div class="form-group">
                <label>Parrocchia</label>
                <input id="e_parrocchia" value="${esc(r.parrocchia||'')}">
            </div>
            <div class="form-group">
                <label>Email genitore 1</label>
                <input type="email" id="e_g1Email" value="${esc(g1.email||'')}">
            </div>
            <div class="form-group">
                <label>Telefono genitore 1</label>
                <input id="e_g1Tel" value="${esc(g1.telefono||'')}">
            </div>
            <div class="form-group">
                <label>Stato</label>
                <select id="e_stato">
                    <option value="in_attesa"   ${r.stato==='in_attesa'?'selected':''}>⏳ In attesa</option>
                    <option value="contattato"  ${r.stato==='contattato'?'selected':''}>📞 Contattato</option>
                    <option value="iscritto"    ${r.stato==='iscritto'?'selected':''}>✅ Iscritto</option>
                    <option value="rifiutato"   ${r.stato==='rifiutato'?'selected':''}>❌ Rifiutato</option>
                </select>
            </div>
            <div class="form-group full">
                <label>Note admin</label>
                <textarea id="e_note" rows="3">${esc(r.note_admin||'')}</textarea>
            </div>
        </div>
    `;
    openModal('editModal');
}

async function saveEdit() {
    if (!currentEditId) return;
    const r = allData.find(x => x.id === currentEditId);
    if (!r) return;

    const update = {
        'bambino.nome':          document.getElementById('e_bNome').value.trim(),
        'bambino.cognome':       document.getElementById('e_bCognome').value.trim(),
        'bambino.data_nascita':  document.getElementById('e_bData').value,
        'bambino.luogo_nascita': document.getElementById('e_bLuogo').value.trim(),
        'bambino.codice_fiscale':document.getElementById('e_bCF').value.trim().toUpperCase(),
        'parrocchia':            document.getElementById('e_parrocchia').value.trim(),
        'genitore1.email':       document.getElementById('e_g1Email').value.trim().toLowerCase(),
        'genitore1.telefono':    document.getElementById('e_g1Tel').value.trim(),
        'stato':                 document.getElementById('e_stato').value,
        'note_admin':            document.getElementById('e_note').value.trim(),
    };

    try {
        await db.collection('lista_attesa').doc(currentEditId).update(update);
        closeModal('editModal');
        showToast('Modifiche salvate ✓');
    } catch (e) {
        showToast('Errore: ' + e.message, true);
    }
}

// ---- Elimina ----
function askDelete(id) {
    deleteTargetId = id;
    const r = allData.find(x => x.id === id);
    const b = r?.bambino || {};
    document.getElementById('deleteNameLabel').textContent = `${b.nome||''} ${b.cognome||''}`;
    openModal('deleteModal');
}

async function confirmDelete() {
    if (!deleteTargetId) return;
    try {
        await db.collection('lista_attesa').doc(deleteTargetId).delete();
        closeModal('deleteModal');
        showToast('Iscrizione eliminata');
        deleteTargetId = null;
    } catch (e) {
        showToast('Errore: ' + e.message, true);
    }
}

// ---- Export Excel ----
function exportAll() {
    if (filteredData.length === 0) {
        showToast('Nessun dato da esportare', true);
        return;
    }

    const tuttiICampi = document.getElementById('exportAllFields').checked;

    const rows = filteredData.map(r => {
        const b  = r.bambino  || {};
        const g1 = r.genitore1|| {};
        const g2 = r.genitore2|| {};
        const pr = r.privacy  || {};
        const tel = [g1.telefono, g2.telefono].filter(Boolean).join(' / ');

        if (!tuttiICampi) {
            return {
                'Codice':             r.registrationId || r.id,
                'Cognome e Nome':     `${b.cognome||''} ${b.nome||''}`.trim(),
                'Data nascita':       formatDate(b.data_nascita),
                'Data iscrizione':    formatTimestamp(r.created_at),
                'Parrocchia':         r.parrocchia    || '',
                'Telefono':           tel,
                'Stato':              r.stato         || 'in_attesa',
            };
        }

        return {
            'ID':                     r.registrationId || r.id,
            'Cognome bambino':        b.cognome || '',
            'Nome bambino':           b.nome    || '',
            'Data nascita':           b.data_nascita  || '',
            'Luogo nascita':          b.luogo_nascita || '',
            'CF bambino':             b.codice_fiscale|| '',
            'Residente a':            b.residente_a   || '',
            'Via bambino':            b.via           || '',
            'Parrocchia':             r.parrocchia    || '',
            'Motivazione':            r.motivazione   || '',
            'Hobby':                  r.hobby         || '',
            'Altre info':             r.altre_info    || '',
            'Fratelli AGESCI':        r.fratelli_agesci?.presente ? 'Sì' : 'No',
            'Nome fratello/sorella':  r.fratelli_agesci?.nome     || '',
            'Nome genitore 1':        g1.nome         || '',
            'Cognome genitore 1':     g1.cognome      || '',
            'Luogo nascita g1':       g1.luogo_nascita|| '',
            'Data nascita g1':        g1.data_nascita || '',
            'CF genitore 1':          g1.codice_fiscale||'',
            'Via genitore 1':         `${g1.via||''} ${g1.numero||''}`.trim(),
            'Città genitore 1':       g1.citta        || '',
            'Provincia g1':           g1.provincia    || '',
            'CAP genitore 1':         g1.cap          || '',
            'Email genitore 1':       g1.email        || '',
            'Telefono genitore 1':    g1.telefono     || '',
            'Nome genitore 2':        g2.nome         || '',
            'Cognome genitore 2':     g2.cognome      || '',
            'Email genitore 2':       g2.email        || '',
            'Telefono genitore 2':    g2.telefono     || '',
            'Privacy consenso':       pr.consenso ? 'SI' : 'NO',
            'Data presentazione':     pr.data_presentazione || '',
            'Luogo presentazione':    pr.luogo        || '',
            'Stato':                  r.stato         || 'in_attesa',
            'Note admin':             r.note_admin    || '',
            'Data iscrizione web':    formatTimestamp(r.created_at),
            'Importato':              r.imported ? 'Sì' : 'No',
        };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lista Attesa');

    // Larghezze colonne
    const colWidths = Object.keys(rows[0]).map(() => ({ wch: 20 }));
    ws['!cols'] = colWidths;

    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `lista_attesa_trani2_${date}.xlsx`);
    showToast(`Esportate ${rows.length} righe ✓`);
}

// ---- Genera template Excel ----
function generateTemplate() {
    const headers = [
        'nome_bambino','cognome_bambino','data_nascita','luogo_nascita',
        'codice_fiscale_bambino','residente_a','via_bambino',
        'nome_genitore1','cognome_genitore1','email_genitore1','telefono_genitore1',
        'nome_genitore2','cognome_genitore2','email_genitore2','telefono_genitore2',
        'parrocchia','motivazione','hobby','altre_info',
        'fratelli_agesci','nome_fratello',
        'data_presentazione','privacy'
    ];
    const example = [
        'Luca','Rossi','2019-03-15','Trani',
        'RSSLCU19C15L328Z','Trani','Via Roma 10',
        'Mario','Rossi','mario.rossi@email.it','320 1234567',
        'Anna','Verdi','anna.verdi@email.it','340 7654321',
        'S. M. delle Grazie','Voglio fare nuove esperienze','Calcio, lettura','Nessuna allergia',
        'No','',
        '2026-01-10','SI'
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws['!cols'] = headers.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'template_importazione_lista_attesa.xlsx');
    showToast('Template scaricato ✓');
}

// ---- Import Excel ----
let importParsedData = [];

function handleDragOver(e) {
    e.preventDefault();
    document.getElementById('importZone').classList.add('drag-over');
}

function handleDragLeave() {
    document.getElementById('importZone').classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    document.getElementById('importZone').classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) parseExcelFile(file);
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) parseExcelFile(file);
}

function parseExcelFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
        const data = new Uint8Array(e.target.result);
        const wb   = XLSX.read(data, { type: 'array', cellDates: true, dateNF: 'DD/MM/YYYY' });

        // Legge tutti i fogli e li unisce
        let allRows = [];
        wb.SheetNames.forEach(sheetName => {
            const ws   = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '', dateNF: 'DD/MM/YYYY' });
            allRows = allRows.concat(rows);
        });

        importParsedData = allRows;
        showImportPreview(allRows, wb.SheetNames);
    };
    reader.readAsArrayBuffer(file);
}

function showImportPreview(rows, sheetNames) {
    if (rows.length === 0) {
        showToast('Il file è vuoto', true);
        return;
    }

    const preview = document.getElementById('importPreview');
    const thead   = document.getElementById('previewHead');
    const tbody   = document.getElementById('previewBody');

    const keys = Object.keys(rows[0]);
    thead.innerHTML = `<tr>${keys.map(k => `<th style="background:#F5F0FF;padding:8px;white-space:nowrap;color:#3D1B6B;font-size:0.75rem">${k}</th>`).join('')}</tr>`;

    const previewRows = rows.slice(0, 5);
    tbody.innerHTML = previewRows.map(row =>
        `<tr>${keys.map(k => `<td style="padding:6px 8px;border-bottom:1px solid #F0EAF8;font-size:0.75rem">${esc(String(row[k]||''))}</td>`).join('')}</tr>`
    ).join('');

    const fogli = sheetNames ? ` · ${sheetNames.length} fogl${sheetNames.length === 1 ? 'io' : 'i'}: ${sheetNames.join(', ')}` : '';
    document.getElementById('importPreviewTitle').textContent = `Anteprima: prime 5 righe di ${rows.length} totali${fogli}`;
    document.getElementById('importCount').textContent = rows.length;
    preview.style.display = 'block';
}

function cancelImport() {
    document.getElementById('importPreview').style.display = 'none';
    document.getElementById('fileInput').value = '';
    importParsedData = [];
}

function detectImportFormat(rows) {
    const keys = Object.keys(rows[0]).map(k => k.toLowerCase().trim());
    const isOld = keys.some(k => k === 'cognome' || k === 'nome') &&
                  !keys.some(k => k === 'nome_bambino' || k === 'cognome_bambino');
    return isOld ? 'vecchio' : 'nuovo';
}

function normalizeStatoVecchio(val) {
    const v = (val || '').toLowerCase().trim();
    if (v === 'preso' || v === 'si' || v === 'sì' || v === 'iscritto') return 'iscritto';
    if (v === 'uscito' || v === 'no' || v === 'rifiutato') return 'rifiutato';
    return 'in_attesa';
}

function isPhoneNumber(val) {
    return /^[\d\s\+\-\/\(\)\.]{6,}$/.test(val);
}

function dateStrToTimestamp(dateStr) {
    const normalized = normalizeDate(dateStr);
    if (!normalized) return firebase.firestore.Timestamp.now();
    const d = new Date(normalized + 'T00:00:00');
    return isNaN(d.getTime()) ? firebase.firestore.Timestamp.now() : firebase.firestore.Timestamp.fromDate(d);
}

function isRowEmpty(row) {
    return Object.values(row).every(v => (v || '').toString().trim() === '');
}

function buildDocVecchio(row) {
    const g = k => {
        const found = Object.keys(row).find(kk => kk.toLowerCase().trim() === k.toLowerCase());
        return found ? (row[found] || '').toString().trim() : '';
    };

    const parente    = g('parente');
    const dataIscr   = normalizeDate(g('data iscrizione') || g('data_iscrizione'));
    let telefono     = g('telefono');
    let noteAdmin    = '';

    // Se "parente" è un numero di telefono → va nel campo telefono (se vuoto), altrimenti nota
    if (parente) {
        if (isPhoneNumber(parente) && !telefono) {
            telefono  = parente;
        } else if (!isPhoneNumber(parente)) {
            noteAdmin = `Parente nel gruppo: ${parente}`;
        }
    }

    return {
        _created_at_str: dataIscr,
        bambino: {
            nome:           g('nome'),
            cognome:        g('cognome'),
            data_nascita:   normalizeDate(g('data nascita') || g('data_nascita')),
            luogo_nascita:  '',
            codice_fiscale: '',
            residente_a:    'Trani',
            via:            g('indirizzo'),
        },
        genitore1: {
            nome: '', cognome: '', email: '',
            telefono,
            luogo_nascita: '', data_nascita: '', codice_fiscale: '',
            via: '', numero: '', citta: '', provincia: '', cap: ''
        },
        genitore2: null,
        fratelli_agesci: {
            presente: !!(parente && !isPhoneNumber(parente)),
            nome:     (!isPhoneNumber(parente) ? parente : '')
        },
        parrocchia:  g('parrocchia'),
        motivazione: '', hobby: '', altre_info: '',
        privacy: {
            consenso: true,
            data_presentazione: dataIscr,
            luogo: 'Trani'
        },
        stato:      normalizeStatoVecchio(g('preso/uscito') || g('preso uscito')),
        note_admin: noteAdmin,
    };
}

function buildDocNuovo(row) {
    const g = k => (row[k] || row[k.toLowerCase()] || row[Object.keys(row).find(kk => kk.toLowerCase().replace(/\s/g,'_') === k.toLowerCase().replace(/\s/g,'_'))] || '').toString().trim();
    return {
        bambino: {
            nome:           g('nome_bambino'),
            cognome:        g('cognome_bambino'),
            data_nascita:   normalizeDate(g('data_nascita')),
            luogo_nascita:  g('luogo_nascita'),
            codice_fiscale: g('codice_fiscale_bambino').toUpperCase(),
            residente_a:    g('residente_a'),
            via:            g('via_bambino'),
        },
        genitore1: {
            nome:    g('nome_genitore1'),
            cognome: g('cognome_genitore1'),
            email:   g('email_genitore1').toLowerCase(),
            telefono:g('telefono_genitore1'),
            luogo_nascita: '', data_nascita: '', codice_fiscale: '',
            via: '', numero: '', citta: '', provincia: '', cap: ''
        },
        genitore2: g('nome_genitore2') ? {
            nome:    g('nome_genitore2'),
            cognome: g('cognome_genitore2'),
            email:   g('email_genitore2').toLowerCase(),
            telefono:g('telefono_genitore2'),
            luogo_nascita: '', data_nascita: '', codice_fiscale: '',
            via: '', numero: '', citta: '', provincia: '', cap: ''
        } : null,
        fratelli_agesci: {
            presente: g('fratelli_agesci').toLowerCase() === 'si' || g('fratelli_agesci').toLowerCase() === 'sì',
            nome: g('nome_fratello')
        },
        parrocchia:  g('parrocchia'),
        motivazione: g('motivazione'),
        hobby:       g('hobby'),
        altre_info:  g('altre_info'),
        privacy: {
            consenso: g('privacy').toLowerCase() === 'si' || g('privacy').toLowerCase() === 'sì',
            data_presentazione: normalizeDate(g('data_presentazione')),
            luogo: 'Trani'
        },
        stato:      'in_attesa',
        note_admin: '',
    };
}

async function confirmImport() {
    if (!importParsedData.length) return;

    const btn = document.getElementById('importConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'Importazione in corso…';

    const formato    = detectImportFormat(importParsedData);
    const righeValide = importParsedData.filter(row => !isRowEmpty(row));
    let successCount = 0;
    let errorCount   = 0;
    let batch        = db.batch();
    let batchCount   = 0;

    for (const row of righeValide) {
        const id    = 'IMP-' + Math.random().toString(36).substring(2, 9).toUpperCase();
        const campi = formato === 'vecchio' ? buildDocVecchio(row) : buildDocNuovo(row);

        // Usa la data dell'Excel come created_at, non la data odierna
        const createdAt = campi._created_at_str
            ? dateStrToTimestamp(campi._created_at_str)
            : firebase.firestore.Timestamp.now();
        const { _created_at_str, ...campiPuliti } = campi;

        const docData = {
            registrationId: id,
            tipo_genitore:  campiPuliti.genitore2 ? 'entrambi' : 'unico',
            ...campiPuliti,
            imported:   true,
            created_at: createdAt
        };

        batch.set(db.collection('lista_attesa').doc(id), docData);
        batchCount++;
        successCount++;

        if (batchCount >= 400) {
            await batch.commit();
            batch      = db.batch();
            batchCount = 0;
        }
    }

    if (batchCount > 0) {
        try {
            await batch.commit();
        } catch (e) {
            errorCount = importParsedData.length - successCount;
            successCount -= errorCount;
        }
    }

    const saltate = importParsedData.length - righeValide.length;
    btn.disabled = false;
    btn.innerHTML = `✅ Importa <span id="importCount">${righeValide.length}</span> righe`;
    cancelImport();
    showToast(`Importate ${successCount} iscrizioni${saltate ? ` (${saltate} righe vuote saltate)` : ''} ✓`);
    showPage('lista');
}

function normalizeDate(val) {
    if (!val) return '';
    const s = val.toString().trim();
    // già YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // DD/MM/YYYY o DD-MM-YYYY o DD.MM.YYYY
    const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    // YYYY/MM/DD
    const m2 = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
    if (m2) return `${m2[1]}-${m2[2].padStart(2,'0')}-${m2[3].padStart(2,'0')}`;
    // Data JS stringa (es. "Thu Jan 15 2015 ...")
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    return s;
}

// ---- Dashboard ----
function updateDashboard() {
    const total      = allData.length;
    const attesa     = allData.filter(r => (r.stato||'in_attesa') === 'in_attesa').length;
    const iscritto   = allData.filter(r => r.stato === 'iscritto').length;
    const contattato = allData.filter(r => r.stato === 'contattato').length;
    const rifiutato  = allData.filter(r => r.stato === 'rifiutato').length;

    document.getElementById('statTot').textContent       = total;
    document.getElementById('statAttesa').textContent    = attesa;
    document.getElementById('statIscritto').textContent  = iscritto;
    document.getElementById('statContattato').textContent= contattato;
    document.getElementById('statRifiutato').textContent = rifiutato;

    // Grafico nascite per anno
    const byYear = {};
    allData.forEach(r => {
        const y = (r.bambino?.data_nascita||'').substring(0, 4);
        if (y) byYear[y] = (byYear[y]||0) + 1;
    });

    const sorted = Object.entries(byYear).sort((a,b) => a[0].localeCompare(b[0]));
    const maxVal = Math.max(...sorted.map(x => x[1]), 1);

    const chart = sorted.map(([year, count]) => {
        const pct = Math.round((count / maxVal) * 100);
        return `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
                <span style="width:40px;font-weight:700;color:#3D1B6B">${year}</span>
                <div style="flex:1;background:#F0EAF8;border-radius:4px;height:22px;overflow:hidden">
                    <div style="width:${pct}%;background:#3D1B6B;height:100%;border-radius:4px;
                                display:flex;align-items:center;padding-left:8px">
                        <span style="color:#fff;font-size:0.75rem;font-weight:700">${count}</span>
                    </div>
                </div>
            </div>`;
    }).join('');

    document.getElementById('birthYearChart').innerHTML = chart || '<p style="color:#aaa">Nessun dato disponibile</p>';
}

// ---- Badge & Helper ----
function badgeHtml(stato) {
    const map = {
        'in_attesa':   ['badge-attesa',     '⏳ In attesa'],
        'contattato':  ['badge-contattato', '📞 Contattato'],
        'iscritto':    ['badge-iscritto',   '✅ Iscritto'],
        'rifiutato':   ['badge-rifiutato',  '❌ Rifiutato'],
    };
    const [cls, label] = map[stato] || ['badge-attesa', '⏳ In attesa'];
    return `<span class="badge ${cls}">${label}</span>`;
}

function updateBadges() {
    document.getElementById('badgeTotal').textContent = allData.length;
}

function updateSubCount() {
    const n = filteredData.length;
    document.getElementById('subCount').textContent =
        n === allData.length ? `${n} iscrizioni totali` : `${n} di ${allData.length} iscrizioni`;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return d && m && y ? `${d}/${m}/${y}` : dateStr;
}

function formatTimestamp(ts) {
    if (!ts) return '—';
    if (ts.toDate) {
        const d = ts.toDate();
        return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
    }
    return '—';
}

function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- Modals ----
function openModal(id) {
    if (id === 'clearModal') {
        document.getElementById('clearCount').textContent = allData.length;
    }
    document.getElementById(id).classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    document.getElementById(id).classList.remove('open');
    document.body.style.overflow = '';
}

// Chiudi modal cliccando fuori
document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) {
        closeModal(e.target.id);
    }
});

// ---- Svuota lista ----
async function confirmClearAll() {
    closeModal('clearModal');
    showToast('Eliminazione in corso…');

    const snapshot = await db.collection('lista_attesa').get();
    let batch = db.batch();
    let count = 0;

    for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        count++;
        if (count % 400 === 0) {
            await batch.commit();
            batch = db.batch();
        }
    }
    if (count % 400 !== 0) await batch.commit();

    showToast(`Eliminati ${count} record ✓`);
}

// ---- Toast ----
function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className   = 'toast' + (isError ? ' error' : '') + ' show';
    setTimeout(() => t.classList.remove('show'), 3500);
}
