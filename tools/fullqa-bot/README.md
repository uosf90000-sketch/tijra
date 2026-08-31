# FullQA Bot

FullQA Bot is a reusable web-application QA runner. The core works with any `TARGET_URL`; application-specific behavior is added through profiles. Tijra is the first built-in profile.

## What it does

- probes `/api/health` and records build metadata when available
- crawls same-origin routes and inventories forms, buttons and links
- discovers registration pages and safely populates forms
- runs real profile-driven account creation and login checks
- stores authenticated browser states for created roles
- supports real write workflows such as publish, order, reservation, picking, receiving and POS when a profile explicitly allows them
- checks Chromium, Firefox, WebKit, iPhone and Android emulation
- supports browser camera permission flows and optional fake-camera execution
- supports file uploads in declarative profiles
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

Its full lifecycle currently checks:

`Publish → duplicate protection → Marketplace Order → reservation quantities → Accept → receive-before-pick gate → barcode Picking → extra/wrong scan handling → Receive → double-receive protection → Inventory → POS → duplicate invoice protection → final stock`

If a critical gate is broken, the report records a FAIL and stops only the dependent part of that lifecycle instead of inventing a PASS.

Set `QA_SKIP_WRITES=true` to keep the Tijra profile read-only after account/auth setup.

## Run any app with a declarative profile

Set `PROFILE_FILE` to a JSON file describing workflows. Supported steps include:

`goto`, `fill`, `click`, `select`, `press`, `uploadFile`, `grantPermissions`, `wait`, `expectText`, `expectUrl`, `expectVisible`, and `screenshot`.

Available variables include `${RUN_ID}`, `${EMAIL}`, `${PASSWORD}`, and `${TARGET_URL}`.

Example:

```bash
TARGET_URL=https://example.com PROFILE_FILE=profiles/example.json npm run qa
```

This lets FullQA create accounts, submit forms and execute business flows on any application once its profile declares the intended safe actions and expected outcomes.

## Camera testing

For permission and camera API flows in Chromium:

```bash
QA_FAKE_CAMERA=true TARGET_URL=https://example.com PROFILE_FILE=profiles/example.json npm run qa
```

A real iPhone/Android hardware-camera verification is still a separate physical-device test. FullQA must report that distinction instead of treating an emulated camera as proof of physical hardware behavior.

## Load and stress

Install k6, then:

```bash
TARGET_URL=https://example.com LOAD_PATH=/api/health LOAD_RATE=100 npm run load:smoke
TARGET_URL=https://example.com LOAD_PATH=/api/health npm run load:stress
```

The default stress ramp is 30 → 50 → 100 → 200 → 500 concurrent VUs. Add profile-specific load scripts for authenticated business actions such as ordering, reservation, POS or inventory updates.

## GitHub Actions

Open **Actions → FullQA Bot → Run workflow**. The cloud runner accepts:

- target URL
- functional / load-smoke / load-stress
- built-in profile (`tijra` or `generic`)
- optional declarative profile file
- allow/disallow write mutations
- fake-camera toggle
- load path and request rate

The run uploads FullQA artifacts automatically.

## Safety model

Generic discovery does not blindly submit unknown forms. A profile is required for destructive actions. This keeps the runner reusable without creating garbage records in arbitrary production systems. Application profiles can opt into real account creation and business mutations because they explicitly define what the test is allowed to do.

## Architecture

- `src/cli.ts` — orchestrator
- `src/discovery.ts` — route/form discovery
- `src/forms.ts` — generic form population
- `src/profile-runner.ts` — declarative cross-app workflow engine
- `src/profiles/tijra.ts` — Tijra auth + marketplace/POS lifecycle
- `load/` — k6 scripts
- `profiles/` — application workflow definitions
- `.github/workflows/fullqa.yml` — manual cloud runner
- `.github/workflows/fullqa-ci.yml` — standalone typecheck validation

FullQA is intentionally not dependent on AI tokens for each click. Browser actions and load generation run as code; AI can be reserved for creating or improving profiles and interpreting unusual failures.
