# TIJRA MVP API

All mutation routes currently accept `businessId` explicitly for development. Before production, authentication/authorization must derive the permitted business from the authenticated membership rather than trusting an arbitrary client value.

## POST `/api/sales`

Records one sale inside a database transaction.

Guarantees:
- every product must belong to the business and be active;
- stock cannot go below zero;
- the sale, sale lines, stock decrement and stock movement audit are committed together or rolled back together;
- cost of goods uses the product average cost at sale time.

Example body:

```json
{
  "businessId": "business-id",
  "paymentMethod": "CARD",
  "items": [
    { "productId": "product-id", "quantity": 2, "unitPrice": 2.5 }
  ]
}
```

## POST `/api/purchases/receive`

Approves actual received quantities against a purchase order.

Guarantees:
- a received product must exist on the purchase order;
- received quantity cannot exceed the remaining ordered quantity in the MVP;
- only the approved received quantity increments stock;
- average cost is recalculated using weighted average cost;
- purchase invoice, receipt, stock balance and stock movement are committed together;
- order becomes `PARTIALLY_RECEIVED` or `RECEIVED` based on cumulative receipts.

This endpoint does not contain delivery dispatch, drivers, tracking or routing. Delivery remains directly between supplier and merchant.

## POST `/api/purchase-plan`

Returns suggested purchase quantities based on sales velocity, coverage target, current stock, supplier price and minimum order quantity.

## POST `/api/payroll/calculate`

Returns salary gross, deductions/advances and net salary per employee plus run totals.

## GET `/api/health`

Returns service scope and explicitly reports `financing: false` and `deliveryManagement: false`.
