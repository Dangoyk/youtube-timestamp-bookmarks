'use strict';

async function init() {
  const list = document.getElementById('bookmark-list');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  let videoId;
  try {
    const url = new URL(tab.url);
    if (!url.hostname.includes('youtube.com') || url.pathname !== '/watch') throw new Error();
    videoId = url.searchParams.get('v');
    if (!videoId) throw new Error();
  } catch {
    list.innerHTML = '<p class="empty">Open a YouTube video to see bookmarks.</p>';
    return;
  }

  const key = `yt-bookmarks-${videoId}`;
  const data = await chrome.storage.local.get(key);
  const bookmarks = data[key]?.bookmarks ?? [];

  if (bookmarks.length === 0) {
    list.innerHTML = '<p class="empty">No bookmarks yet. Click the bookmark button in the player to add one.</p>';
    return;
  }

  bookmarks.forEach(bm => {
    const row = document.createElement('div');
    row.className = 'bookmark-row';
    row.dataset.id = bm.id;

    const label = document.createElement('span');
    label.className = 'bookmark-label';
    label.textContent = bm.label;

    const jumpBtn = document.createElement('button');
    jumpBtn.className = 'btn btn-jump';
    jumpBtn.textContent = 'Jump';
    jumpBtn.addEventListener('click', () => {
      chrome.tabs.sendMessage(tab.id, { action: 'seek', time: bm.time });
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-delete';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      const fresh = await chrome.storage.local.get(key);
      const entry = fresh[key];
      if (entry) {
        entry.bookmarks = entry.bookmarks.filter(b => b.id !== bm.id);
        await chrome.storage.local.set({ [key]: entry });
        chrome.tabs.sendMessage(tab.id, { action: 'rerenderMarkers' });
      }
      row.remove();
      if (!list.querySelector('.bookmark-row')) {
        list.innerHTML = '<p class="empty">No bookmarks yet. Click the bookmark button in the player to add one.</p>';
      }
    });

    row.append(label, jumpBtn, delBtn);
    list.appendChild(row);
  });
}

init();
