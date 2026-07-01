'use strict';
const AuthService = require('../services/auth.service');

exports.login = async (req, res, next) => {
  try {
    const { email, password, mfa_code } = req.body;
    const result = await AuthService.login({ email, password, mfaCode: mfa_code || '' });
    res.json(result);
  } catch (e) { next(e); }
};

exports.refresh = async (req, res, next) => {
  try {
    const result = await AuthService.refresh(req.body.refresh_token);
    res.json(result);
  } catch (e) { next(e); }
};

exports.me = (req, res) => res.json(req.user.toSafeJSON());

exports.logout = (_req, res) => res.status(204).send();