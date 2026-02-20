import { useEffect, useRef, useState } from 'react'
import { Building2, Check, ChevronDown, Plus } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createCompany } from '../api/companies'
import { useCompany } from '../hooks/useCompany'

export default function CompanySelector() {
  const { companies, selected, setSelected, isLoading } = useCompany()
  const queryClient = useQueryClient()
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  const close = () => {
    if (detailsRef.current) detailsRef.current.open = false
    setShowCreate(false)
    setNewName('')
  }

  const createMut = useMutation({
    mutationFn: createCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      setShowCreate(false)
      setNewName('')
    },
  })

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  if (isLoading) {
    return <span className="loading loading-spinner loading-sm" />
  }

  if (companies.length === 0) {
    return <span className="text-sm opacity-60">Inga företag</span>
  }

  return (
    <details ref={detailsRef} className="dropdown dropdown-end">
      <summary className="btn btn-sm btn-ghost gap-2 font-normal border border-base-300 hover:border-base-content/20 pr-3">
        <Building2 className="w-4 h-4 text-primary/60" />
        <span className="font-medium">{selected?.name ?? 'Välj företag'}</span>
        <ChevronDown className="w-2.5 h-2.5 text-base-content/40 ml-0.5" />
      </summary>

      <div className="dropdown-content z-50 mt-2 w-72 rounded-xl bg-base-100 shadow-lg border border-base-200 overflow-hidden">
        <div className="px-3 py-2 border-b border-base-200">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-base-content/40">
            Välj företag
          </p>
        </div>
        <ul className="py-1">
          {companies.map((c) => {
            const isActive = selected?.slug === c.slug
            return (
              <li key={c.slug}>
                <button
                  className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors ${
                    isActive
                      ? 'bg-primary/5'
                      : 'hover:bg-base-200/50'
                  }`}
                  onClick={() => {
                    setSelected(c)
                    close()
                  }}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'bg-base-200/60 text-base-content/40'
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm truncate ${
                        isActive ? 'font-semibold text-primary' : 'font-medium'
                      }`}
                    >
                      {c.name}
                    </p>
                    {c.org_number && (
                      <p className="text-[11px] text-base-content/40 tabular-nums">
                        {c.org_number}
                      </p>
                    )}
                  </div>
                  {isActive && (
                    <Check className="w-4 h-4 text-primary shrink-0" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>

        {/* Create new company */}
        <div className="border-t border-base-200">
          {showCreate
            ? (
                <div className="p-3 space-y-2">
                  <input
                    className="input input-bordered input-sm w-full"
                    placeholder="Företagsnamn"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newName.trim()) {
                        createMut.mutate({ name: newName.trim() })
                      }
                    }}
                    autoFocus
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => {
                        setShowCreate(false)
                        setNewName('')
                      }}
                    >
                      Avbryt
                    </button>
                    <button
                      className="btn btn-primary btn-xs"
                      disabled={!newName.trim() || createMut.isPending}
                      onClick={() => createMut.mutate({ name: newName.trim() })}
                    >
                      {createMut.isPending
                        ? (
                            <span className="loading loading-spinner loading-xs" />
                          )
                        : (
                            'Skapa'
                          )}
                    </button>
                  </div>
                </div>
              )
            : (
                <button
                  className="w-full text-left px-3 py-2.5 flex items-center gap-3 text-sm text-base-content/50 hover:bg-base-200/50 transition-colors"
                  onClick={() => setShowCreate(true)}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-base-200/40 text-base-content/30">
                    <Plus className="w-4 h-4" />
                  </div>
                  Nytt företag
                </button>
              )}
        </div>
      </div>
    </details>
  )
}
