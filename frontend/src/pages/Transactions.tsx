import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { RefreshCw, Search } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  AmountCell,
  DateCell,
  EmptyState,
  StatusBadge,
  batchUpdateTransactions,
  getBasAccounts,
  getCompany,
  useCompany,
  type Account,
  type Transaction,
} from 'openvera'

type MatchFilter = 'all' | 'matched' | 'unmatched'

export default function Transactions() {
  const { selected } = useCompany()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const accountFilter = searchParams.get('account') ?? 'all'
  const matchFilter = (searchParams.get('match') as MatchFilter) || 'all'
  const search = searchParams.get('q') ?? ''

  const setFilter = (key: string, value: string, defaultVal = 'all') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === defaultVal) next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }
  const setAccountFilter = (v: string) => setFilter('account', v)
  const setMatchFilter = (v: MatchFilter) => setFilter('match', v)
  const setSearch = (v: string) => setFilter('q', v, '')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchCode, setBatchCode] = useState('')
  const [batchCategory, setBatchCategory] = useState('')
  const [batchTransfer, setBatchTransfer] = useState('')
  const [batchNeedsReceipt, setBatchNeedsReceipt] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['company', selected?.slug],
    queryFn: () => getCompany(selected!.slug),
    enabled: !!selected,
  })

  const { data: basAccounts = [] } = useQuery({
    queryKey: ['bas-accounts'],
    queryFn: getBasAccounts,
  })

  const accounts: Account[] = data?.accounts ?? []

  const allTransactions = useMemo(() => {
    const txns: (Transaction & { account_name: string })[] = []
    for (const account of accounts) {
      for (const txn of account.transactions ?? []) {
        txns.push({ ...txn, account_name: account.name })
      }
    }
    txns.sort((a, b) => b.date.localeCompare(a.date))
    return txns
  }, [accounts])

  const filtered = useMemo(() => {
    return allTransactions.filter((txn) => {
      if (accountFilter !== 'all' && String(txn.account_id) !== accountFilter)
        return false
      if (matchFilter === 'matched' && !txn.is_matched)
        return false
      if (matchFilter === 'unmatched' && txn.is_matched)
        return false
      if (
        search &&
        !(txn.reference ?? '').toLowerCase().includes(search.toLowerCase())
      )
        return false
      return true
    })
  }, [allTransactions, accountFilter, matchFilter, search])

  const batchMutation = useMutation({
    mutationFn: batchUpdateTransactions,
    onSuccess: () => {
      setSelectedIds(new Set())
      setBatchCode('')
      setBatchCategory('')
      setBatchTransfer('')
      setBatchNeedsReceipt('')
      queryClient.invalidateQueries({ queryKey: ['company', selected?.slug] })
    },
  })

  const allSelected = filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id))

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((t) => t.id)))
    }
  }

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const hasBatchChanges = batchCode !== '' || batchCategory !== '' || batchTransfer !== '' || batchNeedsReceipt !== ''

  const handleBatchSave = () => {
    const payload: Parameters<typeof batchUpdateTransactions>[0] = {
      ids: Array.from(selectedIds),
    }
    if (batchCode !== '') payload.accounting_code = batchCode || null
    if (batchCategory !== '') payload.category = batchCategory || null
    if (batchTransfer !== '') payload.is_internal_transfer = batchTransfer === 'yes' ? 1 : 0
    if (batchNeedsReceipt !== '') payload.needs_receipt = batchNeedsReceipt === 'yes' ? 1 : 0
    if (!hasBatchChanges) return
    batchMutation.mutate(payload)
  }

  if (!selected) {
    return <EmptyState title="Välj ett företag" />
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <h1 className="page-title">Transaktioner</h1>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="select select-bordered select-sm"
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
        >
          <option value="all">Alla konton</option>
          {accounts.map((a) => (
            <option key={a.id} value={String(a.id)}>
              {a.name}
            </option>
          ))}
        </select>

        <select
          className="select select-bordered select-sm"
          value={matchFilter}
          onChange={(e) => setMatchFilter(e.target.value as MatchFilter)}
        >
          <option value="all">Alla</option>
          <option value="matched">Matchade</option>
          <option value="unmatched">Omatchade</option>
        </select>

        <label className="input input-bordered input-sm flex items-center gap-2 w-60">
          <Search className="w-4 h-4 opacity-30" />
          <input
            type="text"
            placeholder="Sök referens..."
            className="grow"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <span className="text-sm text-base-content/50 tabular-nums">
          {filtered.length} transaktioner
        </span>
      </div>

      {/* Batch edit bar */}
      <div className={`bg-base-200 rounded-xl p-3 flex flex-wrap items-center gap-3 ${selectedIds.size === 0 ? 'opacity-40 pointer-events-none' : ''}`}>
          <span className="text-sm font-medium">
            {selectedIds.size} markerade
          </span>
          <select
            className="select select-bordered select-sm w-auto"
            value={batchCode}
            onChange={(e) => setBatchCode(e.target.value)}
          >
            <option value="">Kontokod...</option>
            {basAccounts.map((ba) => (
              <option key={ba.code} value={ba.code}>
                {ba.code} {ba.name}
              </option>
            ))}
          </select>
          <select
            className="select select-bordered select-sm w-auto"
            value={batchCategory}
            onChange={(e) => setBatchCategory(e.target.value)}
          >
            <option value="">Kategori...</option>
            <option value="expense">Utgift</option>
            <option value="income">Intäkt</option>
            <option value="transfer">Överföring</option>
            <option value="salary">Lön</option>
          </select>
          <select
            className="select select-bordered select-sm w-auto"
            value={batchTransfer}
            onChange={(e) => setBatchTransfer(e.target.value)}
          >
            <option value="">Överföring...</option>
            <option value="yes">Intern överföring: Ja</option>
            <option value="no">Intern överföring: Nej</option>
          </select>
          <select
            className="select select-bordered select-sm w-auto"
            value={batchNeedsReceipt}
            onChange={(e) => setBatchNeedsReceipt(e.target.value)}
          >
            <option value="">Underlag...</option>
            <option value="yes">Behöver underlag: Ja</option>
            <option value="no">Behöver underlag: Nej</option>
          </select>
          <span className="flex-1" />
          <button
            className="btn btn-primary btn-sm"
            onClick={handleBatchSave}
            disabled={batchMutation.isPending || !hasBatchChanges}
          >
            {batchMutation.isPending
              ? <span className="loading loading-spinner loading-xs" />
              : 'Spara'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSelectedIds(new Set())
              setBatchCode('')
              setBatchCategory('')
              setBatchTransfer('')
              setBatchNeedsReceipt('')
            }}
          >
            Avbryt
          </button>
        </div>

      {filtered.length === 0
        ? (
            <EmptyState title="Inga transaktioner" description="Justera filtren" />
          )
        : (
            <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th className="w-8">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={allSelected}
                          onChange={toggleAll}
                        />
                      </th>
                      <th className="tabular-nums text-base-content/40 w-12">ID</th>
                      <th>Datum</th>
                      <th>Referens</th>
                      <th className="text-right">Belopp</th>
                      <th>Konto</th>
                      <th>Kontokod</th>
                      <th>Underlag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((txn) => (
                      <tr
                        key={txn.id}
                        className={`hover cursor-pointer ${selectedIds.has(txn.id) ? 'bg-primary/5' : ''}`}
                        onClick={() => navigate(`/transactions/${txn.id}`)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            checked={selectedIds.has(txn.id)}
                            onChange={() => toggleOne(txn.id)}
                          />
                        </td>
                        <td className="tabular-nums text-base-content/40">{txn.id}</td>
                        <td className="tabular-nums">
                          <DateCell date={txn.date} />
                        </td>
                        <td className="max-w-xs truncate font-medium">
                          {txn.reference}
                        </td>
                        <td className="text-right">
                          <AmountCell amount={txn.amount} />
                        </td>
                        <td>{txn.account_name}</td>
                        <td className="tabular-nums">
                          {txn.accounting_code || '—'}
                        </td>
                        <td>
                          {txn.is_internal_transfer
                            ? (
                                <span className="badge badge-ghost badge-sm gap-1">
                                  <RefreshCw className="w-3 h-3" />
                                  Överföring
                                </span>
                              )
                            : txn.needs_receipt === 0
                              ? (
                                  <span className="badge badge-ghost badge-sm gap-1">
                                    Behövs ej
                                  </span>
                                )
                              : (
                                  <StatusBadge
                                    matched={!!txn.is_matched}
                                    reviewed={!!txn.match_reviewed_at}
                                    confidence={txn.match_confidence}
                                  />
                                )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
    </div>
  )
}
