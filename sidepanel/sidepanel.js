let allWords = [];
let allCategories = [];
let selectedCategory = 'all';
let toastTimer = null;
let activeDropdownWordId = null;

let currentView = 'wordbook';
let allGlossaryTerms = [];
let allGlossaryCategories = [];
let selectedGlossaryCategory = 'all';

// ── Utilities ─────────────────────────────────────────────────────────────────

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function getHostname(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function speakWord(text, btn) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  document.querySelectorAll('.tts-btn.playing').forEach(b => b.classList.remove('playing'));
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  if (btn) {
    btn.classList.add('playing');
    u.onend = u.onerror = () => btn.classList.remove('playing');
  }
  window.speechSynthesis.speak(u);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function createCardHTML(w) {
  const hostname = getHostname(w.sourceUrl);
  const sourcePart = hostname
    ? `<span class="sep">·</span><a href="${escapeHTML(w.sourceUrl)}" target="_blank" class="source-link" title="${escapeHTML(w.sourceUrl)}">${escapeHTML(hostname)}</a>`
    : '';

  const isError = w.translation === '번역 실패' || w.translation === '번역 없음';
  const catLabel = w.category ? escapeHTML(w.category) : '+ 카테고리';
  const catClass = w.category ? 'cat-badge' : 'cat-badge unassigned';

  return `
    <div class="word-card">
      <button class="delete-btn" data-id="${w.id}" title="삭제">✕</button>
      <button class="edit-btn" data-id="${w.id}" title="수정">✎</button>
      <div class="word-text"><span class="word-copy" data-id="${w.id}" title="클릭하여 복사">${escapeHTML(w.word)}</span><button class="tts-btn" data-id="${w.id}" title="발음 듣기">🔊</button></div>
      <div class="translation-text${isError ? ' error' : ''}">${escapeHTML(w.translation)}</div>
      <div class="card-meta">
        <span>${formatDate(w.addedAt)}</span>
        ${sourcePart}
        <button class="${catClass}" data-id="${w.id}">${catLabel}</button>
      </div>
    </div>
  `;
}

function renderWords(words) {
  const list = document.getElementById('wordList');
  const emptyState = document.getElementById('emptyState');

  updateCount(allWords.length);

  if (allWords.length === 0) {
    list.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  if (words.length === 0) {
    let msg = '이 카테고리에 단어가 없어요';
    if (selectedCategory === 'uncategorized') msg = '미분류 단어가 없어요';
    list.innerHTML = `<div class="no-result">${msg}</div>`;
    return;
  }

  list.innerHTML = words.map(createCardHTML).join('');

  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteWord(Number(btn.dataset.id)));
  });
  list.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const word = allWords.find(w => w.id === Number(btn.dataset.id));
      if (word) startEdit(btn.closest('.word-card'), word);
    });
  });
  list.querySelectorAll('.tts-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const word = allWords.find(w => w.id === Number(btn.dataset.id));
      if (word) speakWord(word.word, btn);
    });
  });
  list.querySelectorAll('.word-copy').forEach(span => {
    span.addEventListener('click', async () => {
      const word = allWords.find(w => w.id === Number(span.dataset.id));
      if (!word) return;
      try {
        await navigator.clipboard.writeText(word.word);
        showToast(`"${word.word}" 복사됨 📋`);
      } catch {
        showToast('복사 실패');
      }
    });
  });
  list.querySelectorAll('.cat-badge').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCategoryDropdown(btn, Number(btn.dataset.id));
    });
  });
}

function updateCount(n) {
  document.getElementById('wordCount').textContent = `${n}개`;
  document.getElementById('clearAllBtn').style.display = n > 0 ? 'block' : 'none';
}

// ── Category ──────────────────────────────────────────────────────────────────

