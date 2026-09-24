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
let currentDetailId= null;
let deleteTargetId = null;
let importRows     = [];
let unsubscribe    = null;
let filtersActive  = false;

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
        err.textContent = 'Password errata. Riprova.';
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

// ---- Navigazione pagine ----
function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`page-${name}`).style.display = 'block';
    const navBtn = document.getElementById(`nav-${name}`);
    if (navBtn) navBtn.classList.add('active');
}

// ---- Listener realtime Firestore ----
function startRealtimeListener() {
    document.getElementById('tableWrapper').classList.remove('table-empty');
    document.getElementById('tableBody').innerHTML =
        '<tr class="loading-row"><td colspan="7"><div class="spinner"></div></td></tr>';

    unsubscribe = db.collection('lista_attesa')
        .orderBy('created_at', 'desc')
        .onSnapshot(snapshot => {
            allData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            applyFilters();
            populateYearFilter();
        }, err => {
            console.error(err);
            showToast('Errore connessione Firebase: ' + err.message, true);
        });
}

// ---- Filtri e ricerca ----
function applyFilters() {
    const q      = document.getElementById('searchInput').value.toLowerCase();
    const anno   = document.getElementById('filterAnno').value;

    filtersActive = !!(q || anno);
    currentPage = 1;

    if (!filtersActive) {
        filteredData = [];
        renderTable();
        return;
    }

    filteredData = allData.filter(r => {
        const b = r.bambino || {};
        const g = r.genitore1 || {};
        const text = `${b.nome} ${b.cognome} ${b.codice_fiscale} ${g.email} ${g.nome} ${g.cognome}`.toLowerCase();

        if (q && !text.includes(q)) return false;
        if (anno) {
            const y = (b.data_nascita || '').substring(0, 4);
            if (y !== anno) return false;
        }
        return true;
    });

    // Ordinamento: 1) chi ha parenti già in AGESCI, 2) parrocchia S. Maria delle Grazie, 3) data iscrizione
    filteredData.sort((a, b) => {
        const pa = hasAgesciSibling(a) ? 0 : 1;
        const pb = hasAgesciSibling(b) ? 0 : 1;
        if (pa !== pb) return pa - pb;

        const qa = isParrocchiaSMG(a) ? 0 : 1;
        const qb = isParrocchiaSMG(b) ? 0 : 1;
        if (qa !== qb) return qa - qb;

        let va = getNestedVal(a, sortField) || '';
        let vb = getNestedVal(b, sortField) || '';
        if (va && vb && typeof va === 'object' && va.seconds) {
            va = va.seconds; vb = vb.seconds;
        }
        if (va < vb) return sortAsc ? -1 : 1;
        if (va > vb) return sortAsc ?  1 : -1;
        return 0;
    });

    renderTable();
}

// ---- Rileva se il ragazzo ha già fratelli/sorelle in AGESCI ----
// (dal campo strutturato, oppure da un riferimento trovato nelle note admin
//  per i vecchi record importati dove l'informazione era scritta solo in nota)
function hasAgesciSibling(r) {
    if (r.fratelli_agesci?.presente) return true;
    const note = (r.note_admin || '').toLowerCase();
    return note.includes('fratel') || note.includes('sorell') || note.includes('parente nel gruppo');
}

// ---- Rileva se la parrocchia è Santa Maria delle Grazie (anche abbreviata) ----
function isParrocchiaSMG(r) {
    const p = (r.parrocchia || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!p) return false;
    return p === 'smg'
        || p === 'smdg'
        || p.includes('santamariadellegrazie')
        || p.includes('smdellegrazie')
        || (p.startsWith('s') && p.includes('mariadellegrazie'));
}

// ---- Rileva anomalie nei dati dell'iscrizione ----
function getAnomalie(r) {
    const b  = r.bambino  || {};
    const g1 = r.genitore1|| {};
    const pr = r.privacy  || {};
    const anomalie = [];

    if (!g1.email && !g1.telefono) {
        anomalie.push('Nessun recapito per il genitore 1: manca sia email che telefono.');
    }
    if (!b.codice_fiscale || b.codice_fiscale.length !== 16) {
        anomalie.push('Codice fiscale del ragazzo/a mancante o non valido.');
    }
    if (!b.data_nascita) {
        anomalie.push('Data di nascita del ragazzo/a mancante.');
    }
    if (!pr.consenso) {
        anomalie.push('Consenso privacy non dato.');
    }

    return anomalie;
}

