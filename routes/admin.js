const express = require('express');
module.exports = (db) => {
  const router = express.Router();

  const requireAuth = (req, res, next) => {
    if (req.session.user === 'admin') return next();
    res.redirect('/admin/login');
  };

  router.get('/', (req, res) => {
    if (req.session.user === 'admin') return res.redirect('/admin/dashboard');
    res.redirect('/admin/login');
  });

  router.get('/login', (req, res) => {
    if (req.session.user === 'admin') return res.redirect('/admin/dashboard');
    res.render('admin-login', { error: null, layout: false });
  });

  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
      req.session.user = 'admin';
      return res.redirect('/admin/dashboard');
    }
    res.render('admin-login', { error: 'Invalid credentials', layout: false });
  });

  router.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin/login'));
  });

  router.get('/dashboard', requireAuth, (req, res) => {
    db.all("SELECT * FROM contestants ORDER BY category, name", (err, contestants) => {
      db.all("SELECT key, value FROM settings", (e2, settings) => {
        db.all(
          "SELECT email, vote_date, COUNT(*) as total FROM votes GROUP BY email, vote_date ORDER BY created_at DESC LIMIT 20",
          (e3, recentVoters) => {
            const s = {};
            (settings || []).forEach(r => { s[r.key] = r.value; });
            res.render('admin-dashboard', {
              contestants: contestants || [],
              settings: s,
              recentVoters: recentVoters || [],
              layout: 'admin-layout',
              current: 'dashboard',
              title: 'Dashboard',
              user: process.env.ADMIN_USER
            });
          }
        );
      });
    });
  });

  router.post('/branding', requireAuth, (req, res) => {
    const site_name = req.body.site_name || 'Mr & Miss';
    const site_tagline = req.body.site_tagline || '';
    const logo_emoji = req.body.logo_emoji || '👑';
    const logo_image = req.body.logo_image || '';
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('site_name', ?)", [site_name]);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('site_tagline', ?)", [site_tagline]);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('logo_emoji', ?)", [logo_emoji]);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('logo_image', ?)", [logo_image], () => {
      res.redirect('/admin/dashboard');
    });
  });

  router.post('/settings', requireAuth, (req, res) => {
    const opens = req.body.vote_opens_at || '';
    const closes = req.body.vote_closes_at || '';
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('vote_opens_at', ?)", [opens]);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('vote_closes_at', ?)", [closes], () => {
      res.redirect('/admin/dashboard');
    });
  });

  router.get('/contestants/new', requireAuth, (req, res) => {
    res.render('admin-contestant-new', {
      layout: 'admin-layout', current: 'new',
      title: 'Add Contestant', user: process.env.ADMIN_USER
    });
  });

  router.post('/contestants', requireAuth, (req, res) => {
    const name = req.body.name;
    const category = req.body.category;
    const bio = req.body.bio || null;
    const image = req.body.image || null;
    db.run(
      "INSERT INTO contestants (name, category, bio, image) VALUES (?, ?, ?, ?)",
      [name, category, bio, image],
      () => res.redirect('/admin/dashboard')
    );
  });

  router.post('/contestants/:id/delete', requireAuth, (req, res) => {
    db.run("DELETE FROM contestants WHERE id = ?", [req.params.id], () => {
      db.run("DELETE FROM votes WHERE contestant_id = ?", [req.params.id], () => {
        res.redirect('/admin/dashboard');
      });
    });
  });

  router.post('/reset', requireAuth, (req, res) => {
    db.run("UPDATE contestants SET votes = 0");
    db.run("DELETE FROM votes", () => res.redirect('/admin/dashboard'));
  });

  router.get('/export/votes.csv', requireAuth, (req, res) => {
    db.all(
      "SELECT v.created_at, v.email, v.vote_date, c.name as contestant, c.category " +
      "FROM votes v LEFT JOIN contestants c ON c.id = v.contestant_id ORDER BY v.created_at DESC",
      (err, rows) => {
        const header = 'created_at,email,vote_date,contestant,category\n';
        const body = (rows || []).map(r =>
          [r.created_at, r.email, r.vote_date, r.contestant, r.category]
            .map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')
        ).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="votes.csv"');
        res.send(header + body);
      }
    );
  });

  router.get('/export/contestants.csv', requireAuth, (req, res) => {
    db.all("SELECT id, name, category, votes FROM contestants ORDER BY votes DESC", (err, rows) => {
      const header = 'id,name,category,votes\n';
      const body = (rows || []).map(r => [r.id, r.name, r.category, r.votes]
        .map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="contestants.csv"');
      res.send(header + body);
    });
  });

  return router;
};
