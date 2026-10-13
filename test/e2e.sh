#!/bin/bash
# HomeInventory e2e tests — full user flows through the logic engine.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
node << 'NODEEOF'
const HI = require('/home/hatch/workspace/homeinventory-ai/js/inventory.js');
const HD = require('/home/hatch/workspace/homeinventory-ai/js/data.js');
let pass = 0, fail = 0;
const ok  = (n) => { pass++; console.log('PASS: ' + n); };
const bad = (n) => { fail++; console.log('FAIL: ' + n); };

// fresh state like first app load
let rooms = HD.DEFAULT_ROOMS.map(n => ({ id: HI.uid(), name: n }));
let items = [];

// Flow 1: add rooms, then a fully-detailed item
let rr = HI.addRoom(rooms, 'Attic');
const attic = rr.room;
let res = HI.addItem(items, {
  roomId: attic.id, name: 'DeWalt Drill Set', category: 'Tools',
  price: '249.00', date: '2025-11-02', serial: 'DW-88412-X',
  notes: 'Bought at Home Depot', photo: 'data:image/jpeg;base64,AAA'
}, rooms);
(res.ok && items.length === 1 && items[0].serial === 'DW-88412-X')
  ? ok('flow1: room + detailed item added, serial kept') : bad('flow1: ' + JSON.stringify(res));

// Flow 2: spread items across rooms, dashboard totals reconcile
const liv = rooms[0].id, kit = rooms[1].id;
HI.addItem(items, { roomId: liv, name: 'Sofa', price: '1800' }, rooms);
HI.addItem(items, { roomId: liv, name: 'OLED TV', price: '1499.99' }, rooms);
HI.addItem(items, { roomId: kit, name: 'Stand Mixer', price: '379.50' }, rooms);
const t = HI.totals(items);
const expectGrand = 249 + 1800 + 1499.99 + 379.50;
(Math.abs(t.grand.value - expectGrand) < 0.01 && t.grand.count === 4 &&
 Math.abs(t.perRoom[liv].value - 3299.99) < 0.01 && t.perRoom[kit].count === 1)
  ? ok('flow2: grand ' + HI.money(t.grand.value) + ' across 4 items; per-room splits right')
  : bad('flow2: ' + JSON.stringify(t.grand));

// Flow 3: edit an item (price correction), totals update
const tv = items.filter(i => i.name === 'OLED TV')[0];
let up = HI.updateItem(items, tv.id, { price: '1299.99' }, rooms);
const t2 = HI.totals(items);
(up.ok && Math.abs(t2.grand.value - (expectGrand - 200)) < 0.01)
  ? ok('flow3: price edit $1,499.99 -> $1,299.99, grand now ' + HI.money(t2.grand.value))
  : bad('flow3: ' + JSON.stringify(up));

// Flow 4: bad edit rejected, original kept
let badUp = HI.updateItem(items, tv.id, { price: 'not money' }, rooms);
(!badUp.ok && tv.price === 1299.99)
  ? ok('flow4: invalid price edit rejected, value unchanged') : bad('flow4');

// Flow 5: delete item, counts drop
HI.deleteItem(items, items[0].id);
(HI.totals(items).grand.count === 3)
  ? ok('flow5: delete removes item, 3 remain') : bad('flow5');
HI.deleteItem(items, 'missing-id') === false
  ? ok('flow5b: deleting unknown id returns false') : bad('flow5b');

// Flow 6: CSV export is complete and parseable
const csv = HI.itemsToCSV(items, rooms);
const rows = csv.split('\n');
const header = rows[0].split(',');
(header.length === 8 && rows.length === 4 && /1299.99/.test(csv) && /Has photo/.test(rows[0]))
  ? ok('flow6: CSV has 8-col header + 3 rows, prices and photo flag present') : bad('flow6 rows=' + rows.length);
// CSV quoting: comma in name gets quoted
HI.addItem(items, { roomId: liv, name: 'Lamp, floor', price: '89' }, rooms);
const csv2 = HI.itemsToCSV(items, rooms);
(/"Lamp, floor"/.test(csv2)) ? ok('flow6b: comma in name is CSV-quoted') : bad('flow6b quoting');

// Flow 7: search across name/serial/notes
(HI.search(items, 'dewalt').length === 0 && HI.search(items, 'lamp').length === 1 &&
 HI.search(items, 'OLED').length === 1 && HI.search(items, 'mixer').length === 1)
  ? ok('flow7: search hits name fragments, misses deleted items') : bad('flow7');

