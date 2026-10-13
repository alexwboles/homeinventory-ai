# Redesign Audit — homeinventory-ai (2026-10-13)

**Competitors studied:** Sortly (photo-first item cards, folder/room organization, custom fields, barcode, CSV export, dashboard), Encircle (insurance documentation: claim-ready reports, photo proof), Nest Egg (home inventory for insurance).

## Visual gaps
1. **Readiness is dashboard-only.** Encircle/Sortly show per-item proof status. We compute itemReadiness (photo/serial/date) but never surface it on cards. → proof badges on every item card (3 proof dots + x/3).
2. **Readiness % is plain text.** → SVG readiness ring for "share of value fully proven".
3. **Room list is plain.** Sortly folders show counts. → per-room value totals in the room tabs (data: totals().perRoom).
4. **Item cards lack visual hierarchy.** → proof strip + refined card layout.

## Functional / flow gaps
1. **Per-item proof badges** (new UI, existing data).
2. **Readiness ring** (new UI, existing data).
3. **Room value totals** (new UI, existing data).

## Decisions
- Keep: rooms, item CRUD + photos, service history, loan tracker, serial warnings, coverage dashboard (ACV, warranties, loans, risk list), CSV/backup/restore/print.
- Identity: "the claims file" — insurance binder (already in place): warm paper, olive accent, serif figures, sharp corners. Refine, don't replace.
