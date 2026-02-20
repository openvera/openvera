import type { Account, Company } from '../types'

import { api } from './client'

export const getCompanies = () => api<Company[]>('/api/companies')

export const getCompany = (slug: string) =>
  api<{ company: Company; accounts: Account[] }>(`/api/company/${slug}`)

export const createCompany = (data: {
  name: string;
  org_number?: string;
  fiscal_year_start?: string;
}) =>
  api<{ ok: boolean; company_id: number; slug: string }>('/api/companies', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updateCompany = (
  slug: string,
  data: Partial<Pick<Company, 'name' | 'org_number' | 'fiscal_year_start'>>,
) =>
  api<{ ok: boolean; slug: string; old_slug: string }>(
    `/api/company/${slug}`,
    { method: 'PUT', body: JSON.stringify(data) },
  )

export const deleteCompany = (slug: string) =>
  api<{ ok: boolean }>(`/api/company/${slug}`, { method: 'DELETE' })

export const getAccounts = (slug: string) =>
  api<Account[]>(`/api/company/${slug}/accounts`)

export const createAccount = (
  slug: string,
  data: {
    name: string;
    account_number?: string;
    account_type?: string;
    currency?: string;
  },
) =>
  api<{ ok: boolean; account_id: number }>(
    `/api/company/${slug}/accounts`,
    { method: 'POST', body: JSON.stringify(data) },
  )

export const updateAccount = (
  accountId: number,
  data: Partial<Pick<Account, 'name' | 'account_number' | 'account_type' | 'currency'>>,
) =>
  api<{ ok: boolean }>(`/api/accounts/${accountId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const deleteAccount = (accountId: number) =>
  api<{ ok: boolean }>(`/api/accounts/${accountId}`, { method: 'DELETE' })
