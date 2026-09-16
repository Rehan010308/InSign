# InSign — Preview Run Doc

## Current preview — static site via local Node server

The project is a **zero-dependency static site** in `site/` (HTML/CSS/vanilla JS, 2D-canvas animations — no external libraries since the v2 redesign). A tiny Node built-ins server (`site/server.js`) serves it.

### How to reproduce artifacts
- No install, no build, no vendored assets. Fonts load from Google Fonts CDN (falls back to system fonts offline).
- No `.env` files exist; nothing to copy from the main checkout.

### How to run the server
- Working dir: `C:\Users\rehan\Downloads\InSign\site`
- Command: `node server.js 4173` (port 4173; free at setup time; override with any free port as arg 1)
- Detached start on Windows (stdout/stderr to DIFFERENT files):
  ```powershell
  powershell -NoProfile -Command "(Start-Process -FilePath 'node.exe' -ArgumentList 'server.js','4173' -WorkingDirectory 'C:\Users\rehan\Downloads\InSign\site' -RedirectStandardOutput 'C:\Users\rehan\Downloads\InSign\.freebuff\preview-1f4f2f36-1b9c-4698-9b4a-aa162d4605d5.log' -RedirectStandardError 'C:\Users\rehan\Downloads\InSign\.freebuff\preview-1f4f2f36-1b9c-4698-9b4a-aa162d4605d5.log.err' -WindowStyle Hidden -PassThru).Id"
  ```
- Confirm alive: `powershell -NoProfile -Command "Get-Process -Id <pid>"`, then wait for `curl http://localhost:4173` to answer before `register_preview` (url `http://localhost:4173`, pid from above).
- Alternative for the user: double-click `site/start.bat` (foreground window; Ctrl+C or close to stop).

## Notes
- From the project root, `npm start` / `npm run dev` also works (root package.json delegates to `node site/server.js`).
- If the requested port is busy, the server auto-increments to the next free port (up to +10) and prints the chosen one; register the preview with the URL actually printed.
- Reduced-motion / no-WebGL environments automatically fall back to a static poster (no server change needed).
