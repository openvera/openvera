import { type ChangeEvent, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Link as RadixLink, Spinner } from '@radix-ui/themes'
import { Badge, Button, LabelledCheckbox, Select, TextArea } from '@swedev/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle, Link as LinkIcon, Pencil, RefreshCw, Trash2, XCircle } from 'lucide-react'
import {
  AmountCell,
  cn,
  ConfirmDialog,
  DateCell,
  deleteTransaction,
  DocumentDetailModal,
  FormModal,
  getBasAccounts,
  getTransaction,
  getTransactionMatches,
  label,
  type Transaction,
  updateTransaction,
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
        <Spinner size="3" />
      </div>
    )
  }

  const matches = matchData?.matches ?? []

  const allReviewed = matches.length > 0 && matches.every((m) => m.reviewed_at)

  const statusBadge = txn.is_internal_transfer
    ? (
        <Badge semantic="neutral"><RefreshCw className="w-3 h-3" />Överföring</Badge>
      )
    : txn.is_matched && allReviewed
      ? (
          <Badge semantic="success"><CheckCircle className="w-3 h-3" />Matchad</Badge>
        )
      : txn.is_matched
        ? (
            <Badge semantic="info"><LinkIcon className="w-3 h-3" />Matchad{matches[0]?.confidence ? ` ${matches[0].confidence}%` : ''}</Badge>
          )
        : txn.needs_receipt === 0
          ? null
          : (
              <Badge semantic="error"><XCircle className="w-3 h-3" />Ej matchad</Badge>
            )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="2"
          onClick={() => navigate(-1)}
          icon={<ArrowLeft />}
        />
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
        <Button
          variant="ghost"
          size="2"
          onClick={() => setShowEdit(true)}
          icon={<Pencil />}
          text="Redigera"
        />
        <Button
          variant="ghost"
          size="2"
          semantic="destructive"
          onClick={() => setShowDelete(true)}
          icon={<Trash2 />}
          text="Ta bort"
        />
      </div>

      <div className={cn('grid grid-cols-1 gap-6', { 'lg:grid-cols-2': matches.length > 0 || txn.needs_receipt !== 0 })}>
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
              {txn.account_name
                ? (
                    <RadixLink underline="hover" size="2" asChild>
                      <Link to={`/transactions?account=${txn.account_id}`}>
                        {txn.account_name}
                      </Link>
                    </RadixLink>
                  )
                : (
                    '—'
                  )}
            </dd>

            <dt className="text-base-content/50">Företag</dt>
            <dd>
              {txn.company_name
                ? (
                    <RadixLink underline="hover" size="2" asChild>
                      <Link to={`/settings?company=${txn.company_slug}`}>
                        {txn.company_name}
                      </Link>
                    </RadixLink>
                  )
                : (
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
        {(matches.length > 0 || txn.needs_receipt !== 0) && (
          <div className="bg-base-100 rounded-xl shadow-sm p-5 space-y-4 self-start">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
              Matchade dokument
              {matches.length > 0 && (
                <Badge semantic="neutral" ml="2" text={matches.length} />
              )}
            </h2>
            {matches.length === 0
              ? (
                  <p className="text-sm text-base-content/40">Inga matchade dokument</p>
                )
              : (
                  <div className="space-y-3">
                    {matches.map((m) => (
                      <div
                        key={m.id}
                        className="rounded-lg border border-base-200 p-4 hover:bg-base-200/30 cursor-pointer transition-colors"
                        onClick={() => setDetailDocId(m.id)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{m.party_name || '—'}</span>
                          <Badge semantic="neutral" text={label.docType(m.doc_type)} />
                        </div>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                          <dt className="text-base-content/50">Belopp</dt>
                          <dd className="tabular-nums">
                            {m.amount !== null
                              ? (
                                  <AmountCell
                                    amount={m.amount}
                                    currency={m.currency ?? undefined}
                                  />
                                )
                              : (
                                  '—'
                                )}
                          </dd>
                          {m.net_amount !== null && m.vat_amount !== null && (
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
          </div>
        )}
      </div>

      {/* Edit modal */}
      <FormModal
        open={showEdit}
        title="Redigera transaktion"
        onClose={() => setShowEdit(false)}
        footer={
          <>
            <Button
              variant="ghost"
              size="2"
              onClick={() => setShowEdit(false)}
              text="Avbryt"
            />
            <Button
              semantic="action"
              size="2"
              onClick={() => editActions.current?.submit()}
              disabled={updateMutation.isPending}
              loading={updateMutation.isPending}
              text="Spara"
            />
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
  txn: Transaction;
  onSave: (data: Parameters<typeof updateTransaction>[1]) => void;
  onActionsReady: (actions: { submit: () => void; canSubmit: boolean }) => void;
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
          <Select.Root value={accountingCode || undefined} onValueChange={(v: string | undefined) => setAccountingCode(v === '__clear__' ? '' : (v ?? ''))} size="2">
            <Select.Trigger variant="surface" placeholder="— Ingen —" />
            <Select.Content>
              <Select.Item value="__clear__">— Ingen —</Select.Item>
              {basAccounts.map((ba) => (
                <Select.Item key={ba.code} value={ba.code}>
                  {ba.code} {ba.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </div>
        <div>
          <label className="label text-sm">Kategori</label>
          <Select.Root value={category || undefined} onValueChange={(v: string | undefined) => setCategory(v === '__clear__' ? '' : (v ?? ''))} size="2">
            <Select.Trigger variant="surface" placeholder="— Ingen —" />
            <Select.Content>
              <Select.Item value="__clear__">— Ingen —</Select.Item>
              <Select.Item value="expense">Utgift</Select.Item>
              <Select.Item value="income">Intäkt</Select.Item>
              <Select.Item value="transfer">Överföring</Select.Item>
              <Select.Item value="salary">Lön</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
      </div>
      <div>
        <label className="label text-sm">Anteckningar</label>
        <TextArea.Root size="2" variant="surface" rows={3} value={notes} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} />
      </div>
      <div className="flex gap-6">
        <LabelledCheckbox
          size="2"
          checked={isTransfer}
          onCheckedChange={(v: boolean | 'indeterminate') => setIsTransfer(v === true)}
          label="Intern överföring"
        />
        <LabelledCheckbox
          size="2"
          checked={needsReceipt}
          onCheckedChange={(v: boolean | 'indeterminate') => setNeedsReceipt(v === true)}
          label="Behöver underlag"
        />
      </div>
    </div>
  )
}