function renderCategoryTabs() {
  const tabs = document.getElementById('categoryTabs');
  const fixed = [
    { key: 'all', label: '전체', deletable: false },
    { key: 'uncategorized', label: '미분류', deletable: false },
  ];
  const userTabs = allCategories.map(c => ({ key: c, label: c, deletable: true }));

  tabs.innerHTML = [...fixed, ...userTabs].map(t => `
    <button class="cat-tab${selectedCategory === t.key ? ' active' : ''}" data-key="${escapeHTML(t.key)}">
      ${escapeHTML(t.label)}${t.deletable ? `<span class="cat-tab-del" data-key="${escapeHTML(t.key)}">✕</span>` : ''}
    </button>
  `).join('') + `<button class="cat-tab cat-add-tab" id="catAddBtn">+</button>`;

  tabs.querySelectorAll('.cat-tab:not(.cat-add-tab)').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.classList.contains('cat-tab-del')) return;
      selectCategory(btn.dataset.key);
    });
  });

  tabs.querySelectorAll('.cat-tab-del').forEach(span => {
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = span.dataset.key;
      showConfirmBar(`'${key}' 카테고리를 삭제할까요? (단어들은 미분류로 이동)`, () => deleteCategory(key));
    });
  });

  document.getElementById('catAddBtn').addEventListener('click', () => {
    document.getElementById('catInputBar').classList.add('show');
    document.getElementById('catNameInput').focus();
  });
}

function selectCategory(key) {
  selectedCategory = key;
  const toggleBar = document.getElementById('categoryToggleBar');
  if (key !== 'all' && key !== 'uncategorized') {
    document.getElementById('addToCategoryLabelText').textContent = `'${key}' 카테고리로 추가`;
    document.getElementById('addToCategoryCheck').checked = true;
    toggleBar.style.display = 'flex';
  } else {
    toggleBar.style.display = 'none';
  }
  renderCategoryTabs();
  applyFilter();
}

async function addCategory(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  if (allCategories.includes(trimmed)) {
    showToast(`'${trimmed}' 카테고리가 이미 있어요`);
    return;
  }
  allCategories = [...allCategories, trimmed];
  await chrome.storage.local.set({ categories: allCategories });
  renderCategoryTabs();
  showToast(`'${trimmed}' 카테고리 추가됨`);
}

async function deleteCategory(name) {
  allCategories = allCategories.filter(c => c !== name);
  allWords = allWords.map(w => w.category === name ? { ...w, category: null } : w);
  await chrome.storage.local.set({ categories: allCategories, words: allWords });
  if (selectedCategory === name) {
    selectedCategory = 'all';
    document.getElementById('categoryToggleBar').style.display = 'none';
  }
  renderCategoryTabs();
  applyFilter();
  showToast(`'${name}' 카테고리 삭제됨`);
}

async function setWordCategory(wordId, category) {
  const idx = allWords.findIndex(w => w.id === wordId);
  if (idx === -1) return;
  allWords[idx] = { ...allWords[idx], category };
  await chrome.storage.local.set({ words: allWords });
  applyFilter();
}

function applyFilter() {
  let filtered;
  if (selectedCategory === 'all') {
    filtered = allWords;
  } else if (selectedCategory === 'uncategorized') {
    filtered = allWords.filter(w => !w.category);
  } else {
    filtered = allWords.filter(w => w.category === selectedCategory);
  }
  renderWords(filtered);
}

// ── Category dropdown ─────────────────────────────────────────────────────────

function openCategoryDropdown(btn, id, mode = 'wordbook') {
  const dropdown = document.getElementById('categoryDropdown');
  const cats = mode === 'glossary' ? allGlossaryCategories : allCategories;
  const record = mode === 'glossary'
    ? allGlossaryTerms.find(t => t.id === id)
    : allWords.find(w => w.id === id);
  if (!record) return;

  const items = [
    { label: '없음 (미분류)', value: null },
    ...cats.map(c => ({ label: c, value: c })),
  ];

  dropdown.innerHTML = items.map(item => {
    const val = item.value === null ? '' : escapeHTML(item.value);
    const isActive = record.category === item.value;
    return `<button class="cat-dropdown-item${isActive ? ' active' : ''}" data-value="${val}">${escapeHTML(item.label)}</button>`;
  }).join('');

  const rect = btn.getBoundingClientRect();
  dropdown.style.display = 'block';
  dropdown.style.top = `${rect.bottom + 4}px`;
  dropdown.style.left = `${rect.left}px`;
  activeDropdownWordId = id;

  dropdown.querySelectorAll('.cat-dropdown-item').forEach(item => {
    item.addEventListener('click', async () => {
      const value = item.dataset.value || null;
      if (mode === 'glossary') {
        await setGlossaryTermCategory(id, value);
      } else {
        await setWordCategory(id, value);
      }
      closeDropdown();
    });
  });
}

function closeDropdown() {
  document.getElementById('categoryDropdown').style.display = 'none';
  activeDropdownWordId = null;
}

// ── Actions ───────────────────────────────────────────────────────────────────

