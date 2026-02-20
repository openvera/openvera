import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
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

  const [selected, setSelectedState] = useState<Company | null>(null)

  // Restore from localStorage or pick first company
  useEffect(() => {
    if (companies.length === 0) return
    const savedId = localStorage.getItem(STORAGE_KEY)
    const match = savedId
      ? companies.find((c) => c.id === Number(savedId))
      : null
    setSelectedState(match ?? companies[0]!)
  }, [companies])

  const setSelected = (company: Company) => {
    setSelectedState(company)
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
