# SplitRight — Import Report
**File:** `Expenses Export.csv`  
**Group:** Flatmates 2024  
**Imported by:** Harsha  
**Import date:** 2026-06-14  
**Status:** Completed

---

## Summary

| Metric | Count |
|--------|-------|
| Total CSV rows (excl. header) | 43 |
| Successfully imported expenses | 36 |
| Imported as settlements | 2 |
| Skipped (zero amount) | 1 |
| Rejected by user (duplicate) | 2 |
| Auto-corrected (info level) | 4 |
| User decisions required | 8 |

---

## Anomalies Detected & Actions Taken

| # | Row | Anomaly Type | Severity | Description | Action Taken |
|---|-----|-------------|----------|-------------|--------------|
| 1 | 6 | `EXACT_DUPLICATE` | 🔴 Error | "dinner - marina bites" is an exact duplicate of row 5 — same payer (Dev), same amount (₹3200), same date, same split group. Only differ in capitalisation. | **Rejected row 6.** Row 5 kept (proper casing, has note). |
| 2 | 7 | `COMMA_AMOUNT` | 🔵 Info | Electricity Feb amount is `"1,200"` — quoted with a comma inside the CSV value. | **Auto-corrected** → stripped comma, parsed as ₹1200. |
| 3 | 9 | `NAME_CASING` | 🟡 Warning | `paid_by = "priya"` (all lowercase) vs canonical `"Priya"` in member list. | **Auto-normalised** → matched to "Priya" (exact case-insensitive). Logged as warning. |
| 4 | 10 | `EXCESS_PRECISION` | 🔵 Info | Cylinder refill amount is `899.995` — sub-paisa precision (3 decimal places). | **Auto-rounded** → ₹900.00 (standard rounding). |
| 5 | 11 | `UNKNOWN_MEMBER` | 🔴 Error | `paid_by = "Priya S"` — not in member list. Fuzzy score ~0.65 against "Priya" (below 0.9 threshold). | **User mapped** → "Priya S" confirmed as Priya. Row imported. |
| 6 | 13 | `MISSING_PAYER` | 🔴 Error | `paid_by` field is blank. Note: "can't remember who paid". | **User assigned** → Payer set to Aisha. Row imported. |
| 7 | 14 | `PROBABLE_SETTLEMENT` | 🟡 Warning | "Rohan paid Aisha back" — blank split_type, single recipient, settlement keyword detected. | **User confirmed** → imported as Settlement record (Rohan → Aisha ₹3,500). |
| 8 | 15 | `PERCENTAGE_SUM` | 🔴 Error | Pizza Friday: Aisha 30% + Rohan 30% + Priya 30% + Meera 20% = 110% (not 100%). | **User corrected** → Meera changed to 10%. Percentages now sum to 100%. Row imported. |
| 9 | 20 | `FOREIGN_CURRENCY` | 🔵 Info | Goa villa: $540 USD. | **Auto-converted** → fetched rate $1 = ₹83.15 (2026-03-09). Stored as ₹44,901.00. |
| 10 | 21 | `FOREIGN_CURRENCY` | 🔵 Info | Beach shack: $84 USD. | **Auto-converted** → fetched rate $1 = ₹83.22 (2026-03-10). Stored as ₹6,990.48. |
| 11 | 23 | `FOREIGN_CURRENCY` | 🔵 Info | Parasailing: $150 USD. | **Auto-converted** → fetched rate $1 = ₹83.18 (2026-03-11). Stored as ₹12,477.00. |
| 12 | 23 | `UNKNOWN_SPLIT_MEMBER` | 🟡 Warning | "Dev's friend Kabir" in split_with — not a registered member. | **User chose** → redistribute Kabir's share equally among Dev, Rohan, Priya. |
| 13 | 24 | `NEAR_DUPLICATE` | 🟡 Warning | "Dinner at Thalassa" (Aisha, ₹2400) vs "Thalassa dinner" (Rohan, ₹2450) — same date, similar description. Note on row 25: "Aisha also logged this". | **User rejected row 24** → Row 25 kept. |
| 14 | 25 | `NEAR_DUPLICATE` | 🟡 Warning | _(See row 24 above — other half of the pair)_ | **Kept** → imported as the canonical row. |
| 15 | 26 | `NEGATIVE_AMOUNT` | 🟡 Warning | Parasailing refund: `-30 USD`. Note: "one slot got cancelled". | **Auto-detected as refund** → imported with `is_refund=true`. USD converted: -$30 = -₹2,495.40. All split members credited their share. |
| 16 | 26 | `FOREIGN_CURRENCY` | 🔵 Info | Refund amount in USD (see row 26 above). | **Auto-converted** → ₹83.18/USD (2026-03-11). |
| 17 | 27 | `DATE_FORMAT` | 🟡 Warning | Date is `Mar-14` — not DD-MM-YYYY. Ambiguous year. | **Auto-parsed** → 2026-03-14 (year assumed from surrounding rows). User notified. |
| 18 | 28 | `MISSING_CURRENCY` | 🟡 Warning | Groceries DMart ₹2105 has blank currency field. | **Defaulted to INR** (amount scale and context confirm). Logged as warning. |
| 19 | 31 | `ZERO_AMOUNT` | 🟡 Warning | Dinner order Swiggy is ₹0. Note: "counted twice earlier — fixing later". | **Skipped** → ₹0 expense not imported. Logged as skipped. |
| 20 | 34 | `AMBIGUOUS_DATE` | 🟡 Warning | `04-05-2026` — could be April 5 (DD-MM) or May 4 (MM-DD). | **Defaulted to April 5** (DD-MM-YYYY is dominant format). User confirmed. |
| 21 | 36 | `MEMBER_TIMELINE` | 🟡 Warning | Meera in split for April 2 grocery — she left March 31. | **User chose** → removed Meera from split, redistributed her share equally. |
| 22 | 38 | `PROBABLE_SETTLEMENT` | 🟡 Warning | "Sam deposit share" — deposit keyword detected, single recipient (Aisha). | **User confirmed** → imported as Settlement (Sam → Aisha ₹15,000). |
| 23 | 42 | `SPLIT_TYPE_CONFLICT` | 🔵 Info | split_type=`equal` but split_details has `Aisha 1; Rohan 1; Priya 1; Sam 1` (share notation). All shares equal. | **Auto-resolved** → imported as equal split (both notations produce the same result). |

---

## Currency Conversion Summary

All USD→INR rates fetched from [frankfurter.app](https://frankfurter.app) historical rates:

| Date | Rate (1 USD = INR) | Used For |
|------|---------------------|---------|
| 2026-03-09 | ₹83.15 | Goa villa ($540) |
| 2026-03-10 | ₹83.22 | Beach shack ($84) |
| 2026-03-11 | ₹83.18 | Parasailing ($150) + Refund (-$30) |

---

## Final Import Counts

| Decision | Count | Rows |
|----------|-------|------|
| ✅ Imported as expense | 36 | All rows except those below |
| 🤝 Imported as settlement | 2 | 14, 38 |
| 🔄 Auto-corrected (no user action) | 6 | 7, 9, 10, 20, 21, 23 |
| ⚠️ Required user decision | 8 | 11, 13, 15, 23(member), 26, 34, 36, 42 |
| ❌ Skipped (zero amount) | 1 | 31 |
| ❌ Rejected (duplicate) | 2 | 6, 24 |

> **Note:** This report is generated by the SplitRight import engine. Each anomaly was surfaced to the user in the Import UI for review before any data was committed to the database.
