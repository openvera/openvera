import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, CheckCircle, Link as LinkIcon, Pencil, RefreshCw, Trash2, XCircle } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  AmountCell,
  ConfirmDialog,
  DateCell,
  DocumentDetailModal,
  FormModal,
  deleteTransaction,
  getBasAccounts,
  getTransaction,
  getTransactionMatches,
  label,
  updateTransaction,
  type Transaction,
} from 'openvera'

export default function TransactionDetail() {
  const { transactionId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const id = Number(transactionId)

  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [detailDocId, setDetailDocId] = useState<number | null>(null)
  const editActions = useRef<{ submit: () => void; canSubmit: boolean } | null>(
    null,
  )

  const { data: txn, isLoading } = useQuery({
    queryKey: ['transaction', id],
    queryFn: () => getTransaction(id),
  })

  const { data: matchData } = useQuery({
    queryKey: ['transaction-matches', id],
    queryFn: () => getTransactionMatches(id),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['transaction', id] })
    queryClient.invalidateQueries({ queryKey: ['transaction-matches', id] })
  }

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateTransaction>[1]) =>
      updateTransaction(id, data),
    onSuccess: () => {
      setShowEdit(false)
      invalidate()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company'] })
      navigate('/transactions')
    },
  })

  if (isLoading || !txn) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    )
  }

  const matches = matchData?.matches ?? []

  const allReviewed = matches.length > 0 && matches.every((m) => m.reviewed_at)

  const statusBadge = txn.is_internal_transfer ? (
    <span className="badge badge-ghost badge-sm gap-1">
      <RefreshCw className="w-3 h-3" />
      Överföring
    </span>
  ) : txn.is_matched && allReviewed ? (
    <span className="badge badge-success badge-sm gap-1">
      <CheckCircle className="w-3 h-3" />
      Matchad
    </span>
  ) : txn.is_matched ? (
    <span className="badge badge-info badge-sm gap-1">
      <LinkIcon className="w-3 h-3" />
      Matchad{matches[0]?.confidence ? ` ${matches[0].confidence}%` : ''}
    </span>
  ) : txn.needs_receipt === 0 ? null : (
    <span className="badge badge-error badge-sm gap-1">
      <XCircle className="w-3 h-3" />
      Ej matchad
    </span>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm btn-square">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="page-title">
              <span className="text-base-content/40 mr-2">#{txn.id}</span>
              {txn.reference}
            </h1>
            {statusBadge}
          </div>
        </div>
        <span className="text-lg font-semibold tabular-nums">
          <AmountCell amount={txn.amount} />
        </span>
        <button
          className="btn btn-ghost btn-sm gap-1"
          onClick={() => setShowEdit(true)}
        >
          <Pencil className="w-4 h-4" />
          Redigera
        </button>
        <button
          className="btn btn-ghost btn-sm gap-1 text-red-400 hover:text-red-600"
          onClick={() => setShowDelete(true)}
        >
          <Trash2 className="w-4 h-4" />
          Ta bort
        </button>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${matches.length > 0 || txn.needs_receipt !== 0 ? 'lg:grid-cols-2' : ''}`}>
        {/* Info card */}
        <div className="bg-base-100 rounded-xl shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
            Information
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-base-content/50">Datum</dt>
            <dd className="tabular-nums">
              <DateCell date={txn.date} />
            </dd>

            <dt className="text-base-content/50">Referens</dt>
            <dd>{txn.reference}</dd>

            <dt className="text-base-content/50">Belopp</dt>
            <dd className="tabular-nums">
              <AmountCell amount={txn.amount} />
            </dd>

            <dt className="text-base-content/50">Konto</dt>
            <dd>
              {txn.account_name ? (
                <Link
                  to={`/transactions?account=${txn.account_id}`}
                  className="link link-hover link-primary text-sm"
                >
                  {txn.account_name}
                </Link>
              ) : (
                '—'
              )}
            </dd>

            <dt className="text-base-content/50">Företag</dt>
            <dd>
              {txn.company_name ? (
                <Link
                  to={`/settings?company=${txn.company_slug}`}
                  className="link link-hover link-primary text-sm"
                >
                  {txn.company_name}
                </Link>
              ) : (
                '—'
              )}
            </dd>

            <dt className="text-base-content/50">Kontokod</dt>
            <dd className="tabular-nums">
              {txn.accounting_code
                ? <>
                    {txn.accounting_code}
                    {' '}
                    <span className="text-base-content/40">{txn.accounting_code_name}</span>
                  </>
                : '—'}
            </dd>

            <dt className="text-base-content/50">Kategori</dt>
            <dd>{label.category(txn.category)}</dd>

            <dt className="text-base-content/50">Intern överföring</dt>
            <dd>{txn.is_internal_transfer ? 'Ja' : 'Nej'}</dd>

            <dt className="text-base-content/50">Behöver underlag</dt>
            <dd>{txn.needs_receipt ? 'Ja' : 'Nej'}</dd>

            <dt className="text-base-content/50">Anteckningar</dt>
            <dd>{txn.notes || '—'}</dd>
          </dl>
        </div>

        {/* Matched documents — hide when empty and no documentation needed */}
        {(matches.length > 0 || txn.needs_receipt !== 0) && <div className="bg-base-100 rounded-xl shadow-sm p-5 space-y-4 self-start">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
            Matchade dokument
            {matches.length > 0 && (
              <span className="badge badge-sm badge-ghost ml-2">
                {matches.length}
              </span>
            )}
          </h2>
          {matches.length === 0 ? (
            <p className="text-sm text-base-content/40">Inga matchade dokument</p>
          ) : (
            <div className="space-y-3">
              {matches.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-base-200 p-4 hover:bg-base-200/30 cursor-pointer transition-colors"
                  onClick={() => setDetailDocId(m.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{m.party_name || '—'}</span>
                    <span className="badge badge-ghost badge-sm">
                      {label.docType(m.doc_type)}
                    </span>
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <dt className="text-base-content/50">Belopp</dt>
                    <dd className="tabular-nums">
                      {m.amount != null ? (
                        <AmountCell
                          amount={m.amount}
                          currency={m.currency ?? undefined}
                        />
                      ) : (
                        '—'
                      )}
                    </dd>
                    {m.net_amount != null && m.vat_amount != null && (
                      <>
                        <dt className="text-base-content/50">Netto</dt>
                        <dd className="tabular-nums">
                          {Number(m.net_amount).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} {m.currency ?? 'SEK'}
                        </dd>
                        <dt className="text-base-content/50">Moms</dt>
                        <dd className="tabular-nums">
                          {Number(m.vat_amount).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} {m.currency ?? 'SEK'}
                        </dd>
                      </>
                    )}
                    <dt className="text-base-content/50">Datum</dt>
                    <dd className="tabular-nums">
                      {m.doc_date ? <DateCell date={m.doc_date} /> : '—'}
                    </dd>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </div>}
      </div>

      {/* Edit modal */}
      <FormModal
        open={showEdit}
        title="Redigera transaktion"
        onClose={() => setShowEdit(false)}
        footer={
          <>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowEdit(false)}
            >
              Avbryt
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => editActions.current?.submit()}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                'Spara'
              )}
            </button>
          </>
        }
      >
        <TransactionForm
          txn={txn}
          onSave={(data) => updateMutation.mutate(data)}
          onActionsReady={(a) => {
            editActions.current = a
          }}
        />
      </FormModal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={showDelete}
        title="Ta bort transaktion"
        message={`Vill du ta bort transaktion #${txn.id} "${txn.reference}" permanent? Alla matchningar och överföringslänkar tas också bort.`}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setShowDelete(false)}
      />

      {/* Document detail modal */}
      <DocumentDetailModal
        docId={detailDocId}
        onClose={() => setDetailDocId(null)}
        onUpdated={invalidate}
      />
    </div>
  )
}

