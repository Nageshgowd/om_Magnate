const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const { HttpError } = require('./http');
const { getDb } = require('./db');

const COOKIE = 'om_token';
const MAX_AGE_S = 7 * 24 * 60 * 60;
const isProd = () => !!process.env.VERCEL || process.env.NODE_ENV === 'production';

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new HttpError(503, 'The server is not configured yet (JWT_SECRET is missing).');
  return s;
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setSession(res, user) {
  const token = jwt.sign({ sub: String(user._id), tv: user.tokenVersion || 0 }, secret(), {
    expiresIn: MAX_AGE_S
  });
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${MAX_AGE_S}` +
      (isProd() ? '; Secure' : '')
  );
}

function clearSession(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0` + (isProd() ? '; Secure' : '')
  );
}

const publicUser = (u) => ({
  id: String(u._id),
  username: u.username,
  name: u.name,
  role: u.role,
  active: u.active,
  createdAt: u.createdAt,
  lastLoginAt: u.lastLoginAt || null
});

/** Loads the signed-in user from the cookie on every request, so disabling an account takes effect at once. */
async function requireAuth(req, res, next) {
  try {
    const token = readCookie(req, COOKIE);
    if (!token) throw new HttpError(401, 'Please sign in.');
    let payload;
    try {
      payload = jwt.verify(token, secret());
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(401, 'Your session has expired. Please sign in again.');
    }
    const db = await getDb();
    const user = ObjectId.isValid(payload.sub)
      ? await db.collection('users').findOne({ _id: new ObjectId(payload.sub) })
      : null;
    if (!user || !user.active || (user.tokenVersion || 0) !== payload.tv) {
      clearSession(res);
      throw new HttpError(401, 'Your session has expired. Please sign in again.');
    }
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return next(new HttpError(403, 'Administrators only.'));
  next();
}

/** Blocks cross-site writes: a browser always sends Origin on POST/PATCH/DELETE. */
function sameOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (origin && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    let host = '';
    try {
      host = new URL(origin).host;
    } catch {
      /* invalid origin */
    }
    if (host !== req.headers.host) return next(new HttpError(403, 'Cross-site request blocked.'));
  }
  next();
}

module.exports = { setSession, clearSession, publicUser, requireAuth, requireAdmin, sameOrigin };
