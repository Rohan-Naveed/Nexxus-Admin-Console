const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { dbQuery } = require("../../db/helpers");
const queries = require("../../../config/db.json").users;
const config = require("../../../config/config.json");
const { ApiError } = require("../../middleware/errorHandler");

const VALID_ROLES = ["admin", "user"];
const SALT_ROUNDS = 10;

// DB rows are snake_case; the API (and the frontend) speak camelCase.
// Never include password_hash in what leaves this module.
function toApiShape(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  };
}

async function fetchByEmail(email) {
  const rows = await dbQuery(queries.selectByEmail, [email], "users.selectByEmail");
  return rows[0] || null;
}

async function fetchById(id) {
  const rows = await dbQuery(queries.selectById, [id], "users.selectById");
  return rows[0] || null;
}

function normalizeEmail(email) {
  return (email || "").trim().toLowerCase();
}

async function signup({ email, password, role }) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new ApiError(400, "Email is required.");
  }
  if (!password || password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters.");
  }
  if (!VALID_ROLES.includes(role)) {
    throw new ApiError(400, `Role must be one of: ${VALID_ROLES.join(", ")}.`);
  }

  const existing = await fetchByEmail(normalizedEmail);
  if (existing) {
    throw new ApiError(409, "An account with that email already exists.");
  }

  if (role === "admin") {
    const existingAdmin = await dbQuery(queries.selectAdmin, [], "users.selectAdmin");
    if (existingAdmin.length > 0) {
      throw new ApiError(409, "An admin account already exists.");
    }
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  let rows;
  try {
    rows = await dbQuery(
      queries.insert,
      [normalizedEmail, passwordHash, role],
      "users.insert",
    );
  } catch (err) {
    // Race-condition backstop: two concurrent admin signups can both pass
    // the check above, but the DB's partial unique index on role='admin'
    // (and the unique email constraint) will reject the loser here.
    if (err.code === "23505") {
      if (err.constraint === "idx_users_single_admin") {
        throw new ApiError(409, "An admin account already exists.");
      }
      throw new ApiError(409, "An account with that email already exists.");
    }
    throw err;
  }

  return toApiShape(rows[0]);
}

async function login({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await fetchByEmail(normalizedEmail);

  if (!user) {
    throw new ApiError(401, "Invalid email or password.");
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    throw new ApiError(401, "Invalid email or password.");
  }

  return toApiShape(user);
}

function issueToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiresIn },
  );
}

function verifyToken(token) {
  return jwt.verify(token, config.auth.jwtSecret);
}

module.exports = {
  fetchByEmail,
  fetchById,
  signup,
  login,
  issueToken,
  verifyToken,
  toApiShape,
};
