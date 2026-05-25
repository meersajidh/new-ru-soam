# Windows app-local VC++ runtime

On Windows builds, `electron-builder.yml` (`win.extraFiles`) copies the `*.dll`
files in this folder to the app root (next to `ru-soam.exe`). Windows' loader
finds DLLs in the executable's directory, so this lets the MSVC-linked native
binding load on a **clean Windows with no VC++ redistributable installed**.

The DLLs are a **build-environment input, not vendored in git** — `*.dll` is
gitignored (repo `.gitignore`). Only this README is tracked (it also keeps the
folder present so `extraFiles`' `from:` path always resolves).

## Why
`@node-rs/argon2`'s native binding imports `vcruntime140.dll`, which is **not**
part of Windows (only the Universal CRT — `ucrtbase.dll`, `api-ms-win-crt-*` — is).
Without it the app crashes at launch: `Failed to load native binding` /
`ERR_DLOPEN_FAILED: The specified module could not be found`. (better-sqlite3 is
statically linked — confirmed via PE import scan — and needs nothing here.)

## How it's populated
- **CI:** the `Stage VC++ runtime DLLs (Windows)` step in `release.yml` copies the
  `Microsoft.VC143.CRT` set from the runner's Visual Studio redistributable dir.
- **Local packaging** (e.g. building a release on a Windows dev box): copy the
  runtime from your VS redist dir or System32 before `electron-builder`:
  ```bash
  cp /c/Windows/System32/{vcruntime140.dll,vcruntime140_1.dll,msvcp140.dll} \
     apps/desktop/build/win-runtime/
  ```
  (For plain `npm run dev`, you don't need this — your dev machine's system
  runtime is used; it only matters for packaged builds shipped to clean machines.)
