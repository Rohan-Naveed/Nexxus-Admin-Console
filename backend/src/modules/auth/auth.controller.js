const authService = require("./auth.service");
const config = require("../../../config/config.json");

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: config.auth.cookieMaxAgeMs,
};

function setSessionCookie(res, user) {
  const token = authService.issueToken(user);
  res.cookie(config.auth.cookieName, token, COOKIE_OPTIONS);
}

async function signup(req, res) {
  const { email, password, role } = req.body;
  const user = await authService.signup({ email, password, role });
  setSessionCookie(res, user);
  res.status(201).json(user);
}

async function login(req, res) {
  const { email, password } = req.body;
  const user = await authService.login({ email, password });
  setSessionCookie(res, user);
  res.json(user);
}

async function logout(req, res) {
  res.clearCookie(config.auth.cookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.json({ loggedOut: true });
}

async function me(req, res) {
  // requireAuth middleware has already verified the token and set req.user
  res.json(req.user);
}

module.exports = { signup, login, logout, me };