function startEdit(cardEl, word) {
  cardEl.classList.add('editing');
  cardEl.innerHTML = `
    <div class="edit-form">
      <label class="edit-label">단어</label>
      <input class="edit-input edit-word" placeholder="단어">
      <label class="edit-label">번역</label>
      <input class="edit-input edit-trans" placeholder="번역">
      <div class="edit-actions">
        <button class="edit-cancel-btn">취소</button>
        <button class="edit-save-btn">저장</button>
      </div>
    </div>
  `;

  const wordInput = cardEl.querySelector('.edit-word');
  const transInput = cardEl.querySelector('.edit-trans');
  wordInput.value = word.word;
  transInput.value = word.translation;
  wordInput.focus();
  wordInput.select();

  const doSave = () => saveEdit(word.id, wordInput, transInput);
  const doCancel = () => applyFilter();

  cardEl.querySelector('.edit-save-btn').addEventListener('click', doSave);
  cardEl.querySelector('.edit-cancel-btn').addEventListener('click', doCancel);

  [wordInput, transInput].forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') doSave();
      if (e.key === 'Escape') doCancel();
    });
  });
}

async function saveEdit(id, wordInput, transInput) {
  const newWord = wordInput.value.trim();
  const newTrans = transInput.value.trim();
  if (!newWord) {
    wordInput.style.borderColor = '#EF4444';
    wordInput.focus();
    return;
  }

  const idx = allWords.findIndex(w => w.id === id);
  if (idx !== -1) {
    allWords[idx] = { ...allWords[idx], word: newWord, translation: newTrans };
    await chrome.storage.local.set({ words: allWords });
  }
  applyFilter();
  showToast(`"${newWord}" 수정완료! ✓`);
}

async function deleteWord(id) {
  allWords = allWords.filter(w => w.id !== id);
  await chrome.storage.local.set({ words: allWords });
  applyFilter();
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, isDuplicate = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast show${isDuplicate ? ' duplicate' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 2600);
}

// ── Confirm bar (bottom slide-up) ─────────────────────────────────────────────

function showConfirmBar(message, onConfirm) {
  const bar = document.getElementById('confirmBar');
  const okBtn = document.getElementById('confirmBarOk');
  const cancelBtn = document.getElementById('confirmBarCancel');
  document.getElementById('confirmBarMsg').textContent = message;
  bar.classList.add('show');

  const hide = () => {
    bar.classList.remove('show');
    okBtn.onclick = null;
    cancelBtn.onclick = null;
    document.removeEventListener('keydown', onKey);
  };
  const onKey = e => { if (e.key === 'Escape') hide(); };

  okBtn.onclick = () => { hide(); onConfirm(); };
  cancelBtn.onclick = hide;
  document.addEventListener('keydown', onKey);
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function loadWords() {
  const { words = [], categories = [] } = await chrome.storage.local.get(['words', 'categories']);
  allWords = words.map(w => ({ category: null, ...w }));
  allCategories = categories;
  renderCategoryTabs();
  applyFilter();
}

// ── View switching ─────────────────────────────────────────────────────────────

function switchView(view) {
  currentView = view;
  document.getElementById('wordbookView').style.display = view === 'wordbook' ? '' : 'none';
  document.getElementById('glossaryView').style.display = view === 'glossary' ? '' : 'none';
  document.getElementById('viewWordbookBtn').classList.toggle('active', view === 'wordbook');
  document.getElementById('viewGlossaryBtn').classList.toggle('active', view === 'glossary');
  closeDropdown();
}

// ── Glossary Category ──────────────────────────────────────────────────────────

function renderGlossaryTabs() {
  const tabs = document.getElementById('gCategoryTabs');
  const fixed = [
    { key: 'all', label: '전체', deletable: false },
    { key: 'uncategorized', label: '미분류', deletable: false },
  ];
  const userTabs = allGlossaryCategories.map(c => ({ key: c, label: c, deletable: true }));

  tabs.innerHTML = [...fixed, ...userTabs].map(t => `
    <button class="cat-tab${selectedGlossaryCategory === t.key ? ' active' : ''}" data-key="${escapeHTML(t.key)}">
      ${escapeHTML(t.label)}${t.deletable ? `<span class="cat-tab-del" data-key="${escapeHTML(t.key)}">✕</span>` : ''}
    </button>
  `).join('') + `<button class="cat-tab cat-add-tab" id="gCatAddBtn">+</button>`;

  tabs.querySelectorAll('.cat-tab:not(.cat-add-tab)').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.classList.contains('cat-tab-del')) return;
      selectGlossaryCategory(btn.dataset.key);
    });
  });

  tabs.querySelectorAll('.cat-tab-del').forEach(span => {
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = span.dataset.key;
      showConfirmBar(`'${key}' 카테고리를 삭제할까요? (용어들은 미분류로 이동)`, () => deleteGlossaryCategory(key));
    });
  });

  document.getElementById('gCatAddBtn').addEventListener('click', () => {
    document.getElementById('catInputBar').classList.add('show');
    document.getElementById('catNameInput').focus();
  });
}

