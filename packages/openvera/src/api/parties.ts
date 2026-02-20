import type { Party, PartyRelation } from '../types'

import { api } from './client'

export const getParties = () => api<Party[]>('/api/parties')

export const getCompanyParties = (slug: string) =>
  api<Party[]>(`/api/company/${slug}/parties`)

export const getParty = (id: number) => api<Party>(`/api/parties/${id}`)

export const createParty = (data: {
  name: string;
  entity_type?: string;
  patterns?: string;
  company_id?: number;
  relationships?: string[];
}) =>
  api<{ ok: boolean; party_id: number }>('/api/parties', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updateParty = (
  id: number,
  data: {
    name: string;
    entity_type?: string;
    patterns?: string;
    default_code?: string;
    company_id?: number;
    relationships?: string[];
  },
) =>
  api<{ ok: boolean }>(`/api/parties/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const deleteParty = (id: number) =>
  api<{ ok: boolean }>(`/api/parties/${id}`, { method: 'DELETE' })

export const getPartyRelations = (id: number) =>
  api<PartyRelation[]>(`/api/parties/${id}/relations`)

export const getPartyTransactions = (id: number) =>
  api<{
    transactions: {
      id: number;
      date: string;
      reference: string;
      amount: number;
      account_id: number;
      account: string;
      company_id: number;
      company: string;
      company_slug: string;
    }[];
  }>(`/api/parties/${id}/transactions`)

export const addPartyRelation = (data: {
  company_id: number;
  party_id: number;
  relationship: string;
}) =>
  api<{ ok: boolean }>('/api/party-relations', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const removePartyRelation = (data: {
  company_id: number;
  party_id: number;
  relationship?: string;
}) =>
  api<{ ok: boolean }>('/api/party-relations', {
    method: 'DELETE',
    body: JSON.stringify(data),
  })
