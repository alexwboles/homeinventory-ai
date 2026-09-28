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

console.log('---');
console.log('e2e: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
NODEEOF
