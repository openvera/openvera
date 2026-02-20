---
name: match-documents
description: Match unmatched documents to transactions based on amount, date, and party
allowed-tools: Read, Write, Bash(curl *), Bash(open *)
---

# Match Documents to Transactions

Match unmatched documents with transactions by comparing amounts, dates, and parties.

## Steps

### Data validation (run first)

1. **Get unmatched, non-archived documents**:
   `curl -s 'http://localhost:8888/api/documents?unmatched_only=1'`
   - Filter out any with `is_archived = 1` — archived documents should not be matched.

2. **Validate and fix dates**: Check all `doc_date` values. If any are not ISO 8601 (`YYYY-MM-DD`), normalize them via the update API:
   ```
   curl -X POST http://localhost:8888/api/document/<id>/update \
     -H 'Content-Type: application/json' \
     -d '{"doc_date": "2025-02-19"}'
   ```
   Common bad formats: `"19 February 2025"`, `"2025/02/19"`, `"02-19-2025"`.

3. **Report unmatchable docs**: Documents missing `amount` or `doc_date` cannot be matched. Report the count and skip them — they need `/process-inbox` first.

### Matching

4. **Get companies**: `curl -s http://localhost:8888/api/companies`

5. **Get all parties**: `curl -s http://localhost:8888/api/parties`

For each company with unmatched documents:

6. **Get company data with transactions**:
   `curl -s 'http://localhost:8888/api/companies/<slug>'`
   - This returns `accounts[]` each with `transactions[]`.
   - Filter for candidate transactions: `amount < 0`, `is_internal_transfer = 0`.
   - Both matched and unmatched transactions are candidates (a transaction can have multiple documents, e.g. invoice + receipt).

7. **Build amount frequency map**: Before matching, count how many candidate transactions share each amount (rounded to 2 decimals) within the company. This is used to assess amount uniqueness — a unique amount is strong evidence, a common amount is weak.

8. **For each unmatched document**, find the best matching transaction by:
   - **Amount match**: Document amount should match transaction amount (negated). E.g., document `584.00 SEK` matches transaction `-584.00`.
   - **Date proximity**: Transaction date should be close to document date (within ~14 days, ideally same day or 1-2 days after).
   - **Party match**: If the document has a party, check if the transaction reference contains any of the party's patterns.
   - **Currency**: For foreign currency documents, compare `amount_sek` (not `amount`) against the transaction amount.

9. **Assess confidence** (0-100):

   Start with the **base confidence** from amount + date match:
   - **95%**: Exact amount + date within 3 days
   - **85%**: Exact amount + date within 7 days
   - **75%**: Exact amount + date within 14 days
   - **70%**: Amount within 1 SEK + date within 7 days

   Then apply **modifiers**:

   | Modifier | Condition | Effect |
   |----------|-----------|--------|
   | Party match | Transaction reference matches a party pattern | **+5%** |
   | Unique amount | Only 1 candidate transaction has this amount | **+5%** (max 100%) |
   | Common amount | 2 candidate transactions share this amount | **-5%** |
   | Very common amount | 3-4 candidates share this amount | **-10%** |
   | Extremely common amount | 5+ candidates share this amount | **-15%** |

   The amount frequency count uses all candidate transactions for the company (expense, non-transfer), not just those within the date window. This reflects overall ambiguity — if the company has 20 transactions for -190 kr, any single match to that amount is uncertain.

   **Below 70% after modifiers**: Don't create the match — flag it for manual review instead.

9. **Create match** via POST:
   ```
   curl -X POST http://localhost:8888/api/matches \
     -H 'Content-Type: application/json' \
     -d '{
       "transaction_id": <id>,
       "document_id": <id>,
       "match_type": "auto",
       "matched_by": "agent",
       "confidence": <0-100>
     }'
   ```

## Matching rules

- A transaction CAN have multiple matched documents (e.g. invoice + receipt for the same payment)
- A document CAN match multiple transactions if confidence is above threshold — the user will review and remove incorrect matches
- Only match expense transactions (`amount < 0`) — skip income and transfers
- Skip transactions where `is_internal_transfer = 1`
- Skip documents where `is_archived = 1`
- For foreign currency documents: use `amount_sek` for comparison, not `amount`
- If multiple transactions match a document above 70%, create ALL matches — the user will review and remove incorrect ones
- If multiple documents match the same transaction above 70%, create ALL matches

## Output

After processing, check if the environment variable `OPENVERA_REPORT_FORMAT` is set by running `echo $OPENVERA_REPORT_FORMAT`.

- If `OPENVERA_REPORT_FORMAT=text` — print a concise plain-text summary (markdown table format, suitable for piping or further AI processing).
- Otherwise (default) — generate an HTML report, save to `/tmp/openvera-match-report.html`, and open with `open /tmp/openvera-match-report.html`.

The report should be a single self-contained HTML file with inline CSS (Tailwind via CDN is fine). Use a clean, modern design with:

- **Header**: "Matching Report" with timestamp and summary stats (matches created, docs processed, still unmatched)
- **Section 1 — Matches Created**: Table grouped by confidence tier:
  - High (90-100%) — green left border
  - Medium (70-89%) — yellow left border
  - Each row: Doc ID, Amount, Currency, Party, → Txn ID, Txn Reference, Txn Amount, Date diff (days), Amount freq (e.g. "1/904" = unique, "12/904" = common), Confidence badge
- **Section 2 — Near Misses** (50-69% confidence): Orange left border, same columns, explain why it didn't qualify
- **Section 3 — Still Unmatched**: Compact table with Doc ID, Amount, Party, Reason (no amount match / missing data / foreign currency / etc.)
- **Section 4 — Skipped**: Count of docs skipped (archived, missing amount/date) with brief explanation

Use color-coded confidence badges: green ≥90%, yellow 70-89%, orange 50-69%. Make amounts right-aligned. Keep it scannable.

## Important

- Do NOT match with confidence below 70%
- Do NOT match archived documents
- DO create multiple matches if multiple candidates score above 70% — the user will review and keep/remove in the UI
- Skip creating a match if the exact same (transaction_id, document_id) pair already exists
- Do NOT modify documents or transactions — only create matches
- Process ALL unmatched documents, don't stop early
- Report progress as you go (e.g., "Matched doc #123 → txn #456 (confidence 95%)")
