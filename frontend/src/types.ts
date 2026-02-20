// --- Companies & Accounts ---

export interface Company {
  id: number;
  slug: string;
  name: string;
  org_number: string | null;
  fiscal_year_start: string;
}

export interface Account {
  id: number;
  company_id: number;
  name: string;
  account_number: string | null;
  account_type: string;
  currency: string;
  transaction_count?: number;
  total_income?: number;
  total_expenses?: number;
  balance?: number;
  transactions?: Transaction[];
}

// --- Transactions ---

export interface Transaction {
  id: number;
  date: string;
  reference: string;
  amount: number;
  category: string | null;
  accounting_code: string | null;
  accounting_code_name?: string | null;
  notes: string | null;
  is_internal_transfer: number;
  needs_receipt: number | null;
  linked_transfer_id: number | null;
  account_id: number;
  account_name?: string;
  company_id?: number;
  company_name?: string;
  company_slug?: string;
  is_matched?: boolean;
  match_confidence?: number | null;
  match_reviewed_at?: string | null;
  matches?: MatchedDocument[];
}

export interface MatchedDocument {
  id: number;
  party_name: string | null;
  party_id: number | null;
  amount: number | null;
  net_amount: number | null;
  vat_amount: number | null;
  currency: string | null;
  doc_date: string | null;
  doc_type: string;
  filename: string | null;
  match_type: string | null;
  confidence: number | null;
  reviewed_at: string | null;
}

// --- Documents ---

export interface VatBreakdown {
  rate: number;
  net: number;
  vat: number;
}

export interface Document {
  id: number;
  amount: number | null;
  currency: string | null;
  amount_sek: number | null;
  net_amount: number | null;
  vat_amount: number | null;
  net_amount_sek: number | null;
  vat_amount_sek: number | null;
  doc_date: string | null;
  due_date: string | null;
  invoice_number: string | null;
  ocr_number: string | null;
  doc_type: string;
  notes: string | null;
  party_id: number | null;
  party_name: string | null;
  party_slug: string | null;
  party_type: string | null;
  party_default_code: string | null;
  company_name: string;
  company_slug: string;
  file_id: number | null;
  filepath: string | null;
  filename: string | null;
  reviewed_at: string | null;
  match_attempted_at: string | null;
  match_feedback: string | null;
  is_matched: number;
  is_archived: number;
  match_confidence: number | null;
  match_matched_by: string | null;
  matched_txn_amount: number | null;
  created_at: string;
  needs_review: number | null;
  related_document_id: number | null;
}

// --- Matches ---

export interface Match {
  id: number;
  transaction_id: number;
  document_id: number;
  match_type: string;
  confidence: number | null;
  matched_by: string | null;
  matched_at: string;
  transaction_date: string;
  reference: string;
  amount: number;
  doc_amount: number | null;
  doc_net_amount: number | null;
  doc_vat_amount: number | null;
  doc_currency: string | null;
  party_name: string | null;
  doc_type: string;
  doc_date: string | null;
  company_slug: string;
  company_name: string;
}

// --- Parties ---

export interface Party {
  id: number;
  name: string;
  entity_type: string;
  type: string;
  org_number: string | null;
  patterns: string[];
  default_code: string | null;
  relationship?: string;
}

export interface PartyRelation {
  company_id: number;
  company_name: string;
  relationship: string;
}

// --- BAS Accounts ---

export interface BasAccount {
  code: string;
  name: string;
  description: string | null;
}

// --- Reports ---

export interface Report {
  total_expenses: number;
  total_income: number;
  by_account: ReportByAccount[];
  by_period: ReportByPeriod[];
  by_party: ReportByParty[];
  missing: ReportMissing[];
  missing_count: number;
}

export interface ReportByAccount {
  code: string | null;
  name: string | null;
  count: number;
  total: number;
}

export interface ReportByPeriod {
  period: string;
  expenses: number;
  income: number;
}

export interface ReportByParty {
  party: string;
  count: number;
  total: number;
}

export interface ReportMissing {
  date: string;
  reference: string;
  amount: number;
  account: string;
}

// --- VAT Report ---

export interface VatReportByRate {
  rate: number;
  net_sek: number;
  vat_sek: number;
  count: number;
}

export interface VatReport {
  period: { from: string | null; to: string | null };
  by_rate: VatReportByRate[];
  totals: { net_sek: number; vat_sek: number; gross_sek: number };
  incoming_vat_sek: number;
  outgoing_vat_sek: number;
}

// --- Stats ---

export interface Stats {
  total_documents: number;
  matched_documents: number;
  unmatched_documents: number;
  total_expense_transactions: number;
  matched_transactions: number;
  documents_without_party: number;
  match_rate: number;
}

// --- Transfers ---

export interface Transfer {
  id: number;
  from_transaction_id: number;
  to_transaction_id: number;
  transfer_type: string | null;
  notes: string | null;
  created_at: string;
  from_date: string;
  from_amount: number;
  from_reference: string;
  from_account: string;
  to_date: string;
  to_amount: number;
  to_reference: string;
  to_account: string;
  company_slug: string;
  company_name: string;
}
