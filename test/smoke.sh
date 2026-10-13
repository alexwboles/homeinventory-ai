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

# 4b. new UI elements wired (sort, backup/restore, serial warning, category totals, duplicate, readiness, ACV, risk list)
for id in sortSel exportBackup restoreBtn restoreFile serialWarn catTotals readinessPct acvTotal riskList; do
  grep -q "id=\"$id\"" index.html && ok "index.html has #$id" || bad "index.html missing #$id"
done
grep -q 'data-dupe' js/app.js && ok "app.js wires Duplicate button" || bad "app.js missing duplicate wiring"

# 4c. sweep-2 UI elements: warranty panel, loan panel, service/loan form sections
for id in warrantyList loanList fWarranty serviceList loanStatus addService loanOut loanBack; do
  grep -q "id=\"$id\"" index.html && ok "index.html has #$id" || bad "index.html missing #$id"
done
grep -q 'renderWarranties' js/app.js && grep -q 'renderLoans' js/app.js \
  && ok "app.js renders warranty + loan panels" || bad "app.js missing warranty/loan renders"

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

// ---- new functionality checks ----
// sortItems: price desc/asc, name asc, date desc
const sItems = [
  { name: 'Lamp', price: 50, date: '2023-05-01' },
  { name: 'Sofa', price: 1200, date: '2024-01-10' },
  { name: 'Rug', price: 300, date: '2022-11-20' }
];
(HI.sortItems(sItems, 'price', 'desc').map(x => x.name).join(',') === 'Sofa,Rug,Lamp' &&
 HI.sortItems(sItems, 'price', 'asc').map(x => x.name).join(',') === 'Lamp,Rug,Sofa' &&
 HI.sortItems(sItems, 'name', 'asc').map(x => x.name).join(',') === 'Lamp,Rug,Sofa' &&
 HI.sortItems(sItems, 'date', 'desc').map(x => x.name).join(',') === 'Sofa,Lamp,Rug')
  ? ok('sortItems: price asc/desc, name, date ordering') : bad('sortItems');

// duplicateItem: clones with new id, clears serial (serials must be unique)
let dRooms = [{ id: 'r1', name: 'Kitchen' }];
let dItems = [];
HI.addItem(dItems, { roomId: 'r1', name: 'Fridge', price: '1200', serial: 'SN-1' }, dRooms);
const dup2 = HI.duplicateItem(dItems, dItems[0].id);
(dup2.ok && dItems.length === 2 && dup2.item.id !== dItems[0].id &&
 /\(copy\)/.test(dup2.item.name) && dup2.item.serial === '' && dup2.item.price === 1200)
  ? ok('duplicateItem: new id, "(copy)" name, serial cleared, values kept') : bad('duplicateItem');
(!HI.duplicateItem(dItems, 'missing').ok)
  ? ok('duplicateItem: unknown id returns not-ok') : bad('duplicateItem unknown');

// findDuplicateSerials: flags repeated serials, ignores blanks
let serItems = [
  { serial: 'ABC-1', name: 'A' }, { serial: 'abc-1', name: 'B' },
  { serial: 'XYZ-9', name: 'C' }, { serial: '', name: 'D' }
];
const dupes = HI.findDuplicateSerials(serItems);
(dupes.length === 1 && dupes[0].items.length === 2 && dupes[0].serial === 'ABC-1')
  ? ok('findDuplicateSerials: case-insensitive match, blanks ignored') : bad('duplicate serials: ' + JSON.stringify(dupes));
HI.findDuplicateSerials([{ serial: 'A' }, { serial: 'B' }]).length === 0
  ? ok('findDuplicateSerials: none when all unique') : bad('duplicate serials false positive');

// categoryTotals: per-category count + value
let cItems = [
  { category: 'Electronics', price: 1000, name: 'TV' },
  { category: 'Electronics', price: 500, name: 'Speaker' },
  { category: 'Furniture', price: 300, name: 'Chair' }
];
const ct = HI.categoryTotals(cItems);
(ct.Electronics && ct.Electronics.count === 2 && ct.Electronics.value === 1500 &&
 ct.Furniture && ct.Furniture.count === 1 && ct.Furniture.value === 300)
  ? ok('categoryTotals: per-category count + value') : bad('categoryTotals: ' + JSON.stringify(ct));

