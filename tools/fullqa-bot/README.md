# FullQA Bot

FullQA Bot is a reusable web-application QA runner. The core works with any `TARGET_URL`; application-specific behavior is added through profiles. Tijra is the first built-in profile.

## What it does

- probes `/api/health` and records build metadata when available
- crawls same-origin routes and inventories forms, buttons and links
- discovers registration pages and safely populates forms
- runs real profile-driven account creation and login checks
- stores authenticated browser states for created roles
- checks Chromium, Firefox, WebKit, iPhone and Android emulation
- captures screenshots and structured JSON/HTML reports
- supports declarative workflows for arbitrary apps without changing the core
- runs k6 smoke and stress tests, including a default ramp to 500 concurrent VUs
- can be launched from GitHub Actions, so no local computer is required

## Run locally

```bash
cd tools/fullqa-bot
npm install
npx playwright install --with-deps chromium firefox webkit
TARGET_URL=https://example.com npm run qa
```

Tijra:

```bash
TARGET_URL=https://tijra-production.up.railway.app QA_PROFILE=tijra npm run qa
```

The Tijra profile creates fresh Supplier, Retailer, BOTH, Cafe, Restaurant and Electronics QA accounts, validates duplicate-email and wrong-password behavior, and preserves authenticated storage states under `artifacts/states/`.

## Run any app with a declarative profile

Set `PROFILE_FILE` to a JSON file describing workflows. Supported steps are `goto`, `fill`, `click`, `select`, `wait`, `expectText`, `expectUrl`, and `screenshot`.

Available variables include `${RUN_ID}`, `${EMAIL}`, `${PASSWORD}`, and `${TARGET_URL}`.

Example:

```bash
TARGET_URL=https://example.com PROFILE_FILE=profiles/example.json npm run qa
```

This lets FullQA create accounts, submit forms and execute business flows on any application once its profile declares the intended safe actions and expected outcomes.

## Load and stress

Install k6, then:

```bash
TARGET_URL=https://example.com LOAD_PATH=/api/health LOAD_RATE=100 npm run load:smoke
TARGET_URL=https://example.com LOAD_PATH=/api/health npm run load:stress
```

The default stress ramp is 30 → 50 → 100 → 200 → 500 concurrent VUs. Edit or add a profile-specific load script for authenticated business actions such as ordering, reservation, POS or inventory updates.

## GitHub Actions

Open **Actions → FullQA Bot → Run workflow** and provide:

- target URL
- functional / load-smoke / load-stress
- profile name
- load path and request rate when relevant

The run uploads FullQA artifacts automatically.

## Safety model

Generic discovery does not blindly submit unknown forms. A profile is required for destructive actions. This keeps the runner reusable without creating garbage records in arbitrary production systems. Application profiles can opt into real account creation and business mutations because they explicitly define what the test is allowed to do.

## Architecture

- `src/cli.ts` — orchestrator
- `src/discovery.ts` — route/form discovery
- `src/forms.ts` — generic form population
- `src/profile-runner.ts` — declarative cross-app workflow engine
- `src/profiles/tijra.ts` — Tijra account/auth profile
- `load/` — k6 scripts
- `profiles/` — application workflow definitions
- `.github/workflows/fullqa.yml` — cloud runner

FullQA is intentionally not dependent on AI tokens for each click. Browser actions and load generation run as code; AI can be reserved for creating or improving profiles and interpreting unusual failures.