function TransactionForm({
  txn,
  onSave,
  onActionsReady,
}: {
  txn: Transaction
  onSave: (data: Parameters<typeof updateTransaction>[1]) => void
  onActionsReady: (actions: { submit: () => void; canSubmit: boolean }) => void
}) {
  const { data: basAccounts = [] } = useQuery({
    queryKey: ['bas-accounts'],
    queryFn: getBasAccounts,
  })

  const [accountingCode, setAccountingCode] = useState(
    txn.accounting_code ?? '',
  )
  const [category, setCategory] = useState(txn.category ?? '')
  const [notes, setNotes] = useState(txn.notes ?? '')
  const [isTransfer, setIsTransfer] = useState(!!txn.is_internal_transfer)
  const [needsReceipt, setNeedsReceipt] = useState(!!txn.needs_receipt)

  const submit = () => {
    onSave({
      accounting_code: accountingCode || null,
      category: category || null,
      notes: notes || null,
      is_internal_transfer: isTransfer ? 1 : 0,
      needs_receipt: needsReceipt ? 1 : 0,
    })
  }

  onActionsReady({ submit, canSubmit: true })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label text-sm">Kontokod</label>
          <select
            className="select select-bordered select-sm w-full"
            value={accountingCode}
            onChange={(e) => setAccountingCode(e.target.value)}
          >
            <option value="">— Ingen —</option>
            {basAccounts.map((ba) => (
              <option key={ba.code} value={ba.code}>
                {ba.code} {ba.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label text-sm">Kategori</label>
          <select
            className="select select-bordered select-sm w-full"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">— Ingen —</option>
            <option value="expense">Utgift</option>
            <option value="income">Intäkt</option>
            <option value="transfer">Överföring</option>
            <option value="salary">Lön</option>
          </select>
        </div>
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
      <div className="flex gap-6">
        <label className="label cursor-pointer gap-2">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={isTransfer}
            onChange={(e) => setIsTransfer(e.target.checked)}
          />
          <span className="text-sm">Intern överföring</span>
        </label>
        <label className="label cursor-pointer gap-2">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={needsReceipt}
            onChange={(e) => setNeedsReceipt(e.target.checked)}
          />
          <span className="text-sm">Behöver underlag</span>
        </label>
      </div>
    </div>
  )
}
