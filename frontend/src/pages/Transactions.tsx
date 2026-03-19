import { type ChangeEvent, type MouseEvent, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Spinner } from '@radix-ui/themes'
import { Badge, Button, Checkbox, Select, Table, TextField } from '@swedev/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Search } from 'lucide-react'
import {
  type Account,
  AmountCell,
  batchUpdateTransactions,
  cn,
  DateCell,
  EmptyState,
  getBasAccounts,
  getCompany,
  StatusBadge,
  type Transaction,
  useCompany,
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

  const accounts: Account[] = useMemo(() => data?.accounts ?? [], [data?.accounts])

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
        <Spinner size="3" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <h1 className="page-title">Transaktioner</h1>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select.Root value={accountFilter} onValueChange={(v: string | undefined) => setAccountFilter(v ?? 'all')} size="2">
          <Select.Trigger variant="surface" placeholder="Alla konton" />
          <Select.Content>
            <Select.Item value="all">Alla konton</Select.Item>
            {accounts.map((a) => (
              <Select.Item key={a.id} value={String(a.id)}>
                {a.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>

        <Select.Root value={matchFilter} onValueChange={(v: string | undefined) => setMatchFilter((v ?? 'all') as MatchFilter)} size="2">
          <Select.Trigger variant="surface" placeholder="Alla" />
          <Select.Content>
            <Select.Item value="all">Alla</Select.Item>
            <Select.Item value="matched">Matchade</Select.Item>
            <Select.Item value="unmatched">Omatchade</Select.Item>
          </Select.Content>
        </Select.Root>

        <TextField.Root
          size="2"
          variant="surface"
          placeholder="Sök referens..."
          value={search}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        >
          <TextField.Slot side="left">
            <Search className="w-4 h-4 opacity-30" />
          </TextField.Slot>
        </TextField.Root>

        <span className="text-sm text-base-content/50 tabular-nums">
          {filtered.length} transaktioner
        </span>
      </div>

      {/* Batch edit bar */}
      <div className={cn('bg-base-200 rounded-xl p-3 flex flex-wrap items-center gap-3', { 'opacity-40 pointer-events-none': selectedIds.size === 0 })}>
        <span className="text-sm font-medium">
          {selectedIds.size} markerade
        </span>
        <Select.Root value={batchCode || undefined} onValueChange={(v: string | undefined) => setBatchCode(v ?? '')} size="2">
          <Select.Trigger variant="surface" placeholder="Kontokod..." />
          <Select.Content>
            {basAccounts.map((ba) => (
              <Select.Item key={ba.code} value={ba.code}>
                {ba.code} {ba.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <Select.Root value={batchCategory || undefined} onValueChange={(v: string | undefined) => setBatchCategory(v ?? '')} size="2">
          <Select.Trigger variant="surface" placeholder="Kategori..." />
          <Select.Content>
            <Select.Item value="expense">Utgift</Select.Item>
            <Select.Item value="income">Intäkt</Select.Item>
            <Select.Item value="transfer">Överföring</Select.Item>
            <Select.Item value="salary">Lön</Select.Item>
          </Select.Content>
        </Select.Root>
        <Select.Root value={batchTransfer || undefined} onValueChange={(v: string | undefined) => setBatchTransfer(v ?? '')} size="2">
          <Select.Trigger variant="surface" placeholder="Överföring..." />
          <Select.Content>
            <Select.Item value="yes">Intern överföring: Ja</Select.Item>
            <Select.Item value="no">Intern överföring: Nej</Select.Item>
          </Select.Content>
        </Select.Root>
        <Select.Root value={batchNeedsReceipt || undefined} onValueChange={(v: string | undefined) => setBatchNeedsReceipt(v ?? '')} size="2">
          <Select.Trigger variant="surface" placeholder="Underlag..." />
          <Select.Content>
            <Select.Item value="yes">Behöver underlag: Ja</Select.Item>
            <Select.Item value="no">Behöver underlag: Nej</Select.Item>
          </Select.Content>
        </Select.Root>
        <span className="flex-1" />
        <Button
          semantic="action"
          size="2"
          onClick={handleBatchSave}
          disabled={batchMutation.isPending || !hasBatchChanges}
          loading={batchMutation.isPending}
          text="Spara"
        />
        <Button
          variant="ghost"
          size="2"
          onClick={() => {
            setSelectedIds(new Set())
            setBatchCode('')
            setBatchCategory('')
            setBatchTransfer('')
            setBatchNeedsReceipt('')
          }}
          text="Avbryt"
        />
      </div>

      {filtered.length === 0
        ? (
            <EmptyState title="Inga transaktioner" description="Justera filtren" />
          )
        : (
            <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <Table.Root size="2">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell className="w-8">
                        <Checkbox
                          size="2"
                          checked={allSelected}
                          onCheckedChange={() => toggleAll()}
                        />
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell className="tabular-nums text-base-content/40 w-12">ID</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Datum</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Referens</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end">Belopp</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Konto</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Kontokod</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Underlag</Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {filtered.map((txn) => (
                      <Table.Row
                        key={txn.id}
                        className={cn('cursor-pointer', { 'bg-primary/5': selectedIds.has(txn.id) })}
                        onClick={() => navigate(`/transactions/${txn.id}`)}
                      >
                        <Table.Cell onClick={(e: MouseEvent<HTMLTableDataCellElement>) => e.stopPropagation()}>
                          <Checkbox
                            size="2"
                            checked={selectedIds.has(txn.id)}
                            onCheckedChange={() => toggleOne(txn.id)}
                          />
                        </Table.Cell>
                        <Table.Cell className="tabular-nums text-base-content/40">{txn.id}</Table.Cell>
                        <Table.Cell className="tabular-nums">
                          <DateCell date={txn.date} />
                        </Table.Cell>
                        <Table.Cell className="max-w-xs truncate font-medium">
                          {txn.reference}
                        </Table.Cell>
                        <Table.Cell justify="end">
                          <AmountCell amount={txn.amount} />
                        </Table.Cell>
                        <Table.Cell>{txn.account_name}</Table.Cell>
                        <Table.Cell className="tabular-nums">
                          {txn.accounting_code || '—'}
                        </Table.Cell>
                        <Table.Cell>
                          {txn.is_internal_transfer
                            ? (
                                <Badge semantic="neutral">
                                  <RefreshCw className="w-3 h-3" />
                                  Överföring
                                </Badge>
                              )
                            : txn.needs_receipt === 0
                              ? (
                                  <Badge semantic="neutral" text="Behövs ej" />
                                )
                              : (
                                  <StatusBadge
                                    matched={!!txn.is_matched}
                                    reviewed={!!txn.match_reviewed_at}
                                    confidence={txn.match_confidence}
                                  />
                                )}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </div>
            </div>
          )}
    </div>
  )
}
