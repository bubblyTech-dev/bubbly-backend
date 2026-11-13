const auth = require('@config/auth');
const Response = require('@app/Helpers/Response');
const { clientInfo, getCookie, setRefreshCookie, clearRefreshCookie } = require('@app/Helpers/http');
const AuthService = require('@app/Services/V1/Admin/AuthService');

// Thin on purpose: read the validated input, call the service, send the standard response.
const AuthController = {
  async login(req, res) {
    const { payload, refreshToken } = await AuthService.login(req.validated, clientInfo(req));
    setRefreshCookie(res, refreshToken);
    return Response.success(res, { data: payload, message: 'Logged in.' });
  },

  async refresh(req, res) {
    try {
      const { payload, refreshToken } = await AuthService.refresh(getCookie(req, auth.refreshCookieName));
      setRefreshCookie(res, refreshToken);
      return Response.success(res, { data: payload });
    } catch (err) {
      clearRefreshCookie(res); // a dead cookie is useless, remove it
      throw err;
    }
  },

  async logout(req, res) {
    await AuthService.logout(getCookie(req, auth.refreshCookieName));
    clearRefreshCookie(res);
    return Response.success(res, { message: 'Logged out.' });
  },

  async me(req, res) {
    return Response.success(res, { data: { user: await AuthService.me(req.admin) } });
  },

  async changePassword(req, res) {
    const user = await AuthService.changePassword(req.admin, req.validated);
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
