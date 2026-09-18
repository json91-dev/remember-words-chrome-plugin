chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'addToWordbook',
    title: '단어장에 추가',
    contexts: ['selection'],
  });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

async function fetchTranslation(word) {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|ko`;
    const res = await fetch(url);
    const data = await res.json();
    const text = data.responseData?.translatedText;
    if (!text || text.toLowerCase() === word.toLowerCase()) return '번역 없음';
    return text;
  } catch {
    return '번역 실패';
  }
}

async function fetchTranslationWithGPT(word, apiKey, includeExample = false) {
  const systemMsg = includeExample
    ? '영어 단어나 표현의 한국어 뜻과 간단한 예문을 JSON으로만 답해. 형식: {"translation":"핵심 뜻 1~3개","example":"짧은 영어 예문 (한국어 해석)"}. 마크다운 없이.'
    : '영어 단어나 표현의 한국어 뜻을 간결하게 알려줘. 핵심 뜻 1~3개만, 마크다운 없이 짧게 답해.';
  const userMsg = includeExample ? `"${word}"` : `"${word}"의 한국어 뜻`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-5.4-nano-2026-03-17',
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg },
      ],
      max_completion_tokens: includeExample ? 150 : 80,
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '';

  if (includeExample) {
    try {
      const parsed = JSON.parse(content);
      return { translation: parsed.translation || '번역 없음', example: parsed.example || '' };
    } catch {
      return { translation: content || '번역 없음', example: '' };
    }
  }
  return { translation: content || '번역 없음', example: '' };
}

async function addWord(rawWord, sourceUrl = '', category = null) {
  const word = (rawWord || '').trim();
  if (!word) return;

  const { settings = {} } = await chrome.storage.local.get('settings');
  const autoFill = settings.autoFillWordbook !== false;
  const includeExample = autoFill && settings.autoExampleSentence !== false;

  let translation = '번역 없음';
  let example = '';
  if (autoFill) {
    if (settings.openaiApiKey) {
      try {
        const result = await fetchTranslationWithGPT(word, settings.openaiApiKey, includeExample);
        translation = result.translation;
        example = result.example;
      } catch {
        translation = await fetchTranslation(word);
      }
    } else {
      translation = await fetchTranslation(word);
    }
  }

  const { words = [] } = await chrome.storage.local.get('words');
  const isDuplicate = words.some(w => w.word.toLowerCase() === word.toLowerCase());

  const updatedWords = isDuplicate
    ? words
    : [
        {
          id: Date.now(),
          word,
          translation,
          example,
          sourceUrl,
          addedAt: new Date().toISOString(),
          category,
        },
        ...words,
      ];

  await chrome.storage.local.set({
    words: updatedWords,
    notification: { word, isDuplicate, timestamp: Date.now() },
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'addToWordbook') return;

  await addWord(info.selectionText, tab?.url || '');

  if (tab?.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'addWord') {
    addWord(msg.word, '', msg.category || null).then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
