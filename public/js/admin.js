function showToast(message, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = message;
  t.className = 'toast show ' + (type || 'info');
  setTimeout(() => { t.className = 'toast'; }, 3000);
}
