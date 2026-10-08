# 🏠 HomeInventory AI

**Document everything you own — so an insurance claim never relies on memory.** Rooms, items with prices/serials/photos, a total-value dashboard, CSV export, and a print-friendly report — all running 100% in your browser.

## The problem

After a fire, flood, or burglary, insurers ask for a list of everything you lost — with proof. Almost nobody has one, and claims get underpaid because people forget what they owned.

## The solution

HomeInventory AI is a single-page web app (no build step, no dependencies, no account) that:

1. **Organizes by room** — 8 default rooms, add your own, per-room item counts.
2. **Captures what matters** — name, category, purchase price, purchase date, serial number, notes, and one photo per item (auto-shrunk to fit a 500 KB cap).
3. **Dashboards total value** — per-room, per-category, and grand-total documented value with item counts.
4. **Exports for insurance** — one-click CSV export, full **JSON backup + restore**, plus a print stylesheet that turns the inventory into a clean paper report. Keep a copy off-site!
5. **Teaches claim-readiness** — five insurance-documentation guidance notes (photograph everything, keep receipts, update after purchases, off-site copy, replacement cost vs. actual cash value).
6. **Sorts your items** — name, price, or purchase date, ascending or descending.
7. **Duplicates items** — one-click clone for multiples (serial cleared so each keeps a unique one).
8. **Flags duplicate serial numbers** — warns when the same serial appears on multiple items, which insurers flag.

Everything persists in `localStorage`. Optional: set `OPENAI_API_KEY` for AI-assisted item descriptions in a future version — nothing requires it.

## Privacy

**Nothing leaves the device.** No server, no analytics, no tracking. Your inventory and photos stay in the browser. Serve it locally and it works offline.

## Run it

```bash
# any static server works:
npx serve .
# then open http://localhost:3000
```

Add a few rooms and items, check the Dashboard tab for your total documented value, then hit **Export CSV** and email the file to yourself as an off-site backup.

## Tests

```bash
bash test/smoke.sh   # file presence, JS syntax, core logic spot checks
bash test/e2e.sh     # full flows: rooms, items, totals, edit/delete, CSV, search, persistence
```

## Disclaimer

HomeInventory AI is a documentation tool, not insurance or legal advice. Check your policy for coverage details.
