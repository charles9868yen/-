// timetable_bs.js
document.addEventListener('DOMContentLoaded', () => {
  // DOM refs
  const modeList = document.getElementById('modeList');
  const timetableBody = document.getElementById('timetableBody');
  const addCourseBtn = document.getElementById('addCourseBtn');
  const undoBtn = document.getElementById('undoBtn');
  const resetBtn = document.getElementById('resetBtn');
  const colorPicker = document.getElementById('colorPicker');
  const paletteList = document.getElementById('paletteList');
  const customHex = document.getElementById('customHex');
  const applyCustom = document.getElementById('applyCustom');
  const closePalette = document.getElementById('closePalette');
  const memoView = document.getElementById('memoView');
  const memoCourseSelect = document.getElementById('memoCourseSelect');
  const memoText = document.getElementById('memoText');
  const memoSaveBtn = document.getElementById('memoSaveBtn');
  const memoBackBtn = document.getElementById('memoBackBtn');
  const statsModal = document.getElementById('statsModal');
  const openStatsBtn = document.getElementById('openStatsBtn');
  const closeStats = document.getElementById('closeStats');
  const statsTableBody = document.querySelector('#statsTable tbody');
  const totalCoursesEl = document.getElementById('totalCourses');
  const uniqueCoursesEl = document.getElementById('uniqueCourses');
  const toggleWeekendBtn = document.getElementById('toggleWeekendBtn');
  const placeWeekendLeft = document.getElementById('placeWeekendLeft');
  const placeWeekendRight = document.getElementById('placeWeekendRight');
  const weekendTabs = Array.from(document.querySelectorAll('.weekend-tab'));
  const weekendSatBody = document.getElementById('weekendSatBody');
  const weekendSunBody = document.getElementById('weekendSunBody');
  const weekendSat = document.getElementById('weekendSat');
  const weekendSun = document.getElementById('weekendSun');

  const exportBtn = document.getElementById('exportBtn');
  const importFile = document.getElementById('importFile');
  const enableNotify = document.getElementById('enableNotify');
  const toast = document.getElementById('tt-toast');
  const clockEl = document.getElementById('tt-clock');
  const darkToggle = document.getElementById('darkToggle') || document.getElementById('darkModeBtn');
  const shareLinkBtn = document.getElementById('shareLinkBtn');
  const redoBtn = document.getElementById('redoBtn');
  const installBtn = document.getElementById('installBtn');
  const saveIndicator = document.getElementById('saveIndicator');

  // state
  let currentMode = null;
  let historyStack = [];
  const MAX_HISTORY = 150;
  let colorTarget = null;
  let initialSnapshot = null;
  let weekendVisible = false;
  let weekendPlacement = 'right';
  let weekendSelected = 'sat';
  let redoStack = [];

  const STORAGE_KEY = 'timetable-snapshot-v4';
  const HISTORY_KEY = 'timetable-history-v4';
  const COURSE_COLOR_PREFIX = 'course-color-';
  const DARK_PREF_KEY = 'tt-dark';

  const PALETTE = [
    {name: '黃', hex:'#facc15'},
    {name: '藍', hex:'#2563eb'},
    {name: '粉', hex:'#ec4899'},
    {name: '綠', hex:'#10b981'},
    {name: '紅', hex:'#f87171'},
    {name: '淺灰', hex:'#f3f4f6'},
    {name: '白', hex:'#ffffff'},
    {name: '深灰', hex:'#9ca3af'}
  ];

  // utilities
  function cssVar(name, fallback=''){ const v = getComputedStyle(document.documentElement).getPropertyValue(name); return v ? v.trim() : fallback; }
  function rgbToHex(rgb){
    if(!rgb) return '';
    if(rgb.startsWith('#')) return rgb;
    const m = rgb.match(/\d+/g);
    if(!m) return '';
    return '#'+ m.slice(0,3).map(n=> (+n).toString(16).padStart(2,'0')).join('');
  }
  function showToast(msg, ms=1400){ if(!toast) return; toast.textContent = msg; toast.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(()=> toast.classList.remove('show'), ms); }
  function debounce(fn, wait=400){ let t; return (...a)=>{ clearTimeout(t); t = setTimeout(()=> fn(...a), wait); }; }
  function isUserSavedColor(name){ if(!name) return false; return !!localStorage.getItem(COURSE_COLOR_PREFIX + name); }

  // SERIALIZE / RESTORE (store '' when no inline color)
  function serializeState(){
    const rows = [];
    Array.from(timetableBody.rows).forEach(tr=>{
      const time = tr.cells[0]?.textContent || '';
      const courses = [];
      for(let i=1;i<tr.cells.length;i++){
        const c = tr.cells[i];
        const inlineBg = (c.dataset && c.dataset.userColor) ? c.dataset.userColor : '';
        courses.push({ text: c.textContent || '', bg: inlineBg, memo: c.dataset.memo || '' });
      }
      rows.push({ time, courses });
    });
    function serBody(body){
      const out = [];
      if(!body) return out;
      Array.from(body.rows).forEach(tr=>{
        const time = tr.cells[0]?.textContent || '';
        const cs = [];
        for(let i=1;i<tr.cells.length;i++){
          const c = tr.cells[i];
          const inlineBg = (c.dataset && c.dataset.userColor) ? c.dataset.userColor : '';
          cs.push({ text: c.textContent || '', bg:inlineBg, memo: c.dataset.memo || '' });
        }
        out.push({ time, courses: cs });
      });
      return out;
    }
    const sat = serBody(weekendSatBody), sun = serBody(weekendSunBody);
    const colors = {};
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(COURSE_COLOR_PREFIX)) colors[k.replace(COURSE_COLOR_PREFIX,'')] = localStorage.getItem(k);
    }
    return { rows, weekend:{ sat, sun }, courseColors: colors, createdAt: Date.now() };
  }

  function restoreState(snapshot, { replaceHistory=false } = {}){
    if(!snapshot || !snapshot.rows) return;
    // main table
    timetableBody.innerHTML = '';
    snapshot.rows.forEach(r=>{
      const tr = document.createElement('tr');
      const tdTime = document.createElement('td');
      tdTime.className = 'time-cell border px-4 py-2 bg-mywhite';
      tdTime.textContent = r.time || '';
      tr.appendChild(tdTime);

      (r.courses || []).forEach(cobj=>{
        const td = document.createElement('td');
        td.className = 'course-cell border px-4 py-2';
        td.textContent = cobj.text || '';
        // if bg provided => treat as user-chosen => set dataset and inline style
        if(cobj.bg && cobj.bg.trim() !== ''){
          td.dataset.userColor = cobj.bg;
          td.style.backgroundColor = cobj.bg;
        } else {
          // make sure no inline style so CSS can control in dark mode
          td.removeAttribute('style');
          delete td.dataset.userColor;
        }
        if(cobj.memo) td.dataset.memo = cobj.memo;
        tr.appendChild(td);
      });

      timetableBody.appendChild(tr);
    });

    // weekend tables
    if(weekendSatBody) weekendSatBody.innerHTML = '';
    if(weekendSunBody) weekendSunBody.innerHTML = '';
    if(snapshot.weekend){
      (snapshot.weekend.sat || []).forEach(r=>{
        const tr = document.createElement('tr');
        const tdTime = document.createElement('td');
        tdTime.className = 'time-cell border px-4 py-2 bg-mywhite';
        tdTime.textContent = r.time || '';
        tr.appendChild(tdTime);
        (r.courses || []).forEach(cobj=>{
          const td = document.createElement('td');
          td.className = 'course-cell border px-4 py-2';
          td.textContent = cobj.text || '';
          if(cobj.bg && cobj.bg.trim() !== ''){
            td.dataset.userColor = cobj.bg;
            td.style.backgroundColor = cobj.bg;
          } else {
            td.removeAttribute('style');
            delete td.dataset.userColor;
          }
          if(cobj.memo) td.dataset.memo = cobj.memo;
          tr.appendChild(td);
        });
        weekendSatBody && weekendSatBody.appendChild(tr);
      });
      (snapshot.weekend.sun || []).forEach(r=>{
        const tr = document.createElement('tr');
        const tdTime = document.createElement('td');
        tdTime.className = 'time-cell border px-4 py-2 bg-mywhite';
        tdTime.textContent = r.time || '';
        tr.appendChild(tdTime);
        (r.courses || []).forEach(cobj=>{
          const td = document.createElement('td');
          td.className = 'course-cell border px-4 py-2';
          td.textContent = cobj.text || '';
          if(cobj.bg && cobj.bg.trim() !== ''){
            td.dataset.userColor = cobj.bg;
            td.style.backgroundColor = cobj.bg;
          } else {
            td.removeAttribute('style');
            delete td.dataset.userColor;
          }
          if(cobj.memo) td.dataset.memo = cobj.memo;
          tr.appendChild(td);
        });
        weekendSunBody && weekendSunBody.appendChild(tr);
      });
    }

    // restore courseColors keys into localStorage (explicit mapping)
    if(snapshot.courseColors){
      Object.keys(snapshot.courseColors).forEach(k => localStorage.setItem(COURSE_COLOR_PREFIX + k, snapshot.courseColors[k]));
    }

    // ensure time cells not inline-styled (let CSS var control)
    document.querySelectorAll('.time-cell').forEach(t => {
      t.classList.add('bg-mywhite');
      t.removeAttribute('style'); // so CSS var (--mywhite) controls it
    });

    // ensure course-cells without dataset.userColor have no inline style
    document.querySelectorAll('.course-cell').forEach(c=>{
      if(!c.dataset.userColor){
        c.removeAttribute('style');
      }
    });

    if(replaceHistory){
      initialSnapshot = (typeof structuredClone === 'function') ? structuredClone(snapshot) : JSON.parse(JSON.stringify(snapshot));
      historyStack = [ (typeof structuredClone === 'function') ? structuredClone(initialSnapshot) : JSON.parse(JSON.stringify(initialSnapshot)) ];
      persistHistory();
    }
    updateStats();
  }

  // history/persistence
  function pushHistory(){
    try {
      const snap = serializeState();
      const clone = (typeof structuredClone === 'function') ? structuredClone(snap) : JSON.parse(JSON.stringify(snap));
      historyStack.push(clone);
      if(historyStack.length > MAX_HISTORY) historyStack.shift();
      persistHistory();
      debouncedSave();
      redoStack = [];
      updateRedoButton();
    } catch(e){ console.warn(e); }
  }
  function persistHistory(){ try{ localStorage.setItem(HISTORY_KEY, JSON.stringify(historyStack.slice(-MAX_HISTORY))); }catch(e){ console.warn(e); } }
  function saveSnapshotImmediate(){ try{ const snap = serializeState(); localStorage.setItem(STORAGE_KEY, JSON.stringify(snap)); }catch(e){ console.warn(e); } }
  let debouncedSave = debounce(saveSnapshotImmediate, 450);

  function loadFromStorage(){
    try{
      const json = localStorage.getItem(STORAGE_KEY);
      if(json){ const snap = JSON.parse(json); restoreState(snap, { replaceHistory:true }); return true; }
      const h = localStorage.getItem(HISTORY_KEY);
      if(h){ const arr = JSON.parse(h); if(Array.isArray(arr) && arr.length){ restoreState(arr[arr.length-1], { replaceHistory:true }); return true; } }
    }catch(e){ console.warn(e); }
    return false;
  }

  // PALETTE
  function buildPalette(){
    if(!paletteList) return;
    paletteList.innerHTML = '';
    PALETTE.forEach(p=>{
      const wrap = document.createElement('div'); wrap.className = 'p-1 cursor-pointer';
      const sw = document.createElement('div'); sw.className = 'palette-swatch'; sw.style.background = p.hex; sw.title = `${p.name} (${p.hex})`;
      const label = document.createElement('div'); label.className = 'text-xs text-center mt-1'; label.textContent = p.name;
      wrap.appendChild(sw); wrap.appendChild(label);
      wrap.addEventListener('click', ev=>{
        ev.stopPropagation();
        if(colorTarget){
          // set dataset and inline style so it's persistent and will be kept across dark mode
          colorTarget.dataset.userColor = p.hex;
          colorTarget.style.backgroundColor = p.hex;
          const name = colorTarget.textContent.trim();
          if(name) {
            localStorage.setItem(COURSE_COLOR_PREFIX + name, p.hex);
          }
          hidePalette();
          updateStats();
          debouncedSave();
        }
      });
      paletteList.appendChild(wrap);
    });
  }
  buildPalette();

  function openPaletteAt(cell){
    colorTarget = cell;
    if(!colorPicker) return;
    const rect = cell.getBoundingClientRect();
    colorPicker.style.left = Math.max(8, rect.left + window.scrollX) + 'px';
    colorPicker.style.top = (rect.bottom + window.scrollY + 6) + 'px';
    colorPicker.classList.remove('hidden');
    customHex.value = rgbToHex(cell.dataset.userColor || cell.style.backgroundColor || '');
  }
  function hidePalette(){ if(!colorPicker) return; colorPicker.classList.add('hidden'); colorTarget = null; }
  if(closePalette) closePalette.addEventListener('click', hidePalette);
  if(applyCustom) applyCustom.addEventListener('click', ()=>{
    const hex = customHex.value.trim();
    if(!hex) return;
    if(colorTarget){
      colorTarget.dataset.userColor = hex;
      colorTarget.style.backgroundColor = hex;
      const name = colorTarget.textContent.trim();
      if(name) localStorage.setItem(COURSE_COLOR_PREFIX + name, hex);
      hidePalette(); updateStats(); debouncedSave();
    }
  });
  document.addEventListener('click', (e)=>{
    if(colorPicker && !colorPicker.contains(e.target) && !e.target.closest('.course-cell')) hidePalette();
  });

  // MODE selection
  if(modeList){
    modeList.addEventListener('click', (e)=>{
      const li = e.target.closest('li[data-mode]');
      if(!li) return;
      Array.from(modeList.querySelectorAll('li')).forEach(n => n.classList.remove('bg-done','text-mywhite'));
      li.classList.add('bg-done','text-mywhite');
      currentMode = li.dataset.mode;
      if(currentMode === 'stats'){ fillStats(); statsModal.classList.remove('hidden'); } else statsModal.classList.add('hidden');
    });
  }

  // table interaction delegated
  if(timetableBody){
    timetableBody.addEventListener('click', (e)=>{
      const td = e.target.closest('td');
      if(!td) return;
      const isTime = td.classList.contains('time-cell');
      const isCourse = td.classList.contains('course-cell');
      if(!currentMode) return;
      pushHistory();

      if(currentMode === 'name' && isCourse){
        const old = td.textContent.trim();
        const newName = prompt('修改課程名稱：', td.textContent);
        if(newName !== null){
          // move memo & color mapping if needed
          if(old && localStorage.getItem('memo-'+old)){
            const m = localStorage.getItem('memo-'+old);
            localStorage.removeItem('memo-'+old);
            if(newName.trim()) localStorage.setItem('memo-'+newName.trim(), m);
          }
          // move color mapping if existed
          if(old && localStorage.getItem(COURSE_COLOR_PREFIX + old)){
            const col = localStorage.getItem(COURSE_COLOR_PREFIX + old);
            localStorage.removeItem(COURSE_COLOR_PREFIX + old);
            if(newName.trim()) localStorage.setItem(COURSE_COLOR_PREFIX + newName.trim(), col);
          }
          td.textContent = newName;
          // if there is a saved color for this name, apply it to all cells of same name
          const def = localStorage.getItem(COURSE_COLOR_PREFIX + newName.trim());
          if(def){
            document.querySelectorAll('.course-cell').forEach(c=>{ if(c.textContent.trim()===newName.trim()){ c.dataset.userColor = def; c.style.backgroundColor = def; } });
          }
        }
      } else if(currentMode === 'time' && isTime){
        const newTime = prompt('修改時間（保留原格式）：', td.textContent);
        if(newTime !== null) td.textContent = newTime;
      } else if(currentMode === 'color' && isCourse){
        openPaletteAt(td);
      } else if(currentMode === 'memo' && isCourse){
        openMemoForCell(td);
      }

      updateStats();
      debouncedSave();
    });
  }

  // weekend handlers (same behaviour)
  function weekendClickHandler(e){
    const td = e.target.closest('td');
    if(!td) return;
    if(!currentMode) return;
    pushHistory();
    const isTime = td.classList.contains('time-cell');
    const isCourse = td.classList.contains('course-cell');

    if(currentMode === 'name' && isCourse){
      const old = td.textContent.trim();
      const newName = prompt('修改課程名稱：', td.textContent);
      if(newName !== null){
        if(old && localStorage.getItem('memo-'+old)){
          const m = localStorage.getItem('memo-'+old);
          localStorage.removeItem('memo-'+old);
          if(newName.trim()) localStorage.setItem('memo-'+newName.trim(), m);
        }
        if(old && localStorage.getItem(COURSE_COLOR_PREFIX + old)){
          const col = localStorage.getItem(COURSE_COLOR_PREFIX + old);
          localStorage.removeItem(COURSE_COLOR_PREFIX + old);
          if(newName.trim()) localStorage.setItem(COURSE_COLOR_PREFIX + newName.trim(), col);
        }
        td.textContent = newName;
        const def = localStorage.getItem(COURSE_COLOR_PREFIX + newName.trim());
        if(def) document.querySelectorAll('.course-cell').forEach(c=>{ if(c.textContent.trim()===newName.trim()){ c.dataset.userColor = def; c.style.backgroundColor = def; } });
      }
    } else if(currentMode === 'time' && isTime){
      const newTime = prompt('修改時間（保留原格式）：', td.textContent);
      if(newTime !== null) td.textContent = newTime;
    } else if(currentMode === 'color' && isCourse){
      openPaletteAt(td);
    } else if(currentMode === 'memo' && isCourse){
      openMemoForCell(td);
    }
    updateStats(); debouncedSave();
  }
  if(weekendSatBody) weekendSatBody.addEventListener('click', weekendClickHandler);
  if(weekendSunBody) weekendSunBody.addEventListener('click', weekendClickHandler);

  // memo modal helpers
  function refreshMemoOptions(){
    const names = new Set();
    document.querySelectorAll('.course-cell').forEach(c=>{ const t=c.textContent.trim(); if(t) names.add(t); });
    memoCourseSelect.innerHTML = '';
    Array.from(names).sort().forEach(n=>{ const opt = document.createElement('option'); opt.value = n; opt.textContent = n; memoCourseSelect.appendChild(opt); });
    memoText.value = memoCourseSelect.options.length ? (localStorage.getItem('memo-'+memoCourseSelect.value)||'') : '';
  }
  function openMemoForCell(cell){
    refreshMemoOptions();
    const val = cell.textContent.trim();
    let found = false;
    for(const opt of memoCourseSelect.options){ if(opt.value === val){ found=true; memoCourseSelect.value = val; break; } }
    if(!found && val !== ''){ const opt = document.createElement('option'); opt.value = val; opt.textContent = val; memoCourseSelect.appendChild(opt); memoCourseSelect.value = val; }
    memoText.value = localStorage.getItem('memo-'+memoCourseSelect.value) || '';
    memoView.classList.remove('hidden'); memoText.focus();
  }
  if(memoBackBtn) memoBackBtn.addEventListener('click', ()=> memoView.classList.add('hidden'));
  if(memoSaveBtn) memoSaveBtn.addEventListener('click', ()=>{
    const course = memoCourseSelect.value;
    if(!course) return alert('請先選擇課程名稱');
    localStorage.setItem('memo-'+course, memoText.value);
    pushHistory();
    document.querySelectorAll('.course-cell').forEach(c=>{ if(c.textContent.trim() === course) c.dataset.memo = memoText.value; });
    debouncedSave();
    showToast('備忘錄已儲存');
    setTimeout(()=> memoView.classList.add('hidden'), 420);
  });
  if(memoCourseSelect) memoCourseSelect.addEventListener('change', ()=> memoText.value = localStorage.getItem('memo-'+memoCourseSelect.value) || '');

  // add / undo / reset / redo
  function addCourseRowToBody(time, body, cols=5){
    const tr = document.createElement('tr');
    const tdTime = document.createElement('td');
    tdTime.className = 'time-cell border px-4 py-2 bg-mywhite';
    tdTime.textContent = time;
    tr.appendChild(tdTime);
    for(let i=0;i<cols;i++){
      const td = document.createElement('td');
      td.className = 'course-cell border px-4 py-2';
      td.textContent = '';
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  if(addCourseBtn) addCourseBtn.addEventListener('click', ()=>{
    const time = prompt('輸入時間範圍，例如 10:00 - 11:00'); if(!time) return;
    pushHistory();
    addCourseRowToBody(time, timetableBody, 5);
    updateStats(); debouncedSave();
  });

  if(undoBtn) undoBtn.addEventListener('click', ()=>{
    if(historyStack.length < 2){ alert('沒有可還原的動作'); return; }
    const popped = historyStack.pop(); redoStack.push(popped);
    const prev = historyStack[historyStack.length-1];
    if(prev){ restoreState(prev); debouncedSave(); persistHistory(); showToast('已還原'); updateRedoButton(); }
  });

  if(resetBtn) resetBtn.addEventListener('click', ()=>{
    if(!confirm('確定全部重置課表？這會回復到載入時的狀態')) return;
    if(initialSnapshot){
      restoreState(initialSnapshot);
      // enforce: remove inline for cells that are not user-specified
      document.querySelectorAll('.course-cell').forEach(c=>{
        const name = c.textContent.trim();
        if(isUserSavedColor(name)){
          const hex = localStorage.getItem(COURSE_COLOR_PREFIX + name);
          if(hex){ c.dataset.userColor = hex; c.style.backgroundColor = hex; }
        } else {
          // remove inline so dark CSS can style
          c.removeAttribute('style'); delete c.dataset.userColor;
        }
      });
      document.querySelectorAll('.time-cell').forEach(t=>{
        t.classList.add('bg-mywhite');
        t.removeAttribute('style');
      });
      historyStack = [ (typeof structuredClone === 'function') ? structuredClone(initialSnapshot) : JSON.parse(JSON.stringify(initialSnapshot)) ];
      persistHistory(); debouncedSave(); showToast('已重置為初始'); updateStats(); return;
    }
    // fallback: clear inline
    document.querySelectorAll('.course-cell').forEach(c => { c.removeAttribute('style'); delete c.dataset.userColor; });
    document.querySelectorAll('.time-cell').forEach(t => { t.classList.add('bg-mywhite'); t.removeAttribute('style'); });
    historyStack = []; pushHistory(); debouncedSave(); showToast('已強制重設'); updateStats();
  });

  function updateRedoButton(){ if(!redoBtn) return; if(redoStack.length>0) redoBtn.removeAttribute('disabled'); else redoBtn.setAttribute('disabled','true'); }
  if(redoBtn){
    redoBtn.addEventListener('click', ()=>{
      if(redoStack.length === 0) return;
      const snap = redoStack.pop(); if(!snap) return;
      restoreState(snap);
      historyStack.push(snap);
      persistHistory(); debouncedSave(); showToast('已重做'); updateRedoButton();
    });
    updateRedoButton();
  }

  // stats
  function fillStats(){
    const all = [...document.querySelectorAll('.course-cell')];
    const map = {};
    all.forEach(c=>{ const t = c.textContent.trim(); if(t) map[t] = (map[t]||0) + 1; });
    const filled = all.filter(c=>c.textContent.trim()!=='').length;
    if(totalCoursesEl) totalCoursesEl.textContent = filled;
    if(uniqueCoursesEl) uniqueCoursesEl.textContent = Object.keys(map).length;
    if(statsTableBody) statsTableBody.innerHTML = '';
    Object.keys(map).sort().forEach(name=>{
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.className = 'border px-2 py-1 cursor-pointer text-blue-600';
      td1.textContent = name;
      td1.addEventListener('click', ()=>{ refreshMemoOptions(); memoCourseSelect.value = name; memoText.value = localStorage.getItem('memo-'+name) || ''; memoView.classList.remove('hidden'); });
      const td2 = document.createElement('td'); td2.className = 'border px-2 py-1'; td2.textContent = map[name];
      tr.appendChild(td1); tr.appendChild(td2); statsTableBody.appendChild(tr);
    });

    // daily counts
    const daily = [0,0,0,0,0];
    Array.from(timetableBody.rows).forEach(tr=>{
      for(let i=1;i<=5;i++){
        const c = tr.cells[i];
        if(c && c.textContent.trim()!=='') daily[i-1]++;
      }
    });
    ['monCount','tueCount','wedCount','thuCount','friCount'].forEach((id,i)=>{
      const el = document.getElementById(id);
      if(el) el.textContent = daily[i];
    });
  }
  if(openStatsBtn) openStatsBtn.addEventListener('click', ()=>{ fillStats(); statsModal.classList.remove('hidden'); });
  if(closeStats) closeStats.addEventListener('click', ()=> statsModal.classList.add('hidden'));
  function updateStats(){ if(!statsModal || statsModal.classList.contains('hidden')) return; fillStats(); }

  // init / snapshot
  function clearInitialBackgrounds(){
    document.querySelectorAll('.course-cell').forEach(c => { c.removeAttribute('style'); delete c.dataset.userColor; });
    document.querySelectorAll('.time-cell').forEach(t => { t.classList.add('bg-mywhite'); t.removeAttribute('style'); });
  }
  function buildInitialSnapshot(){
    clearInitialBackgrounds();
    const snap = serializeState();
    initialSnapshot = (typeof structuredClone === 'function') ? structuredClone(snap) : JSON.parse(JSON.stringify(snap));
    historyStack = [ (typeof structuredClone === 'function') ? structuredClone(initialSnapshot) : JSON.parse(JSON.stringify(initialSnapshot)) ];
    persistHistory(); debouncedSave();
  }
  function init(){
    // ensure classes
    Array.from(timetableBody.rows).forEach(tr=>{
      if(tr.cells[0] && !tr.cells[0].classList.contains('time-cell')) tr.cells[0].classList.add('time-cell');
      for(let i=1;i<tr.cells.length;i++) if(!tr.cells[i].classList.contains('course-cell')) tr.cells[i].classList.add('course-cell');
    });

    const ok = loadFromStorage();
    if(!ok) buildInitialSnapshot();

    // apply saved course colors (localStorage mapping)
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(COURSE_COLOR_PREFIX)){
        const name = k.replace(COURSE_COLOR_PREFIX,'');
        const hex = localStorage.getItem(k);
        if(name && hex) document.querySelectorAll('.course-cell').forEach(c=>{ if(c.textContent.trim()===name){ c.dataset.userColor = hex; c.style.backgroundColor = hex; } });
      }
    }

    // dark preference
    const v = localStorage.getItem(DARK_PREF_KEY);
    const isDark = v === '1';
    applyDark(isDark);

    updateStats();
    buildPalette();
  }
  init();

  // clock & imminent (kept same)
  (function(){
    const FLASH_BEFORE_MIN = 3, RED_BEFORE_MIN = 1;
    const notified = new Set();
    function getMonday(now){ const d = new Date(now); const day = d.getDay(); const diff = (day===0)? -6 : (1 - day); d.setHours(0,0,0,0); d.setDate(d.getDate() + diff); return d; }
    function parseStart(rangeStr){
      if(!rangeStr) return null;
      const m = rangeStr.match(/(\d{1,2}):(\d{2})/);
      if(!m){
        const m2 = rangeStr.match(/(\d{1,2})\s*[-–]/);
        if(m2) return { hh: parseInt(m2[1],10), mm:0 };
        return null;
      }
      return { hh: parseInt(m[1],10), mm: parseInt(m[2],10) };
    }
    function clearMarks(){ document.querySelectorAll('.course-cell').forEach(c=>{ c.classList.remove('tt-imminent-flash','tt-imminent-red'); }); }
    function notifyOnce(title, body){
      if(!('Notification' in window)) return;
      if(Notification.permission !== 'granted') return;
      const tag = title + '|' + body;
      if(notified.has(tag)) return;
      notified.add(tag);
      try{ new Notification(title, { body, tag }); }catch(e){}
    }
    function updateClock(){
      const now = new Date();
      const y = now.getFullYear(), mo = String(now.getMonth()+1).padStart(2,'0'), d = String(now.getDate()).padStart(2,'0'), hh = String(now.getHours()).padStart(2,'0'), mm = String(now.getMinutes()).padStart(2,'0'), ss = String(now.getSeconds()).padStart(2,'0');
      if(clockEl) clockEl.textContent = `${y}-${mo}-${d} ${hh}:${mm}:${ss}`;
      clearMarks();
      const monday = getMonday(now);

      Array.from(document.querySelectorAll('#timetableBody tr')).forEach(tr=>{
        const timeCell = tr.cells[0]; if(!timeCell) return;
        const timeText = timeCell.textContent || '';
        const start = parseStart(timeText); if(!start) return;
        for(let col=1; col<=5; col++){
          const cell = tr.cells[col]; if(!cell) continue;
          if(!cell.textContent || cell.textContent.trim()==='') continue;
          const sched = new Date(monday); sched.setDate(monday.getDate() + (col-1)); sched.setHours(start.hh||0, start.mm||0, 0, 0);
          const diffMs = sched.getTime() - now.getTime(); const diffMin = diffMs/60000;
          if(diffMs>0 && diffMin <= FLASH_BEFORE_MIN){
            if(diffMin > RED_BEFORE_MIN) cell.classList.add('tt-imminent-flash');
            else { cell.classList.add('tt-imminent-red'); notifyOnce(cell.textContent.trim(), `課程 ${cell.textContent.trim()} ${timeText}`); }
          }
        }
      });

      function checkWeekend(body, offset){
        if(!body) return;
        Array.from(body.rows).forEach(tr=>{
          const timeCell = tr.cells[0]; if(!timeCell) return;
          const timeText = timeCell.textContent || '';
          const start = parseStart(timeText); if(!start) return;
          const cell = tr.cells[1]; if(!cell) return;
          if(!cell.textContent || cell.textContent.trim()==='') return;
          const sched = new Date(monday); sched.setDate(monday.getDate() + offset); sched.setHours(start.hh||0, start.mm||0, 0, 0);
          const diffMs = sched.getTime() - now.getTime(); const diffMin = diffMs/60000;
          if(diffMs>0 && diffMin <= FLASH_BEFORE_MIN){
            if(diffMin > RED_BEFORE_MIN) cell.classList.add('tt-imminent-flash');
            else { cell.classList.add('tt-imminent-red'); notifyOnce(cell.textContent.trim(), `課程 ${cell.textContent.trim()} ${timeText}`); }
          }
        });
      }
      checkWeekend(weekendSatBody, 5);
      checkWeekend(weekendSunBody, 6);
    }
    updateClock(); setInterval(updateClock, 1000);
  })();

  // weekend controls (same)
  function renderWeekendPanel(){
    const weekendPanel = document.getElementById('weekendPanel');
    const appWrap = document.getElementById('appWrap');
    const leftSidebar = document.getElementById('leftSidebar');
    const mainEl = document.querySelector('main');
    if(!weekendPanel || !toggleWeekendBtn) return;
    if(!weekendVisible){ weekendPanel.classList.add('hidden'); toggleWeekendBtn.textContent = '顯示假日'; return; }
    weekendPanel.classList.remove('hidden'); toggleWeekendBtn.textContent = '隱藏假日';
    if(weekendPlacement === 'left'){ if(leftSidebar && mainEl && leftSidebar.nextSibling !== weekendPanel) appWrap.insertBefore(weekendPanel, mainEl); }
    else { if(mainEl && mainEl.nextSibling !== weekendPanel){ if(mainEl.nextSibling) appWrap.insertBefore(weekendPanel, mainEl.nextSibling); else appWrap.appendChild(weekendPanel); } }
    setWeekendTab(weekendSelected);
    if(placeWeekendLeft) placeWeekendLeft.classList.toggle('active', weekendPlacement==='left');
    if(placeWeekendRight) placeWeekendRight.classList.toggle('active', weekendPlacement==='right');
  }
  function setWeekendTab(day){
    weekendSelected = day;
    weekendTabs.forEach(tb => tb.classList.toggle('active', tb.dataset.day === day));
    if(weekendSat) weekendSat.classList.toggle('hidden', day !== 'sat');
    if(weekendSun) weekendSun.classList.toggle('hidden', day !== 'sun');
  }
  if(toggleWeekendBtn) toggleWeekendBtn.addEventListener('click', ()=>{ weekendVisible = !weekendVisible; renderWeekendPanel(); });
  if(placeWeekendLeft) placeWeekendLeft.addEventListener('click', ()=>{ weekendPlacement = 'left'; renderWeekendPanel(); });
  if(placeWeekendRight) placeWeekendRight.addEventListener('click', ()=>{ weekendPlacement = 'right'; renderWeekendPanel(); });
  weekendTabs.forEach(tb => tb.addEventListener('click', ()=> setWeekendTab(tb.dataset.day)));

  // export/import/share/install/notify
  if(exportBtn) exportBtn.addEventListener('click', ()=>{
    const data = JSON.stringify(serializeState(), null, 2);
    const blob = new Blob([data], { type: 'application/json' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'timetable-export.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast('已匯出 JSON');
  });
  if(importFile) importFile.addEventListener('change', e=>{
    const f = e.target.files[0]; if(!f) return; const r = new FileReader();
    r.onload = ev => { try{ const snap = JSON.parse(ev.target.result); restoreState(snap, { replaceHistory:true }); debouncedSave(); showToast('已匯入'); }catch(err){ alert('匯入失敗：格式錯誤'); } };
    r.readAsText(f);
  });
  if(enableNotify) enableNotify.addEventListener('click', async ()=>{
    if(!('Notification' in window)){ alert('此瀏覽器不支援通知'); return; }
    if(Notification.permission === 'granted'){ alert('已授權通知'); return; }
    const p = await Notification.requestPermission();
    if(p === 'granted') showToast('通知已啟用'); else alert('未授權通知');
  });

  function makeShareURL(){
    try{ const snap = serializeState(); const json = JSON.stringify(snap); const raw = btoa(unescape(encodeURIComponent(json))); const u = new URL(location.href.split('?')[0]); u.searchParams.set('data', raw); return u.toString(); } catch(e){ console.warn(e); return null; }
  }
  async function handleShareClick(){
    const url = makeShareURL(); if(!url){ alert('無法產生分享連結'); return; }
    if(navigator.share){ try{ await navigator.share({ title: document.title, text: '我的課表', url }); showToast('已呼叫分享面板'); return; }catch(e){} }
    try{ await navigator.clipboard.writeText(url); showToast('連結已複製到剪貼簿'); }catch(e){ window.open(url, '_blank'); showToast('已在新分頁開啟連結'); }
  }
  if(shareLinkBtn) shareLinkBtn.addEventListener('click', handleShareClick);

  (function tryLoadFromURL(){
    try{
      const params = new URLSearchParams(location.search);
      const d = params.get('data'); if(!d) return;
      const jsonStr = decodeURIComponent(escape(atob(d)));
      const snap = JSON.parse(jsonStr);
      if(confirm('偵測到分享的課表，是否載入？（會覆蓋目前內容）')){ restoreState(snap, { replaceHistory:true }); debouncedSave(); showToast('已載入分享的課表'); }
    }catch(err){ console.warn('tryLoadFromURL failed', err); }
  })();

  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredInstallPrompt = e; if(installBtn){ installBtn.classList.remove('hidden'); installBtn.classList.add('visible'); } });
  if(installBtn) installBtn.addEventListener('click', async ()=>{
    if(!deferredInstallPrompt){ showToast('目前無安裝提示可用'); return; }
    try{ deferredInstallPrompt.prompt(); const choice = await deferredInstallPrompt.userChoice; if(choice.outcome === 'accepted') showToast('已安裝（或即將安裝）'); else showToast('安裝已取消'); deferredInstallPrompt = null; installBtn.classList.add('hidden'); }catch(err){ console.warn(err); }
  });

  // autosave indicator wrapper
  (function wrapDebounced(){
    const orig = debouncedSave;
    debouncedSave = function(){
      if(saveIndicator){ saveIndicator.classList.add('saving'); saveIndicator.textContent = '儲存中…'; }
      orig();
      clearTimeout(debouncedSave._doneTimer);
      debouncedSave._doneTimer = setTimeout(()=>{ if(saveIndicator){ saveIndicator.classList.remove('saving'); saveIndicator.textContent = '已儲存'; } }, 700);
    };
  })();
  const origSaveImmediate = saveSnapshotImmediate;
  saveSnapshotImmediate = function(){ if(saveIndicator){ saveIndicator.classList.add('saving'); saveIndicator.textContent = '儲存中…'; } origSaveImmediate(); setTimeout(()=>{ if(saveIndicator){ saveIndicator.classList.remove('saving'); saveIndicator.textContent = '已儲存'; } }, 300); };

  // keyboard shortcuts
  window.addEventListener('keydown', (ev)=>{
    const mod = ev.ctrlKey || ev.metaKey;
    if(mod && ev.key.toLowerCase() === 'z' && !ev.shiftKey){ ev.preventDefault(); if(undoBtn) undoBtn.click(); return; }
    if((mod && ev.key.toLowerCase() === 'y') || (mod && ev.shiftKey && ev.key.toLowerCase()==='z')){ ev.preventDefault(); if(redoBtn) redoBtn.click(); return; }
    if(!mod && ev.key.toLowerCase() === 'd'){ ev.preventDefault(); if(darkToggle) darkToggle.click(); return; }
    if(!mod && ev.key.toLowerCase() === 's'){ ev.preventDefault(); if(shareLinkBtn) shareLinkBtn.click(); return; }
  });

  // dark mode
  function applyDark(isDark){
    try{
      if(isDark) document.body.classList.add('dark'); else document.body.classList.remove('dark');
      if(darkToggle) darkToggle.textContent = isDark ? 'Light' : 'Dark';
      // ensure cells: if user color saved, restore; otherwise remove inline so CSS can style
      document.querySelectorAll('.course-cell').forEach(c=>{
        const name = c.textContent.trim();
        if(name && isUserSavedColor(name)){
          const hex = localStorage.getItem(COURSE_COLOR_PREFIX + name);
          if(hex){ c.dataset.userColor = hex; c.style.backgroundColor = hex; }
        } else {
          c.removeAttribute('style'); delete c.dataset.userColor;
          // in light mode, no inline -> CSS var makes it white/card; in dark, CSS var will make it dark card
        }
      });
      // time cells: use CSS var, so remove inline
      document.querySelectorAll('.time-cell').forEach(t => t.removeAttribute('style'));
      localStorage.setItem(DARK_PREF_KEY, isDark ? '1' : '0');
    }catch(e){ console.error('applyDark error', e); }
  }

  if(darkToggle){
    darkToggle.addEventListener('click', (e)=>{
      e.preventDefault();
      const willDark = !document.body.classList.contains('dark');
      applyDark(willDark);
    }, { passive:true });
  }

  // fallback ensure exist
  (function ensureDarkToggle(){ if(!document.getElementById('darkToggle')){ const fallback = document.createElement('button'); fallback.id = 'darkToggle'; fallback.textContent = document.body.classList.contains('dark') ? 'Light' : 'Dark'; fallback.className = 'btn btn-ghost'; fallback.style.marginTop = '6px'; document.body.appendChild(fallback); fallback.addEventListener('click', ()=> applyDark(!document.body.classList.contains('dark'))); } })();

  // apply saved colors on start (use localStorage mapping)
  (function applySavedColorsOnStart(){
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(k && k.startsWith(COURSE_COLOR_PREFIX)){
        const name = k.replace(COURSE_COLOR_PREFIX,'');
        const hex = localStorage.getItem(k);
        if(name && hex){
          document.querySelectorAll('.course-cell').forEach(c=>{
            if(c.textContent.trim()===name){ c.dataset.userColor = hex; c.style.backgroundColor = hex; }
          });
        }
      }
    }
  })();

  // save on unload
  window.addEventListener('beforeunload', ()=> saveSnapshotImmediate());

  // service worker (non-blocking)
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('service-worker.js').then(reg=>{ console.log('SW registered', reg); }).catch(err=>{ console.warn('SW failed', err); });
  }

  // helper debug
  window._tt_debug_inline_cells = function(){ return Array.from(document.querySelectorAll('.course-cell')).filter(c=> c.hasAttribute('style')).map(c=>({name:c.textContent.trim(), style:c.getAttribute('style'), computed:getComputedStyle(c).backgroundColor})); };
});
