# Scribe

Job app for Grape Country Woodcraft.

Invoices, cutlist import, door/drawer-front order form and plywood cutlist.

## Run

    docker compose up -d --build

Open https://scribe.local:5877 (see below). On the server itself the app is also at http://localhost:3000. Data lives in `./data` (SQLite file `app.db`, plus a daily backup in `./data/backups`, 30 days kept). Back up the `data` folder.

## HTTPS at https://scribe.local:5877

The `caddy` container serves Scribe over HTTPS on port 5877 using its own certificate authority. Nothing goes to the internet. (Ports 80 and 443 are not used.)

1. **Make the name resolve.** Add a DNS entry on your router for `scribe.local` pointing at the server's IP. If the router cannot, add `SERVER-IP  scribe.local` to `C:\Windows\System32\drivers\etc\hosts` on each computer (open Notepad as administrator).
2. **Trust the certificate, once per computer.** Get `root.crt` from `./caddy-data/caddy/pki/authorities/local/root.crt` on the server (or, before it is trusted, open https://scribe.local:5877/root.crt, click through the warning and keep the download). On Windows, double-click it, choose Install Certificate, Local Machine, Place all certificates in the following store, Trusted Root Certification Authorities. Restart the browser. Firefox keeps its own store: Settings, Certificates, View Certificates, Authorities, Import.
3. Open https://scribe.local:5877. The padlock should be closed and downloads stop warning.

Keep `./caddy-data` (it holds the certificate authority; losing it means installing a new root.crt everywhere). It is not committed to git.

## Notes in Joplin (optional)

Each job's note can be kept in step with your Joplin. They all go in one notebook called `Scribe job notes`, one note per job, named after the job (rename the job and the note is renamed). Edits made in Scribe or in Joplin show up in the other. It does not sync on a timer: Scribe asks for a sync when you open a job's Notes tab, a few seconds after you stop typing, about every 90 seconds while the tab stays open and quiet, and when you press "Sync with Joplin now". Nothing is created in Joplin for a job until you write something in its note. (An earlier version made a notebook per job. Those notes are moved into `Scribe job notes` the next time they sync, and the old notebook is deleted if it is then empty.)

Set up (on the server):

1. Copy `.env.example` to `.env` (it is not committed) and fill in your Joplin Server address, and the email and password you sign in to Joplin with.
2. `docker compose up -d --build`. This builds and starts a small `joplin` container (a headless Joplin app) next to Scribe. It keeps its own copy of your Joplin data in `./joplin-data`, and the first sync downloads everything in your Joplin account. That folder is not committed.
3. Open a job's Notes tab. The line above the note says when it last synced.

If both sides changed the same note between syncs, Scribe's text is kept and Joplin's version is saved next to it in the notebook as "JOB TITLE - Joplin version DATE". If you delete the note in Joplin, syncing for that job pauses until you press "Create it in Joplin again". Deleting a job in Scribe leaves its Joplin notebook alone. Without a `.env`, none of this runs and Scribe behaves as before.

## Using it

1. **New job**: name it, optionally attach the supplier cutlist .txt.
2. **Cutlist** tab: pick which materials appear on the plywood cutlist. Names such as `doors_sqft` can be used in invoice amount cells (e.g. `=doors_sqft*27.5`).
3. **Revised cutlist**: import the new file on the Cutlist tab. Scribe lists what changed (doors, fronts, plywood parts, invoice formula numbers) and nothing is replaced until you approve. Earlier versions are kept and can be restored. Door order and plywood cutlist show "Revision N" after the first change.
4. **Drawer order**: fills in the supplier's drawer order form (xlsx) from the cutlist's drawer boxes. Pick the form options, then Download xlsx.
5. **Door order**: fills in the supplier's door order form (xlsx). Door specs and contact details start from your defaults in Settings, sizes start from the cutlist (end panels get their own labelled section), then Download xlsx.
6. **Notes** tab: free-form markdown notes for the job, saved as you type, with a live preview. Optionally synced with Joplin (see above).
7. **Sheets** tab: real spreadsheets (formulas, formatting) made with the IronCalc engine. One per job, created with a button, with as many sheets inside it as you like. It saves as you edit, download as .xlsx, and you can upload an existing .xlsx. Stored in the database as .xlsx files, so they are included in the daily database backup (but not in the `jobs-DATE.json` export).
8. **Plywood cutlist**: starts from the cutlist, grouped by material. Edit any quantity or size, add or remove parts and materials (sizes and quantities are checked). "Start over from the cutlist" discards your edits. Print or Open PDF uses the edited list.
9. **Invoice** tab: Print, or Open PDF (made by headless Chromium so borders always print).

## Develop

    npm install
    npm run dev:server   # API on :3000
    npm run dev:web      # UI on :5173
    npm test
    npm run typecheck
