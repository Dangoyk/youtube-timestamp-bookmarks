'use strict';

let activeObservers = [];
let fullscreenListenerAdded = false;

function getVideoId() {
  return new URLSearchParams(location.search).get('v');
}

function formatTime(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function waitForElement(selector, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    activeObservers.push(observer);

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for ${selector}`));
    }, timeout);
  });
}

function teardown() {
  document.querySelector('.yt-bookmark-btn')?.remove();
  document.querySelector('.yt-bookmark-markers')?.remove();
  activeObservers.forEach(o => o.disconnect());
  activeObservers = [];
}

async function initialize() {
  const videoId = getVideoId();
  if (!videoId) return;

  try {
    await waitForElement('video');
    await waitForElement('.ytp-right-controls');
    await waitForElement('.ytp-progress-bar-container');
  } catch {
    return;
  }

  injectBookmarkButton();
  await renderAllMarkers(videoId);
  listenForFullscreenChange();
}

function injectBookmarkButton() {
  if (document.querySelector('.yt-bookmark-btn')) return;

  const controls = document.querySelector('.ytp-right-controls');
  if (!controls) return;

  const btn = document.createElement('button');
  btn.className = 'ytp-button yt-bookmark-btn';
  btn.title = 'Add bookmark at current time';
  btn.innerHTML = `<svg height="100%" viewBox="0 0 24 24" width="100%" fill="currentColor">
    <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
  </svg>`;
  btn.addEventListener('click', onBookmarkClick);
  controls.prepend(btn);
}

function renderMarker(wrapper, bookmark, duration) {
  const marker = document.createElement('div');
  marker.className = 'yt-bookmark-marker';
  marker.dataset.time = bookmark.time;
  marker.dataset.id = bookmark.id;
  marker.style.left = `${(bookmark.time / duration) * 100}%`;
  marker.title = `Bookmark: ${bookmark.label}`;
  marker.addEventListener('click', onMarkerClick);
  wrapper.appendChild(marker);
}

async function renderAllMarkers(videoId) {
  const video = document.querySelector('video');
  const progressBar = document.querySelector('.ytp-progress-bar-container');
  if (!video || !progressBar) return;

  if (!video.duration || !isFinite(video.duration)) {
    video.addEventListener('loadedmetadata', () => renderAllMarkers(videoId), { once: true });
    return;
  }

  progressBar.querySelector('.yt-bookmark-markers')?.remove();

  const wrapper = document.createElement('div');
  wrapper.className = 'yt-bookmark-markers';
  progressBar.appendChild(wrapper);

  const key = `yt-bookmarks-${videoId}`;
  const data = await chrome.storage.local.get(key);
  const bookmarks = data[key]?.bookmarks ?? [];

  bookmarks.forEach(bm => renderMarker(wrapper, bm, video.duration));
}

async function saveBookmark(videoId, time) {
  const key = `yt-bookmarks-${videoId}`;
  const data = await chrome.storage.local.get(key);
  const entry = data[key] ?? { videoId, bookmarks: [] };

  const bookmark = {
    id: Date.now().toString(),
    time,
    label: formatTime(time),
    createdAt: Date.now(),
  };

  entry.bookmarks.push(bookmark);
  entry.bookmarks.sort((a, b) => a.time - b.time);
  await chrome.storage.local.set({ [key]: entry });
  return bookmark;
}

async function onBookmarkClick() {
  const video = document.querySelector('video');
  const videoId = getVideoId();
  if (!video || !videoId || !isFinite(video.duration)) return;

  const bookmark = await saveBookmark(videoId, video.currentTime);

  const wrapper = document.querySelector('.yt-bookmark-markers');
  if (wrapper) renderMarker(wrapper, bookmark, video.duration);

  // Brief visual flash on the button to confirm
  const btn = document.querySelector('.yt-bookmark-btn');
  if (btn) {
    btn.classList.add('yt-bookmark-btn--saved');
    setTimeout(() => btn.classList.remove('yt-bookmark-btn--saved'), 600);
  }
}

function onMarkerClick(e) {
  e.stopPropagation();
  e.preventDefault();

  const time = parseFloat(e.currentTarget.dataset.time);
  const video = document.querySelector('video');
  if (video && !isNaN(time)) {
    video.currentTime = time;
  }
}

function listenForFullscreenChange() {
  if (fullscreenListenerAdded) return;
  fullscreenListenerAdded = true;

  document.addEventListener('fullscreenchange', () => {
    setTimeout(() => {
      injectBookmarkButton();
      const videoId = getVideoId();
      if (videoId) renderAllMarkers(videoId);
    }, 500);
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const video = document.querySelector('video');
  if (message.action === 'seek' && video) {
    video.currentTime = message.time;
  }
  if (message.action === 'rerenderMarkers') {
    const videoId = getVideoId();
    if (videoId) renderAllMarkers(videoId);
  }
  sendResponse({ ok: true });
});

// Handle SPA navigation
document.addEventListener('yt-navigate-finish', () => {
  teardown();
  initialize();
});

// Also handle back/forward navigation
window.addEventListener('popstate', () => {
  teardown();
  initialize();
});

initialize();
