const express = require('express');
const { sendOtp } = require('../lib/email');

module.exports = (db) => {
  const router = express.Router();

  const today = () => new Date().toISOString().slice(0, 10);

  const getSettings = () => new Promise((resolve) => {
    db.all("SELECT key, value FROM settings", (err, rows) => {
      const s = {};
      (rows || []).forEach(r => { s[r.key] = r.value; });
      resolve(s);
    });
  });

  const votingStatus = async () => {
    const s = await getSettings();
    const now = Date.now();
    const opens = s.vote_opens_at ? new Date(s.vote_opens_at).getTime() : 0;
    const closes = s.vote_closes_at ? new Date(s.vote_closes_at).getTime() : Infinity;
    if (now < opens) return { open: false, reason: 'Voting opens soon', opens: s.vote_opens_at, closes: s.vote_closes_at };
    if (now > closes) return { open: false, reason: 'Voting has closed', opens: s.vote_opens_at, closes: s.vote_closes_at };
    return { open: true, opens: s.vote_opens_at, closes: s.vote_closes_at };
  };

  const genOtp = () => String(Math.floor(100000 + Math.random() * 900000));

  router.get('/', async (req, res) => {
    const status = await votingStatus();
    db.all("SELECT * FROM contestants", (err, contestants) => {
      res.render('home', { contestants: contestants || [], status: status, title: 'Home' });
    });
  });

  router.get('/contestants', async (req, res) => {
    const status = await votingStatus();
    db.all("SELECT * FROM contestants ORDER BY category, name", (err, contestants) => {
      res.render('contestants', { contestants: contestants || [], status: status, title: 'Contestants' });
    });
  });

  router.get('/results', async (req, res) => {
    const status = await votingStatus();
    db.all("SELECT * FROM contestants ORDER BY votes DESC", (err, contestants) => {
      res.render('results', { contestants: contestants || [], status: status, title: 'Results' });
    });
  });

  // ---- OTP ----
  router.post('/auth/send-otp', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.json({ success: false, message: 'Invalid email address.' });
    }

    const status = await votingStatus();
    if (!status.open) return res.json({ success: false, message: status.reason });

    db.get("SELECT id FROM votes WHERE email = ? AND vote_date = ?", [email, today()], async (err, row) => {
      if (row) return res.json({ success: false, message: 'You already voted today. Come back tomorrow!' });

      const code = genOtp();
      const expires = Date.now() + 10 * 60 * 1000;
      db.run("INSERT INTO otps (email, code, expires_at) VALUES (?, ?, ?)", [email, code, expires], async () => {
        try {
          await sendOtp(email, code);
          req.session.voterEmail = email;
          res.json({ success: true, message: 'Code sent! Check your inbox.' });
        } catch (e) {
          console.error(e);
          res.json({ success: false, message: 'Could not send code. Try again.' });
        }
      });
    });
  });

  router.get('/auth/pending', async (req, res) => {
    const status = await votingStatus();
    if (!req.session.voterEmail) return res.redirect('/contestants');
    res.render('verify', { status: status, email: req.session.voterEmail, title: 'Verify Email' });
  });

  router.post('/auth/verify', async (req, res) => {
    const email = req.session.voterEmail;
    const code = String(req.body.code || '').trim();
    if (!email) return res.json({ success: false, message: 'Session expired. Start again.' });

    db.get(
      "SELECT * FROM otps WHERE email = ? AND code = ? AND used = 0 ORDER BY id DESC LIMIT 1",
      [email, code],
      (err, row) => {
        if (!row) return res.json({ success: false, message: 'Invalid code.' });
        if (row.expires_at < Date.now()) return res.json({ success: false, message: 'Code expired.' });
        db.run("UPDATE otps SET used = 1 WHERE id = ?", [row.id], () => {
          req.session.verified = true;
          req.session.verifiedUntil = Date.now() + 30 * 60 * 1000;
          res.json({ success: true, message: 'Verified! You can vote now.' });
        });
      }
    );
  });

  // ---- VOTE ----
  router.post('/vote/:id', async (req, res) => {
    const id = req.params.id;
    const email = req.session.voterEmail;
    const verifiedUntil = req.session.verifiedUntil || 0;

    if (!email || !req.session.verified || Date.now() > verifiedUntil) {
      return res.json({ success: false, message: 'Please verify your email first.', needsVerify: true });
    }

    const status = await votingStatus();
    if (!status.open) return res.json({ success: false, message: status.reason });

    const date = today();

    db.get("SELECT id FROM votes WHERE email = ? AND vote_date = ?", [email, date], (err, existing) => {
      if (existing) return res.json({ success: false, message: 'You already voted today. Come back tomorrow!' });

      db.run(
        "INSERT INTO votes (contestant_id, email, voter_ip, vote_date) VALUES (?, ?, ?, ?)",
        [id, email, req.ip, date],
        (err) => {
          if (err) return res.json({ success: false, message: 'Vote failed.' });
          db.run("UPDATE contestants SET votes = votes + 1 WHERE id = ?", [id], () => {
            res.json({ success: true, message: 'Vote counted! See you tomorrow.' });
          });
        }
      );
    });
  });

  router.get('/api/contestants', (req, res) => {
    db.all("SELECT id, name, category, votes FROM contestants ORDER BY votes DESC", (err, rows) => {
      res.json(rows || []);
    });
  });

  router.get('/api/status', async (req, res) => {
    res.json(await votingStatus());
  });

  return router;
};
