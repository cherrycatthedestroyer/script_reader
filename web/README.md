# Script Cue — browser edition

The original Windows program remains in the parent folder. This folder is a self-contained web version using the same **Operator Script** and **Actor** screen names and the supplied script. It has no external packages, database, or app accounts.

## Test locally on this Windows PC

1. Install **Node.js 24 LTS** from [nodejs.org](https://nodejs.org/) if needed. The portable Node copy in `.tools`, when present, also works with the launcher.
2. Double-click **Start Web.bat** in this folder. Leave its window open.
3. Open **http://localhost:3000** in a browser. Choose **Operator Script**.
4. Open the same address in a second browser tab/window. Choose **Actor**, then select a character. The very first cue belongs to ARNAB; JAI is one cue away.
5. Press **Next cue** in Operator Script. JAI's Actor screen turns green and says **YOUR LINE — NOW**. Press **Previous** and it turns red with a one-line countdown. Try scene selection and jumping to a cue too.

Or start from PowerShell after installing Node:

```powershell
cd 'C:\Users\Josh\Desktop\incident\web'
node server.js
```

### Test with your phone and tablet

1. Connect the PC, phone, and tablet to the **same Wi-Fi network**. Keep the server running on the PC.
2. The server window prints addresses such as `http://192.168.1.25:3000`. Open the address belonging to your Wi-Fi adapter on both devices. Use `http`, not `https`, locally. **Do not use localhost on the phone**: that refers to the phone itself.
3. Choose **Operator Script** on your phone and **Actor** on your tablet. Select the actor's character. Both now follow the same shared cue. Additional tablets can choose different characters independently.
4. If Windows asks about Node.js network access, allow it on your **private/home network**. If needed, search Windows for “Allow an app through Windows Firewall” and allow the running Node.js executable on Private networks. There is no need to forward router ports.
5. If the page will not open, check `ipconfig` for the PC's Wi-Fi IPv4 address, turn off a VPN if it routes local traffic away, and avoid a guest Wi-Fi network that isolates devices. Keep the PC awake.

Stop the server with **Ctrl+C**. A new server starts at cue 1.

## Controls

- **Operator Script:** complete script including scene headings and stage directions, highlighted current speaking cue, big Previous/Next buttons, scene jump, cue-number jump, and Find current cue. You can scroll away to read ahead; moving the cue brings the current cue back into view.
- **Keyboard:** Up/Left goes back, Down/Right advances, Home/End jumps to the first/last speaking cue. Shortcuts do not interfere with typing or native buttons and dropdowns.
- **Actor:** character-specific next line, speaking-cue countdown, current speaker and position, green border for the current line, red border for an upcoming line, and a completed state after the last line. Long cues remain fully readable by scrolling. Text size and character are remembered on that browser.
- **Fullscreen:** available in supported browsers. On devices without it, use the browser's Add to Home Screen option if available.
- **Change screen:** returns to the selection page without moving the cue. Direct links `/#operator` and `/#actor` are also supported.
- **Connection loss:** the Actor screen drops the red/green live indication, displays an out-of-date warning, and reconnects automatically. Operator controls are disabled until synchronized. Returning from a sleeping/background tab requests the latest cue. An uncertain command is never retried automatically, avoiding accidental double advances.

## Host for free on Render

Use a **Render Web Service**, with one running instance. A static-only host cannot coordinate the shared cue without a separate backend. Hosting setup requires your own GitHub and Render accounts; people using the app do not sign in.

1. Create a GitHub repository (private is fine) and upload this project, keeping the `web` folder. Exclude `web/.tools`, any `node_modules`, and logs. You only need the `web` folder for hosting; the DOCX and original Windows files are optional and are not served by this app.
2. Sign in to [Render](https://dashboard.render.com/), choose **New → Web Service**, and connect that repository.
3. Use these settings:

   | Setting | Value |
   | --- | --- |
   | Language / runtime | Node |
   | Root directory | `web` |
   | Build command | `npm install --omit=dev` |
   | Start command | `npm start` |
   | Instance type | **Free** |
   | Health check path | `/health` |
   | Environment variable | `NODE_VERSION` = `24` |

   If you upload the *contents* of `web` directly into your repository root, leave Root directory blank instead.
4. Deploy. Render gives you an HTTPS address such as `https://your-script-cue.onrender.com`. Open that **same address** on every device and choose each screen. Once hosted, devices can use different networks and the PC does not need to be on.
5. Before filming, open the site, wait for the **Live · all screens synced** indicator, choose characters, and verify a Next/Previous move on every Actor screen.

Render's free tier sleeps after 15 minutes without inbound traffic and can take about a minute to wake. It may also restart a service. **The shared cue is held in server memory and resets to cue 1 on a restart, redeploy, or wake after shutdown.** Use the cue-number or scene jump to resume. A browser refresh alone does not reset the shared cue. Free usage has monthly limits; check the dashboard. This is suitable for casual rehearsal, with the local Wi-Fi option available for filming when you want to avoid free-host interruptions.

Anyone who can open this URL can view the script and choose Operator Script to control it, as requested. Share the URL with your cast; screen choice is not an access restriction. There is one shared rehearsal per deployment. Multiple operators see the same cue; if two act on the exact same revision, the second is synchronized and asked to tap again instead of silently skipping a line.

Hosting references (checked October 1, 2026): [Render free service limits](https://render.com/docs/free), [Node web service deployment](https://render.com/docs/deploy-node-express-app).

## Update the script

The web app loads **web/script.json**, a copy of the original data. It does not parse Word files on Render. After editing the DOCX in the parent folder, run from this folder:

```powershell
powershell -ExecutionPolicy Bypass -File '.\Update Script.ps1'
```

This invokes the existing converter and writes this folder's `script.json`. Restart the local server. For hosting, commit and push the updated `web/script.json`, then let Render redeploy. If this web folder was copied on its own, use the converter in the original folder and copy the regenerated `script.json` here instead.

## Verification and implementation

```powershell
npm test
```

Tests cover cue boundaries, character countdown/current/completed states, real HTTP command handling, two simultaneous event streams, reconnecting at the latest cue, stale command rejection, and invalid requests. No npm dependencies are needed.

Browser checks also verified next/previous updates between two tabs, reaching the final cue, retaining the shared cue across refresh, and scrolling the long opening speech while keeping its countdown visible. Layouts were checked at 390 × 844 (phone) and 820 × 1180 (tablet), without horizontal overflow. Preview images are in `screenshots/`. Real-device Wi-Fi connectivity and deployment are tested using the steps above.

`server.js` serves the page and owns the shared cue. Server-sent events push state to all connected screens; a JSON POST moves the cue. Every screen gets the latest snapshot on connection and a heartbeat every five seconds. Character selection stays on each device. Keep exactly one server instance because state is in memory. `PORT` defaults to 3000 locally and uses Render's assigned value when deployed. Only the explicit public assets and script API are served.
