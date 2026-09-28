#!/bin/bash
# HomeInventory smoke tests — file presence, syntax, core logic sanity.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL: $1"; }

# 1. expected files exist
for f in index.html css/style.css js/data.js js/inventory.js js/app.js README.md test/e2e.sh; do
  [ -f "$f" ] && ok "file exists: $f" || bad "missing file: $f"
done

# 2. JS syntax valid
for f in js/data.js js/inventory.js js/app.js; do
  node --check "$f" 2>/dev/null && ok "syntax ok: $f" || bad "syntax error: $f"
done

# 3. index.html wires up the scripts
grep -q 'js/data.js' index.html && grep -q 'js/inventory.js' index.html && grep -q 'js/app.js' index.html \
  && ok "index.html loads data.js, inventory.js, app.js" || bad "index.html missing script tags"

# 4. print CSS present for insurance export
grep -q '@media print' css/style.css && ok "print stylesheet present" || bad "no @media print"

# 5+. logic checks via node
node << 'NODEEOF'
const HI = require('/home/hatch/workspace/homeinventory-ai/js/inventory.js');
const HD = require('/home/hatch/workspace/homeinventory-ai/js/data.js');
let pass = 0, fail = 0;
const ok  = (n) => { pass++; console.log('PASS: ' + n); };
const bad = (n) => { fail++; console.log('FAIL: ' + n); };

// money formatting / parsing
(HI.money(1234.5) === '$1,234.50' && HI.money(0) === '$0.00' && HI.money(9999999.99) === '$9,999,999.99')
  ? ok('money formats $1,234.50 / $0.00 / $9,999,999.99') : bad('money: ' + HI.money(1234.5));
(HI.parseMoney('$1,234.56') === 1234.56 && HI.parseMoney('499.99') === 499.99 &&
 HI.parseMoney('abc') === null && HI.parseMoney('') === null && HI.parseMoney('12.999') === null)
  ? ok('parseMoney: $, commas ok; junk/3-decimals rejected') : bad('parseMoney mismatch');

// default data shapes
(HD.DEFAULT_ROOMS.length === 8 && HD.CATEGORIES.length >= 10 && HD.GUIDANCE.length === 5)
  ? ok('data: 8 default rooms, 10+ categories, 5 guidance notes') : bad('data shape wrong');

// addRoom validation
let rooms = [{ id: 'r1', name: 'Kitchen' }];
let dup = HI.addRoom(rooms, 'kitchen');
(!dup.ok && rooms.length === 1) ? ok('addRoom rejects duplicate (case-insensitive)') : bad('addRoom dup');
let blank = HI.addRoom(rooms, '   ');
(!blank.ok) ? ok('addRoom rejects blank name') : bad('addRoom blank');

// addItem validation
let items = [];
let badItem = HI.addItem(items, { roomId: 'nope', name: '', price: 'abc' }, rooms);
(!badItem.ok && badItem.errors.length >= 3 && items.length === 0)
  ? ok('addItem rejects bad room/blank name/bad price (' + badItem.errors.length + ' errors)') : bad('addItem validation');

// photo cap enforced
const bigPhoto = 'data:image/jpeg;base64,' + 'A'.repeat(600 * 1024);
let bigRes = HI.addItem(items, { roomId: 'r1', name: 'TV', price: '899', photo: bigPhoto }, rooms);
(!bigRes.ok && /500 KB/.test(bigRes.errors.join(' '))) ? ok('addItem rejects photo over 500 KB') : bad('photo cap');
HI.photoOk('data:image/jpeg;base64,AAA', 500 * 1024) && !HI.photoOk('not-a-data-url', 500 * 1024)
  ? ok('photoOk accepts data URLs, rejects junk') : bad('photoOk');

// totals math
HI.addItem(items, { roomId: 'r1', name: 'Fridge', price: '1200', date: '2024-01-01' }, rooms);
HI.addItem(items, { roomId: 'r1', name: 'TV', price: '899.99' }, rooms);
const t = HI.totals(items);
(t.grand.count === 2 && Math.abs(t.grand.value - 2099.99) < 0.001 && t.perRoom['r1'].count === 2)
  ? ok('totals: 2 items, $2,099.99 in Kitchen') : bad('totals: ' + JSON.stringify(t.grand));

// search
HI.search(items, 'fridge').length === 1 && HI.search(items, '').length === 2
  ? ok('search finds "fridge", empty query returns all') : bad('search broken');

// CSV shape
const csv = HI.itemsToCSV(items, rooms);
const lines = csv.split('\n');
(lines.length === 3 && /^Room,Item,Category/.test(lines[0]) && /Fridge/.test(lines[1]))
  ? ok('CSV: header + 2 rows, header starts with Room,Item,Category') : bad('CSV shape');

// storage round-trip
HI.storageSet('tkey', { a: 1 });
JSON.stringify(HI.storageGet('tkey', null)) === '{"a":1}' ? ok('storage round-trip works') : bad('storage broken');

console.log('---');
console.log('smoke-node: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
NODEEOF
[ "$?" -eq 0 ] && ok "node logic checks all green" || bad "node logic checks failed"

echo "---"
echo "smoke: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
