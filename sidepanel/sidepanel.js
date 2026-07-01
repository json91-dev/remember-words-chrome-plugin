let allWords = [];
let toastTimer = null;

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
  window.speechSynthesis.cancel();          // 연속 클릭 시 이전 음성 중단
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

  return `
    <div class="word-card">
      <button class="delete-btn" data-id="${w.id}" title="삭제">✕</button>
      <button class="edit-btn" data-id="${w.id}" title="수정">✎</button>
      <div class="word-text">${escapeHTML(w.word)}<button class="tts-btn" data-id="${w.id}" title="발음 듣기">🔊</button></div>
      <div class="translation-text${isError ? ' error' : ''}">${escapeHTML(w.translation)}</div>
      <div class="card-meta">
        <span>${formatDate(w.addedAt)}</span>
        ${sourcePart}
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
    list.innerHTML = '<div class="no-result">검색 결과가 없어요</div>';
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
}

function updateCount(n) {
  document.getElementById('wordCount').textContent = `${n}개`;
  document.getElementById('clearAllBtn').style.display = n > 0 ? 'block' : 'none';
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
  const doCancel = () => applySearch();

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
  applySearch();
  showToast(`"${newWord}" 수정완료! ✓`);
}

async function deleteWord(id) {
  allWords = allWords.filter(w => w.id !== id);
  await chrome.storage.local.set({ words: allWords });
  applySearch();
}

function applySearch() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const filtered = q
    ? allWords.filter(w =>
        w.word.toLowerCase().includes(q) || w.translation.toLowerCase().includes(q)
      )
    : allWords;
  renderWords(filtered);
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
  const { words = [] } = await chrome.storage.local.get('words');
  allWords = words;
  renderWords(allWords);
}

document.addEventListener('DOMContentLoaded', () => {
  loadWords();

  document.getElementById('searchInput').addEventListener('input', applySearch);

  document.getElementById('clearAllBtn').addEventListener('click', () => {
    if (!allWords.length) return;
    showConfirmBar(`저장된 단어 ${allWords.length}개를 모두 삭제할까요?`, async () => {
      allWords = [];
      await chrome.storage.local.set({ words: [] });
      renderWords([]);
      showToast('전체 삭제 완료 🗑️');
    });
  });
});

// ── Storage listener (real-time sync) ────────────────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.words) {
    allWords = changes.words.newValue || [];
    applySearch();
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
