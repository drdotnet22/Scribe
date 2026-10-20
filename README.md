# Scribe

Job app for Grape Country Woodcraft.

Invoices, cutlist import, door/drawer-front order form and plywood cutlist.

## Run

    docker compose up -d --build

Open http://SERVER:3000. Data lives in `./data` (SQLite file `app.db`, plus a daily backup in `./data/backups`, 30 days kept). Back up the `data` folder.

## Using it

1. **New job**: name it, optionally attach the supplier cutlist .txt.
2. **Cutlist** tab: pick which materials appear on the plywood cutlist. Names such as `doors_sqft` can be used in invoice amount cells (e.g. `=doors_sqft*27.5`).
3. **Revised cutlist**: import the new file on the Cutlist tab. Scribe lists what changed (doors, fronts, plywood parts, invoice formula numbers) and nothing is replaced until you approve. Earlier versions are kept and can be restored. Door order and plywood cutlist show "Revision N" after the first change.
4. **Door order** and **Plywood cutlist** tabs: Print, or Open PDF (made by headless Chromium so borders always print).

## Develop

    npm install
    npm run dev:server   # API on :3000
    npm run dev:web      # UI on :5173
    npm test
    npm run typecheck
