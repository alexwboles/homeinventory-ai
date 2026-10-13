/* HomeInventory logic engine — rooms, items, totals, CSV, photos. Browser + node. */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else root.HomeInv = Object.assign(root.HomeInv || {}, factory());
})(typeof self !== "undefined" ? self : this, function () {

  var _mem = {};
  var NS = "homeinv:";

  function uid() {
    return "id-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
  }

  function storageGet(key, fallback) {
    try {
      if (typeof localStorage !== "undefined") {
        var raw = localStorage.getItem(NS + key);
        return raw == null ? fallback : JSON.parse(raw);
      }
    } catch (e) {}
    return (key in _mem) ? _mem[key] : fallback;
  }

  function storageSet(key, val) {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(NS + key, JSON.stringify(val));
        return;
      }
    } catch (e) {}
    _mem[key] = val;
  }

  function money(n) {
    var v = Number(n);
    if (!isFinite(v)) return "$0.00";
    var neg = v < 0;
    var s = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-$" : "$") + s;
  }

  function parseMoney(s) {
    if (s == null) return null;
    var t = String(s).trim().replace(/[$,\s]/g, "");
    if (t === "") return null;
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    return parseFloat(t);
  }

  function validISODate(s) {
    if (typeof s !== "string") return false;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getFullYear() === Number(m[1]) &&
           d.getMonth() === Number(m[2]) - 1 &&
           d.getDate() === Number(m[3]);
  }

  function addRoom(rooms, name) {
    var n = String(name || "").trim();
    if (!n) return { ok: false, error: "Room name is required." };
    if (rooms.some(function (r) { return r.name.toLowerCase() === n.toLowerCase(); }))

  return { ok: false, error: "That room already exists." };
    var room = { id: uid(), name: n };
    rooms.push(room);
    return { ok: true, room: room };
  }

  function validateItem(fields, rooms) {
    var errors = [];
    var name = String(fields.name || "").trim();
    if (!name) errors.push("Item name is required.");
    var roomIds = rooms.map(function (r) { return r.id; });
    if (roomIds.indexOf(fields.roomId) === -1) errors.push("Pick a valid room.");
    var price = parseMoney(fields.price);
    if (price == null) errors.push("Purchase price must be a number like 499.99.");
    if (fields.date && !validISODate(fields.date)) errors.push("Purchase date must be YYYY-MM-DD.");
    if (fields.photo && typeof fields.photo === "string" && fields.photo.length > 500 * 1024)
      errors.push("Photo is too large (500 KB cap — it is downscaled on upload).");
    return errors;
  }

  function addItem(items, fields, rooms) {
    var errors = validateItem(fields, rooms);
    if (errors.length) return { ok: false, errors: errors };
    var item = {
      id: uid(),
      roomId: fields.roomId,
      name: String(fields.name).trim(),
      category: String(fields.category || "Other"),
      price: parseMoney(fields.price),
      date: fields.date || "",
      serial: String(fields.serial || "").trim(),
      notes: String(fields.notes || "").trim(),
      photo: fields.photo || ""
    };
    items.push(item);
    return { ok: true, item: item };
  }

  function updateItem(items, id, fields, rooms) {
    var item = items.filter(function (i) { return i.id === id; })[0];
    if (!item) return { ok: false, errors: ["Item not found."] };
    var merged = {
      roomId: fields.roomId !== undefined ? fields.roomId : item.roomId,
      name: fields.name !== undefined ? fields.name : item.name,
      category: fields.category !== undefined ? fields.category : item.category,
      price: fields.price !== undefined ? fields.price : String(item.price),
      date: fields.date !== undefined ? fields.date : item.date,
      serial: fields.serial !== undefined ? fields.serial : item.serial,
      notes: fields.notes !== undefined ? fields.notes : item.notes,
      photo: fields.photo !== undefined ? fields.photo : item.photo
    };
    var errors = validateItem(merged, rooms);
    if (errors.length) return { ok: false, errors: errors };
    item.roomId = merged.roomId;
    item.name = String(merged.name).trim();
    item.category = String(merged.category);
    item.price = parseMoney(merged.price);
    item.date = merged.date || "";
    item.serial = String(merged.serial || "").trim();
    item.notes = String(merged.notes || "").trim();
    item.photo = merged.photo || "";
    return { ok: true, item: item };
  }

  function deleteItem(items, id) {
    var i = items.findIndex(function (x) { return x.id === id; });
    if (i === -1) return false;
    items.splice(i, 1);
    return true;
  }

  function totals(items) {
    var perRoom = {}, grand = { count: 0, value: 0 };
    items.forEach(function (it) {
      var r = perRoom[it.roomId] || (perRoom[it.roomId] = { count: 0, value: 0 });
      r.count += 1; r.value += it.price;
      grand.count += 1; grand.value += it.price;
    });
    // round to cents to avoid float dust
    Object.keys(perRoom).forEach(function (k) {
      perRoom[k].value = Math.round(perRoom[k].value * 100) / 100;
    });
    grand.value = Math.round(grand.value * 100) / 100;
    return { perRoom: perRoom, grand: grand };
  }

  function search(items, q) {
    var t = String(q || "").trim().toLowerCase();
    if (!t) return items.slice();
    return items.filter(function (it) {
      return (it.name + " " + it.category + " " + it.serial + " " + it.notes).toLowerCase().indexOf(t) !== -1;
    });
  }

  function csvCell(v) {
    var s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function itemsToCSV(items, rooms) {
    var byId = {};
    rooms.forEach(function (r) { byId[r.id] = r.name; });
    var rows = [["Room", "Item", "Category", "Purchase price", "Purchase date", "Serial number", "Notes", "Has photo"]];
    items.forEach(function (it) {
      rows.push([
        byId[it.roomId] || "", it.name, it.category,
        it.price.toFixed(2), it.date, it.serial, it.notes,
        it.photo ? "yes" : "no"
      ]);
    });
    return rows.map(function (r) { return r.map(csvCell).join(","); }).join("\n");
  }

  function photoOk(dataUrl, maxBytes) {
    return typeof dataUrl === "string" &&
      dataUrl.indexOf("data:image/") === 0 &&
      dataUrl.length <= (maxBytes || 500 * 1024);
  }

  /* ---- item sorting ---- */
  // key: "name" | "price" | "date"; dir: "asc" | "desc"
  function sortItems(items, key, dir) {
    var mul = dir === "desc" ? -1 : 1;
    return items.slice().sort(function (a, b) {
      var va, vb;
      if (key === "price") { va = a.price; vb = b.price; }
      else if (key === "date") { va = a.date || ""; vb = b.date || ""; }
      else { va = (a.name || "").toLowerCase(); vb = (b.name || "").toLowerCase(); }
      if (va < vb) return -1 * mul;
      if (va > vb) return 1 * mul;
      // tie-break: name, so ordering is deterministic
      var na = (a.name || "").toLowerCase(), nb = (b.name || "").toLowerCase();
      if (na < nb) return -1;
      if (na > nb) return 1;
      return 0;
    });
  }

  /* ---- duplicate an item ---- */
  function duplicateItem(items, id) {
    var src = items.filter(function (i) { return i.id === id; })[0];
    if (!src) return { ok: false, error: "Item not found." };
    var copy = {
      id: uid(), roomId: src.roomId, name: src.name + " (copy)",
      category: src.category, price: src.price, date: src.date,
      serial: "", notes: src.notes, photo: src.photo
    };
    items.push(copy);
    return { ok: true, item: copy };
  }

  /* ---- duplicate serial detection (insurers flag conflicting serials) ---- */
  function findDuplicateSerials(items) {
    var byKey = {};
    items.forEach(function (it) {
      var s = String(it.serial || "").trim();
      if (!s) return;
      var k = s.toLowerCase();
      (byKey[k] || (byKey[k] = { serial: s, items: [] })).items.push(it);
    });
    return Object.keys(byKey).map(function (k) { return byKey[k]; })
      .filter(function (g) { return g.items.length > 1; });
  }

  /* ---- value by category ---- */
  function categoryTotals(items) {
    var cats = {};
    items.forEach(function (it) {
      var c = it.category || "Other";
      var g = cats[c] || (cats[c] = { count: 0, value: 0 });
      g.count += 1;
      g.value += it.price;
    });
    Object.keys(cats).forEach(function (k) {
      cats[k].value = Math.round(cats[k].value * 100) / 100;
    });
    return cats;
  }

  /* ---- JSON backup + restore ---- */
  function makeBackup(rooms, items) {
    return JSON.stringify({
      app: "homeinventory-ai", version: 1,
      exportedAt: new Date().toISOString(),
      rooms: rooms, items: items
    });
  }

  function backupFilename() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return "home-inventory-backup-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + ".json";
  }

  // Validates a backup payload; returns {ok, rooms, items} or {ok:false, errors[]}.
  // Ids are kept when present, roomIds that no longer exist fall back to the first room.
  function parseBackup(jsonText) {
    var data;
    try { data = JSON.parse(jsonText); }
    catch (e) { return { ok: false, errors: ["That file isn't valid JSON."] }; }
    if (!data || typeof data !== "object") return { ok: false, errors: ["Not a valid backup file."] };
    var errors = [];
    if (!Array.isArray(data.rooms)) errors.push("Backup is missing the rooms list.");
    if (!Array.isArray(data.items)) errors.push("Backup is missing the items list.");
    if (errors.length) return { ok: false, errors: errors };
    var rooms = [];
    data.rooms.forEach(function (r, i) {
      if (!r || typeof r.name !== "string" || !r.name.trim()) {
        errors.push("Room #" + (i + 1) + " has no name."); return;
      }
      rooms.push({ id: typeof r.id === "string" && r.id ? r.id : uid(), name: r.name.trim() });
    });
    if (!rooms.length) rooms.push({ id: uid(), name: "Restored items" });
    var roomIds = {};
    rooms.forEach(function (r) { roomIds[r.id] = true; });
    var items = [];
    data.items.forEach(function (it, i) {
      if (!it || typeof it.name !== "string" || !it.name.trim()) {
        errors.push("Item #" + (i + 1) + " has no name."); return;
      }
      var price = Number(it.price);
      if (!isFinite(price) || price < 0) {
        errors.push("Item '" + it.name + "' has an invalid price."); return;
      }
      var wl = Number(it.warrantyMonths);
      var serviceLog = [];
      if (Array.isArray(it.serviceLog)) {
        it.serviceLog.forEach(function (e) {
          if (!e || !validISODate(e.date) || !String(e.description || "").trim()) return;
          var c = (e.cost === "" || e.cost == null) ? null : Number(e.cost);
          serviceLog.push({
            id: typeof e.id === "string" && e.id ? e.id : uid(),
            date: e.date,
            description: String(e.description).trim(),
            cost: (c !== null && isFinite(c) && c >= 0) ? Math.round(c * 100) / 100 : null
          });
        });
      }
      var loan = null;
      if (it.loan && String(it.loan.to || "").trim()) {
        var ldate = String(it.loan.date || "");
        var ldue = String(it.loan.dueBack || "");
        loan = {
          to: String(it.loan.to).trim(),
          date: validISODate(ldate) ? ldate : "",
          dueBack: validISODate(ldue) ? ldue : ""
        };
      }
      items.push({
        id: typeof it.id === "string" && it.id ? it.id : uid(),
        roomId: roomIds[it.roomId] ? it.roomId : rooms[0].id,
        name: it.name.trim(),
        category: String(it.category || "Other"),
        price: Math.round(price * 100) / 100,
        date: String(it.date || ""),
        serial: String(it.serial || "").trim(),
        notes: String(it.notes || "").trim(),
        photo: typeof it.photo === "string" ? it.photo : "",
        warrantyMonths: (isFinite(wl) && wl > 0 && wl <= 120) ? Math.round(wl) : null,
        serviceLog: serviceLog,
        loan: loan
      });
    });
    if (errors.length) return { ok: false, errors: errors };
    return { ok: true, rooms: rooms, items: items };
  }

  function exportFilename() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return "home-inventory-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + ".csv";
  }

  /* ---- claim readiness: 3 proof points per item (photo, serial, purchase date) ---- */
  function itemReadiness(item) {
    var points = 0, checks = [];
    if (item && item.photo) { points++; checks.push("photo"); }
    if (item && item.serial && String(item.serial).trim()) { points++; checks.push("serial"); }
    if (item && item.date && validISODate(item.date)) { points++; checks.push("date"); }
    return { points: points, of: 3, pct: Math.round(points / 3 * 100), checks: checks };
  }

  // Value-weighted readiness: share of total documented value fully proven.
  // proven value of an item = price * (proof points / 3).
  function claimReadiness(items) {
    var total = 0, proven = 0, fully = 0;
    (items || []).forEach(function (it) {
      var v = Number(it.price) || 0;
      total += v;
      var r = itemReadiness(it);
      proven += v * (r.points / 3);
      if (r.points === 3) fully++;
    });
    return {
      total: (items || []).length, fullyDocumented: fully,
      valuePct: total > 0 ? Math.round(proven / total * 100) : 0
    };
  }

  /* ---- actual cash value: straight-line depreciation by category ---- */
  // Years until an item is fully depreciated (collectibles don't depreciate).
  var DEPRECIATION_YEARS = {
    "Electronics": 5, "Appliances": 10, "Furniture": 10, "Jewelry & Watches": 50,
    "Clothing": 5, "Tools": 10, "Sports & Outdoors": 7, "Musical Instruments": 15,
    "Collectibles & Art": Infinity, "Kitchenware": 8, "Other": 7
  };
  var DEFAULT_DEPRECIATION_YEARS = 7;

  function itemAgeYears(item, asOfISO) {
    if (!item || !item.date || !validISODate(item.date)) return null;
    var asOf = asOfISO || (function () {
      var d = new Date();
      return d.getFullYear() + "-" + (d.getMonth() + 1 < 10 ? "0" : "") + (d.getMonth() + 1) +
        "-" + (d.getDate() < 10 ? "0" : "") + d.getDate();
    })();
    if (!validISODate(asOf)) return null;
    var ms = new Date(asOf + "T12:00:00") - new Date(item.date + "T12:00:00");
    if (isNaN(ms) || ms < 0) return null;
    return ms / (365.25 * 24 * 3600 * 1000);
  }

  // Actual cash value = purchase price depreciated straight-line to zero over
  // the category's life. Returns {ageYears, lifeYears, acv} — ageYears null
  // when the purchase date is unknown (can't depreciate).
  function acv(item, asOfISO) {
    var price = Number(item && item.price) || 0;
    var life = DEPRECIATION_YEARS[item && item.category] || DEFAULT_DEPRECIATION_YEARS;
    var age = itemAgeYears(item, asOfISO);
    if (age == null) return { ageYears: null, lifeYears: life, acv: Math.round(price * 100) / 100 };
    var factor = Math.max(0, 1 - age / life);
    return {
      ageYears: Math.round(age * 10) / 10, lifeYears: life,
      acv: Math.round(price * factor * 100) / 100
    };
  }

  // Portfolio-wide: purchase value vs depreciated (ACV) value.
  function acvTotals(items, asOfISO) {
    var purchase = 0, current = 0;
    (items || []).forEach(function (it) {
      purchase += Number(it.price) || 0;
      current += acv(it, asOfISO).acv;
    });
    return {
      purchaseValue: Math.round(purchase * 100) / 100,
      acvValue: Math.round(current * 100) / 100,
      depreciation: Math.round((purchase - current) * 100) / 100
    };
  }

  /* ---- under-documented high-value items: claim risk list ---- */
  // Items at/above the value threshold missing at least one proof point.
  function underDocumented(items, threshold) {
    var t = threshold == null ? 500 : Number(threshold);
    if (isNaN(t) || t < 0) t = 500;
    return (items || [])
      .filter(function (it) {
        return (Number(it.price) || 0) >= t && itemReadiness(it).points < 3;
      })
      .map(function (it) {
        var r = itemReadiness(it);
        var missing = ["photo", "serial", "date"].filter(function (k) { return r.checks.indexOf(k) === -1; });
        return { item: it, missing: missing, readiness: r.pct };
      })
      .sort(function (a, b) { return (Number(b.item.price) || 0) - (Number(a.item.price) || 0); });
  }

      /* ---- warranties ---- */
  function _pad(n) { return (n < 10 ? "0" : "") + n; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + _pad(d.getMonth() + 1) + "-" + _pad(d.getDate());
  }

  function findItem(items, id) {
    return (items || []).filter(function (x) { return x.id === id; })[0] || null;
  }

  // Warranty length in months (null = none tracked). 0–120 sanity range.
  function setWarrantyMonths(items, id, months) {
    var it = findItem(items, id);
    if (!it) return { ok: false, error: "Item not found." };
    var m = (months === "" || months == null) ? null : Number(months);
    if (m !== null && (!isFinite(m) || m < 0 || m > 120))
      return { ok: false, error: "Warranty must be 0–120 months." };
    it.warrantyMonths = (m == null || m === 0) ? null : Math.round(m);
    return { ok: true, item: it };
  }

  // Expiry date from purchase date + warranty months (null when unknown).
  function warrantyExpiry(item) {
    if (!item || !item.date || !validISODate(item.date) || !(item.warrantyMonths > 0)) return null;
    var d = new Date(item.date + "T12:00:00");
    d.setMonth(d.getMonth() + item.warrantyMonths);
    return d.getFullYear() + "-" + _pad(d.getMonth() + 1) + "-" + _pad(d.getDate());
  }

  // {status: "none"|"active"|"expiring"|"expired", expiry, daysLeft}
  // "expiring" = 90 days or fewer left; expired items are still reported.
  function warrantyStatus(item, asOfISO) {
    var exp = warrantyExpiry(item);
    if (!exp) return { status: "none", expiry: null, daysLeft: null };
    var asOf = (asOfISO && validISODate(asOfISO)) ? asOfISO : todayISO();
    var days = Math.round((new Date(exp + "T12:00:00") - new Date(asOf + "T12:00:00")) / 864e5);
    var status = days < 0 ? "expired" : (days <= 90 ? "expiring" : "active");
    return { status: status, expiry: exp, daysLeft: days };
  }

  // Items whose warranty expires within `withinDays` (default 90), plus items
  // that expired in the last 30 days (grace window for claims paperwork).
  function warrantyAlerts(items, withinDays, asOfISO) {
    var w = (withinDays == null) ? 90 : Number(withinDays);
    if (!isFinite(w) || w < 0) w = 90;
    return (items || []).map(function (it) {
      return { item: it, w: warrantyStatus(it, asOfISO) };
    }).filter(function (x) {
      return x.w.status === "expiring" ||
             (x.w.status === "expired" && x.w.daysLeft >= -30);
    }).sort(function (a, b) { return a.w.daysLeft - b.w.daysLeft; });
  }

  /* ---- maintenance / service log ---- */
  function logService(items, id, entry) {
    var it = findItem(items, id);
    if (!it) return { ok: false, error: "Item not found." };
    entry = entry || {};
    var date = String(entry.date || "");
    if (!validISODate(date)) return { ok: false, error: "Service date must be YYYY-MM-DD." };
    var desc = String(entry.description || "").trim();
    if (!desc) return { ok: false, error: "Describe the service performed." };
    var cost = (entry.cost === "" || entry.cost == null) ? null : Number(entry.cost);
    if (cost !== null && (!isFinite(cost) || cost < 0))
      return { ok: false, error: "Service cost must be a positive number." };
    it.serviceLog = it.serviceLog || [];
    it.serviceLog.push({ id: uid(), date: date, description: desc, cost: cost });
    return { ok: true, item: it };
  }

  function serviceHistory(item) {
    return ((item && item.serviceLog) || []).slice()
      .sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
  }

  function lastService(item) {
    var h = serviceHistory(item);
    return h.length ? h[0] : null;
  }

  function totalServiceCost(item) {
    var sum = serviceHistory(item).reduce(function (s, e) { return s + (Number(e.cost) || 0); }, 0);
    return Math.round(sum * 100) / 100;
  }

  function deleteService(items, itemId, entryId) {
    var it = findItem(items, itemId);
    if (!it || !it.serviceLog) return false;
    var i = it.serviceLog.findIndex(function (e) { return e.id === entryId; });
    if (i === -1) return false;
    it.serviceLog.splice(i, 1);
    return true;
  }

  /* ---- loan tracker ---- */
  function loanItem(items, id, loan) {
    var it = findItem(items, id);
    if (!it) return { ok: false, error: "Item not found." };
    if (it.loan) return { ok: false, error: "That item is already on loan to " + it.loan.to + "." };
    loan = loan || {};
    var to = String(loan.to || "").trim();
    if (!to) return { ok: false, error: "Say who borrowed it." };
    var date = String(loan.date || todayISO());
    if (!validISODate(date)) return { ok: false, error: "Loan date must be YYYY-MM-DD." };
    var dueBack = String(loan.dueBack || "");
    if (dueBack && !validISODate(dueBack)) return { ok: false, error: "Due-back date must be YYYY-MM-DD." };
    it.loan = { to: to, date: date, dueBack: dueBack };
    return { ok: true, item: it };
  }

  function returnItem(items, id) {
    var it = findItem(items, id);
    if (!it) return { ok: false, error: "Item not found." };
    if (!it.loan) return { ok: false, error: "That item isn't on loan." };
    delete it.loan;
    return { ok: true, item: it };
  }

  // All loaned items, overdue first. Overdue = dueBack date has passed.
  function loanedItems(items, asOfISO) {
    var asOf = (asOfISO && validISODate(asOfISO)) ? asOfISO : todayISO();
    return (items || []).filter(function (it) { return !!it.loan; })
      .map(function (it) {
        return { item: it, overdue: !!(it.loan.dueBack && it.loan.dueBack < asOf) };
      })
      .sort(function (a, b) { return (a.overdue === b.overdue) ? 0 : (a.overdue ? -1 : 1); });
  }

  return {
    uid: uid, storageGet: storageGet, storageSet: storageSet,
    money: money, parseMoney: parseMoney, validISODate: validISODate,
    addRoom: addRoom, addItem: addItem, updateItem: updateItem, deleteItem: deleteItem,
    validateItem: validateItem, totals: totals, search: search,
    itemsToCSV: itemsToCSV, photoOk: photoOk, exportFilename: exportFilename,
    sortItems: sortItems, duplicateItem: duplicateItem,
    findDuplicateSerials: findDuplicateSerials, categoryTotals: categoryTotals,
    makeBackup: makeBackup, parseBackup: parseBackup, backupFilename: backupFilename,
    itemReadiness: itemReadiness, claimReadiness: claimReadiness,
    acv: acv, acvTotals: acvTotals, DEPRECIATION_YEARS: DEPRECIATION_YEARS,
    underDocumented: underDocumented,
    todayISO: todayISO, findItem: findItem,
    setWarrantyMonths: setWarrantyMonths, warrantyExpiry: warrantyExpiry,
    warrantyStatus: warrantyStatus, warrantyAlerts: warrantyAlerts,
    logService: logService, serviceHistory: serviceHistory,
    lastService: lastService, totalServiceCost: totalServiceCost,
    deleteService: deleteService,
    loanItem: loanItem, returnItem: returnItem, loanedItems: loanedItems
  };
});
