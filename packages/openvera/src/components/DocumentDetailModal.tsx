import React, { type ChangeEvent, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Button, Modal, Select, Table, TextArea, TextField } from '@swedev/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
} from 'lucide-react'

import {
  archiveDocument,
  deleteDocument,
  getDocumentDetails,
  reviewDocument,
  updateDocument,
} from '../api/documents'
import { createMatch, unmatch } from '../api/matches'
import { searchTransactions, type TransactionSearchResult } from '../api/transactions'
import { label } from '../labels'

interface Props {
  docId: number | null;
  onClose: () => void;
  /** Called after any mutation so parent can invalidate its own queries */
  onUpdated?: () => void;
}

export default function DocumentDetailModal({ docId, onClose, onUpdated }: Props) {
  const queryClient = useQueryClient()
  const [editingDocId, setEditingDocId] = useState<number | null>(null)

  const open = docId !== null
  const editing = docId !== null && editingDocId === docId

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
      setEditingDocId(null)
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
    <Modal.Root
      open={open}
      onOpenChange={(v: boolean) => {
        if (!v) {
          setEditingDocId(null)
          onClose()
        }
      }}
      size="3"
    >
      {open && (
        <>
          {/* Header */}
          <Modal.Header
            title={
              isLoading
                ? 'Laddar...'
                : `#${doc?.id} ${doc?.party_name ?? doc?.filename ?? 'Dokument'}`
            }
            closeButton
            onClose={() => {
              setEditingDocId(null)
              onClose()
            }}
          />

          {isLoading || !doc
            ? (
                <Modal.Body>
                  <div className="flex justify-center py-12">
                    <span className="loading loading-spinner loading-md" />
                  </div>
                </Modal.Body>
              )
            : editing
              ? (
                  <EditDocumentForm
                    doc={doc}
                    parties={doc.parties ?? []}
                    onSave={(data) => saveMutation.mutate(data)}
                    onCancel={() => setEditingDocId(null)}
                    isPending={saveMutation.isPending}
                  />
                )
              : (
                  <>
                    {/* Body */}
                    <Modal.Body>
                      <div className="space-y-5">
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
                                  doc.amount !== null && doc.amount !== undefined
                                    ? `${Number(doc.amount).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} ${doc.currency ?? 'SEK'}`
                                    : null
                                }
                              />
                              {doc.net_amount !== null && doc.net_amount !== undefined && doc.vat_amount !== null && doc.vat_amount !== undefined && (
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
                              <Table.Root size="1">
                                <Table.Header>
                                  <Table.Row>
                                    <Table.ColumnHeaderCell>Momssats</Table.ColumnHeaderCell>
                                    <Table.ColumnHeaderCell justify="end">Netto</Table.ColumnHeaderCell>
                                    <Table.ColumnHeaderCell justify="end">Moms</Table.ColumnHeaderCell>
                                  </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                  {doc.vat_breakdown.map((entry: any, i: number) => (
                                    <Table.Row key={i}>
                                      <Table.Cell>{entry.rate}%</Table.Cell>
                                      <Table.Cell justify="end" className="tabular-nums">
                                        {Number(entry.net).toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
                                      </Table.Cell>
                                      <Table.Cell justify="end" className="tabular-nums">
                                        {Number(entry.vat).toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
                                      </Table.Cell>
                                    </Table.Row>
                                  ))}
                                </Table.Body>
                              </Table.Root>
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
                                  <Button
                                    variant="ghost"
                                    size="1"
                                    semantic="destructive"
                                    onClick={() =>
                                      unmatchMutation.mutate({
                                        txnId: mt.txn_id,
                                        docId: doc.id,
                                      })
                                    }
                                    disabled={unmatchMutation.isPending}
                                    icon={<Unlink />}
                                    text="Ta bort matchning"
                                  />
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                  <Field label="Datum" value={mt.date} />
                                  <Field label="Referens" value={mt.reference} />
                                  <Field
                                    label="Belopp"
                                    value={
                                      mt.amount !== null && mt.amount !== undefined
                                        ? `${Number(mt.amount).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr`
                                        : null
                                    }
                                  />
                                  <Field label="Konto" value={mt.account} />
                                </div>
                                {mt.confidence !== null && mt.confidence !== undefined && (
                                  <p className="text-xs text-base-content/40">
                                    Matchning: {mt.match_type} ({Math.round(mt.confidence)}%)
                                  </p>
                                )}
                                <p className="text-xs text-base-content/40">
                                  {mt.approved_at
                                    ? `Matchning godkand ${new Date(mt.approved_at).toLocaleString('sv-SE')}`
                                    : 'Matchning vantar godkannande'}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Match transaction section (for unmatched matchable docs) */}
                        {label.isMatchable(doc.doc_type) && !doc.is_matched && !!doc.data_verified_at && (
                          <MatchTransactionSection
                            doc={doc}
                            onMatched={invalidate}
                          />
                        )}

                        {label.isMatchable(doc.doc_type) && !doc.is_matched && !doc.data_verified_at && (
                          <p className="text-xs text-base-content/40">
                            Verifiera PDF-data innan du skapar en slutlig matchning.
                          </p>
                        )}

                        {/* Review status */}
                        {doc.data_verified_at && (
                          <p className="text-xs text-base-content/40">
                            PDF-data verifierad:{' '}
                            {new Date(doc.data_verified_at).toLocaleString('sv-SE')}
                          </p>
                        )}
                        {doc.reviewed_at && doc.reviewed_at !== doc.data_verified_at && (
                          <p className="text-xs text-base-content/40">
                            Klar for bokforing:{' '}
                            {new Date(doc.reviewed_at).toLocaleString('sv-SE')}
                          </p>
                        )}
                      </div>
                    </Modal.Body>

                    {/* Footer actions */}
                    <Modal.Footer>
                      <div className="flex justify-between w-full">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="2"
                            semantic="destructive"
                            onClick={() => deleteMutation.mutate(doc.id)}
                            icon={<Trash2 />}
                            text="Ta bort"
                          />
                          {!doc.is_archived && (
                            <Button
                              variant="ghost"
                              size="2"
                              onClick={() => archiveMutation.mutate(doc.id)}
                              icon={<Archive />}
                              text="Arkivera"
                            />
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="soft"
                            size="2"
                            onClick={() => setEditingDocId(docId)}
                            icon={<Pencil />}
                            text="Redigera"
                          />
                          <Button
                            semantic="action"
                            size="2"
                            onClick={() =>
                              reviewMutation.mutate({
                                id: doc.id,
                                unreview: !!doc.data_verified_at,
                              })
                            }
                            disabled={reviewMutation.isPending}
                            icon={doc.data_verified_at ? <EyeOff /> : <Check />}
                            text={doc.data_verified_at ? 'Ångra verifiering' : 'Verifiera PDF-data'}
                          />
                        </div>
                      </div>
                    </Modal.Footer>
                  </>
                )}
        </>
      )}
    </Modal.Root>
  )
}

function EditDocumentForm({
  doc,
  parties,
  onSave,
  onCancel,
  isPending,
}: {
  doc: any;
  parties: { id: number; name: string }[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [partyId, setPartyId] = useState<string>(
    doc.party_id !== null && doc.party_id !== undefined ? String(doc.party_id) : '',
  )
  const [amount, setAmount] = useState(doc.amount !== null && doc.amount !== undefined ? String(doc.amount) : '')
  const [currency, setCurrency] = useState(doc.currency ?? 'SEK')
  const [docDate, setDocDate] = useState(doc.doc_date ?? '')
  const [dueDate, setDueDate] = useState(doc.due_date ?? '')
  const [invoiceNumber, setInvoiceNumber] = useState(doc.invoice_number ?? '')
  const [ocrNumber, setOcrNumber] = useState(doc.ocr_number ?? '')
  const [docType, setDocType] = useState(doc.doc_type ?? 'invoice')
  const [notes, setNotes] = useState(doc.notes ?? '')
  const [netAmount, setNetAmount] = useState(doc.net_amount !== null && doc.net_amount !== undefined ? String(doc.net_amount) : '')
  const [vatAmount, setVatAmount] = useState(doc.vat_amount !== null && doc.vat_amount !== undefined ? String(doc.vat_amount) : '')
  const [breakdown, setBreakdown] = useState<{ rate: string; net: string; vat: string }[]>(
    doc.vat_breakdown?.map((e: any) => ({ rate: String(e.rate), net: String(e.net), vat: String(e.vat) })) ?? [],
  )
  const matchable = label.isMatchable(docType)
  const hasVatData = (doc.vat_amount !== null && doc.vat_amount !== undefined) || (doc.net_amount !== null && doc.net_amount !== undefined)

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
      <Modal.Body>
        <div className="space-y-4">
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
              <label className="field-label">Typ</label>
              <Select.Root value={docType} onValueChange={(v: string | undefined) => setDocType(v ?? 'invoice')} size="2">
                <Select.Trigger variant="surface" className="w-full" />
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
            </div>
            <div>
              <label className="field-label">Part</label>
              <Select.Root value={partyId || undefined} onValueChange={(v: string | undefined) => setPartyId(v ?? '')} size="2">
                <Select.Trigger variant="surface" placeholder="— Ingen —" className="w-full" />
                <Select.Content>
                  {parties.map((p) => (
                    <Select.Item key={p.id} value={String(p.id)}>
                      {p.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>
            <div>
              <label className="field-label">Datum</label>
              <TextField.Root
                size="2"
                variant="surface"
                type="date"
                value={docDate}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDocDate(e.target.value)}
              />
            </div>
            {matchable && (
              <>
                <div>
                  <label className="field-label">Belopp</label>
                  <TextField.Root
                    size="2"
                    variant="surface"
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Valuta</label>
                  <Select.Root value={currency} onValueChange={(v: string | undefined) => setCurrency(v ?? 'SEK')} size="2">
                    <Select.Trigger variant="surface" className="w-full" />
                    <Select.Content>
                      <Select.Item value="SEK">SEK</Select.Item>
                      <Select.Item value="EUR">EUR</Select.Item>
                      <Select.Item value="USD">USD</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </div>
                <div>
                  <label className="field-label">Förfallodatum</label>
                  <TextField.Root
                    size="2"
                    variant="surface"
                    type="date"
                    value={dueDate}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setDueDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Fakturanummer</label>
                  <TextField.Root
                    size="2"
                    variant="surface"
                    value={invoiceNumber}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setInvoiceNumber(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">OCR-nummer</label>
                  <TextField.Root
                    size="2"
                    variant="surface"
                    value={ocrNumber}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setOcrNumber(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          <div>
            <label className="field-label">Anteckningar</label>
            <TextArea.Root
              size="2"
              variant="surface"
              rows={3}
              value={notes}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
            />
          </div>
          {(matchable || hasVatData || breakdown.length > 0) && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Netto (exkl. moms)</label>
                  <TextField.Root
                    size="2"
                    variant="surface"
                    type="number"
                    step="0.01"
                    value={netAmount}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNetAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Moms</label>
                  <TextField.Root
                    size="2"
                    variant="surface"
                    type="number"
                    step="0.01"
                    value={vatAmount}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setVatAmount(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="field-label">Momsuppdelning</label>
                {breakdown.length > 0 && (
                  <Table.Root size="1">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeaderCell className="w-24">Momssats %</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell className="w-32">Netto</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell className="w-32">Moms</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell className="w-8" />
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {breakdown.map((row, i) => {
                        const computedVat = row.rate && row.net
                          ? (Number(row.net) * Number(row.rate) / 100).toFixed(2)
                          : ''
                        return (
                          <Table.Row key={i}>
                            <Table.Cell>
                              <TextField.Root
                                size="1"
                                variant="surface"
                                type="number"
                                step="any"
                                className="w-20"
                                value={row.rate}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                  const next = [...breakdown]
                                  next[i] = { ...row, rate: e.target.value, vat: '' }
                                  setBreakdown(next)
                                }}
                              />
                            </Table.Cell>
                            <Table.Cell>
                              <TextField.Root
                                size="1"
                                variant="surface"
                                type="number"
                                step="0.01"
                                className="w-28"
                                value={row.net}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                  const next = [...breakdown]
                                  next[i] = { ...row, net: e.target.value, vat: '' }
                                  setBreakdown(next)
                                }}
                              />
                            </Table.Cell>
                            <Table.Cell className="tabular-nums text-sm text-base-content/70">
                              {computedVat}
                            </Table.Cell>
                            <Table.Cell>
                              <Button
                                variant="ghost"
                                size="1"
                                semantic="destructive"
                                onClick={() => setBreakdown(breakdown.filter((_, j) => j !== i))}
                                icon={<Trash2 />}
                              />
                            </Table.Cell>
                          </Table.Row>
                        )
                      })}
                    </Table.Body>
                  </Table.Root>
                )}
                <Button
                  variant="ghost"
                  size="1"
                  onClick={() => setBreakdown([...breakdown, { rate: '25', net: '0', vat: '' }])}
                  text="+ Lägg till rad"
                />
              </div>
            </div>
          )}
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="ghost" size="2" onClick={onCancel} text="Avbryt" />
        <Button
          semantic="action"
          size="2"
          onClick={handleSave}
          disabled={isPending}
          loading={isPending}
          text="Spara"
        />
      </Modal.Footer>
    </>
  )
}

function MatchTransactionSection({
  doc,
  onMatched,
}: {
  doc: any;
  onMatched: () => void;
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

  const doSearch = useCallback(async (q?: string) => {
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
  }, [doc.amount, doc.company_id, doc.doc_date, doc.doc_type])

  // Auto-search on mount if we have an amount
  useEffect(() => {
    if (doc.amount !== null && doc.amount !== undefined) {
      void doSearch()
    }
  }, [doc.amount, doSearch])

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
        <TextField.Root
          size="2"
          variant="surface"
          className="flex-1"
          placeholder="Sök referens..."
          value={searchQuery}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') doSearch(searchQuery)
          }}
        >
          <TextField.Slot side="left">
            <Search className="w-3.5 h-3.5 opacity-30" />
          </TextField.Slot>
        </TextField.Root>
        <Button
          variant="ghost"
          size="2"
          onClick={() => doSearch(searchQuery)}
          disabled={isSearching}
          loading={isSearching}
          text="Sök"
        />
      </div>

      {/* Results */}
      {hasSearched && candidates.length === 0 && (
        <p className="text-xs text-base-content/40 py-1">
          Inga matchande transaktioner hittades.
        </p>
      )}
      {candidates.length > 0 && (
        <div className="overflow-x-auto max-h-48 overflow-y-auto">
          <Table.Root size="1">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Datum</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Referens</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell justify="end">Belopp</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Konto</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {candidates.map((txn) => (
                <Table.Row key={txn.id}>
                  <Table.Cell className="text-nowrap">
                    {txn.date}
                    {doc.doc_date && txn.date && (() => {
                      const diff = Math.round((new Date(txn.date).getTime() - new Date(doc.doc_date).getTime()) / 86400000)
                      return (
                        <span className="ml-1 text-base-content/30">
                          ({diff >= 0 ? '+' : ''}{diff})
                        </span>
                      )
                    })()}
                  </Table.Cell>
                  <Table.Cell className="max-w-40 truncate" title={txn.reference}>
                    {txn.reference}
                  </Table.Cell>
                  <Table.Cell justify="end" className="tabular-nums text-nowrap">
                    {Number(txn.amount).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr
                  </Table.Cell>
                  <Table.Cell className="text-nowrap">{txn.account_name}</Table.Cell>
                  <Table.Cell>
                    <Button
                      variant="ghost"
                      size="1"
                      semantic="action"
                      onClick={() => matchMutation.mutate(txn.id)}
                      disabled={matchMutation.isPending}
                      icon={<LinkIcon />}
                      text="Matcha"
                    />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </div>
      )}
    </div>
  )
}

function Field({
  label: lbl,
  value,
}: {
  label: string;
  value: string | null | undefined;
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
