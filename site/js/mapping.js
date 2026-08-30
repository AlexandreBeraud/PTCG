// ═══════════════════════════════════════════════════════════════════════════
//  PTCG Collection — js/mapping.js
//  Mapping TCG — association TCGdex ↔ extensions PTCG
// ═══════════════════════════════════════════════════════════════════════════

// ── Mapping TCG ────────────────────────────────────────────────────────────
// SB_URL / SB_KEY sont définies une seule fois dans js/sync.js (chargé avant
// ce fichier) et réutilisées ici pour interroger les tables cards/set_mapping.
var _mapping = { sets:[], mappings:{}, query:'', filter:'all', initialized:false };

async function initMappingView() {
  if (_mapping.initialized) { renderMappingList(); return; }
  const el = document.getElementById('mapping-list');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text2);font-size:.82rem">Chargement…</div>';
  try {
    let allRows = [], offset = 0, pageSize = 1000;
    while (true) {
      const res = await fetch(
        `${SB_URL}/rest/v1/cards?select=set_id,set_name,set_logo&order=set_name.asc`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Range-Unit': 'items', 'Range': `${offset}-${offset+pageSize-1}` } }
      );
      const rows = await res.json();
      if (!rows.length) break;
      allRows = allRows.concat(rows);
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
    const seen = new Set();
    _mapping.sets = allRows
      .filter(r => { if (seen.has(r.set_id)) return false; seen.add(r.set_id); return true; })
      .map(r => ({ id: r.set_id, name: r.set_name, logo: r.set_logo }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const mRes = await fetch(`${SB_URL}/rest/v1/set_mapping?select=stm_ptcg_ext_id,stm_tcgdex_set_id,stm_tcgdex_set_name`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    const mRows = await mRes.json();
    _mapping.mappings = {};
    mRows.forEach(r => { _mapping.mappings[r.stm_ptcg_ext_id] = { set_id: r.stm_tcgdex_set_id, set_name: r.stm_tcgdex_set_name }; });
    _mapping.initialized = true;
    renderMappingList();
    _refreshViewsAfterMappingLoaded();
  } catch(e) {
    if (el) el.innerHTML = `<p style="color:var(--accent2);font-size:.82rem;padding:16px">Erreur : ${e.message}</p>`;
  }
}

// Les Ventes/Dépenses/Acheteurs/Vendeurs peuvent avoir été affichés AVANT que
// le mapping TCGDex (nécessaire pour résoudre couleur/sigle/regroupement de
// façon fiable — voir _extForSetId dans ventes-achats.js) ait fini de
// charger. On rafraîchit la vue actuellement ouverte une fois le mapping
// disponible, pour ne jamais avoir à changer d'onglet et revenir pour voir
// les couleurs/sigles corrects.
function _refreshViewsAfterMappingLoaded() {
  if (_currentView === 'ventes'    && typeof renderVentes === 'function')    renderVentes();
  if (_currentView === 'depenses'  && typeof renderDepenses === 'function')  renderDepenses();
  if (_currentView === 'acheteurs' && typeof renderAcheteurs === 'function') renderAcheteurs();
  if (_currentView === 'vendeurs'  && typeof renderVendeurs === 'function')  renderVendeurs();
}

function renderMappingList() {
  const el = document.getElementById('mapping-list');
  if (!el) return;
  const mode = _tabViewModes['mapping'] || 'grid';
  const q = (_mapping.query||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  let totalFiltered = 0, html = '';
  getBlocs().forEach(bloc => {
    const builtInExts = (bloc.extensions||[]).filter(e => {
      const ov = (_D.ext_overrides||{})[e.id]||{};
      return !ov._hidden && (!ov.bloc_id_override || ov.bloc_id_override === bloc.id);
    }).map(e => { const ov=(_D.ext_overrides||{})[e.id]||{}; return {...e,...ov,_builtin:true}; });
    const movedHere = getBlocs().filter(b=>b._builtin&&b.id!==bloc.id).flatMap(b=>
      (b.extensions||[]).filter(e=>{const ov=(_D.ext_overrides||{})[e.id]||{};return !ov._hidden&&ov.bloc_id_override===bloc.id;})
        .map(e=>{const ov=(_D.ext_overrides||{})[e.id]||{};return{...e,...ov,_builtin:true};})
    );
    const customExts = (_D.custom_exts||[]).filter(e=>e.bloc_id===bloc.id);
    const allExts = sortExts([...builtInExts,...movedHere,...customExts]);
    if (!allExts.length) return;
    const items = allExts.map(e => {
      const mapped   = _mapping.mappings[e.id];
      if (_mapping.filter === 'mapped'   && !mapped) return '';
      if (_mapping.filter === 'unmapped' &&  mapped) return '';
      const name     = e.nom || e.name || e.id;
      const code     = e.code || '';
      const logoSrc  = e.logo  || bloc.logo  || '';
      const sigleSrc = e.sigle || bloc.sigle || '';
      if (q) {
        const hay = (name+code).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        if (!hay.includes(q)) return '';
      }
      totalFiltered++;
      const safeId = e.id.replace(/'/g,"\\'");
      const sigleHtml = sigleSrc ? `<img src="${sigleSrc}" alt="" class="mrow-sigle-img" onerror="_nasImgRetry(this,img=>img.style.display='none')">` : `<div class="mrow-sigle-ph">${code.slice(0,5)||'?'}</div>`;
      const statusHtml = mapped
        ? `<span class="mbadge mbadge-ok">✓</span><button class="mbadge-clear" onclick="clearMapping('${safeId}')" title="Supprimer">×</button>`
        : `<span class="mbadge mbadge-no">—</span>`;
      const setInput = `<div class="mrow-set-wrap">
          <input type="text" class="mrow-input" id="mset-${e.id}"
            placeholder="Chercher un set TCGdex…"
            value="${mapped ? mapped.set_name+' ('+mapped.set_id+')' : ''}"
            oninput="showMappingDropdown('${safeId}',this.value)"
            onfocus="showMappingDropdown('${safeId}',this.value)"
            autocomplete="off">
          <div class="mrow-dropdown" id="mdrop-${e.id}" style="display:none"></div>
        </div>`;
      if (mode === 'list') {
        return `<div class="mrow" id="mrow-${e.id}">
          <div class="mrow-ext">
            ${logoSrc ? `<img src="${logoSrc}" alt="" class="mrow-logo" onerror="_nasImgRetry(this,img=>img.style.display='none')">` : ''}
            ${sigleHtml}
            <div class="mrow-names">
              <span class="mrow-name">${name}</span>
              ${code ? `<span class="mrow-code">${code}</span>` : ''}
            </div>
          </div>
          <div class="mrow-set">${setInput}</div>
          <div class="mrow-status" id="mstatus-${e.id}">${statusHtml}</div>
        </div>`;
      }
      return `<div class="mmap-card" id="mrow-${e.id}">
        <div class="mmap-card-top">
          ${sigleHtml}
          <div class="mrow-names">
            <span class="mrow-name">${name}</span>
            ${code ? `<span class="mrow-code">${code}</span>` : ''}
          </div>
          <div class="mrow-status" id="mstatus-${e.id}">${statusHtml}</div>
        </div>
        ${setInput}
      </div>`;
    }).filter(Boolean).join('');
    if (!items) return;
    const uid    = 'mbloc_' + bloc.id;
    const isOpen = !sessionStorage.getItem('mbloc_closed_' + bloc.id);
    html += `<div class="mbloc">
      <div class="mbloc-header collapsible" onclick="toggleMappingBloc('${bloc.id}')">
        ${bloc.logo  ? `<img src="${bloc.logo}"  alt="" class="mbloc-logo"  onerror="_nasImgRetry(this,img=>img.style.display='none')">` : ''}
        ${bloc.sigle ? `<img src="${bloc.sigle}" alt="" class="mbloc-sigle" onerror="_nasImgRetry(this,img=>img.style.display='none')">` : ''}
        <span class="mbloc-name">${bloc.nom||bloc.id}</span>
        <span class="mbloc-count">${allExts.length} ext.</span>
        <div class="cer-chevron ${isOpen?'open':''}" id="mchev-${bloc.id}" style="margin-left:auto">▼</div>
      </div>
      <div id="${uid}" style="${isOpen?'':'display:none'}" class="${mode==='list'?'':'mmap-cards-grid'}">${items}</div>
    </div>`;
  });
  const counter = document.getElementById('mapping-counter');
  if (counter) counter.textContent = `${totalFiltered} extension${totalFiltered>1?'s':''}`;
  el.innerHTML = html || `<p style="color:var(--text2);font-size:.82rem;padding:16px 0">Aucune extension.</p>`;
}

function toggleMappingBloc(blocId) {
  const panel = document.getElementById('mbloc_' + blocId);
  const chev  = document.getElementById('mchev-' + blocId);
  if (!panel) return;
  const open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : '';
  if (chev) chev.classList.toggle('open', !open);
  if (open) sessionStorage.setItem('mbloc_closed_' + blocId, '1');
  else sessionStorage.removeItem('mbloc_closed_' + blocId);
}

function showMappingDropdown(extId, query) {
  const drop = document.getElementById(`mdrop-${extId}`);
  if (!drop) return;
  const q = (query||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const matches = q
    ? _mapping.sets.filter(s =>
        s.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q) ||
        s.id.toLowerCase().includes(q)).slice(0,30)
    : _mapping.sets.slice(0,30);
  if (!matches.length) { drop.style.display='none'; return; }
  drop.innerHTML = matches.map(s => {
    const sn = s.name.replace(/'/g,"\\'");
    return `<div class="mrow-drop-item" onmousedown="selectMapping('${extId}','${s.id}','${sn}')">
      ${s.logo ? `<img src="${s.logo}" alt="" style="height:14px;object-fit:contain;margin-right:6px" onerror="_nasImgRetry(this,img=>img.style.display='none')">` : ''}
      <span>${s.name}</span><span style="color:var(--text3);font-size:.7rem;margin-left:6px">${s.id}</span>
    </div>`;
  }).join('');
  drop.style.display = 'block';
}

async function selectMapping(extId, setId, setName) {
  const drop = document.getElementById(`mdrop-${extId}`);
  const inp  = document.getElementById(`mset-${extId}`);
  if (drop) drop.style.display = 'none';
  if (inp)  inp.value = `${setName} (${setId})`;
  const ext = getAllExtensions().find(e => e.id === extId);
  if (!ext) return;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/set_mapping`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ stm_tcgdex_set_id: setId, stm_tcgdex_set_name: setName, stm_ptcg_ext_id: extId, stm_ptcg_ext_name: ext.nom||ext.name||extId, stm_ptcg_sigle: ext.sigle||'' })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    _mapping.mappings[extId] = { set_id: setId, set_name: setName };
    const status = document.getElementById(`mstatus-${extId}`);
    if (status) status.innerHTML = `<span class="mbadge mbadge-ok">✓</span><button class="mbadge-clear" onclick="clearMapping('${extId.replace(/'/g,"\\'")}')">×</button>`;
    toast('Mapping sauvegardé.', 'success');
  } catch(e) { toast('Erreur : ' + e.message, 'error'); }
}

async function clearMapping(extId) {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/set_mapping?stm_ptcg_ext_id=eq.${encodeURIComponent(extId)}`,
      { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    delete _mapping.mappings[extId];
    const inp = document.getElementById(`mset-${extId}`);
    const status = document.getElementById(`mstatus-${extId}`);
    if (inp) inp.value = '';
    if (status) status.innerHTML = `<span class="mbadge mbadge-no">—</span>`;
    toast('Mapping supprimé.', 'success');
  } catch(e) { toast('Erreur : ' + e.message, 'error'); }
}

