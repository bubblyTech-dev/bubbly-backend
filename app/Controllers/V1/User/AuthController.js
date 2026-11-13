const auth = require('@config/auth');
const Response = require('@app/Helpers/Response');
const { clientInfo, getCookie, setSchoolRefreshCookie, clearSchoolRefreshCookie } = require('@app/Helpers/http');
const AuthService = require('@app/Services/V1/User/AuthService');

// Thin on purpose: read the validated input, call the service, send the standard response.
const AuthController = {
  async login(req, res) {
    const { payload, refreshToken } = await AuthService.login(req.validated, clientInfo(req));
    setSchoolRefreshCookie(res, refreshToken);
    return Response.success(res, { data: payload, message: 'Logged in.' });
  },

  async refresh(req, res) {
    try {
      const { payload, refreshToken } = await AuthService.refresh(getCookie(req, auth.schoolRefreshCookieName));
      setSchoolRefreshCookie(res, refreshToken);
      return Response.success(res, { data: payload });
    } catch (err) {
      clearSchoolRefreshCookie(res); // a dead cookie is useless, remove it
      throw err;
    }
  },

  async logout(req, res) {
    await AuthService.logout(getCookie(req, auth.schoolRefreshCookieName));
    clearSchoolRefreshCookie(res);
    return Response.success(res, { message: 'Logged out.' });
  },

  async me(req, res) {
    return Response.success(res, { data: await AuthService.me(req.user, req.client) });
  },

  async changePassword(req, res) {
    const user = await AuthService.changePassword(req.user, req.validated);
    return Response.success(res, { data: { user }, message: 'Password changed. Other devices were signed out.' });
  },

  async forgotPassword(req, res) {
    await AuthService.forgotPassword(req.validated, clientInfo(req));
    return Response.success(res, { message: 'If that email belongs to an account, a reset link has been sent.' });
  },

  async resetPassword(req, res) {
    await AuthService.resetPassword(req.validated);
    return Response.success(res, { message: 'Password updated. Please log in.' });
  },
};

module.exports = AuthController;