// Flow 8: persistence round-trip of full state
HI.storageSet('rooms', rooms);
HI.storageSet('items', items);
const r2 = HI.storageGet('rooms', []), i2 = HI.storageGet('items', []);
(r2.length === rooms.length && i2.length === items.length &&
 HI.totals(i2).grand.count === HI.totals(items).grand.count)
  ? ok('flow8: rooms+items survive storage round-trip, totals match') : bad('flow8');

// Flow 9: date validation edge cases
(HI.validISODate('2024-02-29') && !HI.validISODate('2025-02-29') && !HI.validISODate('2024-13-01') && !HI.validISODate('nope'))
  ? ok('flow9: leap-day 2024 ok, 2025-02-29 / bad month / junk rejected') : bad('flow9');

// Flow 10: export filename is dated
(/^home-inventory-\d{8}\.csv$/.test(HI.exportFilename()))
  ? ok('flow10: export filename ' + HI.exportFilename()) : bad('flow10: ' + HI.exportFilename());

// Flow 11: duplicate an item (bulk purchase of identical tools) — serial cleared
const drillRoom = rooms[rooms.length - 1].id;
HI.addItem(items, { roomId: drillRoom, name: 'DeWalt Battery', price: '99.00', serial: 'BAT-001' }, rooms);
const bat = items.filter(i => i.name === 'DeWalt Battery')[0];
const dupe = HI.duplicateItem(items, bat.id);
(dupe.ok && dupe.item.serial === '' && /\(copy\)/.test(dupe.item.name) &&
 items.filter(i => i.name.indexOf('DeWalt Battery') === 0).length === 2)
  ? ok('flow11: duplicate clones item, clears serial, "(copy)" suffix') : bad('flow11: ' + JSON.stringify(dupe));

// Flow 12: two items sharing a serial raise the duplicate-serial warning
HI.addItem(items, { roomId: drillRoom, name: 'DeWalt Charger', price: '49.00', serial: 'BAT-001' }, rooms);
const flags = HI.findDuplicateSerials(items);
(flags.length === 1 && flags[0].serial === 'BAT-001' && flags[0].items.length === 2)
  ? ok('flow12: duplicate serial "BAT-001" flagged on 2 items') : bad('flow12: ' + JSON.stringify(flags));

// Flow 13: sort items by price high->low and name A-Z
const byPrice = HI.sortItems(items, 'price', 'desc');
const byName = HI.sortItems(items, 'name', 'asc');
let priceOk = true;
for (let i = 1; i < byPrice.length; i++) if (byPrice[i - 1].price < byPrice[i].price) priceOk = false;
let nameOk = true;
for (let i = 1; i < byName.length; i++)
  if (byName[i - 1].name.toLowerCase() > byName[i].name.toLowerCase()) nameOk = false;
(priceOk && nameOk)
  ? ok('flow13: sort by price desc and name asc both ordered') : bad('flow13');

// Flow 14: category totals + JSON backup/restore full lifecycle
HI.updateItem(items, bat.id, { category: 'Tools' }, rooms);
const cats = HI.categoryTotals(items);
(cats['Tools'] && cats['Tools'].count >= 1 && cats['Tools'].value === 99)
  ? ok('flow14a: category totals show Tools = $99.00') : bad('flow14a: ' + JSON.stringify(cats));
const snap = HI.makeBackup(rooms, items);
const itemCount = items.length;
items.length = 0; rooms.length = 0; // wipe state like a fresh browser
const restored = HI.parseBackup(snap);
if (restored.ok) { rooms = restored.rooms; items = restored.items; }
(restored.ok && items.length === itemCount && HI.totals(items).grand.count === itemCount)
  ? ok('flow14b: backup -> wipe -> restore recovers all ' + itemCount + ' items') : bad('flow14b: ' + JSON.stringify(restored.errors || restored));
const corrupt = HI.parseBackup('{"app":"x"}');
(!corrupt.ok) ? ok('flow14c: corrupt backup rejected, not applied') : bad('flow14c');

// Flow 15: claim readiness — value-weighted proof score
const rd = HI.claimReadiness(items);
(rd.total === items.length && rd.valuePct >= 0 && rd.valuePct <= 100 && rd.fullyDocumented <= rd.total)
  ? ok('flow15: claim readiness ' + rd.valuePct + '% over ' + rd.total + ' items') : bad('flow15: ' + JSON.stringify(rd));

