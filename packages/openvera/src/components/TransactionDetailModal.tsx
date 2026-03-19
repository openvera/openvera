import { Modal } from '@swedev/ui'
import { useQuery } from '@tanstack/react-query'

import { getTransaction } from '../api/transactions'
import { label } from '../labels'

interface Props {
  txnId: number | null;
  onClose: () => void;
}

export default function TransactionDetailModal({ txnId, onClose }: Props) {
  const open = txnId !== null

  const { data: txn, isLoading } = useQuery({
    queryKey: ['transaction', txnId],
    queryFn: () => getTransaction(txnId!),
    enabled: open,
  })

  return (
    <Modal.Root open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      {open && (
        <>
          <Modal.Header
            title={
              isLoading
                ? 'Laddar...'
                : `#${txn?.id ?? ''} ${txn?.reference ?? 'Transaktion'}`
            }
            closeButton
            onClose={onClose}
          />

          <Modal.Body>
            {isLoading || !txn
              ? (
                  <div className="flex justify-center py-12">
                    <span className="loading loading-spinner loading-md" />
                  </div>
                )
              : (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
                    <dt className="text-base-content/50">Datum</dt>
                    <dd className="tabular-nums">{txn.date}</dd>

                    <dt className="text-base-content/50">Referens</dt>
                    <dd>{txn.reference}</dd>

                    <dt className="text-base-content/50">Belopp</dt>
                    <dd className="tabular-nums">
                      {Number(txn.amount).toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr
                    </dd>

                    <dt className="text-base-content/50">Konto</dt>
                    <dd>{txn.account_name || '—'}</dd>

                    {txn.company_name && (
                      <>
                        <dt className="text-base-content/50">Företag</dt>
                        <dd>{txn.company_name}</dd>
                      </>
                    )}

                    <dt className="text-base-content/50">Kontokod</dt>
                    <dd className="tabular-nums">
                      {txn.accounting_code
                        ? `${txn.accounting_code} ${txn.accounting_code_name ?? ''}`
                        : '—'}
                    </dd>

                    <dt className="text-base-content/50">Kategori</dt>
                    <dd>{label.category(txn.category)}</dd>

                    <dt className="text-base-content/50">Intern överföring</dt>
                    <dd>{txn.is_internal_transfer ? 'Ja' : 'Nej'}</dd>

                    <dt className="text-base-content/50">Behöver underlag</dt>
                    <dd>{txn.needs_receipt ? 'Ja' : 'Nej'}</dd>

                    {txn.notes && (
                      <>
                        <dt className="text-base-content/50">Anteckningar</dt>
                        <dd className="whitespace-pre-wrap">{txn.notes}</dd>
                      </>
                    )}
                  </dl>
                )}
          </Modal.Body>
        </>
      )}
    </Modal.Root>
  )
}