function selectGlossaryCategory(key) {
  selectedGlossaryCategory = key;
  const toggleBar = document.getElementById('gCategoryToggleBar');
  if (key !== 'all' && key !== 'uncategorized') {
    document.getElementById('addToGCategoryLabelText').textContent = `'${key}' 카테고리로 추가`;
    document.getElementById('addToGCategoryCheck').checked = true;
    toggleBar.style.display = 'flex';
  } else {
    toggleBar.style.display = 'none';
  }
  renderGlossaryTabs();
  applyGlossaryFilter();
}

async function addGlossaryCategory(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  if (allGlossaryCategories.includes(trimmed)) {
    showToast(`'${trimmed}' 카테고리가 이미 있어요`);
    return;
  }
  allGlossaryCategories = [...allGlossaryCategories, trimmed];
  await chrome.storage.local.set({ glossaryCategories: allGlossaryCategories });
  renderGlossaryTabs();
  showToast(`'${trimmed}' 카테고리 추가됨`);
}

async function deleteGlossaryCategory(name) {
  allGlossaryCategories = allGlossaryCategories.filter(c => c !== name);
  allGlossaryTerms = allGlossaryTerms.map(t => t.category === name ? { ...t, category: null } : t);
  await chrome.storage.local.set({ glossaryCategories: allGlossaryCategories, glossaryTerms: allGlossaryTerms });
  if (selectedGlossaryCategory === name) {
    selectedGlossaryCategory = 'all';
    document.getElementById('gCategoryToggleBar').style.display = 'none';
  }
  renderGlossaryTabs();
  applyGlossaryFilter();
  showToast(`'${name}' 카테고리 삭제됨`);
}

async function setGlossaryTermCategory(termId, category) {
  const idx = allGlossaryTerms.findIndex(t => t.id === termId);
  if (idx === -1) return;
  allGlossaryTerms[idx] = { ...allGlossaryTerms[idx], category };
  await chrome.storage.local.set({ glossaryTerms: allGlossaryTerms });
  applyGlossaryFilter();
}

// ── Glossary Rendering ─────────────────────────────────────────────────────────

function createGlossaryCardHTML(t) {
  const catLabel = t.category ? escapeHTML(t.category) : '+ 카테고리';
  const catClass = t.category ? 'cat-badge' : 'cat-badge unassigned';
  const hasDesc = t.description && t.description.trim();

  return `
    <div class="word-card glossary-card">
      <button class="delete-btn" data-gid="${t.id}" title="삭제">✕</button>
      <button class="edit-btn" data-gid="${t.id}" title="수정">✎</button>
      <div class="word-text">
        <span class="word-copy" data-gid="${t.id}" title="클릭하여 복사">${escapeHTML(t.term)}</span>
        <button class="ai-btn" data-gid="${t.id}" title="AI 설명 자동완성">✨</button>
      </div>
      <div class="desc-text${hasDesc ? '' : ' empty'}">${hasDesc ? escapeHTML(t.description) : 'AI 버튼으로 설명 자동완성'}</div>
      <div class="card-meta">
        <span>${formatDate(t.addedAt)}</span>
        <button class="${catClass}" data-gid="${t.id}">${catLabel}</button>
      </div>
    </div>
  `;
}

function updateGlossaryCount(n) {
  document.getElementById('glossaryCount').textContent = `${n}개`;
  document.getElementById('clearGlossaryBtn').style.display = n > 0 ? 'block' : 'none';
}

