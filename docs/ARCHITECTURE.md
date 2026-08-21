# TIJRA MVP Architecture

## Product loop

1. Sale is recorded.
2. Stock is decremented through a stock movement.
3. Daily sales velocity is recalculated.
4. Purchase planner estimates target stock coverage.
5. Registered supplier offers are compared.
6. Merchant reviews and sends purchase orders.
7. Supplier and merchant handle delivery directly outside TIJRA.
8. Merchant receives goods and matches the supplier invoice.
9. Only approved received quantities update stock and average cost.
10. Accounting summaries and payroll are updated from operational records.

## Modules

- Inventory
- Sales / POS
- Suppliers
- Smart Purchasing
- Purchase Invoice Matching
- Accounting
- Employees
- Payroll

## Hard exclusions

- Financing
- Lending
- Credit underwriting
- Delivery dispatching
- Driver management
- Route optimization
- Last-mile tracking

## Data integrity rules

- A sale must decrement stock in the same DB transaction.
- Approved purchase receipt quantities must increment stock in the same DB transaction.
- Purchase invoice quantity is not treated as received quantity.
- Stock should be derived/auditable from `StockMovement`; the `Product.quantity` field is a fast current balance.
- Payroll approval freezes the period inputs; later changes should create adjustments rather than silently changing paid runs.
- Supplier comparison uses recorded offers only; it must not imply guaranteed availability.

## UI principles

- Arabic-first and RTL.
- A merchant should understand the day in under 10 seconds.
- Tables for dense operational data; cards only for summaries.
- No logistics status language that implies TIJRA controls delivery.
- Mobile navigation prioritizes dashboard, inventory, purchases, accounting and payroll.
