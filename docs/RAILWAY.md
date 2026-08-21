# Railway setup

1. Deploy the GitHub repository as a Railway service.
2. Add a PostgreSQL service in the same Railway project.
3. Set the app service `DATABASE_URL` to a Railway reference for the PostgreSQL `DATABASE_URL`.
4. Keep `AUTH_SESSION_DAYS=30` and optionally set `OCR_MAX_BYTES`.
5. Deploy. `railway.json` runs the database schema push before starting the application and checks `/api/health`.

TIJRA does not need a paid OCR API in the current MVP.
