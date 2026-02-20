import type { Match } from '../types'

import { api } from './client'

export const getMatches = (params?: {
  transaction_id?: number;
  document_id?: number;
  company_slug?: string;
}) => {
  const search = new URLSearchParams()
  if (params?.transaction_id)
    search.set('transaction_id', String(params.transaction_id))
  if (params?.document_id)
    search.set('document_id', String(params.document_id))
  if (params?.company_slug) search.set('company_slug', params.company_slug)
  const qs = search.toString()
  return api<Match[]>(`/api/matches${qs ? `?${qs}` : ''}`)
}

export const createMatch = (data: {
  transaction_id: number;
  document_id: number;
  match_type?: string;
}) =>
  api<{ ok: boolean; match_id: number }>('/api/matches', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const unmatch = (transactionId: number, documentId: number) =>
  api<{ ok: boolean }>('/api/unmatch-invoice', {
    method: 'POST',
    body: JSON.stringify({
      transaction_id: transactionId,
      document_id: documentId,
    }),
  })
