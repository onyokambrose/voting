require('dotenv').config();
const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// Ensure the data directory exists before opening the database
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const app = express();
const db = new sqlite3.Database(path.join(dataDir, 'voting.db'));

db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS contestants (" +
    "  id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "  name TEXT NOT NULL," +
    "  category TEXT CHECK(category IN ('Mr','Miss')) NOT NULL," +
    "  bio TEXT," +
    "  image TEXT," +
    "  votes INTEGER DEFAULT 0" +
    ")"
  );

  db.run(
    "CREATE TABLE IF NOT EXISTS votes (" +
    "  id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "  contestant_id INTEGER," +
    "  email TEXT NOT NULL," +
    "  voter_ip TEXT," +
    "  vote_date TEXT NOT NULL," +
    "  created_at DATETIME DEFAULT CURRENT_TIMESTAMP," +
    "  UNIQUE(email, vote_date)" +
    ")"
  );

  db.run(
    "CREATE TABLE IF NOT EXISTS otps (" +
    "  id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "  email TEXT NOT NULL," +
    "  code TEXT NOT NULL," +
    "  expires_at INTEGER NOT NULL," +
    "  used INTEGER DEFAULT 0," +
    "  created_at DATETIME DEFAULT CURRENT_TIMESTAMP" +
    ")"
  );

  db.run(
    "CREATE TABLE IF NOT EXISTS settings (" +
    "  key TEXT PRIMARY KEY," +
    "  value TEXT" +
    ")"
  );

  // Seed default settings
  db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('vote_opens_at', ?)", [process.env.VOTE_OPENS_AT || '']);
  db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('vote_closes_at', ?)", [process.env.VOTE_CLOSES_AT || '']);
  db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('site_name', 'Mr & Miss')");
  db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('site_tagline', 'Vote for the next Mr & Miss')");
  db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('logo_emoji', '👑')");
  db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('logo_image', '')");
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

// Load branding into res.locals for every request
app.use((req, res, next) => {
  req.db = db;
  res.locals.user = req.session.user || null;
  res.locals.voterEmail = req.session.voterEmail || null;

  db.all("SELECT key, value FROM settings WHERE key IN ('site_name','site_tagline','logo_emoji','logo_image')", (err, rows) => {
    const b = { site_name: 'Mr & Miss', site_tagline: 'Vote for the next Mr & Miss', logo_emoji: '👑', logo_image: '' };
    (rows || []).forEach(r => { b[r.key] = r.value; });
    res.locals.brand = b;
    next();
  });
});

app.use('/', require('./routes/index')(db));
app.use('/admin', require('./routes/admin')(db));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('✅ Server running on port ' + PORT));
