// ポイント付与ユーティリティ
// 使い方: addPoints(pt, type, label)
// type: 'kanji' / 'math' / 'english' / 'romaji'

function addPoints(pt, type, label) {
  const owner = location.pathname.includes('/kanka/') ? 'kanka' : 'hanano';
  const key = 'pet_' + owner;
  try {
    const raw = localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : {};
    data.pts = (data.pts || 0) + pt;
    data.totalPts = (data.totalPts || 0) + pt;
    data.exp = (data.exp || 0) + Math.floor(pt * 0.3);
    data.ptsByType = data.ptsByType || {kanji:0,math:0,english:0,romaji:0};
    if(data.ptsByType[type] !== undefined) data.ptsByType[type] += pt;
    data.history = data.history || [];
    data.history.push({label, pt, time: Date.now()});
    if(data.history.length > 50) data.history = data.history.slice(-50);
    localStorage.setItem(key, JSON.stringify(data));
    showPointToast(pt);
  } catch(e) {}
}

function showPointToast(pt) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;top:16px;right:16px;
    background:#c0392b;color:white;
    padding:8px 16px;border-radius:20px;
    font-size:12pt;font-weight:700;
    z-index:9999;animation:fadeout 2s forwards;
  `;
  toast.textContent = '⭐ +' + pt + 'pt!';
  if(!document.getElementById('toast-style')) {
    const s = document.createElement('style');
    s.id = 'toast-style';
    s.textContent = '@keyframes fadeout{0%{opacity:1;transform:translateY(0)}80%{opacity:1}100%{opacity:0;transform:translateY(-20px)}}';
    document.head.appendChild(s);
  }
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}
