/* HomeInventory UI — rooms, items, dashboard, export. */
(function () {
  "use strict";
  var HI = window.HomeInv, HID = window.HomeInvData;

  var state = {
    rooms: HI.storageGet("rooms", null),
    items: HI.storageGet("items", []),
    roomFilter: "all",
    query: "",
    sortKey: "name",
    sortDir: "asc"
  };
  if (!state.rooms) {
    state.rooms = HID.DEFAULT_ROOMS.map(function (n) { return { id: HI.uid(), name: n }; });
    save();
  }

  function save() {
    HI.storageSet("rooms", state.rooms);
    HI.storageSet("items", state.items);
  }
  function roomName(id) {
    var r = state.rooms.filter(function (x) { return x.id === id; })[0];
    return r ? r.name : "(deleted room)";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- dashboard ---------- */
  function renderDashboard() {
    var t = HI.totals(state.items);
    var grand = t.grand.value || 0;
    var cards = state.rooms.map(function (r) {
      var rt = t.perRoom[r.id] || { count: 0, value: 0 };
      var pct = grand > 0 ? Math.max(2, Math.round((rt.value / grand) * 100)) : 0;
      return '<div class="card"><h3>' + esc(r.name) + '</h3>' +
        '<div class="big">' + HI.money(rt.value) + '</div>' +
        '<div class="muted">' + rt.count + ' item' + (rt.count === 1 ? '' : 's') + '</div>' +
        '<div class="vbar"><span style="width:' + pct + '%"></span></div></div>';
    }).join("");
    document.getElementById("dashCards").innerHTML = cards;
    document.getElementById("grandTotal").textContent = HI.money(t.grand.value);
    document.getElementById("grandCount").textContent =
      t.grand.count + ' item' + (t.grand.count === 1 ? '' : 's') + ' documented';
    renderCategoryTotals(grand);
  }

  function renderCategoryTotals(grand) {
    var cats = HI.categoryTotals(state.items);
    var names = Object.keys(cats).sort(function (a, b) { return cats[b].value - cats[a].value; });
    var html = names.map(function (c) {
      var g = cats[c];
      var pct = grand > 0 ? Math.max(2, Math.round((g.value / grand) * 100)) : 0;
      return '<div class="card"><h3>' + esc(c) + '</h3>' +
        '<div class="big">' + HI.money(g.value) + '</div>' +
        '<div class="muted">' + g.count + ' item' + (g.count === 1 ? '' : 's') + '</div>' +
        '<div class="vbar"><span style="width:' + pct + '%"></span></div></div>';
    }).join("");
    document.getElementById("catTotals").innerHTML = html ||
      '<p class="muted">No items yet — categories will appear here as you add items.</p>';
  }

  /* ---------- rooms ---------- */
  function renderRooms() {
    var t = HI.totals(state.items);
    var html = '<button class="room' + (state.roomFilter === "all" ? " active" : "") +
      '" data-room="all"><span>' + esc("All rooms") + '</span><span class="rcount">' + t.grand.count + '</span></button>';
    html += state.rooms.map(function (r) {
      var c = (t.perRoom[r.id] || { count: 0 }).count;
      return '<button class="room' + (state.roomFilter === r.id ? " active" : "") +
        '" data-room="' + r.id + '"><span>' + esc(r.name) + '</span><span class="rcount">' + c + '</span></button>';
    }).join("");
    document.getElementById("roomList").innerHTML = html;
    var sel = document.getElementById("fRoom");
    sel.innerHTML = state.rooms.map(function (r) {
      return '<option value="' + r.id + '">' + esc(r.name) + '</option>';
    }).join("");
  }

  /* ---------- items table ---------- */
  function renderSerialWarning() {
    var dupes = HI.findDuplicateSerials(state.items);
    var el = document.getElementById("serialWarn");
    if (!dupes.length) { el.innerHTML = ""; el.style.display = "none"; return; }
    el.style.display = "";
    el.innerHTML = '<strong>⚠ ' + dupes.length + ' serial number' +
      (dupes.length === 1 ? '' : 's') + ' used on multiple items:</strong> ' +
      dupes.map(function (g) {
        return '<span class="warnserial">' + esc(g.serial) + ' (' +
          g.items.map(function (it) { return esc(it.name); }).join(", ") + ')</span>';
      }).join(" ") +
      ' <span class="muted">Insurers flag this — check each item has its own serial.</span>';
  }

  function renderItems() {
    var list = state.items.filter(function (it) {
      return state.roomFilter === "all" || it.roomId === state.roomFilter;
    });
    list = HI.search(list, state.query);
    list = HI.sortItems(list, state.sortKey, state.sortDir);
    renderSerialWarning();
    var cards = list.map(function (it) {
      return '<article class="itemcard">' +
        '<div class="ic-photo">' + (it.photo
          ? '<img class="thumb" src="' + it.photo + '" alt="">'
          : '<span class="ic-nophoto">No photo</span>') + '</div>' +
        '<div class="ic-body">' +
        '<span class="ic-cat">' + esc(it.category || "Uncategorized") + '</span>' +
        '<h3>' + esc(it.name) + '</h3>' +
        '<div class="ic-price">' + HI.money(it.price) + '</div>' +
        '<dl class="ic-meta">' +
        '<div><dt>Room</dt><dd>' + esc(roomName(it.roomId)) + '</dd></div>' +
        '<div><dt>Purchased</dt><dd>' + esc(it.date || "—") + '</dd></div>' +
        '<div><dt>Serial</dt><dd>' + esc(it.serial || "—") + '</dd></div>' +
        '</dl>' +
        (it.notes ? '<p class="ic-notes">' + esc(it.notes) + '</p>' : '') +
        '<div class="ic-actions"><button data-edit="' + it.id + '">Edit</button> ' +
        '<button data-dupe="' + it.id + '">Duplicate</button> ' +
        '<button data-del="' + it.id + '" class="danger">Delete</button></div>' +
        '</div></article>';
    }).join("");
    document.getElementById("itemRows").innerHTML = cards ||
      '<div class="empty-state"><strong>No items yet</strong>Add your first item below — name, price, and a photo are all an insurer needs to start.</div>';
  }

  function renderAll() { renderDashboard(); renderRooms(); renderItems(); }

  /* ---------- photo handling ---------- */
  var pendingPhoto = "";
  function handlePhotoFile(file, done) {
    if (!file) { done(""); return; }
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      var max = HID.PHOTO_MAX_DIM, w = img.width, h = img.height;
      if (Math.max(w, h) > max) {
        var s = max / Math.max(w, h);
        w = Math.round(w * s); h = Math.round(h * s);
      }
      var cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      var du = cv.toDataURL("image/jpeg", 0.7);
      if (!HI.photoOk(du, HID.PHOTO_MAX_BYTES)) { done(null); return; }
      done(du);
    };
    img.onerror = function () { URL.revokeObjectURL(url); done(null); };
    img.src = url;
  }

  function fillForm(it) {
    document.getElementById("fName").value = it ? it.name : "";
    document.getElementById("fRoom").value = it ? it.roomId : (state.rooms[0] || {}).id || "";
    document.getElementById("fCat").value = it ? it.category : HID.CATEGORIES[0];
    document.getElementById("fPrice").value = it ? it.price.toFixed(2) : "";
    document.getElementById("fDate").value = it ? it.date : "";
    document.getElementById("fSerial").value = it ? it.serial : "";
    document.getElementById("fNotes").value = it ? it.notes : "";
    pendingPhoto = it ? it.photo : "";
    document.getElementById("photoPreview").innerHTML =
      pendingPhoto ? '<img src="' + pendingPhoto + '" alt="">' : "";
    document.getElementById("fPhoto").value = "";
    document.getElementById("formTitle").textContent = it ? "Edit item" : "Add item";
    document.getElementById("saveItem").dataset.editing = it ? it.id : "";
    document.getElementById("formError").textContent = "";
  }

  /* ---------- events ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    // category select
    document.getElementById("fCat").innerHTML =
      HID.CATEGORIES.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("");

    // guidance
    document.getElementById("guidance").innerHTML = HID.GUIDANCE.map(function (g) {
      return '<div class="guide"><h3>' + esc(g.title) + '</h3><p>' + esc(g.body) + '</p></div>';
    }).join("");

    renderAll();
    fillForm(null);

    document.getElementById("roomList").addEventListener("click", function (e) {
      var b = e.target.closest("[data-room]");
      if (b) { state.roomFilter = b.dataset.room; renderRooms(); renderItems(); }
    });

    document.getElementById("addRoom").addEventListener("click", function () {
      var name = prompt("Room name:");
      if (name == null) return;
      var res = HI.addRoom(state.rooms, name);
      if (!res.ok) { alert(res.error); return; }
      save(); renderAll();
    });

    document.getElementById("search").addEventListener("input", function (e) {
      state.query = e.target.value; renderItems();
    });

    document.getElementById("fPhoto").addEventListener("change", function (e) {
      var file = e.target.files[0];
      handlePhotoFile(file, function (du) {
        if (du === null) {
          alert("That photo is still over the 500 KB cap after shrinking — try a smaller image.");
          e.target.value = "";
          return;
        }
        pendingPhoto = du;
        document.getElementById("photoPreview").innerHTML =
          du ? '<img src="' + du + '" alt=""> <button type="button" id="clearPhoto">Remove</button>' : "";
        var cp = document.getElementById("clearPhoto");
        if (cp) cp.addEventListener("click", function () {
          pendingPhoto = "";
          document.getElementById("photoPreview").innerHTML = "";
          document.getElementById("fPhoto").value = "";
        });
      });
    });

    document.getElementById("saveItem").addEventListener("click", function (e) {
      var editing = e.target.dataset.editing;
      var fields = {
        roomId: document.getElementById("fRoom").value,
        name: document.getElementById("fName").value,
        category: document.getElementById("fCat").value,
        price: document.getElementById("fPrice").value,
        date: document.getElementById("fDate").value,
        serial: document.getElementById("fSerial").value,
        notes: document.getElementById("fNotes").value,
        photo: pendingPhoto
      };
      var res = editing
        ? HI.updateItem(state.items, editing, fields, state.rooms)
        : HI.addItem(state.items, fields, state.rooms);
      if (!res.ok) {
        document.getElementById("formError").textContent = res.errors.join(" ");
        return;
      }
      save(); renderAll(); fillForm(null);
    });

    document.getElementById("cancelEdit").addEventListener("click", function () { fillForm(null); });

    document.getElementById("itemRows").addEventListener("click", function (e) {
      var eb = e.target.closest("[data-edit]");
      var db = e.target.closest("[data-del]");
      var pb = e.target.closest("[data-dupe]");
      if (eb) {
        var it = state.items.filter(function (x) { return x.id === eb.dataset.edit; })[0];
        if (it) { fillForm(it); window.scrollTo(0, document.getElementById("itemForm").offsetTop); }
      } else if (pb) {
        var res = HI.duplicateItem(state.items, pb.dataset.dupe);
        if (res.ok) { save(); renderAll(); }
      } else if (db) {
        if (confirm("Delete this item?")) {
          HI.deleteItem(state.items, db.dataset.del);
          save(); renderAll();
        }
      }
    });

    document.getElementById("sortSel").addEventListener("change", function (e) {
      var parts = e.target.value.split(":");
      state.sortKey = parts[0]; state.sortDir = parts[1];
      renderItems();
    });

    document.getElementById("exportBackup").addEventListener("click", function () {
      var json = HI.makeBackup(state.rooms, state.items);
      var blob = new Blob([json], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = HI.backupFilename();
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    });

    document.getElementById("restoreBtn").addEventListener("click", function () {
      document.getElementById("restoreFile").click();
    });
    document.getElementById("restoreFile").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var res = HI.parseBackup(reader.result);
        if (!res.ok) { alert("Couldn't restore backup:\n" + res.errors.join("\n")); return; }
        if (!confirm("Restore will REPLACE your current inventory with " + res.items.length +
          " items from the backup. Continue?")) return;
        state.rooms = res.rooms;
        state.items = res.items;
        state.roomFilter = "all";
        save(); renderAll(); fillForm(null);
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    document.getElementById("exportCsv").addEventListener("click", function () {
      var csv = HI.itemsToCSV(state.items, state.rooms);
      var blob = new Blob([csv], { type: "text/csv" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = HI.exportFilename();
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    });

    document.getElementById("printBtn").addEventListener("click", function () { window.print(); });

    // tabs
    document.querySelectorAll("[data-tab]").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll("[data-tab]").forEach(function (x) { x.classList.remove("active"); });
        document.querySelectorAll(".tabpage").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        document.getElementById("tab-" + b.dataset.tab).classList.add("active");
      });
    });
  });
})();
