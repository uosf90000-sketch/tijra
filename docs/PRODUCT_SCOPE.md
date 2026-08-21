# TIJRA — Product Scope

## Product promise
TIJRA is an Arabic-first operating system for small retailers. It combines inventory, supplier purchasing, accounting, and payroll, then uses AI to tell the merchant what to buy, when to buy it, and which supplier offer is best.

## MVP users
- Retail business owner / manager
- Cashier
- Accountant
- Supplier

## MVP modules

### 1. Inventory
- Products, barcode/SKU, units, cost, sale price, current quantity
- Stock decreases from recorded sales
- Stock increases when a purchase order is received
- Reorder point and low-stock alerts
- Basic stock movement history

### 2. Suppliers & purchasing
- Supplier directory
- Supplier product catalog and last quoted price
- Purchase-order draft, send, confirm, receive
- Compare supplier prices for the same product
- Suggested purchase quantities based on stock and recent sales
- Receiving check: ordered vs received quantity and expected vs invoiced price

### 3. Sales & accounting
- Record sales and cost of goods sold
- Expenses
- Daily/period sales, gross profit, estimated net profit, and stock value
- Supplier balances and basic payable tracking in later MVP iterations
- Full statutory/e-invoicing integrations are a later milestone, not a launch blocker

### 4. Employees & payroll
- Employee directory
- Base salary
- Allowances, deductions, and advances
- Payroll run and net salary
- Attendance can be added later without making it a launch blocker

### 5. Smart purchasing
- Low-stock forecast
- Suggested quantity to buy
- Supplier comparison by product price and minimum order quantity
- "Prepare today's purchases" summary
- AI is advisory first; the merchant confirms orders

## Explicit exclusions
- No financing, credit product, BNPL, or lending features.
- TIJRA does not operate or manage delivery/logistics. Delivery method, timing, and cost remain between the merchant and supplier.
- No marketplace-owned inventory or warehouses.
- No forced supplier migration: merchants can keep their existing suppliers.

## Product principles
1. Arabic-first and mobile-first.
2. The merchant should understand the dashboard without accounting knowledge.
3. Every feature must reduce manual work or protect margin/cash.
4. Do not build an ERP for its own sake; prioritize the purchase → receive → stock → sell → profit loop.
5. Never commit production secrets or credentials to the public repository.
