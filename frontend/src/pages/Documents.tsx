import { type ChangeEvent, type MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Link as RadixLink, Spinner } from '@radix-ui/themes'
import { Badge, Button, Checkbox, Select, type Semantic, Table, TextField } from '@swedev/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Check, Search, Trash2 } from 'lucide-react'
import {
  AmountCell,
  archiveDocument,
  batchUpdateDocuments,
  cn,
  ConfirmDialog,
  DateCell,
  deleteDocument,
  type Document,
  DocumentDetailModal,
  EmptyState,
  getDocuments,
  getParties,
  label,
  reviewDocument,
  StatusBadge,
  useCompany,
} from 'openvera'

type DocFilter = 'all' | 'matched' | 'unmatched' | 'reviewed' | 'unreviewed' | 'no_party' | 'archived'

const docTypeSemantic: Record<string, Semantic> = {
  invoice: 'info',
  receipt: 'success',
  kvittens: 'success',
  outgoing_invoice: 'action',
  credit_note: 'warning',
  salary: 'action',
  reminder: 'error',
  contract: 'neutral',
}

export default function Documents() {
  const { selected } = useCompany()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = (searchParams.get('filter') as DocFilter) || 'all'
  const typeFilter = searchParams.get('type') ?? 'all'
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (search) next.set('q', search)
        else next.delete('q')
        return next
      }, { replace: true })
    }, 300)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [search, setSearchParams])
  const detailId = searchParams.get('doc') ? Number(searchParams.get('doc')) : null
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchDocType, setBatchDocType] = useState('')
  const [batchPartyId, setBatchPartyId] = useState('')
  const [batchReviewed, setBatchReviewed] = useState('')
  const [batchArchived, setBatchArchived] = useState('')

  const setParam = (key: string, value: string, defaultVal = 'all') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === defaultVal) next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }
  const setFilter = (v: DocFilter) => setParam('filter', v)
  const setTypeFilter = (v: string) => setParam('type', v)
  const setDetailId = (id: number | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (id !== null) next.set('doc', String(id))
      else next.delete('doc')
      return next
    })
  }

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', selected?.id],
    queryFn: () => getDocuments({ company_id: selected!.id }),
    enabled: !!selected,
  })

  const { data: parties = [] } = useQuery({
    queryKey: ['parties'],
    queryFn: getParties,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['documents', selected?.id] })

  const reviewMutation = useMutation({
    mutationFn: ({ id, unreview }: { id: number; unreview: boolean }) =>
      reviewDocument(id, unreview),
    onSuccess: () => {
      invalidate()
      if (detailId) queryClient.invalidateQueries({ queryKey: ['document-detail', detailId] })
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (id: number) => archiveDocument(id),
    onSuccess: () => {
      invalidate()
      setDetailId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDocument(id),
    onSuccess: () => {
      setDeleteTarget(null)
      setDetailId(null)
      invalidate()
    },
  })

  const batchMutation = useMutation({
    mutationFn: batchUpdateDocuments,
    onSuccess: () => {
      setSelectedIds(new Set())
      setBatchDocType('')
      setBatchPartyId('')
      setBatchReviewed('')
      setBatchArchived('')
      invalidate()
    },
  })

  const hasBatchChanges = batchDocType !== '' || batchPartyId !== '' || batchReviewed !== '' || batchArchived !== ''

  const handleBatchSave = () => {
    if (!hasBatchChanges) return
    const payload: Parameters<typeof batchUpdateDocuments>[0] = {
      ids: Array.from(selectedIds),
    }
    if (batchDocType !== '') payload.doc_type = batchDocType
    if (batchPartyId !== '') payload.party_id = batchPartyId === 'none' ? null : Number(batchPartyId)
    if (batchReviewed !== '') payload.reviewed = batchReviewed === 'yes'
    if (batchArchived !== '') payload.archived = batchArchived === 'yes'
    batchMutation.mutate(payload)
  }

  const docTypes = useMemo(() => {
    const types = new Set(documents.map((d) => d.doc_type))
    return Array.from(types).sort()
  }, [documents])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return documents
      .filter((doc) => {
        if (typeFilter !== 'all' && doc.doc_type !== typeFilter) return false
        if (q && !(doc.filename ?? '').toLowerCase().includes(q) &&
          !(doc.party_name ?? '').toLowerCase().includes(q) &&
          !(doc.invoice_number ?? '').toLowerCase().includes(q) &&
          !(doc.ocr_number ?? '').toLowerCase().includes(q))
          return false
        switch (filter) {
          case 'matched':
            return !!doc.is_matched
          case 'unmatched':
            return !doc.is_matched
          case 'reviewed':
            return !!doc.reviewed_at
          case 'unreviewed':
            return !doc.reviewed_at
          case 'no_party':
            return !doc.party_id
          case 'archived':
            return !!doc.is_archived
          default:
            return !doc.is_archived
        }
      })
      .sort((a, b) => (b.doc_date ?? '').localeCompare(a.doc_date ?? ''))
  }, [documents, filter, typeFilter, search])

  const allSelected = filtered.length > 0 && filtered.every((d) => selectedIds.has(d.id))

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((d) => d.id)))
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
      <h1 className="page-title">Dokument</h1>

      <div className="flex flex-wrap items-center gap-3">
        <Select.Root value={filter} onValueChange={(v: string | undefined) => setFilter((v ?? 'all') as DocFilter)} size="2">
          <Select.Trigger variant="surface" placeholder="Filter..." />
          <Select.Content>
            <Select.Item value="all">Alla (ej arkiverade)</Select.Item>
            <Select.Item value="matched">Matchade</Select.Item>
            <Select.Item value="unmatched">Omatchade</Select.Item>
            <Select.Item value="reviewed">Granskade</Select.Item>
            <Select.Item value="unreviewed">Ej granskade</Select.Item>
            <Select.Item value="no_party">Utan part</Select.Item>
            <Select.Item value="archived">Arkiverade</Select.Item>
          </Select.Content>
        </Select.Root>

        <Select.Root value={typeFilter} onValueChange={(v: string | undefined) => setTypeFilter(v ?? 'all')} size="2">
          <Select.Trigger variant="surface" placeholder="Alla typer" />
          <Select.Content>
            <Select.Item value="all">Alla typer</Select.Item>
            {docTypes.map((t) => (
              <Select.Item key={t} value={t}>
                {label.docType(t)}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>

        <TextField.Root size="2" variant="surface" placeholder="Sök fil, part, fakturanr..." value={search} onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}>
          <TextField.Slot side="left">
            <Search className="w-4 h-4 opacity-30" />
          </TextField.Slot>
        </TextField.Root>

        <span className="text-sm text-base-content/50 tabular-nums">
          {filtered.length} dokument
        </span>
      </div>

      {/* Batch edit bar */}
      <div className={cn('bg-base-200 rounded-xl p-3 flex flex-wrap items-center gap-3', { 'opacity-40 pointer-events-none': selectedIds.size === 0 })}>
        <span className="text-sm font-medium">
          {selectedIds.size} markerade
        </span>
        <Select.Root value={batchDocType || undefined} onValueChange={(v: string | undefined) => setBatchDocType(v ?? '')} size="2">
          <Select.Trigger variant="surface" placeholder="Typ..." />
          <Select.Content>
            <Select.Item value="invoice">Faktura</Select.Item>
            <Select.Item value="receipt">Kvitto</Select.Item>
            <Select.Item value="kvittens">Kvittens</Select.Item>
            <Select.Item value="outgoing_invoice">Utgående faktura</Select.Item>
            <Select.Item value="credit_note">Kreditnota</Select.Item>
            <Select.Item value="reminder">Påminnelse</Select.Item>
            <Select.Item value="contract">Avtal</Select.Item>
            <Select.Item value="salary">Lönebesked</Select.Item>
            <Select.Item value="statement">Kontoutdrag</Select.Item>
            <Select.Item value="balansrapport">Balansrapport</Select.Item>
            <Select.Item value="resultatrapport">Resultatrapport</Select.Item>
            <Select.Item value="betalningssammanstalning">Betalningssammanställning</Select.Item>
            <Select.Item value="other">Övrigt</Select.Item>
          </Select.Content>
        </Select.Root>
        <Select.Root value={batchPartyId || undefined} onValueChange={(v: string | undefined) => setBatchPartyId(v ?? '')} size="2">
          <Select.Trigger variant="surface" placeholder="Part..." />
          <Select.Content>
            <Select.Item value="none">— Ta bort part —</Select.Item>
            {parties.map((p) => (
              <Select.Item key={p.id} value={String(p.id)}>
                {p.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <Select.Root value={batchReviewed || undefined} onValueChange={(v: string | undefined) => setBatchReviewed(v ?? '')} size="2">
          <Select.Trigger variant="surface" placeholder="Granskning..." />
          <Select.Content>
            <Select.Item value="yes">Markera granskad</Select.Item>
            <Select.Item value="no">Ångra granskning</Select.Item>
          </Select.Content>
        </Select.Root>
        <Select.Root value={batchArchived || undefined} onValueChange={(v: string | undefined) => setBatchArchived(v ?? '')} size="2">
          <Select.Trigger variant="surface" placeholder="Arkivering..." />
          <Select.Content>
            <Select.Item value="yes">Arkivera</Select.Item>
            <Select.Item value="no">Avarkivera</Select.Item>
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
            setBatchDocType('')
            setBatchPartyId('')
            setBatchReviewed('')
            setBatchArchived('')
          }}
          text="Avbryt"
        />
      </div>

      {filtered.length === 0
        ? (
            <EmptyState
              title="Inga dokument"
              description="Justera filtren eller ladda upp dokument"
            />
          )
        : (
            <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <Table.Root size="2" className="w-max min-w-full">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell className="w-8">
                        <Checkbox size="2" checked={allSelected} onCheckedChange={() => toggleAll()} />
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell className="tabular-nums text-base-content/40 w-12">ID</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Fil</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Part</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end">Belopp</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end">Kurs</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end">SEK</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end">Moms</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Datum</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Typ</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Åtgärder</Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {filtered.map((doc) => (
                      <Table.Row
                        key={doc.id}
                        className={cn('cursor-pointer', { 'bg-primary/5': selectedIds.has(doc.id) })}
                        onClick={() => setDetailId(doc.id)}
                      >
                        <Table.Cell onClick={(e: MouseEvent<HTMLTableDataCellElement>) => e.stopPropagation()}>
                          <Checkbox size="2" checked={selectedIds.has(doc.id)} onCheckedChange={() => toggleOne(doc.id)} />
                        </Table.Cell>
                        <Table.Cell className="tabular-nums text-base-content/40">{doc.id}</Table.Cell>
                        <Table.Cell className="text-xs max-w-48 truncate">
                          {doc.file_id && doc.filename
                            ? (
                                <RadixLink underline="hover" size="1" className="font-mono" asChild>
                                  <a
                                    href={`/api/files/${doc.file_id}/view`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {doc.filename}
                                  </a>
                                </RadixLink>
                              )
                            : '—'}
                        </Table.Cell>
                        <Table.Cell className="font-medium max-w-28 truncate">
                          {doc.party_id
                            ? (
                                <RadixLink underline="hover" asChild>
                                  <Link
                                    to={`/parties/${doc.party_id}`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {doc.party_name}
                                  </Link>
                                </RadixLink>
                              )
                            : '—'}
                        </Table.Cell>
                        <Table.Cell justify="end">
                          <AmountCell
                            amount={doc.amount_sek ?? doc.amount}
                            currency={doc.currency ?? 'SEK'}
                          />
                        </Table.Cell>
                        <Table.Cell justify="end" className="tabular-nums text-nowrap">
                          {doc.currency && doc.currency !== 'SEK' && doc.matched_txn_amount !== null && doc.amount
                            ? (Math.abs(doc.matched_txn_amount) / Math.abs(doc.amount)).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : ''}
                        </Table.Cell>
                        <Table.Cell justify="end" className="tabular-nums text-nowrap">
                          {doc.currency && doc.currency !== 'SEK' && doc.matched_txn_amount !== null
                            ? `${Math.abs(doc.matched_txn_amount).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`
                            : ''}
                        </Table.Cell>
                        <Table.Cell justify="end" className="tabular-nums text-nowrap">
                          {doc.vat_amount !== null && doc.vat_amount !== 0 && (
                            <span>
                              {Math.abs(doc.vat_amount).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {(!doc.currency || doc.currency === 'SEK') && ' kr'}
                              {doc.net_amount !== null && doc.net_amount !== 0 && (
                                <span className="text-base-content/40 ml-1">
                                  {Math.round((Math.abs(doc.vat_amount) / Math.abs(doc.net_amount)) * 100)}%
                                </span>
                              )}
                            </span>
                          )}
                        </Table.Cell>
                        <Table.Cell className="tabular-nums text-nowrap">
                          <DateCell date={doc.doc_date} />
                        </Table.Cell>
                        <Table.Cell>
                          <Badge
                            semantic={docTypeSemantic[doc.doc_type] ?? 'neutral'}
                            className="max-w-28 truncate"
                            title={label.docType(doc.doc_type)}
                            text={label.docType(doc.doc_type)}
                          />
                        </Table.Cell>
                        <Table.Cell className="text-nowrap">
                          <StatusBadge
                            matched={!!doc.is_matched}
                            reviewed={!!doc.reviewed_at}
                            archived={!!doc.is_archived}
                            confidence={doc.match_confidence}
                            docType={doc.doc_type}
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <div
                            className="flex gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant={doc.reviewed_at ? 'soft' : 'ghost'}
                              {...(doc.reviewed_at ? { semantic: 'success' as const } : {})}
                              size="1"
                              className={cn('tooltip', { 'opacity-30': !doc.reviewed_at })}
                              data-tip={doc.reviewed_at ? 'Ångra granskning' : 'Markera granskad'}
                              onClick={() =>
                                reviewMutation.mutate({
                                  id: doc.id,
                                  unreview: !!doc.reviewed_at,
                                })
                              }
                              icon={<Check />}
                            />
                            {!doc.is_archived && (
                              <Button
                                variant="ghost"
                                size="1"
                                className="tooltip"
                                data-tip="Arkivera"
                                onClick={() =>
                                  archiveMutation.mutate(doc.id)
                                }
                                icon={<Archive />}
                              />
                            )}
                            <Button
                              variant="ghost"
                              size="1"
                              semantic="destructive"
                              className="tooltip"
                              data-tip="Ta bort"
                              onClick={() => setDeleteTarget(doc)}
                              icon={<Trash2 />}
                            />
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </div>
            </div>
          )}

      {/* Document detail modal */}
      <DocumentDetailModal
        docId={detailId}
        onClose={() => setDetailId(null)}
        onUpdated={invalidate}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Ta bort dokument"
        message={`Vill du ta bort "${deleteTarget?.party_name ?? deleteTarget?.filename ?? 'dokument'}"? Detta kan inte ångras.`}
        onConfirm={() =>
          deleteTarget && deleteMutation.mutate(deleteTarget.id)
        }
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
