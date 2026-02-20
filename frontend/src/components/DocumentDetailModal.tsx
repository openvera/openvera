/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  Archive,
  Check,
  ExternalLink,
  EyeOff,
  Link as LinkIcon,
  Pencil,
  Search,
  Trash2,
  Unlink,
  X,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  archiveDocument,
  deleteDocument,
  getDocumentDetails,
  reviewDocument,
  updateDocument,
} from '../api/documents'
import { label } from '../labels'
import { createMatch, unmatch } from '../api/matches'
import { searchTransactions, type TransactionSearchResult } from '../api/transactions'

interface Props {
  docId: number | null
  onClose: () => void
  /** Called after any mutation so parent can invalidate its own queries */
  onUpdated?: () => void
}

export default function DocumentDetailModal({ docId, onClose, onUpdated }: Props) {
  const queryClient = useQueryClient()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [editing, setEditing] = useState(false)

  const open = docId !== null

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    setEditing(false)
  }, [docId])

  const { data: detail, isLoading } = useQuery({
    queryKey: ['document-detail', docId],
    queryFn: () => getDocumentDetails(docId!),
    enabled: open,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['document-detail', docId] })
    onUpdated?.()
  }

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      updateDocument(docId!, data),
    onSuccess: () => {
      setEditing(false)
      invalidate()
    },
  })

  const reviewMutation = useMutation({
    mutationFn: ({ id, unreview }: { id: number; unreview: boolean }) =>
      reviewDocument(id, unreview),
    onSuccess: invalidate,
  })

  const archiveMutation = useMutation({
    mutationFn: (id: number) => archiveDocument(id),
    onSuccess: () => {
      onClose()
      invalidate()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDocument(id),
    onSuccess: () => {
      onClose()
      invalidate()
    },
  })

  const unmatchMutation = useMutation({
    mutationFn: ({ txnId, docId }: { txnId: number; docId: number }) =>
      unmatch(txnId, docId),
    onSuccess: invalidate,
  })

  const doc = detail as any

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      {open && (
        <div className="modal-box max-w-3xl rounded-2xl p-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-base-200">
            <h3 className="font-bold text-lg">
              {isLoading
                ? 'Laddar...'
                : (doc?.party_name ?? doc?.filename ?? 'Dokument')}
            </h3>
            <div className="flex gap-1">
              {doc && !editing && (
                <button
                  className="btn btn-ghost btn-sm btn-square"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              <button
                className="btn btn-ghost btn-sm btn-square"
                onClick={() => { setEditing(false); onClose() }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {isLoading || !doc
            ? (
                <div className="flex justify-center py-12">
                  <span className="loading loading-spinner loading-md" />
                </div>
              )
            : editing
              ? (
                  <EditDocumentForm
                    doc={doc}
                    parties={doc.parties ?? []}
                    onSave={(data) => saveMutation.mutate(data)}
                    onCancel={() => setEditing(false)}
                    isPending={saveMutation.isPending}
                  />
                )
              : (
                  <>
                    {/* Body */}
                    <div className="px-6 py-5 space-y-5">
                      {/* File link */}
                      {doc.file_id && doc.filename && (
                        <a
                          href={`/api/files/${doc.file_id}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                        >
                          <ExternalLink className="w-4 h-4" />
                          {doc.filename}
                        </a>
                      )}

                      {/* Document info */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <Field
                          label="Typ"
                          value={label.docType(doc.doc_type)}
                        />
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-0.5">
                            Part
                          </dt>
                          <dd className="text-base-content/80">
                            {doc.party_id
                              ? (
                                  <Link
                                    to={`/parties/${doc.party_id}`}
                                    className="link link-hover link-primary"
                                  >
                                    {doc.party_name}
                                  </Link>
                                )
                              : '—'}
                          </dd>
                        </div>
                        <Field label="Datum" value={doc.doc_date} />
                        {label.isMatchable(doc.doc_type) && (
                          <>
                            <Field
                              label="Belopp"
                              value={
                                doc.amount != null
                                  ? `${Number(doc.amount).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} ${doc.currency ?? 'SEK'}`
                                  : null
                              }
                            />
                            {doc.net_amount != null && doc.vat_amount != null && (
                              <>
                                <Field
                                  label="Netto (exkl. moms)"
                                  value={`${Number(doc.net_amount).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} ${doc.currency ?? 'SEK'}`}
                                />
                                <Field
                                  label="Moms"
                                  value={`${Number(doc.vat_amount).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} ${doc.currency ?? 'SEK'}`}
                                />
                              </>
                            )}
                            <Field label="Förfallodatum" value={doc.due_date} />
                            <Field
                              label="Fakturanummer"
                              value={doc.invoice_number}
                            />
                            <Field label="OCR-nummer" value={doc.ocr_number} />
                          </>
                        )}
                      </div>

                      {/* VAT breakdown per rate */}
                      {doc.vat_breakdown && Array.isArray(doc.vat_breakdown) && doc.vat_breakdown.length > 1 && (
                        <div className="text-sm">
                          <dt className="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-2">
                            Momsuppdelning
                          </dt>
                          <div className="overflow-x-auto">
                            <table className="table table-xs">
                              <thead>
                                <tr>
                                  <th>Momssats</th>
                                  <th className="text-right">Netto</th>
                                  <th className="text-right">Moms</th>
                                </tr>
                              </thead>
                              <tbody>
                                {doc.vat_breakdown.map((entry: any, i: number) => (
                                  <tr key={i}>
                                    <td>{entry.rate}%</td>
                                    <td className="text-right tabular-nums">
                                      {Number(entry.net).toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="text-right tabular-nums">
                                      {Number(entry.vat).toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {doc.notes && (
                        <div className="text-sm">
                          <dt className="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-1">
                            Anteckningar
                          </dt>
                          <dd className="whitespace-pre-wrap text-base-content/70">
                            {doc.notes}
                          </dd>
                        </div>
                      )}

                      {/* Matched transactions */}
                      {doc.matched_transactions?.length > 0 && (
                        <div className="space-y-3">
                          {doc.matched_transactions.map((mt: any) => (
                            <div key={mt.match_id} className="bg-base-200/40 rounded-lg p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <a
                                  href={`/transactions/${mt.txn_id}`}
                                  className="text-xs font-semibold uppercase tracking-wider text-base-content/40 hover:text-primary transition-colors"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    onClose()
                                    window.location.href = `/transactions/${mt.txn_id}`
                                  }}
                                >
                                  Matchad transaktion
                                  <span className="ml-2 tabular-nums">#{mt.txn_id}</span>
                                </a>
                                <button
                                  className="btn btn-ghost btn-xs text-red-400 hover:text-red-600 gap-1"
                                  onClick={() =>
                                    unmatchMutation.mutate({
                                      txnId: mt.txn_id,
                                      docId: doc.id,
                                    })
                                  }
                                  disabled={unmatchMutation.isPending}
                                >
                                  <Unlink className="w-3 h-3" />
                                  Ta bort matchning
                                </button>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <Field label="Datum" value={mt.date} />
                                <Field label="Referens" value={mt.reference} />
                                <Field
                                  label="Belopp"
                                  value={
                                    mt.amount != null
                                      ? `${Number(mt.amount).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr`
                                      : null
                                  }
                                />
                                <Field label="Konto" value={mt.account} />
                              </div>
                              {mt.confidence != null && (
                                <p className="text-xs text-base-content/40">
                                  Matchning: {mt.match_type} ({Math.round(mt.confidence)}%)
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Match transaction section (for unmatched matchable docs) */}
                      {label.isMatchable(doc.doc_type) && !doc.is_matched && (
                        <MatchTransactionSection
                          doc={doc}
                          onMatched={invalidate}
                        />
                      )}

                      {/* Review status */}
                      {doc.reviewed_at && (
                        <p className="text-xs text-base-content/40">
                          Granskad:{' '}
                          {new Date(doc.reviewed_at).toLocaleString('sv-SE')}
                        </p>
                      )}
                    </div>

                    {/* Footer actions */}
                    <div className="flex justify-between px-6 py-4 bg-base-200/40 border-t border-base-200 rounded-b-2xl">
                      <button
                        className="btn btn-ghost btn-sm text-red-400 hover:text-red-600 gap-1"
                        onClick={() => deleteMutation.mutate(doc.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                        Ta bort
                      </button>
                      <div className="flex gap-2">
                        {!doc.is_archived && (
                          <button
                            className="btn btn-ghost btn-sm gap-1"
                            onClick={() => archiveMutation.mutate(doc.id)}
                          >
                            <Archive className="w-4 h-4" />
                            Arkivera
                          </button>
                        )}
                        <button
                          className="btn btn-primary btn-sm gap-1"
                          onClick={() =>
                            reviewMutation.mutate({
                              id: doc.id,
                              unreview: !!doc.reviewed_at,
                            })
                          }
                          disabled={reviewMutation.isPending}
                        >
                          {doc.reviewed_at
                            ? <EyeOff className="w-4 h-4" />
                            : <Check className="w-4 h-4" />}
                          {doc.reviewed_at
                            ? 'Ångra granskning'
                            : 'Markera granskad'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
        </div>
      )}
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  )
}

function EditDocumentForm({
  doc,
  parties,
  onSave,
  onCancel,
  isPending,
}: {
  doc: any
  parties: { id: number; name: string }[]
  onSave: (data: Record<string, unknown>) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [partyId, setPartyId] = useState<string>(
    doc.party_id != null ? String(doc.party_id) : '',
  )
  const [amount, setAmount] = useState(doc.amount != null ? String(doc.amount) : '')
  const [currency, setCurrency] = useState(doc.currency ?? 'SEK')
  const [docDate, setDocDate] = useState(doc.doc_date ?? '')
  const [dueDate, setDueDate] = useState(doc.due_date ?? '')
  const [invoiceNumber, setInvoiceNumber] = useState(doc.invoice_number ?? '')
  const [ocrNumber, setOcrNumber] = useState(doc.ocr_number ?? '')
  const [docType, setDocType] = useState(doc.doc_type ?? 'invoice')
  const [notes, setNotes] = useState(doc.notes ?? '')
  const [netAmount, setNetAmount] = useState(doc.net_amount != null ? String(doc.net_amount) : '')
  const [vatAmount, setVatAmount] = useState(doc.vat_amount != null ? String(doc.vat_amount) : '')
  const [breakdown, setBreakdown] = useState<{ rate: string; net: string; vat: string }[]>(
    doc.vat_breakdown?.map((e: any) => ({ rate: String(e.rate), net: String(e.net), vat: String(e.vat) })) ?? [],
  )
  const matchable = label.isMatchable(docType)
  const hasVatData = doc.vat_amount != null || doc.net_amount != null

  const handleSave = () => {
    const data: Record<string, unknown> = {
      party_id: partyId ? Number(partyId) : null,
      amount: amount ? Number(amount) : null,
      currency,
      doc_date: docDate || null,
      due_date: dueDate || null,
      invoice_number: invoiceNumber || null,
      ocr_number: ocrNumber || null,
      doc_type: docType,
      notes: notes || null,
      net_amount: netAmount ? Number(netAmount) : null,
      vat_amount: vatAmount ? Number(vatAmount) : null,
      vat_breakdown_json: breakdown.length > 0
        ? JSON.stringify(breakdown.map((r) => ({
            rate: Number(r.rate),
            net: Number(r.net),
            vat: r.rate && r.net ? +(Number(r.net) * Number(r.rate) / 100).toFixed(2) : 0,
          })))
        : null,
    }
    onSave(data)
  }

  return (
    <>
      <div className="px-6 py-5 space-y-4">
        {/* File link in edit mode too */}
        {doc.file_id && doc.filename && (
          <a
            href={`/api/files/${doc.file_id}/view`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <ExternalLink className="w-4 h-4" />
            {doc.filename}
          </a>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="label text-sm">Typ</label>
            <select
              className="select select-bordered select-sm w-full"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
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
          </div>
          <div>
            <label className="label text-sm">Part</label>
            <select
              className="select select-bordered select-sm w-full"
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
            >
              <option value="">— Ingen —</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-sm">Datum</label>
            <input
              className="input input-bordered input-sm w-full"
              type="date"
              value={docDate}
              onChange={(e) => setDocDate(e.target.value)}
            />
          </div>
          {matchable && (
            <>
              <div>
                <label className="label text-sm">Belopp</label>
                <input
                  className="input input-bordered input-sm w-full"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="label text-sm">Valuta</label>
                <select
                  className="select select-bordered select-sm w-full"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="SEK">SEK</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label className="label text-sm">Förfallodatum</label>
                <input
                  className="input input-bordered input-sm w-full"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div>
                <label className="label text-sm">Fakturanummer</label>
                <input
                  className="input input-bordered input-sm w-full"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </div>
              <div>
                <label className="label text-sm">OCR-nummer</label>
                <input
                  className="input input-bordered input-sm w-full"
                  value={ocrNumber}
                  onChange={(e) => setOcrNumber(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
        <div>
          <label className="label text-sm">Anteckningar</label>
          <textarea
            className="textarea textarea-bordered w-full text-sm"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {(matchable || hasVatData || breakdown.length > 0) && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label text-sm">Netto (exkl. moms)</label>
                <input
                  className="input input-bordered input-sm w-full"
                  type="number"
                  step="0.01"
                  value={netAmount}
                  onChange={(e) => setNetAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="label text-sm">Moms</label>
                <input
                  className="input input-bordered input-sm w-full"
                  type="number"
                  step="0.01"
                  value={vatAmount}
                  onChange={(e) => setVatAmount(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="label text-sm">Momsuppdelning</label>
              {breakdown.length > 0 && (
                <table className="table table-xs table-fixed">
                  <thead>
                    <tr>
                      <th className="w-24">Momssats %</th>
                      <th className="w-32">Netto</th>
                      <th className="w-32">Moms</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map((row, i) => {
                      const computedVat = row.rate && row.net
                        ? (Number(row.net) * Number(row.rate) / 100).toFixed(2)
                        : ''
                      return (
                      <tr key={i}>
                        <td>
                          <input
                            className="input input-bordered input-xs w-20"
                            type="number"
                            step="any"
                            value={row.rate}
                            onChange={(e) => {
                              const next = [...breakdown]
                              next[i] = { ...row, rate: e.target.value, vat: '' }
                              setBreakdown(next)
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="input input-bordered input-xs w-28"
                            type="number"
                            step="0.01"
                            value={row.net}
                            onChange={(e) => {
                              const next = [...breakdown]
                              next[i] = { ...row, net: e.target.value, vat: '' }
                              setBreakdown(next)
                            }}
                          />
                        </td>
                        <td className="tabular-nums text-sm text-base-content/70">
                          {computedVat}
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-xs text-error"
                            onClick={() => setBreakdown(breakdown.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setBreakdown([...breakdown, { rate: '25', net: '0', vat: '' }])}
              >
                + Lägg till rad
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 px-6 py-4 bg-base-200/40 border-t border-base-200 rounded-b-2xl">
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          Avbryt
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={isPending}
        >
          {isPending
            ? <span className="loading loading-spinner loading-xs" />
            : 'Spara'}
        </button>
      </div>
    </>
  )
}

function MatchTransactionSection({
  doc,
  onMatched,
}: {
  doc: any
  onMatched: () => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [candidates, setCandidates] = useState<TransactionSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const queryClient = useQueryClient()

  const matchMutation = useMutation({
    mutationFn: (txnId: number) =>
      createMatch({ transaction_id: txnId, document_id: doc.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-detail', doc.id] })
      onMatched()
    },
  })

  const doSearch = async (q?: string) => {
    setIsSearching(true)
    try {
      const results = await searchTransactions({
        company_id: doc.company_id,
        amount: doc.amount ?? undefined,
        date: doc.doc_date ?? undefined,
        doc_type: doc.doc_type ?? undefined,
        q: q || undefined,
      })
      setCandidates(results)
      setHasSearched(true)
    } finally {
      setIsSearching(false)
    }
  }

  // Auto-search on mount if we have an amount
  useEffect(() => {
    if (doc.amount != null) {
      doSearch()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <dt className="text-xs font-semibold uppercase tracking-wider text-base-content/40">
          <LinkIcon className="w-3 h-3 inline mr-1" />
          Matcha med transaktion
        </dt>
      </div>

      {/* Search input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-base-content/30" />
          <input
            className="input input-bordered input-sm w-full pl-8"
            type="text"
            placeholder="Sök referens..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doSearch(searchQuery)
            }}
          />
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => doSearch(searchQuery)}
          disabled={isSearching}
        >
          {isSearching ? <span className="loading loading-spinner loading-xs" /> : 'Sök'}
        </button>
      </div>

      {/* Results */}
      {hasSearched && candidates.length === 0 && (
        <p className="text-xs text-base-content/40 py-1">
          Inga matchande transaktioner hittades.
        </p>
      )}
      {candidates.length > 0 && (
        <div className="overflow-x-auto max-h-48 overflow-y-auto">
          <table className="table table-xs">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Referens</th>
                <th className="text-right">Belopp</th>
                <th>Konto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {candidates.map((txn) => (
                <tr key={txn.id} className="hover">
                  <td className="text-nowrap">
                    {txn.date}
                    {doc.doc_date && txn.date && (() => {
                      const diff = Math.round((new Date(txn.date).getTime() - new Date(doc.doc_date).getTime()) / 86400000)
                      return (
                        <span className="ml-1 text-base-content/30">
                          ({diff >= 0 ? '+' : ''}{diff})
                        </span>
                      )
                    })()}
                  </td>
                  <td className="max-w-40 truncate" title={txn.reference}>
                    {txn.reference}
                  </td>
                  <td className="text-right tabular-nums text-nowrap">
                    {Number(txn.amount).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr
                  </td>
                  <td className="text-nowrap">{txn.account_name}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-xs text-primary"
                      onClick={() => matchMutation.mutate(txn.id)}
                      disabled={matchMutation.isPending}
                    >
                      <LinkIcon className="w-3 h-3" />
                      Matcha
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Field({
  label: lbl,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-0.5">
        {lbl}
      </dt>
      <dd className="text-base-content/80">{value || '—'}</dd>
    </div>
  )
}
