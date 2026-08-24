# Offline cashier and stock count

- Cashier sales are queued in IndexedDB when connectivity is lost and keep their original sale timestamp.
- Each queued sale has a stable invoice id so retries do not create duplicate sales.
- Stock counts are deduplicated per product/location while offline and keep the first count baseline so later server activity is preserved when the count syncs.
- `/sales` and `/inventory/audit` are runtime-cached for operational continuity after they have been opened online.
- Sync retries automatically on reconnect and periodically while online.