// backup round-trip: makeBackup + parseBackup restores rooms/items intact
const bRooms = [{ id: 'r1', name: 'Kitchen' }];
const bItems = [];
HI.addItem(bItems, { roomId: 'r1', name: 'Fridge', price: '1200', serial: 'SN-9' }, bRooms);
const payload = HI.makeBackup(bRooms, bItems);
const parsed = HI.parseBackup(payload);
(parsed.ok && parsed.rooms.length === 1 && parsed.items.length === 1 &&
 parsed.items[0].name === 'Fridge' && parsed.items[0].serial === 'SN-9' &&
 /^home-inventory-backup-\d{8}\.json$/.test(HI.backupFilename()))
  ? ok('backup: makeBackup -> parseBackup restores 1 room + 1 item; filename dated') : bad('backup round-trip');
(!HI.parseBackup('not json').ok && !HI.parseBackup('{"rooms":[]}').ok)
  ? ok('parseBackup: rejects bad JSON and missing items') : bad('parseBackup validation');
const orph = HI.parseBackup(JSON.stringify({ rooms: [{ id: 'r1', name: 'Kitchen' }],
  items: [{ id: 'i1', roomId: 'gone', name: 'Lamp', price: 10 }] }));
(orph.ok && orph.items[0].roomId === 'r1')
  ? ok('parseBackup: orphan roomId falls back to first room') : bad('parseBackup orphan fallback');

// ---- claim readiness ----
const rFull = HI.itemReadiness({ photo: 'data:x', serial: 'SN1', date: '2024-01-01' });
const rNone = HI.itemReadiness({ name: 'Lamp', price: 50 });
const rPart = HI.itemReadiness({ serial: 'SN2' });
(rFull.points === 3 && rNone.points === 0 && rPart.points === 1 && rPart.pct === 33)
  ? ok('itemReadiness: 3/0/1 proof points scored') : bad('itemReadiness: ' + JSON.stringify([rFull, rNone, rPart]));
const cr = HI.claimReadiness([
  { name: 'TV', price: 1000, photo: 'data:x', serial: 'S1', date: '2024-01-01' },
  { name: 'Lamp', price: 100 }
]);
// TV fully proven ($1000), Lamp nothing: proven value = 1000/1100
(cr.fullyDocumented === 1 && cr.total === 2 && cr.valuePct === 91)
  ? ok('claimReadiness: 1 of 2 fully proven, 91% of value proven') : bad('claimReadiness: ' + JSON.stringify(cr));

// ---- actual cash value (depreciation) ----
const aNew = HI.acv({ name: 'TV', price: 1000, category: 'Electronics', date: '2026-01-01' }, '2026-10-12');
const aOld = HI.acv({ name: 'TV', price: 1000, category: 'Electronics', date: '2016-01-01' }, '2026-10-12');
const aNoDate = HI.acv({ name: 'TV', price: 1000, category: 'Electronics' }, '2026-10-12');
const aArt = HI.acv({ name: 'Painting', price: 2000, category: 'Collectibles & Art', date: '2000-01-01' }, '2026-10-12');
(aNew.acv > 800 && aNew.acv <= 1000 && aOld.acv === 0 && aNoDate.acv === 1000 && aArt.acv === 2000)
  ? ok('acv: recent TV keeps most value, 10-yr-old TV fully depreciated, no-date keeps price, art holds')
  : bad('acv: ' + JSON.stringify([aNew, aOld, aNoDate, aArt]));
const at = HI.acvTotals([
  { name: 'TV', price: 1000, category: 'Electronics', date: '2021-10-12' },
  { name: 'Sofa', price: 500, category: 'Furniture', date: '2021-10-12' }
], '2026-10-12');
// TV: 5yr life, ~5yr old -> ~0; Sofa: 10yr life, ~5yr old -> ~250
(at.purchaseValue === 1500 && at.acvValue < 260 && at.acvValue >= 240 && Math.abs(at.depreciation - (1500 - at.acvValue)) < 0.01)
  ? ok('acvTotals: purchase $1,500, ACV ~$250, depreciation reconciles') : bad('acvTotals: ' + JSON.stringify(at));

