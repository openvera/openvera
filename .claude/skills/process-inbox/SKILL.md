---
name: process-inbox
description: Process pending files — read PDFs, extract structured data, match parties, create document records
allowed-tools: Read, Bash(curl *), WebFetch
---

# Process Inbox Files

Process all pending files (files without document records) by extracting structured data and creating documents.

## Steps

1. **Get pending files**: `curl -s http://localhost:8888/api/files/pending`
2. **Get companies**: `curl -s http://localhost:8888/api/companies`
3. **Get all parties**: `curl -s http://localhost:8888/api/parties`

For each pending file:

4. **View the file** using the Read tool on the file path (resolve relative paths under `VERA_FILES_DIR` — check `app/config.py` for the default). PDFs can be read directly.

5. **Extract structured data** following the schema in `agent-docs/main/extraction-schema.md`. Extract everything useful from the document — the schema defines the standard fields, but include any additional relevant data in the `extra` object. Be thorough.

6. **Match parties** against the existing parties list. Check both vendor and customer names/org numbers against known parties. Use `patterns` arrays for fuzzy matching. If a party doesn't exist yet, note it but don't create it — use `party_id: null`.

7. **Decide: one or two documents?**
   - If both vendor AND customer are companies in Vera (e.g., an invoice from Insector AB to Wingframe AB), create **two** document records — one for each company.
   - If only one side is a Vera company, create **one** document record for that company.
   - Set the `party_id` to the **counterparty** (the other side). E.g., if Wingframe AB received an invoice from Stripe, the document belongs to Wingframe's company_id with party_id pointing to Stripe.

8. **Create document(s)** via POST, including VAT fields:
   ```
   curl -X POST http://localhost:8888/api/files/{file_id}/process \
     -H 'Content-Type: application/json' \
     -d '{
       "company_id": <id>,
       "amount": <total amount as number>,
       "currency": "SEK",
       "doc_date": "YYYY-MM-DD",
       "doc_type": "invoice|receipt|salary|...",
       "party_id": <counterparty id or null>,
       "net_amount": <totals.net or null>,
       "vat_amount": <totals.vat or null>,
       "net_amount_sek": <net in SEK>,
       "vat_amount_sek": <vat in SEK>,
       "vat_breakdown_json": "[{\"rate\": 25, \"net\": 1000.00, \"vat\": 250.00}]",
       "extracted_json": "<full JSON string>"
     }'
   ```

   **VAT field rules:**
   - `net_amount` / `vat_amount`: from `totals.net` / `totals.vat` in extracted data
   - For SEK documents: `net_amount_sek = net_amount`, `vat_amount_sek = vat_amount`
   - For foreign-currency documents: derive SEK amounts using the same FX rate applied to `amount` -> `amount_sek` (i.e., `net_amount_sek = net_amount * (amount_sek / amount)`)
   - `vat_breakdown_json`: build by grouping `line_items` by `vat_rate` and summing `net` and `vat`. JSON string of array: `[{"rate": 25, "net": 2000.00, "vat": 500.00}, {"rate": 6, "net": 500.00, "vat": 30.00}]`. **Only include if there are 2+ different VAT rates** — a single-rate breakdown is redundant with `net_amount`/`vat_amount`. Set to null if no per-rate data or only one rate.
   - If no VAT data is available (no `totals.vat`), omit these fields (they default to null)

## Document type mapping

Map `extracted_json.document_type` to `doc_type` column values:
- `invoice` → `invoice` (incoming) or `outgoing_invoice` (if the Vera company is the vendor)
- `receipt` / `kvittens` → `receipt`
- `salary` → `salary`
- `credit_note` → `credit_note`
- `bank_statement` → `statement`
- `contract` → `contract`
- `report` → `balansrapport`, `resultatrapport`, or `other`
- `other` → `other`

## Important

- Do NOT skip files — process every pending file
- Do NOT create parties — just match against existing ones
- If extraction fails (corrupted PDF, image-only, etc.), still create a document with what you have and set `doc_type` to `other`
- All amounts are numbers (e.g., `129.0`, not `"129,00 kr"`)
- All dates MUST be ISO 8601 format: `YYYY-MM-DD` (e.g., `2025-02-19`, NOT `19 February 2025`)
- The `extracted_json` field is a JSON **string** (stringified), not a nested object
- Dates inside `extracted_json` must also be ISO 8601
