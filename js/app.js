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
    renderReadiness();
    renderCategoryTotals(grand);
    renderRiskList();
    renderWarranties();
    renderLoans();
  }

  function readinessRing(pct) {
    var rad = 34, circ = 2 * Math.PI * rad;
    var off = (circ * (1 - Math.max(0, Math.min(100, pct)) / 100)).toFixed(1);
    return '<div class="ringwrap" role="img" aria-label="Claim readiness ' + pct + ' percent">' +
      '<svg width="92" height="92" viewBox="0 0 92 92">' +
      '<circle cx="46" cy="46" r="' + rad + '" class="ring-bg"/>' +
      '<circle cx="46" cy="46" r="' + rad + '" class="ring-fg" stroke-dasharray="' + circ.toFixed(1) +
      '" stroke-dashoffset="' + off + '" transform="rotate(-90 46 46)"/></svg>' +
      '<span class="ring-num">' + pct + "%</span></div>";
  }

  function renderReadiness() {
    var r = HI.claimReadiness(state.items);
    var a = HI.acvTotals(state.items);
    document.getElementById("readinessPct").innerHTML = readinessRing(r.valuePct);
    document.getElementById("readinessPct").classList.remove("big");
    document.getElementById("readinessDetail").textContent =
      r.fullyDocumented + ' of ' + r.total + ' items fully proven';
    document.getElementById("acvTotal").textContent = HI.money(a.acvValue);
    document.getElementById("acvDetail").textContent =
      'Purchase value ' + HI.money(a.purchaseValue) + ' · depreciation ' + HI.money(a.depreciation);
  }

  function renderWarranties() {
    var alerts = HI.warrantyAlerts(state.items, 90);
    var el = document.getElementById("warrantyList");
    el.innerHTML = alerts.length ? alerts.map(function (x) {
      var when = x.w.status === "expired"
        ? "Expired " + x.w.expiry + " (" + Math.abs(x.w.daysLeft) + "d ago)"
        : "Expires " + x.w.expiry + " (" + x.w.daysLeft + "d left)";
      return '<div class="card"><span class="ic-cat">' + (x.w.status === "expired" ? "Warranty expired" : "Warranty expiring") + '</span>' +
        '<h3>' + esc(x.item.name) + '</h3>' +
        '<div class="big">' + HI.money(x.item.price) + '</div>' +
        '<div class="muted">' + esc(when) + ' · ' + esc(roomName(x.item.roomId)) + '</div></div>';
    }).join("") : '<p class="muted">No warranties expiring soon.</p>';
  }

  function renderLoans() {
    var loans = HI.loanedItems(state.items);
    var el = document.getElementById("loanList");
    el.innerHTML = loans.length ? loans.map(function (x) {
      return '<div class="card"><span class="ic-cat">' + (x.overdue ? "Overdue" : "On loan") + '</span>' +
        '<h3>' + esc(x.item.name) + '</h3>' +
        '<div class="big">' + HI.money(x.item.price) + '</div>' +
        '<div class="muted">Borrowed by ' + esc(x.item.loan.to) +
        (x.item.loan.dueBack ? ' · due back ' + esc(x.item.loan.dueBack) + (x.overdue ? ' — overdue' : '') : '') +
        ' · ' + esc(roomName(x.item.roomId)) + '</div></div>';
    }).join("") : '<p class="muted">Nothing is on loan right now.</p>';
  }

  function renderRiskList() {
    var risks = HI.underDocumented(state.items, 500);
    var el = document.getElementById("riskList");
    el.innerHTML = risks.length ? risks.map(function (x) {
      return '<div class="card"><span class="ic-cat">Claim risk</span><h3>' + esc(x.item.name) + '</h3>' +
        '<div class="big">' + HI.money(x.item.price) + '</div>' +
        '<div class="muted">Missing: ' + esc(x.missing.join(', ')) + ' · ' + esc(roomName(x.item.roomId)) + '</div></div>';
    }).join("") : '<p class="muted">No high-value items are missing proof. Nice — your claim file is solid.</p>';
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
      var rt = t.perRoom[r.id] || { count: 0, value: 0 };
      return '<button class="room' + (state.roomFilter === r.id ? " active" : "") +
        '" data-room="' + r.id + '"><span class="rname">' + esc(r.name) + '</span>' +
        '<span class="rmeta">' + rt.count + ' · ' + HI.money(rt.value) + '</span></button>';
    }).join("");
    document.getElementById("roomList").innerHTML = html;
    var sel = document.getElementById("fRoom");
    sel.innerHTML = state.rooms.map(function (r) {
      return '<option value="' + r.id + '">' + esc(r.name) + '</option>';
    }).join("");
  }

  /* ---------- items table ---------- */
  function warrantyRow(it) {
    var w = HI.warrantyStatus(it);
    if (w.status === "none") return "";
    var txt = w.status === "expired"
      ? "Expired " + w.expiry
      : "Until " + w.expiry + " (" + w.daysLeft + "d)";
    return '<div><dt>Warranty</dt><dd class="' + (w.status === "active" ? "" : "warn") + '">' + esc(txt) + '</dd></div>';
  }

  function loanRow(it) {
    if (!it.loan) return "";
    var overdue = !!(it.loan.dueBack && it.loan.dueBack < HI.todayISO());
    return '<div><dt>On loan</dt><dd class="' + (overdue ? "warn" : "") + '">' + esc(it.loan.to) +
      (it.loan.dueBack ? " · due " + esc(it.loan.dueBack) + (overdue ? " — overdue" : "") : "") + '</dd></div>';
  }

  function serviceRow(it) {
    var h = HI.serviceHistory(it);
    if (!h.length) return "";
    return '<div><dt>Service</dt><dd>' + h.length + ' record' + (h.length === 1 ? '' : 's') +
      ' · last ' + esc(h[0].date) + ' · ' + HI.money(HI.totalServiceCost(it)) + ' total</dd></div>';
  }
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
      var pr = HI.itemReadiness(it);
      var dots = ["photo", "serial", "date"].map(function (k) {
        var on = pr.checks.indexOf(k) >= 0;
        return '<span class="pdot' + (on ? " on" : "") + '" title="' +
          (on ? "Recorded" : "Missing") + ": " + k + '">' + k.charAt(0).toUpperCase() + "</span>";
      }).join("");
      return '<article class="itemcard">' +
        '<div class="ic-photo">' + (it.photo
          ? '<img class="thumb" src="' + it.photo + '" alt="">'
          : '<span class="ic-nophoto">No photo</span>') + '</div>' +
        '<div class="ic-body">' +
        '<span class="ic-cat">' + esc(it.category || "Uncategorized") + '</span>' +
        '<h3>' + esc(it.name) + '</h3>' +
        '<div class="ic-price">' + HI.money(it.price) + '</div>' +
        '<div class="proof" role="img" aria-label="Claim proof: ' + pr.points + ' of 3 recorded">' +
        '<span class="proof-lbl">Proof ' + pr.points + "/3</span>" +
        '<span class="pdots">' + dots + "</span></div>" +
        '<dl class="ic-meta">' +
        '<div><dt>Room</dt><dd>' + esc(roomName(it.roomId)) + '</dd></div>' +
        '<div><dt>Purchased</dt><dd>' + esc(it.date || "—") + '</dd></div>' +
        '<div><dt>Serial</dt><dd>' + esc(it.serial || "—") + '</dd></div>' +
        warrantyRow(it) + loanRow(it) + serviceRow(it) +
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
    document.getElementById("fWarranty").value = it && it.warrantyMonths ? it.warrantyMonths : "";
    document.getElementById("formTitle").textContent = it ? "Edit item" : "Add item";
    document.getElementById("saveItem").dataset.editing = it ? it.id : "";
    document.getElementById("formError").textContent = "";
    renderServiceSection(it);
    renderLoanSection(it);
  }

  function renderServiceSection(it) {
    var sec = document.getElementById("serviceSection");
    if (!it) { sec.style.display = "none"; return; }
    sec.style.display = "";
    var h = HI.serviceHistory(it);
    document.getElementById("serviceList").innerHTML = h.length ? h.map(function (e) {
      return '<div class="srow"><span>' + esc(e.date) + '</span><span>' + esc(e.description) + '</span>' +
        '<span>' + (e.cost != null ? HI.money(e.cost) : "—") + '</span>' +
        '<button type="button" data-delservice="' + e.id + '" class="danger small">Remove</button></div>';
    }).join("") +
      '<div class="muted small">Total spent on service: ' + HI.money(HI.totalServiceCost(it)) + '</div>'
      : '<p class="muted small">No service records yet.</p>';
  }

  function renderLoanSection(it) {
    var sec = document.getElementById("loanSection");
    if (!it) { sec.style.display = "none"; return; }
    sec.style.display = "";
    var st = document.getElementById("loanStatus");
    var form = document.getElementById("loanForm");
    var outBtn = document.getElementById("loanOut");
    var backBtn = document.getElementById("loanBack");
    if (it.loan) {
      st.innerHTML = '<p><strong>On loan to ' + esc(it.loan.to) + '</strong> since ' + esc(it.loan.date || "—") +
        (it.loan.dueBack ? ', due back ' + esc(it.loan.dueBack) : '') + '</p>';
      form.style.display = "none"; outBtn.style.display = "none"; backBtn.style.display = "";
      document.getElementById("lTo").value = ""; document.getElementById("lDue").value = "";
    } else {
      st.innerHTML = '<p class="muted small">Not currently on loan.</p>';
      form.style.display = ""; outBtn.style.display = ""; backBtn.style.display = "none";
    }
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
      var wres = HI.setWarrantyMonths(state.items, res.item.id,
        document.getElementById("fWarranty").value);
      if (!wres.ok) {
        document.getElementById("formError").textContent = wres.error;
        return;
      }
      save(); renderAll(); fillForm(null);
    });

    document.getElementById("cancelEdit").addEventListener("click", function () { fillForm(null); });

    document.getElementById("addService").addEventListener("click", function () {
      var editing = document.getElementById("saveItem").dataset.editing;
      if (!editing) { alert("Save the item first, then add service records."); return; }
      var res = HI.logService(state.items, editing, {
        date: document.getElementById("sDate").value,
        description: document.getElementById("sDesc").value,
        cost: document.getElementById("sCost").value
      });
      if (!res.ok) { alert(res.error); return; }
      document.getElementById("sDate").value = "";
      document.getElementById("sDesc").value = "";
      document.getElementById("sCost").value = "";
      save(); renderServiceSection(res.item); renderAll();
    });

    document.getElementById("serviceList").addEventListener("click", function (e) {
      var b = e.target.closest("[data-delservice]");
      if (!b) return;
      var editing = document.getElementById("saveItem").dataset.editing;
      if (HI.deleteService(state.items, editing, b.dataset.delservice)) {
        save(); renderServiceSection(HI.findItem(state.items, editing)); renderAll();
      }
    });

    document.getElementById("loanOut").addEventListener("click", function () {
      var editing = document.getElementById("saveItem").dataset.editing;
      if (!editing) { alert("Save the item first, then loan it out."); return; }
      var res = HI.loanItem(state.items, editing, {
        to: document.getElementById("lTo").value,
        dueBack: document.getElementById("lDue").value
      });
      if (!res.ok) { alert(res.error); return; }
      save(); renderLoanSection(res.item); renderAll();
    });

    document.getElementById("loanBack").addEventListener("click", function () {
      var editing = document.getElementById("saveItem").dataset.editing;
      var res = HI.returnItem(state.items, editing);
      if (!res.ok) { alert(res.error); return; }
      save(); renderLoanSection(res.item); renderAll();
    });

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
