/* Decathlon-tickets – code-toekenning (gedeeld door site en tests). */
(function (root) {
  var SALT = "decathlon1711:";
  var TOTAL_TICKETS = 100;     // wat we communiceren
  var POOL = 48;               // codes in de quiz (2 zijn gereserveerd)
  var PER_CODE = 2;

  function normEmail(e) { return String(e || "").trim().toLowerCase(); }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120; }

  async function sha256hex(s) {
    var c = (root.crypto && root.crypto.subtle) ? root.crypto.subtle : require("crypto").webcrypto.subtle;
    var buf = await c.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }
  function pad(i) { return (i < 10 ? "0" : "") + i; }
  function ticketsLeft(takenCount) { return Math.max(0, (POOL - takenCount) * PER_CODE); }

  async function readCode(db, i) {
    var s = await db.ref("decathlon1711/codes/" + i).once("value");
    return s.val();
  }

  // Geeft {status:"new"|"existing"|"soldout", code, index}
  async function claim(db, name, email, opts) {
    opts = opts || {};
    var ts = opts.serverTimestamp;
    email = normEmail(email); name = String(name || "").trim().slice(0, 80);
    if (name.length < 2) throw new Error("naam");
    if (!validEmail(email)) throw new Error("email");
    var h = await sha256hex(SALT + email);
    for (var attempt = 0; attempt < 12; attempt++) {
      var ex = (await db.ref("decathlon1711/claims/" + h).once("value")).val();
      if (ex && ex.i) return { status: "existing", code: await readCode(db, ex.i), index: ex.i };
      var taken = (await db.ref("decathlon1711/taken").once("value")).val() || {};
      var free = [];
      for (var k = 0; k < POOL; k++) if (!taken[pad(k)]) free.push(pad(k));
      if (!free.length) return { status: "soldout" };
      // willekeurige vrije index: minder botsingen bij gelijktijdige spelers
      var i = free[Math.floor(Math.random() * Math.min(free.length, 8 + attempt * 4))];
      var u = {};
      u["taken/" + i] = true;
      u["byIndex/" + i] = h;
      u["claims/" + h] = { i: i, t: ts };
      u["log/" + i] = { name: name, email: email, t: ts };
      try {
        await db.ref("decathlon1711").update(u);
        return { status: "new", code: await readCode(db, i), index: i };
      } catch (e) {
        await new Promise(function (r) { setTimeout(r, 150 + Math.random() * 400); });
      }
    }
    throw new Error("druk");
  }

  var api = { claim: claim, ticketsLeft: ticketsLeft, sha256hex: sha256hex, normEmail: normEmail,
              validEmail: validEmail, POOL: POOL, PER_CODE: PER_CODE, TOTAL_TICKETS: TOTAL_TICKETS, SALT: SALT };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.DecathlonTix = api;
})(typeof window !== "undefined" ? window : globalThis);