// Flow 16: ACV depreciation — a 2021 TV is worth less than its receipt price
const tv16 = items.filter(i => i.name === 'OLED TV')[0];
HI.updateItem(items, tv16.id, { date: '2021-06-01', category: 'Electronics' }, rooms);
const acv16 = HI.acv(tv16, '2026-10-12');
(acv16.acv < tv16.price && acv16.acv >= 0)
  ? ok('flow16: 2021 TV $' + tv16.price + ' -> ACV $' + acv16.acv) : bad('flow16: ' + JSON.stringify(acv16));

// Flow 17: under-documented valuables flag the pricey unproven item
const risks17 = HI.underDocumented(items, 500);
(risks17.length >= 1 && risks17.every(r => r.missing.length > 0))
  ? ok('flow17: ' + risks17.length + ' under-documented valuable(s) flagged with missing proof points')
  : bad('flow17: ' + JSON.stringify(risks17.map(r => r.item.name)));

// Flow 18: warranty lifecycle — set, expiry math, expiring-soon alert
const wroom18 = HI.addRoom([], 'Kitchen').room;
const wItems18 = [];
const wi18 = HI.addItem(wItems18, { roomId: wroom18.id, name: 'Fridge', category: 'Appliances', price: '1200', date: '2024-06-01' }, [wroom18]);
HI.setWarrantyMonths(wItems18, wi18.item.id, 36);
(HI.warrantyExpiry(wi18.item) === '2027-06-01')
  ? ok('flow18: 36-month warranty on 2024-06-01 fridge expires 2027-06-01') : bad('flow18: ' + HI.warrantyExpiry(wi18.item));
const alerts18 = HI.warrantyAlerts(wItems18, 90, '2027-04-01');
(alerts18.length === 1 && alerts18[0].w.status === 'expiring' && alerts18[0].w.daysLeft === 61)
  ? ok('flow18b: alert fires 61 days before expiry') : bad('flow18b: ' + JSON.stringify(alerts18));

// Flow 19: service log tells the maintenance story
HI.logService(wItems18, wi18.item.id, { date: '2025-06-01', description: 'Compressor check', cost: '89' });
HI.logService(wItems18, wi18.item.id, { date: '2026-06-01', description: 'Seal replaced', cost: '45.50' });
const hist19 = HI.serviceHistory(wi18.item);
(hist19.length === 2 && hist19[0].date === '2026-06-01' && HI.totalServiceCost(wi18.item) === 134.5)
  ? ok('flow19: 2 service records, newest first, $134.50 total') : bad('flow19: ' + JSON.stringify(hist19));

// Flow 20: loan tracker — out, overdue, back
const loan20 = HI.loanItem(wItems18, wi18.item.id, { to: 'Cousin Al', dueBack: '2026-09-01' });
const loans20 = HI.loanedItems(wItems18, '2026-10-13');
(loan20.ok && loans20.length === 1 && loans20[0].overdue === true)
  ? ok('flow20: fridge on loan to Cousin Al, overdue past 2026-09-01') : bad('flow20');
HI.returnItem(wItems18, wi18.item.id);
(HI.loanedItems(wItems18, '2026-10-13').length === 0)
  ? ok('flow20b: returned — loan list clear') : bad('flow20b');

// Flow 21: backup round-trips the new fields
const json21 = HI.makeBackup([wroom18], wItems18);
const back21 = HI.parseBackup(json21);
(back21.ok && back21.items[0].warrantyMonths === 36 &&
 back21.items[0].serviceLog.length === 2 && back21.items[0].loan === null)
  ? ok('flow21: backup keeps warranty + service log, loan was returned') : bad('flow21');
const corrupt21 = HI.parseBackup(JSON.stringify({ app: 'x', rooms: [], items: [{ name: 'x', price: 1, serviceLog: 'junk', loan: { to: '' }, warrantyMonths: 999 }] }));
(corrupt21.ok && corrupt21.items[0].warrantyMonths === null && corrupt21.items[0].serviceLog.length === 0 && corrupt21.items[0].loan === null)
  ? ok('flow21b: junk warranty/service/loan data sanitized on restore') : bad('flow21b: ' + JSON.stringify(corrupt21));

console.log('---');
console.log('e2e: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
NODEEOF
