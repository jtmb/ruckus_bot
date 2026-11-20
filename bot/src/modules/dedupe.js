// Bounded "already handled" cache: TTL 10 minutes, at most 5,000 entries (oldest evicted first).
class Dedupe {
  constructor(ttlMs = 10 * 60 * 1000, max = 5000, now = Date.now) {
    this.ttl = ttlMs; this.max = max; this.now = now; this.map = new Map();
  }
  has(id) {
    const t = this.map.get(id);
    if (t === undefined) return false;
    if (this.now() - t > this.ttl) { this.map.delete(id); return false; }
    return true;
  }
  set(id) {
    this.map.delete(id);
    this.map.set(id, this.now());
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return this;
  }
  get size() { return this.map.size; }
}
module.exports = Dedupe;
