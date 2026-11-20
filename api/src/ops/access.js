// access.js — protection for GET /metrics per contracts/api-contract.md §7 and session-contract.md §4.
// Inputs: an Express request with req.user (from attachUser) and a request id.
// Outputs: calls next() only for an admin session; otherwise a 403 FORBIDDEN JSON error.
// Side effects: emits a redacted warn signal on denial.
// Failure behaviour: absent/non-admin sessions are denied; the guard never trusts client addresses
// or proxy-derived socket peers and never throws.

"use strict";

// Build the admin-only guard middleware; opts.signalLogger is optional local structured logging.
// Network location is deliberately not consulted. Behind a private ingress proxy an arbitrary external
// ingress call presents a private req.ip/socket peer (or forwarded header), so an address is not a
// credential. There is intentionally no option to restore an address-based private-network bypass.
function createMetricsAccess(opts = {}) {
  const signals = opts.signalLogger && typeof opts.signalLogger.warn === "function" ? opts.signalLogger : null;
  return function metricsAccess(req, res, next) {
    const admin = Boolean(req.user && req.user.role === "admin");
    if (admin) return next();
    if (signals) signals.warn("metrics_access_denied", { route: "/metrics", hasSession: Boolean(req.user) });
    return res.status(403).json({
      error: { code: "FORBIDDEN", message: "Metrics access denied", requestId: req.id },
    });
  };
}

module.exports = { createMetricsAccess };
