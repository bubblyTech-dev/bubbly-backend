const logger = require('@app/Helpers/logger');

const AuthController = {
  login(req, res) {
    logger.info('V1/Admin/AuthController@login called');
    res.json({ message: 'Admin login reached', controller: 'V1/Admin/AuthController@login' });
  },
};

module.exports = AuthController;