function renderGlossaryTerms(terms) {
  const list = document.getElementById('glossaryList');
  const emptyState = document.getElementById('glossaryEmptyState');

  updateGlossaryCount(allGlossaryTerms.length);

  if (allGlossaryTerms.length === 0) {
    list.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  if (terms.length === 0) {
    const msg = selectedGlossaryCategory === 'uncategorized' ? '미분류 용어가 없어요' : '이 카테고리에 용어가 없어요';
    list.innerHTML = `<div class="no-result">${msg}</div>`;
    return;
  }

  list.innerHTML = terms.map(createGlossaryCardHTML).join('');

  list.querySelectorAll('.delete-btn[data-gid]').forEach(btn => {
    btn.addEventListener('click', () => deleteGlossaryTerm(Number(btn.dataset.gid)));
  });

  list.querySelectorAll('.edit-btn[data-gid]').forEach(btn => {
    btn.addEventListener('click', () => {
      const term = allGlossaryTerms.find(t => t.id === Number(btn.dataset.gid));
      if (term) startGlossaryEdit(btn.closest('.word-card'), term);
    });
  });

  list.querySelectorAll('.word-copy[data-gid]').forEach(span => {
    span.addEventListener('click', async () => {
      const term = allGlossaryTerms.find(t => t.id === Number(span.dataset.gid));
      if (!term) return;
      try {
        await navigator.clipboard.writeText(term.term);
        showToast(`"${term.term}" 복사됨 📋`);
      } catch {
        showToast('복사 실패');
      }
    });
  });

  list.querySelectorAll('.ai-btn').forEach(btn => {
    btn.addEventListener('click', () => aiAutoFill(Number(btn.dataset.gid)));
  });

  list.querySelectorAll('.cat-badge[data-gid]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCategoryDropdown(btn, Number(btn.dataset.gid), 'glossary');
    });
  });
}

function applyGlossaryFilter() {
  let filtered;
  if (selectedGlossaryCategory === 'all') {
    filtered = allGlossaryTerms;
  } else if (selectedGlossaryCategory === 'uncategorized') {
    filtered = allGlossaryTerms.filter(t => !t.category);
  } else {
    filtered = allGlossaryTerms.filter(t => t.category === selectedGlossaryCategory);
  }
  renderGlossaryTerms(filtered);
}

// ── Glossary CRUD ──────────────────────────────────────────────────────────────

async function addGlossaryTerm(term, category = null) {
  const trimmed = term.trim();
  if (!trimmed) return;
  if (allGlossaryTerms.some(t => t.term.toLowerCase() === trimmed.toLowerCase())) {
    showToast(`'${trimmed}' 이미 있어요`);
    return;
  }
  const newTerm = {
    id: Date.now(),
    term: trimmed,
    category,
    description: '',
    addedAt: new Date().toISOString(),
  };
  allGlossaryTerms = [newTerm, ...allGlossaryTerms];
  await chrome.storage.local.set({ glossaryTerms: allGlossaryTerms });
  applyGlossaryFilter();
  showToast(`"${trimmed}" 추가됨 ✓`);
}

async function deleteGlossaryTerm(id) {
  allGlossaryTerms = allGlossaryTerms.filter(t => t.id !== id);
  await chrome.storage.local.set({ glossaryTerms: allGlossaryTerms });
  applyGlossaryFilter();
}

function startGlossaryEdit(cardEl, term) {
  cardEl.classList.add('editing');
  cardEl.innerHTML = `
    <div class="edit-form">
      <label class="edit-label">용어</label>
      <input class="edit-input edit-term" placeholder="용어">
      <label class="edit-label">설명</label>
      <textarea class="edit-input edit-desc" placeholder="설명" rows="3"></textarea>
      <div class="edit-actions">
        <button class="edit-cancel-btn">취소</button>
        <button class="edit-save-btn">저장</button>
      </div>
    </div>
  `;
  const termInput = cardEl.querySelector('.edit-term');
  const descInput = cardEl.querySelector('.edit-desc');
  termInput.value = term.term;
  descInput.value = term.description || '';
  termInput.focus();
  termInput.select();

  const doSave = () => saveGlossaryEdit(term.id, termInput, descInput);
  const doCancel = () => applyGlossaryFilter();

  cardEl.querySelector('.edit-save-btn').addEventListener('click', doSave);
  cardEl.querySelector('.edit-cancel-btn').addEventListener('click', doCancel);
  [termInput, descInput].forEach(input => {
    input.addEventListener('keydown', e => { if (e.key === 'Escape') doCancel(); });
  });
}

