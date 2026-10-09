# Windows service deployment

These WinSW services run the backend API and built frontend on the same
machine. Both bind to `127.0.0.1`, so they are only reachable locally. The
sync scheduler is optional; install it only when automatic synchronization
is required, and run only one scheduler per database.

## Prepare the deployment

1. Keep the project folder structure intact on the deployment machine.
2. Install Node.js 18 or newer.
3. The checked-in local defaults already use the frontend at
   `http://localhost:3000` and the API at `http://localhost:4000/api`; no
   config changes are needed for a single-machine setup.
4. From the project root, install frontend dependencies if needed and build:

   ```powershell
   cd C:\REPLACE_WITH_PROJECT_PATH\frontend
   npm ci
   npm run build
   ```

   If dependencies are already installed, rebuilding only requires
   `npm run build`.
5. Install backend dependencies if needed:

   ```powershell
   cd C:\REPLACE_WITH_PROJECT_PATH\backend
   npm ci
   ```

6. Create the service log directories if they do not already exist:

   ```powershell
   New-Item -ItemType Directory -Force `
     C:\REPLACE_WITH_PROJECT_PATH\backend\logs\winsw-api, `
     C:\REPLACE_WITH_PROJECT_PATH\backend\logs\winsw-frontend, `
     C:\REPLACE_WITH_PROJECT_PATH\backend\logs\winsw-scheduler
   ```

7. Replace `C:\REPLACE_WITH_NODE_INSTALL_PATH` and
   `C:\REPLACE_WITH_PROJECT_PATH` in each service XML.

The frontend service serves `frontend\dist` on `127.0.0.1:3000`; the backend
listens on `127.0.0.1:4000`. If you change either port, update the matching
frontend API URL or backend CORS origin as appropriate and rebuild the
frontend after changing `frontend\config.json`.

## Install each service

For every service you want to install, place a WinSW executable beside its
XML and give the executable the same base name as that XML:

- `NexxusAdminConsoleBackend.exe` + `NexxusAdminConsoleBackend.xml`
- `NexxusAdminConsoleFrontend.exe` + `NexxusAdminConsoleFrontend.xml`
- `NexxusSyncScheduler.exe` + `NexxusSyncScheduler.xml` (optional)

Run an elevated PowerShell window in that directory, then install and start
each service:

```powershell
.\NexxusAdminConsoleBackend.exe install
.\NexxusAdminConsoleBackend.exe start
```

Repeat with the corresponding executable for the frontend and, if needed,
the sync scheduler. The frontend and API use separate local ports.
