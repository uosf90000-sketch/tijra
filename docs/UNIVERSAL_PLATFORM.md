# TIJRA — Universal Operating Platform

## Product direction
One Arabic-first operating platform for food trucks, shops, restaurants, service companies, distributors, manufacturers and large corporate groups, **without claiming one ERP implementation can serve all of these at production grade immediately**.

### User journeys
| Scale | Entry experience | Operational scope |
|---|---|---|
| MICRO: food truck | 1–5 essential tools | Fast POS, menu/recipe, basic inventory, vendor ordering, expenses, low stock, margin |
| SMALL: retail shop | 5–7 essential tools | POS, purchasing, stock, marketplace, accounting, alerting |
| MEDIUM: regional business | 8 adaptable tools | Departments, users, warehouses/locations, advanced procurement and analytics |
| ENTERPRISE: corporate group | Independent company contexts with configurable workspace | **Foundation only today**; consolidated ledgers, granular branch ACL, SSO, high-availability and workflows remain future deliverables |

## Delivered groundwork (feature branch only, pending CI and staging)
- Business.businessScale and Business.operatingModel, workspaceModules as UI preferences; existing businesses default SMALL + SHOP.
- Per-tenant owner-managed workspace configuration and registration-time business size/model selection.
- Preset-based simplified sidebar/management and onboarding. UI presets **do not grant/restrict data/API permissions**.
- Organization grouping and multiple Business records with separate legal-data scopes, memberships and storage queries. One owner can add an independent business and switch active business; other users may only switch among their own memberships.
- Session.activeBusinessId per authenticated session, checked against currently valid memberships; dedicated switch API, full page reload on switch, and an audit event.
- Existing warehouse/location features remain *inside* a Business; new independent companies use separate Business IDs.
- Existing prior work in this branch links purchasing, sales, inventory, supplier invoices, margins and accounting (see PURCHASE_GUARDIAN.md).
- Pure tests for preset selection and company-membership invariant.

## Enterprise gap register — not implemented yet
### Security and governance
1. Branch/department scoped authorization **at API and database query level**, not sidebar visibility.
2. Enterprise SSO (OIDC/SAML), MFA, provision/deprovision (SCIM), security-key support.
3. Delegated administration, maker-checker rules and multi-level purchasing/payment approvals.
4. Expanded audit trails and retention, export, tamper-evidence, backup/restore drills.
5. Tenant isolation penetration tests, access review and robust row-level policies.

### Finance and statutory
6. Proper accounting ledger with double-entry journals, fiscal periods and close.
7. Multi-currency accounting, exchange rates, tax jurisdictions and intercompany transfers.
8. Corporate group consolidation with eliminations, subsidiary hierarchy, and intercompany reconciliation.
9. Saudi ZATCA Phase Two e-invoicing and verification (XML, cryptographic stamps, clearance/reporting), **not delivered or certified**.
10. Controlled accounts payable/receivable, bank connections and payment reconciliation.

### Industry operations
11. Recipe yields, waste, food truck service/offline POS and payment terminals.
12. Warehouse management: advanced picking/put-away, batch/lot traceability, barcode workflows, stock transfers with approval.
13. Manufacturing BOM/MRP/work orders/quality.
14. Logistics/field service dispatch, jobs, fleet and tracking (regulatory scope to be validated).
15. Supplier RFQ, negotiated price lists, contract management, SLA metrics with *recorded promised delivery dates*.

### Platform engineering
16. High-volume database indexes and query plans; pagination, queues, offline sync, retries and idempotency.
17. API integrations and webhooks with OAuth, versioning, rate limits.
18. Observability, SLOs, disaster recovery, multiregion plan when necessary, load tests with enterprise-like workloads.
19. Production readiness gates, staging test data, safe/forward database migrations, staged rollouts.

## Operational acceptance criteria before launch
- Auth: account with membership in Company A cannot view/update Company B resources by ID, including cross-company API calls. Revoked membership immediately loses switching rights.
- Switching: no stale product price, order, stock, POS cart or cached report crosses the context after switching company.
- Performance: profile start/checkout/stock lookup benchmarks with 1 / 10 / 100 / 1000 simulated locations and high transaction concurrency.
- Food truck: complete registration to first sale and purchase with minimal data entry on a phone.
- Group: create two businesses, purchase in one, switch to other, verify stock, sales, suppliers and employee data stay separate.
- Financial/regulatory: no statements of ZATCA compliance, consolidated balance or payment verification without their own released tested modules.
- Operations: staging database migration rollback plan, verified build, schema deploy, smoke tests and audit logging.

## References
- Odoo multi-company model: https://www.odoo.com/documentation/20.0/applications/general/companies/multi_company.html
- Oracle NetSuite OneWorld subsidiaries and consolidation: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N266701.html
- ZATCA e-invoicing official: https://zatca.gov.sa/en/E-Invoicing/Pages/default.aspx
- SDAIA Saudi PDPL guidance: https://dgp.sdaia.gov.sa/

**This document is a roadmap and staged safety contract, not evidence that TIJRA is production-ready for enterprise deployment.**