function resetFilters() {
    document.getElementById('searchInput').value    = '';
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

// ---- Mostra il messaggio di tabella vuota (dentro la tabella da tablet in su;
//      su mobile la tabella viene nascosta via CSS e si vede solo il messaggio a parte) ----
function showEmptyTable(message) {
    document.getElementById('tableWrapper').classList.add('table-empty');
    document.getElementById('tableBody').innerHTML = `
        <tr><td colspan="7">
            <div class="empty-state">
                <p>${esc(message)}</p>
            </div>
        </td></tr>`;
    document.getElementById('tableEmptyMobileText').textContent = message;
    document.getElementById('paginationBar').innerHTML = '';
}

// ---- Render tabella ----
function renderTable() {
    const tbody = document.getElementById('tableBody');
    const start = (currentPage - 1) * PAGE_SIZE;
    const slice = filteredData.slice(start, start + PAGE_SIZE);

    if (!filtersActive) {
        showEmptyTable('Seleziona un anno o digita il nome del ragazzo per visualizzare i dati');
        return;
    }

    if (filteredData.length === 0) {
        showEmptyTable('Nessuna iscrizione trovata');
        return;
    }

    document.getElementById('tableWrapper').classList.remove('table-empty');

    tbody.innerHTML = slice.map(r => {
        const b = r.bambino  || {};
        const g = r.genitore1|| {};
        const g2 = r.genitore2|| {};
        const anno = (b.data_nascita || '').substring(0, 4) || '—';
        const dataIscr = formatTimestamp(r.created_at);
        const tel = [g.telefono, g2.telefono].filter(Boolean).join(' / ');
        const priorita = hasAgesciSibling(r)
            ? '<span class="priority-badge" title="Ha già un fratello/sorella in AGESCI">Parente negli scout</span>' : '';

        return `
        <tr>
            <td class="td-name">${esc(b.nome || '—')}</td>
            <td class="td-name">${esc(b.cognome || '—')}${priorita}</td>
            <td class="td-date">${anno}</td>
            <td class="td-date">${dataIscr}</td>
            <td>${esc(r.parrocchia || '—')}</td>
            <td style="font-size:0.82rem">${esc(tel || '—')}</td>
            <td>
                <button class="action-icon-btn" title="Apri scheda" onclick="viewDetail('${r.id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 3h7v7"/><path d="M10 14 21 3"/>
                        <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>
                    </svg>
                </button>
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

// ---- Visualizza / modifica dettaglio (scheda anagrafica a tab) ----
function viewDetail(id) {
    currentDetailId = id;
    const r = allData.find(x => x.id === id);
    if (!r) return;

    const b  = r.bambino  || {};
    const g1 = r.genitore1|| {};
    const g2 = r.genitore2|| null;
    const fr = r.fratelli_agesci || {};
    const pr = r.privacy  || {};

    document.getElementById('detailModalTitle').textContent = `${b.nome || ''} ${b.cognome || ''}`.trim() || 'Dettaglio iscrizione';
    document.getElementById('detailModalAvatar').textContent = (b.nome || '?').trim().charAt(0).toUpperCase();

    const anomalie = getAnomalie(r);
    document.getElementById('detailModalAlert').innerHTML = anomalie.length ? `
        <div class="alert-box alert-red">
            <strong>Anomalie rilevate:</strong>
            <ul>${anomalie.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
        </div>` : '';

    document.getElementById('detailModalBody').innerHTML = `
        <div class="modal-tab-panel active" data-tab="ragazzo">
            <div class="edit-grid">
                <div class="form-group">
                    <label>Nome</label>
                    <input id="d_bNome" value="${esc(b.nome||'')}">
                </div>
                <div class="form-group">
                    <label>Cognome</label>
                    <input id="d_bCognome" value="${esc(b.cognome||'')}">
                </div>
                <div class="form-group">
                    <label>Luogo di nascita</label>
                    <input id="d_bLuogo" value="${esc(b.luogo_nascita||'')}">
                </div>
                <div class="form-group">
                    <label>Data di nascita</label>
                    <input type="date" id="d_bData" value="${b.data_nascita||''}">
                </div>
                <div class="form-group">
                    <label>Codice fiscale</label>
                    <input id="d_bCF" value="${esc(b.codice_fiscale||'')}" maxlength="16" style="text-transform:uppercase">
                </div>
                <div class="form-group">
                    <label>Residente a</label>
                    <input id="d_bResidente" value="${esc(b.residente_a||'')}">
                </div>
                <div class="form-group">
                    <label>Via/Piazza</label>
                    <input id="d_bVia" value="${esc(b.via||'')}">
                </div>
                <div class="form-group">
                    <label>Parrocchia</label>
                    <input id="d_parrocchia" value="${esc(r.parrocchia||'')}">
                </div>
                <div class="form-group">
                    <label>Fratelli/Sorelle AGESCI</label>
                    <select id="d_frPresente">
                        <option value="no" ${!fr.presente?'selected':''}>No</option>
                        <option value="si" ${fr.presente?'selected':''}>Sì</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Nome fratello/sorella</label>
                    <input id="d_frNome" value="${esc(fr.nome||'')}">
                </div>
                ${!fr.presente && hasAgesciSibling(r) ? `<div class="form-group full"><div class="alert-box alert-amber">Nelle note admin risulta un riferimento a un fratello/sorella già in AGESCI: verifica e aggiorna questo campo.</div></div>` : ''}
            </div>
        </div>

        <div class="modal-tab-panel" data-tab="genitori">
            <div class="detail-section-title" style="margin-bottom:10px">Genitore 1</div>
            <div class="edit-grid">
                <div class="form-group"><label>Nome</label><input id="d_g1Nome" value="${esc(g1.nome||'')}"></div>
                <div class="form-group"><label>Cognome</label><input id="d_g1Cognome" value="${esc(g1.cognome||'')}"></div>
                <div class="form-group"><label>Email</label><input type="email" id="d_g1Email" value="${esc(g1.email||'')}"></div>
                <div class="form-group"><label>Telefono</label><input id="d_g1Tel" value="${esc(g1.telefono||'')}"></div>
                <div class="form-group"><label>Luogo di nascita</label><input id="d_g1Luogo" value="${esc(g1.luogo_nascita||'')}"></div>
                <div class="form-group"><label>Data di nascita</label><input type="date" id="d_g1Data" value="${g1.data_nascita||''}"></div>
                <div class="form-group"><label>Codice fiscale</label><input id="d_g1CF" value="${esc(g1.codice_fiscale||'')}" maxlength="16" style="text-transform:uppercase"></div>
                <div class="form-group"><label>Via</label><input id="d_g1Via" value="${esc(g1.via||'')}"></div>
                <div class="form-group"><label>Numero</label><input id="d_g1Numero" value="${esc(g1.numero||'')}"></div>
                <div class="form-group"><label>Città</label><input id="d_g1Citta" value="${esc(g1.citta||'')}"></div>
                <div class="form-group"><label>Provincia</label><input id="d_g1Provincia" value="${esc(g1.provincia||'')}" maxlength="2" style="text-transform:uppercase"></div>
                <div class="form-group"><label>CAP</label><input id="d_g1Cap" value="${esc(g1.cap||'')}"></div>
            </div>

            <div class="detail-section-title" style="margin:18px 0 10px">Genitore 2</div>
            <div class="edit-grid">
                <div class="form-group"><label>Nome</label><input id="d_g2Nome" value="${esc(g2?.nome||'')}"></div>
                <div class="form-group"><label>Cognome</label><input id="d_g2Cognome" value="${esc(g2?.cognome||'')}"></div>
                <div class="form-group"><label>Email</label><input type="email" id="d_g2Email" value="${esc(g2?.email||'')}"></div>
                <div class="form-group"><label>Telefono</label><input id="d_g2Tel" value="${esc(g2?.telefono||'')}"></div>
                <div class="form-group"><label>Luogo di nascita</label><input id="d_g2Luogo" value="${esc(g2?.luogo_nascita||'')}"></div>
                <div class="form-group"><label>Data di nascita</label><input type="date" id="d_g2Data" value="${g2?.data_nascita||''}"></div>
                <div class="form-group"><label>Codice fiscale</label><input id="d_g2CF" value="${esc(g2?.codice_fiscale||'')}" maxlength="16" style="text-transform:uppercase"></div>
                <div class="form-group"><label>Via</label><input id="d_g2Via" value="${esc(g2?.via||'')}"></div>
                <div class="form-group"><label>Numero</label><input id="d_g2Numero" value="${esc(g2?.numero||'')}"></div>
                <div class="form-group"><label>Città</label><input id="d_g2Citta" value="${esc(g2?.citta||'')}"></div>
                <div class="form-group"><label>Provincia</label><input id="d_g2Provincia" value="${esc(g2?.provincia||'')}" maxlength="2" style="text-transform:uppercase"></div>
                <div class="form-group"><label>CAP</label><input id="d_g2Cap" value="${esc(g2?.cap||'')}"></div>
            </div>
        </div>

        <div class="modal-tab-panel" data-tab="iscrizione">
            <div class="edit-grid">
                <div class="form-group full">
                    <label>Motivazione</label>
                    <textarea id="d_motivazione" rows="2">${esc(r.motivazione||'')}</textarea>
                </div>
                <div class="form-group">
                    <label>Hobby</label>
                    <input id="d_hobby" value="${esc(r.hobby||'')}">
                </div>
                <div class="form-group full">
                    <label>Altre info</label>
                    <textarea id="d_altreInfo" rows="2">${esc(r.altre_info||'')}</textarea>
                </div>
                <div class="form-group">
                    <label>Consenso privacy</label>
                    <select id="d_privacyConsenso">
                        <option value="no" ${!pr.consenso?'selected':''}>No</option>
                        <option value="si" ${pr.consenso?'selected':''}>Sì</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Data domanda</label>
                    <input type="date" id="d_privacyData" value="${pr.data_presentazione||''}">
                </div>
                <div class="form-group">
                    <label>Luogo domanda</label>
                    <input id="d_privacyLuogo" value="${esc(pr.luogo||'')}">
                </div>
                <div class="form-group">
                    <label>Stato</label>
                    <select id="d_stato">
                        <option value="in_attesa"   ${r.stato==='in_attesa'   ?'selected':''}>In attesa</option>
                        <option value="contattato"  ${r.stato==='contattato'  ?'selected':''}>Contattato</option>
                        <option value="iscritto"    ${r.stato==='iscritto'    ?'selected':''}>Iscritto</option>
                        <option value="rifiutato"   ${r.stato==='rifiutato'   ?'selected':''}>Rifiutato</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Data iscrizione</label>
                    <input value="${formatTimestamp(r.created_at)}" disabled data-readonly style="background:#F5F5F5;color:#888">
                </div>
                <div class="form-group full">
                    <label>Note admin</label>
                    <textarea id="d_note" rows="3">${esc(r.note_admin||'')}</textarea>
                </div>
            </div>
        </div>
    `;

    document.querySelectorAll('#detailModalBody input, #detailModalBody select, #detailModalBody textarea')
        .forEach(el => { if (!el.hasAttribute('data-readonly')) el.disabled = true; });
    resetDetailFooter();

    switchDetailTab('ragazzo');
    openModal('detailModal');
}

// ---- Passa il popup di dettaglio in modalità modifica ----
function enableDetailEdit() {
    document.querySelectorAll('#detailModalBody input, #detailModalBody select, #detailModalBody textarea')
        .forEach(el => { if (!el.hasAttribute('data-readonly')) el.disabled = false; });

    const secondary = document.getElementById('detailSecondaryBtn');
    const primary    = document.getElementById('detailPrimaryBtn');
    secondary.textContent = 'Annulla';
    secondary.onclick = () => viewDetail(currentDetailId);
    primary.textContent = 'Salva modifiche';
    primary.onclick = saveDetail;
}

function resetDetailFooter() {
    const secondary = document.getElementById('detailSecondaryBtn');
    const primary    = document.getElementById('detailPrimaryBtn');
    secondary.textContent = 'Chiudi';
    secondary.onclick = () => closeModal('detailModal');
    primary.textContent = 'Modifica';
    primary.onclick = enableDetailEdit;
}

function switchDetailTab(tab) {
    document.querySelectorAll('#detailModal .modal-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('#detailModal .modal-tab-panel').forEach(p => {
        const isActive = p.dataset.tab === tab;
        p.classList.toggle('active', isActive);
        if (isActive) p.scrollTop = 0;
    });
    document.getElementById('detailModal').scrollTop = 0;
}

function askDeleteFromDetail() {
    closeModal('detailModal');
    askDelete(currentDetailId);
}

// ---- Salva modifiche dal popup di dettaglio ----
async function saveDetail() {
    if (!currentDetailId) return;

    const v = id => document.getElementById(id).value.trim();
    const g2Nome = v('d_g2Nome'), g2Cognome = v('d_g2Cognome'), g2Email = v('d_g2Email'), g2Tel = v('d_g2Tel');
    const g2Luogo = v('d_g2Luogo'), g2Data = v('d_g2Data'), g2CF = v('d_g2CF'),
          g2Via = v('d_g2Via'), g2Numero = v('d_g2Numero'), g2Citta = v('d_g2Citta'),
          g2Provincia = v('d_g2Provincia'), g2Cap = v('d_g2Cap');
    const genitore2 = (g2Nome || g2Cognome || g2Email || g2Tel) ? {
        nome: g2Nome, cognome: g2Cognome, email: g2Email.toLowerCase(), telefono: g2Tel,
        luogo_nascita: g2Luogo, data_nascita: g2Data, codice_fiscale: g2CF.toUpperCase(),
        via: g2Via, numero: g2Numero, citta: g2Citta, provincia: g2Provincia.toUpperCase(), cap: g2Cap
    } : null;

    const update = {
        'bambino.nome':             v('d_bNome'),
        'bambino.cognome':          v('d_bCognome'),
        'bambino.luogo_nascita':    v('d_bLuogo'),
        'bambino.data_nascita':     v('d_bData'),
        'bambino.codice_fiscale':   v('d_bCF').toUpperCase(),
        'bambino.residente_a':      v('d_bResidente'),
        'bambino.via':              v('d_bVia'),
        'parrocchia':               v('d_parrocchia'),
        'fratelli_agesci.presente': document.getElementById('d_frPresente').value === 'si',
        'fratelli_agesci.nome':     v('d_frNome'),
        'genitore1.nome':           v('d_g1Nome'),
        'genitore1.cognome':        v('d_g1Cognome'),
        'genitore1.email':          v('d_g1Email').toLowerCase(),
        'genitore1.telefono':       v('d_g1Tel'),
        'genitore1.luogo_nascita':  v('d_g1Luogo'),
        'genitore1.data_nascita':   v('d_g1Data'),
        'genitore1.codice_fiscale': v('d_g1CF').toUpperCase(),
        'genitore1.via':            v('d_g1Via'),
        'genitore1.numero':         v('d_g1Numero'),
        'genitore1.citta':          v('d_g1Citta'),
        'genitore1.provincia':      v('d_g1Provincia').toUpperCase(),
        'genitore1.cap':            v('d_g1Cap'),
        'genitore2':                genitore2,
        'motivazione':              v('d_motivazione'),
        'hobby':                    v('d_hobby'),
        'altre_info':               v('d_altreInfo'),
        'privacy.consenso':         document.getElementById('d_privacyConsenso').value === 'si',
        'privacy.data_presentazione': v('d_privacyData'),
        'privacy.luogo':            v('d_privacyLuogo'),
        'stato':                    document.getElementById('d_stato').value,
        'note_admin':               v('d_note'),
    };

    try {
        await db.collection('lista_attesa').doc(currentDetailId).update(update);

        const r = allData.find(x => x.id === currentDetailId);
        if (r) applyDotUpdate(r, update);
        applyFilters();

        closeModal('detailModal');
        showToast('Modifiche salvate');
    } catch (e) {
        showToast('Errore: ' + e.message, true);
    }
}

// ---- Applica un aggiornamento con chiavi puntate (es. 'bambino.nome') a un oggetto annidato ----
function applyDotUpdate(obj, update) {
    for (const [key, value] of Object.entries(update)) {
        const parts = key.split('.');
        let cur = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
            cur = cur[parts[i]];
        }
        cur[parts[parts.length - 1]] = value;
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

    const rows = filteredData.map(r => {
        const b  = r.bambino  || {};
        const g1 = r.genitore1|| {};
        const g2 = r.genitore2|| {};
        const pr = r.privacy  || {};

        return {
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
    showToast(`Esportate ${rows.length} righe`);
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
    showToast('Template scaricato');
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
    const dataPresentazione = normalizeDate(g('data_presentazione'));
    return {
        _created_at_str: dataPresentazione,
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
            data_presentazione: dataPresentazione,
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
    btn.innerHTML = `Importa <span id="importCount">${righeValide.length}</span> righe`;
    cancelImport();
    showToast(`Importate ${successCount} iscrizioni${saltate ? ` (${saltate} righe vuote saltate)` : ''}`);
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

// ---- Helper ----
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

    showToast(`Eliminati ${count} record`);
}

// ---- Toast ----
function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className   = 'toast' + (isError ? ' error' : '') + ' show';
    setTimeout(() => t.classList.remove('show'), 3500);
}
