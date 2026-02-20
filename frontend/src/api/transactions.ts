import type { BasAccount, MatchedDocument, Transaction, Transfer } from '../types'

import { api } from './client'

export const getBasAccounts = () =>
  api<BasAccount[]>('/api/bas-accounts')

export const getTransaction = (id: number) =>
  api<Transaction>(`/api/transaction/${id}`)

export const updateTransaction = (
  id: number,
  data: Partial<
    Pick<
      Transaction,
      | 'category'
      | 'accounting_code'
      | 'notes'
      | 'is_internal_transfer'
      | 'needs_receipt'
    >
  >,
) =>
  api<{ ok: boolean }>(`/api/transaction/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const deleteTransaction = (id: number) =>
  api<{ ok: boolean }>(`/api/transaction/${id}`, { method: 'DELETE' })

export const batchUpdateTransactions = (data: {
  ids: number[];
  accounting_code?: string | null;
  category?: string | null;
  is_internal_transfer?: number;
  needs_receipt?: number;
}) =>
  api<{ ok: boolean; updated: number }>('/api/transactions/batch-update', {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const getTransactionMatches = (id: number) =>
  api<{ matches: MatchedDocument[] }>(`/api/transaction/${id}/matches`)

export const markTransfer = (transactionId: number, isTransfer = true) =>
  api<{ ok: boolean }>('/api/mark-transfer', {
    method: 'POST',
    body: JSON.stringify({ transaction_id: transactionId, is_transfer: isTransfer }),
  })

export const getTransfers = (companySlug?: string) => {
  const params = companySlug ? `?company_slug=${companySlug}` : ''
  return api<Transfer[]>(`/api/transfers${params}`)
}

export const createTransfer = (data: {
  from_transaction_id: number;
  to_transaction_id: number;
  notes?: string;
}) =>
  api<{ ok: boolean; transfer_id: number }>('/api/transfers', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const deleteTransfer = (id: number) =>
  api<{ ok: boolean }>(`/api/transfers/${id}`, { method: 'DELETE' })

export interface TransactionSearchResult {
  id: number
  date: string
  reference: string
  amount: number
  account_name: string
}

export const searchTransactions = (params: {
  company_id?: number
  amount?: number
  date?: string
  q?: string
  doc_type?: string
  unmatched_only?: boolean
}) => {
  const search = new URLSearchParams()
  if (params.company_id) search.set('company_id', String(params.company_id))
  if (params.amount) search.set('amount', String(params.amount))
  if (params.date) search.set('date', params.date)
  if (params.q) search.set('q', params.q)
  if (params.doc_type) search.set('doc_type', params.doc_type)
  if (params.unmatched_only === false) search.set('unmatched_only', '0')
  const qs = search.toString()
  return api<TransactionSearchResult[]>(`/api/transactions/search${qs ? `?${qs}` : ''}`)
}