// ---- under-documented high-value items ----
const risks = HI.underDocumented([
  { name: 'TV', price: 2000, serial: 'S1' },                       // missing photo+date
  { name: 'Ring', price: 5000, photo: 'data:x', serial: 'R1', date: '2024-01-01' }, // fully proven
  { name: 'Lamp', price: 50 }                                      // below threshold
], 500);
(risks.length === 1 && risks[0].item.name === 'TV' &&
 risks[0].missing.join(',') === 'photo,date')
  ? ok('underDocumented: only the $2,000 TV flagged, missing photo+date') : bad('underDocumented: ' + JSON.stringify(risks));

// ---- warranties ----
const wItems = [];
const wroom = HI.addRoom([], 'Living Room').room;
const wi = HI.addItem(wItems, { roomId: wroom.id, name: 'Washer', category: 'Appliances', price: '900', date: '2025-01-15' }, [wroom]);
const wset = HI.setWarrantyMonths(wItems, wi.item.id, 24);
(wset.ok && wi.item.warrantyMonths === 24)
  ? ok('setWarrantyMonths stores 24 months') : bad('setWarrantyMonths: ' + JSON.stringify(wset));
(HI.warrantyExpiry(wi.item) === '2027-01-15')
  ? ok('warrantyExpiry: 2025-01-15 + 24mo = 2027-01-15') : bad('warrantyExpiry: ' + HI.warrantyExpiry(wi.item));
const ws = HI.warrantyStatus(wi.item, '2026-11-01');
(ws.status === 'expiring' && ws.daysLeft === 75)
  ? ok('warrantyStatus: expiring, 75 days left on 2026-11-01') : bad('warrantyStatus: ' + JSON.stringify(ws));
const wsAct = HI.warrantyStatus(wi.item, '2026-01-01');
(wsAct.status === 'active') ? ok('warrantyStatus: active a year out') : bad('warrantyStatus active: ' + JSON.stringify(wsAct));
const wsExp = HI.warrantyStatus(wi.item, '2028-01-01');
(wsExp.status === 'expired' && wsExp.daysLeft < 0)
  ? ok('warrantyStatus: expired after 2027-01-15') : bad('warrantyStatus expired: ' + JSON.stringify(wsExp));
(HI.warrantyStatus({ name: 'x' }, '2026-11-01').status === 'none')
  ? ok('warrantyStatus: none when untracked') : bad('warrantyStatus none');
(!HI.setWarrantyMonths(wItems, wi.item.id, 999).ok)
  ? ok('setWarrantyMonths rejects 999 months') : bad('warranty range not enforced');
(!HI.setWarrantyMonths(wItems, 'nope', 12).ok)
  ? ok('setWarrantyMonths rejects unknown item') : bad('warranty unknown item');
const alerts = HI.warrantyAlerts(wItems, 90, '2026-11-01');
(alerts.length === 1 && alerts[0].item.name === 'Washer')
  ? ok('warrantyAlerts flags the washer 75 days out') : bad('warrantyAlerts: ' + JSON.stringify(alerts));

// ---- service log ----
const s1 = HI.logService(wItems, wi.item.id, { date: '2026-03-01', description: 'Replaced belt', cost: '120' });
const s2 = HI.logService(wItems, wi.item.id, { date: '2026-09-01', description: 'Annual check', cost: '' });
(s1.ok && s2.ok && HI.serviceHistory(wi.item).length === 2)
  ? ok('logService stores 2 records') : bad('logService: ' + JSON.stringify([s1, s2]));
(HI.serviceHistory(wi.item)[0].date === '2026-09-01')
  ? ok('serviceHistory newest-first') : bad('serviceHistory order');
(HI.lastService(wi.item).description === 'Annual check')
  ? ok('lastService returns newest') : bad('lastService');
(HI.totalServiceCost(wi.item) === 120)
  ? ok('totalServiceCost = $120 (blank cost ignored)') : bad('totalServiceCost: ' + HI.totalServiceCost(wi.item));
(!HI.logService(wItems, wi.item.id, { date: 'nope', description: 'x' }).ok)
  ? ok('logService rejects bad date') : bad('service date validation');
