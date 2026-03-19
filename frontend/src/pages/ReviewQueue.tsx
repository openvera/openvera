import { useState } from 'react'
import { Spinner } from '@radix-ui/themes'
import { Badge, Button, Table } from '@swedev/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, ClipboardCheck, PartyPopper, XCircle } from 'lucide-react'
import {
  AmountCell,
  approveMatch,
  DateCell,
  DocumentDetailModal,
  EmptyState,
  getDocuments,
  getMatches,
  label,
  TransactionDetailModal,
  unmatch,
  useCompany,
  verifyDocumentData,
} from 'openvera'

type ReviewTab = 'data' | 'matches'

export default function ReviewQueue() {
  const { selected } = useCompany()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<ReviewTab>('data')
  const [detailDocId, setDetailDocId] = useState<number | null>(null)
  const [detailTxnId, setDetailTxnId] = useState<number | null>(null)

  const { data: matches = [], isLoading: matchesLoading } = useQuery({
    queryKey: ['matches', selected?.slug],
    queryFn: () => getMatches({ company_slug: selected?.slug }),
    enabled: !!selected,
  })

  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ['documents-review', selected?.id],
    queryFn: () => getDocuments({ company_id: selected!.id }),
    enabled: !!selected,
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['matches'] })
    queryClient.invalidateQueries({ queryKey: ['documents-review'] })
    queryClient.invalidateQueries({ queryKey: ['documents'] })
  }

  const approveMutation = useMutation({
    mutationFn: (matchId: number) => approveMatch(matchId),
    onSuccess: invalidateAll,
  })

  const rejectMutation = useMutation({
    mutationFn: (match: { transaction_id: number; document_id: number }) =>
      unmatch(match.transaction_id, match.document_id),
    onSuccess: invalidateAll,
  })

  useMutation({
    mutationFn: (id: number) => verifyDocumentData(id),
    onSuccess: invalidateAll,
  })

  const isLoading = matchesLoading || docsLoading

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

  const pendingDataVerification = documents.filter(
    (doc) => !doc.data_verified_at && !doc.is_archived,
  )

  const pendingMatchApprovals = matches.filter(
    (match) => !match.approved_at && !!match.data_verified_at,
  )

  const blockedMatchApprovals = matches.filter(
    (match) => !match.approved_at && !match.data_verified_at,
  )

  const totalItems = pendingDataVerification.length + pendingMatchApprovals.length

  if (totalItems === 0) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Granska</h1>
        <EmptyState
          title="Allt klart!"
          description="Det finns inga objekt att granska just nu."
          icon={PartyPopper}
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <h1 className="page-title">Granska</h1>
        <Badge className="tabular-nums">{totalItems} att granska</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="2"
          variant={activeTab === 'data' ? 'solid' : 'ghost'}
          semantic={activeTab === 'data' ? 'action' : undefined}
          onClick={() => setActiveTab('data')}
          text={`PDF-data (${pendingDataVerification.length})`}
        />
        <Button
          size="2"
          variant={activeTab === 'matches' ? 'solid' : 'ghost'}
          semantic={activeTab === 'matches' ? 'action' : undefined}
          onClick={() => setActiveTab('matches')}
          text={`Matchningar (${pendingMatchApprovals.length})`}
        />
      </div>

      {activeTab === 'matches' && blockedMatchApprovals.length > 0 && (
        <p className="text-sm text-base-content/50">
          {blockedMatchApprovals.length} matchningar väntar fortfarande på dataverifiering av dokumentet.
        </p>
      )}

      {activeTab === 'matches' && pendingMatchApprovals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
            Matchningar att godkänna
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {pendingMatchApprovals.map((match) => (
              <div
                key={match.id}
                className="bg-base-100 rounded-xl shadow-sm overflow-hidden flex flex-col"
              >
                <div className="grid grid-cols-[1fr_auto_1fr] flex-1">
                  {/* Document (left) */}
                  <div
                    className="px-4 py-3 hover:bg-base-200/40 transition-colors space-y-0.5 cursor-pointer"
                    onClick={() => setDetailDocId(match.document_id)}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-base-content/40">
                      Dokument
                    </p>
                    <p className="font-medium truncate">{match.party_name ?? '—'}</p>
                    <p className="text-sm tabular-nums text-base-content/60">
                      <DateCell date={match.doc_date} />
                    </p>
                    {match.doc_amount !== null && (
                      <p className="text-sm tabular-nums">
                        <AmountCell amount={match.doc_amount} currency={match.doc_currency ?? undefined} />
                      </p>
                    )}
                    {match.doc_net_amount !== null && match.doc_vat_amount !== null && (
                      <p className="text-xs text-base-content/40 tabular-nums">
                        netto {Math.abs(match.doc_net_amount).toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
                        {' + moms '}
                        {Math.abs(match.doc_vat_amount).toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
                      </p>
                    )}
                    <Badge semantic="neutral" text={label.docType(match.doc_type)} />
                  </div>

                  {/* Divider */}
                  <div className="flex items-center">
                    <div className="w-px h-full bg-base-200" />
                  </div>

                  {/* Transaction (right) */}
                  <div
                    className="px-4 py-3 hover:bg-base-200/40 transition-colors space-y-0.5 cursor-pointer"
                    onClick={() => setDetailTxnId(match.transaction_id)}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-base-content/40">
                      Transaktion
                    </p>
                    <p className="font-medium truncate">{match.reference}</p>
                    <p className="text-sm tabular-nums text-base-content/60">
                      <DateCell date={match.transaction_date} />
                    </p>
                    <p className="text-sm tabular-nums">
                      <AmountCell amount={match.amount} />
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between px-4 py-2 bg-base-200/30 border-t border-base-200 mt-auto">
                  {match.confidence
                    ? <Badge semantic="info" className="tabular-nums">{match.confidence}% konfidens</Badge>
                    : <span />}
                  <div className="flex gap-1.5">
                    <Button
                      variant="ghost"
                      size="1"
                      semantic="destructive"
                      onClick={() => rejectMutation.mutate({ transaction_id: match.transaction_id, document_id: match.document_id })}
                      disabled={rejectMutation.isPending}
                      icon={<XCircle />}
                      text="Avvisa"
                    />
                    <Button
                      semantic="success"
                      size="1"
                      onClick={() => approveMutation.mutate(match.id)}
                      disabled={approveMutation.isPending}
                      icon={<CheckCircle />}
                      text="Godkänn"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'data' && pendingDataVerification.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
            Dokument att verifiera
            <span className="ml-2 tabular-nums text-base-content/40">
              ({pendingDataVerification.length})
            </span>
          </h2>
          <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <Table.Root size="2">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell className="tabular-nums text-base-content/40 w-12">ID</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Leverantör</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Belopp</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Datum</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Typ</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Åtgärd</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {pendingDataVerification.map((doc) => (
                    <Table.Row
                      key={doc.id}
                      className="cursor-pointer"
                      onClick={() => setDetailDocId(doc.id)}
                    >
                      <Table.Cell className="tabular-nums text-base-content/40">{doc.id}</Table.Cell>
                      <Table.Cell className="font-medium">
                        {doc.party_name ?? '—'}
                      </Table.Cell>
                      <Table.Cell justify="end">
                        <AmountCell amount={doc.amount_sek ?? doc.amount} />
                      </Table.Cell>
                      <Table.Cell className="tabular-nums">
                        <DateCell date={doc.doc_date} />
                      </Table.Cell>
                      <Table.Cell>
                        <Badge semantic="neutral" text={label.docType(doc.doc_type)} />
                      </Table.Cell>
                      <Table.Cell>
                        <Button
                          variant="ghost"
                          size="1"
                          onClick={() => setDetailDocId(doc.id)}
                          icon={<ClipboardCheck />}
                          text="Granska"
                        />
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'data' && pendingDataVerification.length === 0 && (
        <EmptyState
          title="Ingen PDF-data att verifiera"
          description="Alla dokument i kön har redan verifierad data."
        />
      )}

      {activeTab === 'matches' && pendingMatchApprovals.length === 0 && (
        <EmptyState
          title="Inga matchningar att godkänna"
          description="Det finns inga verifierade dokument med väntande matchgodkännande."
        />
      )}

      <DocumentDetailModal
        docId={detailDocId}
        onClose={() => setDetailDocId(null)}
        onUpdated={invalidateAll}
      />
      <TransactionDetailModal
        txnId={detailTxnId}
        onClose={() => setDetailTxnId(null)}
      />
    </div>
  )
}
