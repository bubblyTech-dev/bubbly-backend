const auth = require('@config/auth');

// where a request came from (for sessions and login history)
const clientInfo = (req) => {
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 400);

  const browser =
    (/Edg\//.test(userAgent) && 'Edge') ||
    (/Firefox\//.test(userAgent) && 'Firefox') ||
    (/Chrome\//.test(userAgent) && 'Chrome') ||
    (/Safari\//.test(userAgent) && 'Safari') ||
    'Browser';
  const os =
    (/Windows/.test(userAgent) && 'Windows') ||
    (/iPhone|iPad/.test(userAgent) && 'iOS') ||
    (/Android/.test(userAgent) && 'Android') ||
    (/Mac OS X/.test(userAgent) && 'macOS') ||
    (/Linux/.test(userAgent) && 'Linux') ||
    'unknown OS';

  return { ip: String(req.ip || '').slice(0, 64), userAgent, deviceLabel: `${browser} on ${os}` };
};

// read one cookie without a cookie-parsing package
const getCookie = (req, name) => {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > -1 && part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
};

// the refresh token only ever lives in this cookie: the browser cannot read it with JavaScript
const cookieOptionsFor = (path) => ({
  httpOnly: true,
  secure: auth.cookieSecure,
  sameSite: 'lax',
  path,
});

const cookieOptions = cookieOptionsFor(auth.refreshCookiePath);

const setRefreshCookie = (res, token) =>
  res.cookie(auth.refreshCookieName, token, { ...cookieOptions, maxAge: auth.refreshTtlDays * 86400 * 1000 });

const clearRefreshCookie = (res) => res.clearCookie(auth.refreshCookieName, cookieOptions);

// the same for school users (own cookie name and path, so the two logins never mix)
const schoolCookieOptions = cookieOptionsFor(auth.schoolRefreshCookiePath);

const setSchoolRefreshCookie = (res, token) =>
  res.cookie(auth.schoolRefreshCookieName, token, { ...schoolCookieOptions, maxAge: auth.refreshTtlDays * 86400 * 1000 });

const clearSchoolRefreshCookie = (res) => res.clearCookie(auth.schoolRefreshCookieName, schoolCookieOptions);

module.exports = { clientInfo, getCookie, setRefreshCookie, clearRefreshCookie, setSchoolRefreshCookie, clearSchoolRefreshCookie };
