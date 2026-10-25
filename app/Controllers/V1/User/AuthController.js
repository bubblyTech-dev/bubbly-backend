const AuthController = {
  login(req, res) {
    res.json({ message: 'User login reached', controller: 'V1/User/AuthController@login' });
  },
};

module.exports = AuthController;