(!HI.logService(wItems, wi.item.id, { date: '2026-01-01', description: '  ' }).ok)
  ? ok('logService rejects blank description') : bad('service desc validation');
const sdel = HI.deleteService(wItems, wi.item.id, wi.item.serviceLog[0].id);
(sdel && HI.serviceHistory(wi.item).length === 1)
  ? ok('deleteService removes one record') : bad('deleteService');
(!HI.deleteService(wItems, wi.item.id, 'nope'))
  ? ok('deleteService rejects unknown entry') : bad('deleteService unknown');

// ---- loan tracker ----
const l1 = HI.loanItem(wItems, wi.item.id, { to: 'Neighbor Jane', dueBack: '2026-10-01' });
(l1.ok && wi.item.loan.to === 'Neighbor Jane' && wi.item.loan.date === HI.todayISO())
  ? ok('loanItem records borrower, defaults loan date to today') : bad('loanItem: ' + JSON.stringify(l1));
(!HI.loanItem(wItems, wi.item.id, { to: 'Someone else' }).ok)
  ? ok('loanItem rejects double-loan') : bad('double loan allowed');
const wi2 = HI.addItem(wItems, { roomId: wroom.id, name: 'Ladder', price: '80' }, [wroom]);
(!HI.loanItem(wItems, wi2.item.id, { to: '   ' }).ok)
  ? ok('loanItem rejects blank borrower name') : bad('blank borrower allowed');
(!HI.loanItem(wItems, wi2.item.id, { to: 'Al', dueBack: 'not-a-date' }).ok)
  ? ok('loanItem rejects bad due-back date') : bad('bad due-back allowed');
const loans = HI.loanedItems(wItems, '2026-10-13');
(loans.length === 1 && loans[0].overdue === true)
  ? ok('loanedItems: overdue after 2026-10-01 due-back') : bad('loanedItems: ' + JSON.stringify(loans));
const loansOk = HI.loanedItems(wItems, '2026-09-01');
(loansOk.length === 1 && loansOk[0].overdue === false)
  ? ok('loanedItems: not overdue before due-back') : bad('loanedItems early');
const r1 = HI.returnItem(wItems, wi.item.id);
(r1.ok && !wi.item.loan && HI.loanedItems(wItems, '2026-10-13').length === 0)
  ? ok('returnItem clears the loan') : bad('returnItem: ' + JSON.stringify(r1));
(!HI.returnItem(wItems, wi.item.id).ok)
  ? ok('returnItem rejects when not on loan') : bad('return when not loaned');
process.exit(fail ? 1 : 0);
NODEEOF
[ "$?" -eq 0 ] && ok "node logic checks all green" || bad "node logic checks failed"

echo "---"
echo "smoke: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]

# redesign sweep: proof badges, readiness ring, room values
node -e "
var HI = require('./js/inventory.js');
// itemReadiness: 3 proofs
var r = HI.itemReadiness({ photo: 'x', serial: 'AB1', date: '2024-01-01' });
if (r.points !== 3 || r.pct !== 100) { console.error('3/3 failed'); process.exit(1); }
var r2 = HI.itemReadiness({ photo: '', serial: '', date: '' });
if (r2.points !== 0) { console.error('0/3 failed'); process.exit(1); }
var r3 = HI.itemReadiness({ photo: 'x', serial: '', date: 'bad-date' });
if (r3.points !== 1 || r3.checks.join() !== 'photo') { console.error('1/3 failed'); process.exit(1); }
var fs = require('fs'), a = fs.readFileSync('./js/app.js', 'utf8');
['pdot', 'readinessRing', 'ringwrap', 'rmeta', 'Proof '].forEach(function (s) {
  if (a.indexOf(s) < 0) { console.error('app missing ' + s); process.exit(1); }
});
var c = fs.readFileSync('./css/style.css', 'utf8');
['.proof', '.pdot.on', '.ringwrap', '.room .rmeta'].forEach(function (s) {
  if (c.indexOf(s) < 0) { console.error('css missing ' + s); process.exit(1); }
});
console.log('OK');" 2>/dev/null && ok "proof badges + readiness ring + room values" || bad "redesign checks"
