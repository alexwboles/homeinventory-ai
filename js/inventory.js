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

  function exportFilename() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return "home-inventory-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + ".csv";
  }

  return {
    uid: uid, storageGet: storageGet, storageSet: storageSet,
    money: money, parseMoney: parseMoney, validISODate: validISODate,
    addRoom: addRoom, addItem: addItem, updateItem: updateItem, deleteItem: deleteItem,
    validateItem: validateItem, totals: totals, search: search,
    itemsToCSV: itemsToCSV, photoOk: photoOk, exportFilename: exportFilename
  };
});
