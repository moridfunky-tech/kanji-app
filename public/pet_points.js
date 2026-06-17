// ポイント付与ユーティリティ（Upstash KV経由）
function addPoints(pt, type, label) {
  const owner = location.pathname.includes('/kanka/') ? 'kanka' : 'hanano';
  fetch('/api/pet/' + owner + '/addpoints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pt, type, label })
  }).catch(function() {});
  showPointToast(pt);
}

function showPointToast(pt) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:16px;right:16px;background:#c0392b;color:white;padding:8px 16px;border-radius:20px;font-size:12pt;font-weight:700;z-index:9999;animation:fadeout 2s forwards;';
  toast.textContent = '⭐ +' + pt + 'pt!';
  if (!document.getElementById('toast-style')) {
    const s = document.createElement('style');
    s.id = 'toast-style';
    s.textContent = '@keyframes fadeout{0%{opacity:1;transform:translateY(0)}80%{opacity:1}100%{opacity:0;transform:translateY(-20px)}}';
    document.head.appendChild(s);
  }
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 2000);
}

