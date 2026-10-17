// ============ DARK MODE ============
(function () {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  });
})();

// ============ TOAST ============
function showToast(message, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = message;
  t.className = 'toast show ' + (type || 'info');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ============ CONFETTI ============
function burstConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.display = 'block';

  const colors = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#0ea5e9'];
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 200,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    color: colors[Math.floor(Math.random() * colors.length)],
    vx: -2 + Math.random() * 4,
    vy: 3 + Math.random() * 4,
    rot: Math.random() * Math.PI,
    vr: -0.15 + Math.random() * 0.3
  }));

  let frames = 0;
  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    frames++;
    if (frames < 180) requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.style.display = 'none'; }
  }
  frame();
}

// ============ VOTE ============
async function vote(id) {
  try {
    const res = await fetch('/vote/' + id, { method: 'POST' });
    const data = await res.json();
    showToast(data.message, data.success ? 'success' : 'error');
    if (data.success) {
      const el = document.querySelector('.votes-count[data-id="' + id + '"]');
      if (el) {
        const num = parseInt(el.textContent) + 1;
        el.textContent = num + ' votes';
      }
      burstConfetti();
    }
  } catch (e) {
    showToast('Something went wrong', 'error');
  }
}

// ============ SHARE ============
function shareContestant(name, id) {
  const url = window.location.origin + '/contestants#' + id;
  const text = 'Vote for ' + name + ' in Mr & Miss!';
  if (navigator.share) {
    navigator.share({ title: 'Mr & Miss', text: text, url: url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text + ' ' + url);
    showToast('📋 Link copied to clipboard!', 'success');
  }
}

// ============ COUNTDOWN ============
(function () {
  const el = document.querySelector('.countdown');
  if (!el) return;
  const deadline = new Date(el.dataset.deadline).getTime();

  function tick() {
    const now = Date.now();
    const diff = Math.max(0, deadline - now);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);
    const pad = n => String(n).padStart(2, '0');
    el.querySelector('[data-days]').textContent = pad(days);
    el.querySelector('[data-hours]').textContent = pad(hours);
    el.querySelector('[data-mins]').textContent = pad(mins);
    el.querySelector('[data-secs]').textContent = pad(secs);
  }
  tick();
  setInterval(tick, 1000);
})();

// ============ SEARCH ============
(function () {
  const input = document.getElementById('search');
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    document.querySelectorAll('[data-grid] .card').forEach(card => {
      const match = !q || card.dataset.name.includes(q);
      card.style.display = match ? '' : 'none';
    });
  });
})();

// ============ LIVE UPDATES (results page + home stats) ============
(function () {
  const isResults = !!document.getElementById('results-body');
  const hasLiveStats = !!document.querySelector('[data-live-votes]');
  if (!isResults && !hasLiveStats) return;

  async function refresh() {
    try {
      const res = await fetch('/api/contestants');
      const data = await res.json();

      if (hasLiveStats) {
        const total = data.reduce((s, c) => s + c.votes, 0);
        document.querySelector('[data-live-votes]').textContent = total;
        document.querySelector('[data-live-contestants]').textContent = data.length;
      }

      data.forEach(c => {
        document.querySelectorAll('[data-votes-id="' + c.id + '"]').forEach(el => {
          el.textContent = c.votes;
        });
      });

      if (isResults) {
        const t = document.getElementById('last-refresh');
        if (t) t.textContent = new Date().toLocaleTimeString();
      }
    } catch (e) { /* silent */ }
  }

  setInterval(refresh, 5000);
})();

// ============ EMAIL / OTP ============
let __pendingVoteId = null;

function openEmailModal(voteId) {
  __pendingVoteId = voteId;
  document.getElementById('email-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('voter-email').focus(), 100);
}
function closeEmailModal() {
  document.getElementById('email-modal').style.display = 'none';
  __pendingVoteId = null;
}

async function sendOtp() {
  const email = document.getElementById('voter-email').value.trim();
  if (!email) return showToast('Enter your email', 'error');
  const res = await fetch('/auth/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const data = await res.json();
  showToast(data.message, data.success ? 'success' : 'error');
  if (data.success) {
    setTimeout(() => location.href = '/auth/pending', 700);
  }
}

// Override the vote() function to require verification
const __oldVote = window.vote;
window.vote = async function (id) {
  const res = await fetch('/vote/' + id, { method: 'POST' });
  const data = await res.json();
  if (data.needsVerify) {
    openEmailModal(id);
    return;
  }
  showToast(data.message, data.success ? 'success' : 'error');
  if (data.success) {
    const el = document.querySelector('.votes-count[data-id="' + id + '"]');
    if (el) {
      const num = parseInt(el.textContent) + 1;
      el.textContent = num + ' votes';
    }
    burstConfetti();
  }
};
