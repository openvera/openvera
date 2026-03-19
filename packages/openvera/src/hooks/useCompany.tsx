import {
  createContext,
  type ReactNode,
  useContext,
  useState,
} from 'react'
import { useQuery } from '@tanstack/react-query'

import { getCompanies } from '../api/companies'
import type { Company } from '../types'

interface CompanyContextValue {
  companies: Company[];
  selected: Company | null;
  setSelected: (company: Company) => void;
  isLoading: boolean;
}

const CompanyContext = createContext<CompanyContextValue | null>(null)

const STORAGE_KEY = 'openvera-company-id'

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: getCompanies,
  })

  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const savedId = localStorage.getItem(STORAGE_KEY)
    return savedId ? Number(savedId) : null
  })
  const selected = companies.find((company) => company.id === selectedId)
    ?? companies[0]
    ?? null

  const setSelected = (company: Company) => {
    setSelectedId(company.id)
    localStorage.setItem(STORAGE_KEY, String(company.id))
  }

  return (
    <CompanyContext.Provider
      value={{ companies, selected, setSelected, isLoading }}
    >
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompany() {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider')
  return ctx
}