async function saveGlossaryEdit(id, termInput, descInput) {
  const newTerm = termInput.value.trim();
  const newDesc = descInput.value.trim();
  if (!newTerm) {
    termInput.style.borderColor = '#EF4444';
    termInput.focus();
    return;
  }
  const idx = allGlossaryTerms.findIndex(t => t.id === id);
  if (idx !== -1) {
    allGlossaryTerms[idx] = { ...allGlossaryTerms[idx], term: newTerm, description: newDesc };
    await chrome.storage.local.set({ glossaryTerms: allGlossaryTerms });
  }
  applyGlossaryFilter();
  showToast(`"${newTerm}" 수정완료! ✓`);
}

// ── AI Auto-fill ───────────────────────────────────────────────────────────────

async function aiAutoFill(termId) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  const apiKey = settings.openaiApiKey;

  if (!apiKey) {
    document.getElementById('apiKeyBar').classList.add('show');
    document.getElementById('apiKeyInput').focus();
    showToast('먼저 API 키를 설정해주세요');
    return;
  }

  const term = allGlossaryTerms.find(t => t.id === termId);
  if (!term) return;

  const btn = document.querySelector(`.ai-btn[data-gid="${termId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-nano-2026-03-17',
        messages: [
          {
            role: 'system',
            content: '너는 단어 암기 도우미야. 사용자가 암기하고 싶은 단어나 개념을 입력하면 핵심만 짧고 명확하게 설명해줘. 반드시 마크다운(**, -, #, * 등) 없이 일반 텍스트로만 답변해. 줄바꿈은 필요한 경우에만 사용해.',
          },
          {
            role: 'user',
            content: `"${term.term}"에 대해 한국어로 쉽고 간결하게 설명해줘. 3~5문장 이내로.`,
          },
        ],
        max_completion_tokens: 300,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API 오류 ${res.status}`);
    }

    const data = await res.json();
    const description = data.choices?.[0]?.message?.content?.trim();

    if (description) {
      const idx = allGlossaryTerms.findIndex(t => t.id === termId);
      if (idx !== -1) {
        allGlossaryTerms[idx] = { ...allGlossaryTerms[idx], description };
        await chrome.storage.local.set({ glossaryTerms: allGlossaryTerms });
        applyGlossaryFilter();
        showToast('설명 자동완성 완료! ✨');
      }
    }
  } catch (err) {
    showToast(`AI 오류: ${err.message}`);
    if (btn) { btn.disabled = false; btn.textContent = '✨'; }
  }
}

// ── Glossary Init ──────────────────────────────────────────────────────────────

async function loadGlossary() {
  const { glossaryTerms = [], glossaryCategories = [] } = await chrome.storage.local.get(['glossaryTerms', 'glossaryCategories']);
  allGlossaryTerms = glossaryTerms.map(t => ({ category: null, description: '', ...t }));
  allGlossaryCategories = glossaryCategories;
  renderGlossaryTabs();
  applyGlossaryFilter();
}

