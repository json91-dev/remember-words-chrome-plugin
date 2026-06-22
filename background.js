chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'addToWordbook',
    title: '단어장에 추가',
    contexts: ['selection'],
  });
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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'addToWordbook') return;

  const word = (info.selectionText || '').trim();
  if (!word) return;

  const translation = await fetchTranslation(word);

  const { words = [] } = await chrome.storage.local.get('words');
  const isDuplicate = words.some(w => w.word.toLowerCase() === word.toLowerCase());

  const updatedWords = isDuplicate
    ? words
    : [
        {
          id: Date.now(),
          word,
          translation,
          sourceUrl: tab?.url || '',
          addedAt: new Date().toISOString(),
        },
        ...words,
      ];

  await chrome.storage.local.set({
    words: updatedWords,
    notification: { word, isDuplicate, timestamp: Date.now() },
  });

  if (tab?.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
