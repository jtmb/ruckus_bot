const USERNAME = /^[A-Za-z0-9_.-]{3,64}$/;

const bad = (res, req, msg) => res.status(400).json({ error: msg, requestId: req.id });

// Parses limit/offset: integers, limit 1..100, offset >= 0. Responds 400 on invalid input.
function pagination(req, res, next) {
  const limitRaw = req.query.limit ?? "10";
  const offsetRaw = req.query.offset ?? "0";
  if (!/^\d{1,9}$/.test(String(limitRaw)) || !/^\d{1,9}$/.test(String(offsetRaw))) {
    return bad(res, req, "limit and offset must be non-negative integers");
  }
  const limit = Number(limitRaw);
  const offset = Number(offsetRaw);
  if (limit < 1 || limit > 100) return bad(res, req, "limit must be between 1 and 100");
  req.page = { limit, offset };
  next();
}

function credentials({ needRole = false } = {}) {
  return (req, res, next) => {
    const { username, password, role } = req.body || {};
    if (typeof username !== "string" || !USERNAME.test(username)) return bad(res, req, "username must be 3-64 characters of letters, digits, . _ -");
    if (typeof password !== "string" || password.length < 8 || password.length > 128) return bad(res, req, "password must be 8-128 characters");
    if (needRole && !["admin", "user"].includes(role)) return bad(res, req, "role must be admin or user");
    next();
  };
}

function idParam(req, res, next) {
  if (!/^\d{1,10}$/.test(req.params.id)) return bad(res, req, "id must be a positive integer");
  next();
}

module.exports = { pagination, credentials, idParam, USERNAME, bad };