document.addEventListener('DOMContentLoaded', () => {
  loadWords();
  loadGlossary();

  // View switcher
  document.getElementById('viewWordbookBtn').addEventListener('click', () => switchView('wordbook'));
  document.getElementById('viewGlossaryBtn').addEventListener('click', () => switchView('glossary'));

  const newWordInput = document.getElementById('newWordInput');
  const addWordBtn = document.getElementById('addWordBtn');

  async function submitNewWord() {
    const word = newWordInput.value.trim();
    if (!word) return;

    let category = null;
    if (selectedCategory !== 'all' && selectedCategory !== 'uncategorized') {
      if (document.getElementById('addToCategoryCheck').checked) {
        category = selectedCategory;
      }
    }

    newWordInput.disabled = true;
    addWordBtn.disabled = true;
    try {
      await chrome.runtime.sendMessage({ type: 'addWord', word, category });
      newWordInput.value = '';
    } catch {
      showToast('추가 실패');
    } finally {
      newWordInput.disabled = false;
      addWordBtn.disabled = false;
      newWordInput.focus();
    }
  }

  addWordBtn.addEventListener('click', submitNewWord);
  newWordInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitNewWord(); });

  document.getElementById('clearAllBtn').addEventListener('click', () => {
    if (!allWords.length) return;
    showConfirmBar(`저장된 단어 ${allWords.length}개를 모두 삭제할까요?`, async () => {
      allWords = [];
      await chrome.storage.local.set({ words: [] });
      applyFilter();
      showToast('전체 삭제 완료 🗑️');
    });
  });

  // Category input bar (slide-up)
  const catInputBar = document.getElementById('catInputBar');
  const catNameInput = document.getElementById('catNameInput');

  const hideCatInputBar = () => {
    catInputBar.classList.remove('show');
    catNameInput.value = '';
  };

  document.getElementById('catInputConfirm').addEventListener('click', async () => {
    const name = catNameInput.value.trim();
    if (name) {
      if (currentView === 'glossary') await addGlossaryCategory(name);
      else await addCategory(name);
    }
    hideCatInputBar();
  });

  document.getElementById('catInputCancel').addEventListener('click', hideCatInputBar);

  catNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('catInputConfirm').click();
    if (e.key === 'Escape') hideCatInputBar();
  });

  // Glossary term add
  const newTermInput = document.getElementById('newTermInput');
  const addTermBtn = document.getElementById('addTermBtn');

  async function submitNewTerm() {
    const term = newTermInput.value.trim();
    if (!term) return;
    let category = null;
    if (selectedGlossaryCategory !== 'all' && selectedGlossaryCategory !== 'uncategorized') {
      if (document.getElementById('addToGCategoryCheck').checked) {
        category = selectedGlossaryCategory;
      }
    }
    newTermInput.disabled = true;
    addTermBtn.disabled = true;
    await addGlossaryTerm(term, category);
    newTermInput.value = '';
    newTermInput.disabled = false;
    addTermBtn.disabled = false;
    newTermInput.focus();
  }

  addTermBtn.addEventListener('click', submitNewTerm);
  newTermInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitNewTerm(); });

  // Clear glossary
  document.getElementById('clearGlossaryBtn').addEventListener('click', () => {
    if (!allGlossaryTerms.length) return;
    showConfirmBar(`용어 ${allGlossaryTerms.length}개를 모두 삭제할까요?`, async () => {
      allGlossaryTerms = [];
      await chrome.storage.local.set({ glossaryTerms: [] });
      applyGlossaryFilter();
      showToast('전체 삭제 완료 🗑️');
    });
  });

  // API Key bar
  const apiKeyBar = document.getElementById('apiKeyBar');
  const apiKeyInput = document.getElementById('apiKeyInput');

  const hideApiKeyBar = () => {
    apiKeyBar.classList.remove('show');
    apiKeyInput.value = '';
  };

  document.getElementById('apiKeyBtn').addEventListener('click', async () => {
    const { settings = {} } = await chrome.storage.local.get('settings');
    if (settings.openaiApiKey) apiKeyInput.value = settings.openaiApiKey;
    apiKeyBar.classList.add('show');
    apiKeyInput.focus();
  });

  document.getElementById('apiKeyConfirm').addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      await chrome.storage.local.set({ settings: { openaiApiKey: key } });
      showToast('API 키 저장됨 ✓');
    }
    hideApiKeyBar();
  });

  document.getElementById('apiKeyCancel').addEventListener('click', hideApiKeyBar);

  apiKeyInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('apiKeyConfirm').click();
    if (e.key === 'Escape') hideApiKeyBar();
  });

  // Close category dropdown on outside click
  document.addEventListener('click', (e) => {
    if (activeDropdownWordId === null) return;
    if (!e.target.closest('#categoryDropdown') && !e.target.classList.contains('cat-badge')) {
      closeDropdown();
    }
  });

  // Close dropdown on scroll
  document.addEventListener('scroll', closeDropdown, true);
});

// ── Storage listener (real-time sync) ────────────────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.words) {
    const newWords = changes.words.newValue || [];
    allWords = newWords.map(w => ({ category: null, ...w }));
    applyFilter();
  }

  if (changes.categories) {
    allCategories = changes.categories.newValue || [];
    renderCategoryTabs();
  }

  if (changes.glossaryTerms) {
    allGlossaryTerms = (changes.glossaryTerms.newValue || []).map(t => ({ category: null, description: '', ...t }));
    if (currentView === 'glossary') applyGlossaryFilter();
  }

  if (changes.glossaryCategories) {
    allGlossaryCategories = changes.glossaryCategories.newValue || [];
    if (currentView === 'glossary') renderGlossaryTabs();
  }

  if (changes.notification) {
    const { word, isDuplicate, timestamp } = changes.notification.newValue;
    if (Date.now() - timestamp < 5000) {
      showToast(
        isDuplicate ? `"${word}" 이미 저장되어 있어요` : `"${word}" 저장완료! ✓`,
        isDuplicate
      );
    }
  }
});
