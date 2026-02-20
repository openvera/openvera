import type { Report, Stats, VatReport } from '../types'

import { api } from './client'

export const getStats = () => api<Stats>('/api/stats')

export const getReport = (params: {
  company_id: number;
  from?: string;
  to?: string;
}) => {
  const search = new URLSearchParams()
  search.set('company_id', String(params.company_id))
  if (params.from) search.set('from', params.from)
  if (params.to) search.set('to', params.to)
  return api<Report>(`/api/report?${search}`)
}

export const getVatReport = (params: {
  company_id: number;
  from?: string;
  to?: string;
}) => {
  const search = new URLSearchParams()
  search.set('company_id', String(params.company_id))
  if (params.from) search.set('from', params.from)
  if (params.to) search.set('to', params.to)
  return api<VatReport>(`/api/report/vat?${search}`)
}

export const getSieExportUrl = (companyId: number, year?: number) => {
  const search = new URLSearchParams()
  search.set('company_id', String(companyId))
  if (year) search.set('year', String(year))
  return `/api/sie-export?${search}`
}
