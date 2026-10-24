const logger = require('@app/Helpers/logger');

const AuthController = {
  login(req, res) {
    logger.info('V1/User/AuthController@login called');
    res.json({ message: 'User login reached', controller: 'V1/User/AuthController@login' });
  },
};

module.exports = AuthController;
