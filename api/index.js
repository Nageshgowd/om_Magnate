const express = require('express');
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const { HttpError, wrap, errorHandler } = require('./_lib/http');
const { getDb } = require('./_lib/db');
const { setSession, clearSession, publicUser, requireAuth, requireAdmin, sameOrigin } = require('./_lib/auth');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use(sameOrigin);

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const COST = 12;
// compared against when the username is unknown, so response time does not reveal which usernames exist
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);

const USERNAME_RE = /^[a-z0-9._@+-]{3,64}$/; // a plain username or an email address
const str = (v) => (typeof v === 'string' ? v : '');

function checkPassword(p) {
  if (p.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (p.length > 128) throw new HttpError(400, 'Password is too long (max 128 characters).');
}

const users = async () => (await getDb()).collection('users');
const stats = async () => (await getDb()).collection('event_stats');

async function eventStatsFor(userId) {
  const rows = await (await stats()).find({ userId }).sort({ lastActivityAt: -1 }).toArray();
  return rows.map((r) => ({
    eventId: r.eventId,
    eventName: r.eventName,
    downloads: r.downloads || 0,
    prints: r.prints || 0,
    lastActivityAt: r.lastActivityAt
  }));
}

function objectId(id) {
  if (!ObjectId.isValid(id)) throw new HttpError(404, 'User not found.');
  return new ObjectId(id);
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---------- auth ----------
app.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    const username = str(req.body?.username).trim().toLowerCase();
    const password = str(req.body?.password);
    if (!username || !password) throw new HttpError(400, 'Enter your username and password.');

    const col = await users();
    const user = await col.findOne({ username });

    if (user?.lockUntil && user.lockUntil > new Date()) {
      const mins = Math.ceil((user.lockUntil - Date.now()) / 60000);
      throw new HttpError(429, `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
    }

    const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !ok) {
      if (user) {
        const fails = (user.failedLogins || 0) + 1;
        await col.updateOne(
          { _id: user._id },
          fails >= MAX_FAILS
            ? { $set: { failedLogins: 0, lockUntil: new Date(Date.now() + LOCK_MS) } }
            : { $set: { failedLogins: fails } }
        );
      }
      throw new HttpError(401, 'Invalid username or password.');
    }
    if (!user.active) throw new HttpError(403, 'This account is disabled. Contact your administrator.');

    await col.updateOne(
      { _id: user._id },
      { $set: { failedLogins: 0, lockUntil: null, lastLoginAt: new Date() } }
    );
    setSession(res, user);
    res.json({ user: publicUser(user) });
  })
);

app.post('/api/auth/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

app.post(
  '/api/auth/change-password',
  requireAuth,
  wrap(async (req, res) => {
    const current = str(req.body?.currentPassword);
    const next = str(req.body?.newPassword);
    checkPassword(next);
    if (!(await bcrypt.compare(current, req.user.passwordHash))) {
      throw new HttpError(400, 'Your current password is incorrect.');
    }
    const tokenVersion = (req.user.tokenVersion || 0) + 1; // signs out every other session
    await (await users()).updateOne(
      { _id: req.user._id },
      { $set: { passwordHash: await bcrypt.hash(next, COST), tokenVersion } }
    );
    setSession(res, { ...req.user, tokenVersion });
    res.json({ ok: true });
  })
);

// ---------- admin: user management ----------
const admin = [requireAuth, requireAdmin];

app.get(
  '/api/admin/users',
  admin,
  wrap(async (req, res) => {
    const list = await (await users()).find().sort({ createdAt: -1 }).toArray();
    const totals = await (await stats())
      .aggregate([
        {
          $group: {
            _id: '$userId',
            downloads: { $sum: '$downloads' },
            prints: { $sum: '$prints' },
            events: { $sum: 1 }
          }
        }
      ])
      .toArray();
    const byUser = new Map(totals.map((t) => [String(t._id), t]));
    res.json({
      users: list.map((u) => {
        const t = byUser.get(String(u._id));
        return { ...publicUser(u), stats: { downloads: t?.downloads || 0, prints: t?.prints || 0, events: t?.events || 0 } };
      })
    });
  })
);

// per-event download/print counts for one user
app.get(
  '/api/admin/users/:id/activity',
  admin,
  wrap(async (req, res) => {
    const id = objectId(req.params.id);
    res.json({ events: await eventStatsFor(id) });
  })
);

app.post(
  '/api/admin/users',
  admin,
  wrap(async (req, res) => {
    const username = str(req.body?.username).trim().toLowerCase();
    const name = str(req.body?.name).trim();
    const password = str(req.body?.password);
    const role = req.body?.role === 'admin' ? 'admin' : 'user';

    if (!USERNAME_RE.test(username)) {
      throw new HttpError(400, 'Username must be 3–64 characters: letters, numbers and . _ - @ + (an email address works too).');
    }
    if (!name || name.length > 60) throw new HttpError(400, 'Enter the full name (up to 60 characters).');
    checkPassword(password);

    const doc = {
      username,
      name,
      role,
      active: true,
      passwordHash: await bcrypt.hash(password, COST),
      tokenVersion: 0,
      failedLogins: 0,
      lockUntil: null,
      createdAt: new Date(),
      createdBy: req.user._id,
      lastLoginAt: null
    };
    try {
      const r = await (await users()).insertOne(doc);
      res.status(201).json({ user: publicUser({ ...doc, _id: r.insertedId }) });
    } catch (e) {
      if (e.code === 11000) throw new HttpError(409, 'That username is already taken.');
      throw e;
    }
  })
);

async function otherActiveAdmins(col, id) {
  return col.countDocuments({ role: 'admin', active: true, _id: { $ne: id } });
}

app.patch(
  '/api/admin/users/:id',
  admin,
  wrap(async (req, res) => {
    const id = objectId(req.params.id);
    const col = await users();
    const target = await col.findOne({ _id: id });
    if (!target) throw new HttpError(404, 'User not found.');
    const self = String(id) === String(req.user._id);

    const set = {};
    const body = req.body || {};
    if (body.name !== undefined) {
      const name = str(body.name).trim();
      if (!name || name.length > 60) throw new HttpError(400, 'Enter the full name (up to 60 characters).');
      set.name = name;
    }
    if (body.username !== undefined) {
      const username = str(body.username).trim().toLowerCase();
      if (!USERNAME_RE.test(username)) {
        throw new HttpError(400, 'Username must be 3–64 characters: letters, numbers and . _ - @ + (an email address works too).');
      }
      if (username !== target.username) set.username = username;
    }
    if (body.role !== undefined) {
      if (!['admin', 'user'].includes(body.role)) throw new HttpError(400, 'Invalid role.');
      set.role = body.role;
    }
    if (body.active !== undefined) set.active = !!body.active;
    if (body.password !== undefined) {
      const p = str(body.password);
      checkPassword(p);
      set.passwordHash = await bcrypt.hash(p, COST);
      set.tokenVersion = (target.tokenVersion || 0) + 1; // sign the user out everywhere
      set.failedLogins = 0;
      set.lockUntil = null;
    }

    const losesAdmin =
      target.role === 'admin' && target.active && (set.role === 'user' || set.active === false);
    if (losesAdmin) {
      if (self) throw new HttpError(400, 'You cannot remove your own admin access or disable yourself.');
      if (!(await otherActiveAdmins(col, id))) throw new HttpError(400, 'At least one active admin is required.');
    }
    if (!Object.keys(set).length) throw new HttpError(400, 'Nothing to update.');

    try {
      await col.updateOne({ _id: id }, { $set: set });
    } catch (e) {
      if (e.code === 11000) throw new HttpError(409, 'That username is already taken.');
      throw e;
    }
    res.json({ user: publicUser({ ...target, ...set }) });
  })
);

app.delete(
  '/api/admin/users/:id',
  admin,
  wrap(async (req, res) => {
    const id = objectId(req.params.id);
    if (String(id) === String(req.user._id)) throw new HttpError(400, 'You cannot delete your own account.');
    const col = await users();
    const target = await col.findOne({ _id: id });
    if (!target) throw new HttpError(404, 'User not found.');
    if (target.role === 'admin' && target.active && !(await otherActiveAdmins(col, id))) {
      throw new HttpError(400, 'At least one active admin is required.');
    }
    await col.deleteOne({ _id: id });
    await (await stats()).deleteMany({ userId: id }); // their usage counts go with the account
    res.json({ ok: true });
  })
);

// ---------- usage: download and print counts per user and event ----------
app.post(
  '/api/activity',
  requireAuth,
  wrap(async (req, res) => {
    const type = req.body?.type;
    if (type !== 'download' && type !== 'print') throw new HttpError(400, 'Invalid activity type.');
    const eventId = str(req.body?.eventId).trim();
    if (!/^[\w-]{8,64}$/.test(eventId)) throw new HttpError(400, 'Invalid event.');
    const eventName = str(req.body?.eventName).trim().slice(0, 60) || 'Untitled event';

    const now = new Date();
    const [field, other, lastField] =
      type === 'download' ? ['downloads', 'prints', 'lastDownloadAt'] : ['prints', 'downloads', 'lastPrintAt'];
    const doc = await (await stats()).findOneAndUpdate(
      { userId: req.user._id, eventId },
      {
        $inc: { [field]: 1 },
        $set: { eventName, lastActivityAt: now, [lastField]: now },
        $setOnInsert: { [other]: 0, createdAt: now }
      },
      { upsert: true, returnDocument: 'after' }
    );
    res.status(201).json({ downloads: doc.downloads, prints: doc.prints });
  })
);

app.get(
  '/api/activity/me',
  requireAuth,
  wrap(async (req, res) => {
    const events = await eventStatsFor(req.user._id);
    res.json({
      events,
      totals: {
        downloads: events.reduce((n, e) => n + e.downloads, 0),
        prints: events.reduce((n, e) => n + e.prints, 0)
      }
    });
  })
);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use(errorHandler);

module.exports = app;
