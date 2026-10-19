# Approved merchant accounting — My-app

User specification received and confirmed 2026-10-19. This document records requirements; it does not assert they are already implemented. Reuse canonical workspaces, Owner/Editor/Viewer and Firebase Auth/Firestore. No parallel business/auth system. Arabic, Turkish and English use the existing dictionaries and direction policy.

## Signed balances, independently for every party and currency

- Merchant: credit purchases plus explicit opening/adjustment entries, minus payments and direct customer-to-merchant settlements. Positive = store owes merchant; negative = merchant owes value/credit to store; zero = balanced.
- Customer: debt charges plus explicit opening/adjustment entries, minus payments and direct settlements. Positive = customer owes store; negative = store owes value/credit to customer; zero = balanced.
- A new charge consumes an existing credit through signed addition; that consumption never creates a fresh cash movement.
- No automatic netting between different merchants, currencies or workspaces.
- The existing customer settlement endpoint rejects overpayment and mutates remaining debt amounts. Historical remaining balances must not have their payments subtracted again. Inventory and test compatibility before choosing a migration/projection, preserve audit history and obtain appropriate approval before changing existing records.

## Purchases and payments

- Item total = quantity × unit price; purchase total = sum of item totals. Preserve item descriptions/notes without inventing inventory management.
- Credit purchase increases merchant balance; cash unchanged.
- Cash payment from the managed drawer reduces merchant balance and reduces cash by the actual paid amount, even when it exceeds the debt.
- Full cash purchase links the purchase and payment once: merchant net effect zero; cash decreases by the full price.
- Partial payment links the purchase and payment atomically without double counting.
- Bank transfer/external-account payment is separately classified and must not reduce managed drawer cash. Do not infer a cash source from a payment label.
- Opening balances/adjustments must be explicit audited operations, not unaudited edits.

## Direct payment: customer → merchant

Only a new amount actually paid by that customer directly to that merchant:

`new customer balance = old customer balance - amount`

`new merchant balance = old merchant balance - amount`

`drawer cash delta = 0`

Record the operation once with a unique operation ID and immutable matching payload, then project it into both statements and the daily journal; never create `cash_in`/`cash_out` for it. Commit both party effects together or neither. Validate same currency/workspace and fresh write permission on the trusted server. Existing customer credit is retained, not consumed by this new third-party payment. Using old customer credit for a different transfer is not this operation and must not be silently added.

## Numerical acceptance examples

| Case | Expected signed result | Managed cash delta |
| --- | --- | --- |
| Merchant purchase 1,000; payment 1,300 from drawer | Merchant −300 | −1,300 |
| 5 × 400 + 10 × 150 + 20 × 50 purchase; pay 1,000 from drawer | Purchase 4,500; merchant +3,500 | −1,000 |
| Merchant +500; pay 800 from drawer | Merchant −300 | −800 |
| Merchant −300; new credit purchase 200 | Merchant −100 | 0 |
| Merchant −300; new credit purchase 450 | Merchant +150 | 0 |
| Customer −200; new actual direct payment 300 to merchant | Customer −500; merchant decreases 300 | 0 |
| Merchants +1,000, −300, +500 in TRY | Payables 1,500; store credit 300; net 1,200 | No movement from aggregation |

## Financial safeguards and totals

- Use exact monetary arithmetic (integer minor units or precise decimals) and specify currency precision/rounding before implementation; avoid uncontrolled binary floating-point calculations, including line-item multiplication. Do not silently round legacy records.
- Aggregate positive merchant balances as payables; absolute negative balances as store credit; net = payables − credit, per currency. Present separately, not as permission to settle unrelated merchants.
- Every purchase/payment/settlement has an idempotent operation identifier; same identifier with a different payload must fail, not replay success.
- Record actor identity and linked record IDs. Approved operations are corrected by documented reversals or a reviewed archive-compatible procedure, not silent deletion.
- Archiving/closing preserves the correct financial day and does not reapply party balance effects. Integrate cash/noncash journal and archive projections without duplicate counting.
- Firebase is the business source of truth. No offline financial truth, silent queued success, production migration, broad rules deployment or automatic data rewrite from this document alone.

## Verification gates

Pure numerical cases first, then trusted command tests (including retries, races, overpayments, signed credits, wrong currency/space/role, linked purchase/payment atomicity and direct settlement atomicity), direct-SDK security tests, historical-data compatibility checks and finally isolated end-to-end/device acceptance. No claim of complete merchant functionality until all required layers pass.
