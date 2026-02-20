import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Archive, Check, Search, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  AmountCell,
  ConfirmDialog,
  DateCell,
  DocumentDetailModal,
  EmptyState,
  StatusBadge,
  archiveDocument,
  batchUpdateDocuments,
  deleteDocument,
  getDocuments,
  getParties,
  label,
  reviewDocument,
  useCompany,
  type Document,
} from 'openvera'

type DocFilter = 'all' | 'matched' | 'unmatched' | 'reviewed' | 'unreviewed' | 'no_party' | 'archived'

const docTypeBadge: Record<string, string> = {
  invoice: 'badge-info badge-soft',
  receipt: 'badge-success badge-soft',
  kvittens: 'badge-success badge-soft',
  outgoing_invoice: 'badge-primary badge-soft',
  credit_note: 'badge-warning badge-soft',
  salary: 'badge-accent badge-soft',
  reminder: 'badge-error badge-soft',
  contract: 'badge-neutral badge-soft',
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
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search])
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
      if (id != null) next.set('doc', String(id))
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
        if (q && !(doc.filename ?? '').toLowerCase().includes(q)
          && !(doc.party_name ?? '').toLowerCase().includes(q)
          && !(doc.invoice_number ?? '').toLowerCase().includes(q)
          && !(doc.ocr_number ?? '').toLowerCase().includes(q))
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
        <span className="loading loading-spinner loading-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <h1 className="page-title">Dokument</h1>

      <div className="flex flex-wrap items-center gap-3">
        <select
          className="select select-bordered select-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value as DocFilter)}
        >
          <option value="all">Alla (ej arkiverade)</option>
          <option value="matched">Matchade</option>
          <option value="unmatched">Omatchade</option>
          <option value="reviewed">Granskade</option>
          <option value="unreviewed">Ej granskade</option>
          <option value="no_party">Utan part</option>
          <option value="archived">Arkiverade</option>
        </select>

        <select
          className="select select-bordered select-sm"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">Alla typer</option>
          {docTypes.map((t) => (
            <option key={t} value={t}>
              {label.docType(t)}
            </option>
          ))}
        </select>

        <label className="input input-bordered input-sm flex items-center gap-2 w-60">
          <Search className="w-4 h-4 opacity-30" />
          <input
            type="text"
            placeholder="Sök fil, part, fakturanr..."
            className="grow"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <span className="text-sm text-base-content/50 tabular-nums">
          {filtered.length} dokument
        </span>
      </div>

      {/* Batch edit bar */}
      <div className={`bg-base-200 rounded-xl p-3 flex flex-wrap items-center gap-3 ${selectedIds.size === 0 ? 'opacity-40 pointer-events-none' : ''}`}>
        <span className="text-sm font-medium">
          {selectedIds.size} markerade
        </span>
        <select
          className="select select-bordered select-sm w-auto"
          value={batchDocType}
          onChange={(e) => setBatchDocType(e.target.value)}
        >
          <option value="">Typ...</option>
          <option value="invoice">Faktura</option>
          <option value="receipt">Kvitto</option>
          <option value="kvittens">Kvittens</option>
          <option value="outgoing_invoice">Utgående faktura</option>
          <option value="credit_note">Kreditnota</option>
          <option value="reminder">Påminnelse</option>
          <option value="contract">Avtal</option>
          <option value="salary">Lönebesked</option>
          <option value="statement">Kontoutdrag</option>
          <option value="balansrapport">Balansrapport</option>
          <option value="resultatrapport">Resultatrapport</option>
          <option value="betalningssammanstalning">Betalningssammanställning</option>
          <option value="other">Övrigt</option>
        </select>
        <select
          className="select select-bordered select-sm w-auto"
          value={batchPartyId}
          onChange={(e) => setBatchPartyId(e.target.value)}
        >
          <option value="">Part...</option>
          <option value="none">— Ta bort part —</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className="select select-bordered select-sm w-auto"
          value={batchReviewed}
          onChange={(e) => setBatchReviewed(e.target.value)}
        >
          <option value="">Granskning...</option>
          <option value="yes">Markera granskad</option>
          <option value="no">Ångra granskning</option>
        </select>
        <select
          className="select select-bordered select-sm w-auto"
          value={batchArchived}
          onChange={(e) => setBatchArchived(e.target.value)}
        >
          <option value="">Arkivering...</option>
          <option value="yes">Arkivera</option>
          <option value="no">Avarkivera</option>
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
            setBatchDocType('')
            setBatchPartyId('')
            setBatchReviewed('')
            setBatchArchived('')
          }}
        >
          Avbryt
        </button>
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
                <table className="table table-sm w-max min-w-full">
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
                      <th>Fil</th>
                      <th>Part</th>
                      <th className="text-right">Belopp</th>
                      <th className="text-right">Kurs</th>
                      <th className="text-right">SEK</th>
                      <th className="text-right">Moms</th>
                      <th>Datum</th>
                      <th>Typ</th>
                      <th>Status</th>
                      <th>Åtgärder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((doc) => (
                      <tr
                        key={doc.id}
                        className={`hover cursor-pointer ${selectedIds.has(doc.id) ? 'bg-primary/5' : ''}`}
                        onClick={() => setDetailId(doc.id)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            checked={selectedIds.has(doc.id)}
                            onChange={() => toggleOne(doc.id)}
                          />
                        </td>
                        <td className="tabular-nums text-base-content/40">{doc.id}</td>
                        <td className="text-xs max-w-48 truncate">
                          {doc.file_id && doc.filename
                            ? (
                                <a
                                  href={`/api/files/${doc.file_id}/view`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="link link-hover link-primary font-mono"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {doc.filename}
                                </a>
                              )
                            : '—'}
                        </td>
                        <td className="font-medium max-w-28 truncate">
                          {doc.party_id
                            ? (
                                <Link
                                  to={`/parties/${doc.party_id}`}
                                  className="link link-hover link-primary"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {doc.party_name}
                                </Link>
                              )
                            : '—'}
                        </td>
                        <td className="text-right">
                          <AmountCell
                            amount={doc.amount_sek ?? doc.amount}
                            currency={doc.currency ?? 'SEK'}
                          />
                        </td>
                        <td className="text-right tabular-nums text-nowrap">
                          {doc.currency && doc.currency !== 'SEK' && doc.matched_txn_amount != null && doc.amount
                            ? (Math.abs(doc.matched_txn_amount) / Math.abs(doc.amount)).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : ''}
                        </td>
                        <td className="text-right tabular-nums text-nowrap">
                          {doc.currency && doc.currency !== 'SEK' && doc.matched_txn_amount != null
                            ? `${Math.abs(doc.matched_txn_amount).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`
                            : ''}
                        </td>
                        <td className="text-right tabular-nums text-nowrap">
                          {doc.vat_amount != null && doc.vat_amount !== 0 && (
                            <span>
                              {Math.abs(doc.vat_amount).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {(!doc.currency || doc.currency === 'SEK') && ' kr'}
                              {doc.net_amount != null && doc.net_amount !== 0 && (
                                <span className="text-base-content/40 ml-1">
                                  {Math.round((Math.abs(doc.vat_amount) / Math.abs(doc.net_amount)) * 100)}%
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="tabular-nums text-nowrap">
                          <DateCell date={doc.doc_date} />
                        </td>
                        <td>
                          <span className={`badge badge-sm inline-block max-w-28 truncate align-middle ${docTypeBadge[doc.doc_type] ?? 'badge-ghost'}`} title={label.docType(doc.doc_type)}>
                            {label.docType(doc.doc_type)}
                          </span>
                        </td>
                        <td className="text-nowrap">
                          <StatusBadge
                            matched={!!doc.is_matched}
                            reviewed={!!doc.reviewed_at}
                            archived={!!doc.is_archived}
                            confidence={doc.match_confidence}
                            docType={doc.doc_type}
                          />
                        </td>
                        <td>
                          <div
                            className="flex gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              className={`btn btn-xs tooltip ${doc.reviewed_at ? 'btn-success btn-soft' : 'btn-ghost opacity-30'}`}
                              data-tip={
                                doc.reviewed_at
                                  ? 'Ångra granskning'
                                  : 'Markera granskad'
                              }
                              onClick={() =>
                                reviewMutation.mutate({
                                  id: doc.id,
                                  unreview: !!doc.reviewed_at,
                                })
                              }
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            {!doc.is_archived && (
                              <button
                                className="btn btn-ghost btn-xs tooltip"
                                data-tip="Arkivera"
                                onClick={() =>
                                  archiveMutation.mutate(doc.id)
                                }
                              >
                                <Archive className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              className="btn btn-ghost btn-xs text-red-400 hover:text-red-600 tooltip"
                              data-tip="Ta bort"
                              onClick={() => setDeleteTarget(doc)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

