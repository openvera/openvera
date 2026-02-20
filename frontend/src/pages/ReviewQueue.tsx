import { ArrowRight, CheckCircle, ClipboardCheck, PartyPopper, XCircle } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getDocuments, reviewDocument } from '../api/documents'
import { createMatch, getMatches, unmatch } from '../api/matches'
import AmountCell from '../components/AmountCell'
import DateCell from '../components/DateCell'
import EmptyState from '../components/EmptyState'
import { useCompany } from '../hooks/useCompany'
import { label } from '../labels'

export default function ReviewQueue() {
  const { selected } = useCompany()
  const queryClient = useQueryClient()

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
  }

  const approveMutation = useMutation({
    mutationFn: (match: { transaction_id: number; document_id: number }) =>
      createMatch({
        transaction_id: match.transaction_id,
        document_id: match.document_id,
        match_type: 'approved',
      }),
    onSuccess: invalidateAll,
  })

  const rejectMutation = useMutation({
    mutationFn: (match: { transaction_id: number; document_id: number }) =>
      unmatch(match.transaction_id, match.document_id),
    onSuccess: invalidateAll,
  })

  const reviewMutation = useMutation({
    mutationFn: (id: number) => reviewDocument(id),
    onSuccess: invalidateAll,
  })

  const isLoading = matchesLoading || docsLoading

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

  const suggested = matches.filter(
    (m) => m.match_type === 'suggested' || m.match_type === 'auto',
  )

  const unreviewedDocs = documents.filter(
    (d) => !d.reviewed_at && !d.is_matched && !d.is_archived,
  )

  const totalItems = suggested.length + unreviewedDocs.length

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
        <span className="badge badge-primary tabular-nums">
          {totalItems} att granska
        </span>
      </div>

      {/* Suggested matches */}
      {suggested.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
            Föreslagna matchningar
          </h2>
          <div className="grid gap-4">
            {suggested.map((match) => (
              <div
                key={match.id}
                className="bg-base-100 rounded-xl shadow-sm overflow-hidden"
              >
                <div className="p-5">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-6 items-start">
                    {/* Transaction side */}
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-base-content/40">
                        Transaktion
                      </p>
                      <p className="font-medium truncate">{match.reference}</p>
                      <p className="tabular-nums text-base-content/60">
                        <DateCell date={match.transaction_date} />
                      </p>
                      <p>
                        <AmountCell amount={match.amount} />
                      </p>
                    </div>

                    {/* Arrow separator */}
                    <div className="hidden md:flex items-center justify-center h-full pt-4">
                      <div className="w-10 h-10 rounded-full bg-base-200/50 flex items-center justify-center">
                        <ArrowRight className="w-4 h-4 text-base-content/30" />
                      </div>
                    </div>

                    {/* Document side */}
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-base-content/40">
                        Dokument
                      </p>
                      <p className="font-medium">{match.party_name ?? '—'}</p>
                      <p className="tabular-nums text-base-content/60">
                        <DateCell date={match.doc_date} />
                      </p>
                      {match.doc_amount != null && (
                        <p className="tabular-nums">
                          <AmountCell amount={match.doc_amount} currency={match.doc_currency ?? undefined} />
                        </p>
                      )}
                      {match.doc_net_amount != null && match.doc_vat_amount != null && (
                        <p className="text-xs text-base-content/50 tabular-nums">
                          netto {Math.abs(match.doc_net_amount).toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
                          {' + moms '}
                          {Math.abs(match.doc_vat_amount).toLocaleString('sv-SE', { minimumFractionDigits: 2 })}
                          {match.doc_currency ? ` ${match.doc_currency}` : ''}
                        </p>
                      )}
                      <span className="badge badge-ghost badge-sm">
                        {label.docType(match.doc_type)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action footer */}
                <div className="flex items-center justify-between px-5 py-3 bg-base-200/30 border-t border-base-200">
                  <div>
                    {match.confidence && (
                      <span className="badge badge-info badge-sm tabular-nums">
                        {match.confidence}% konfidens
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-sm btn-ghost gap-1 text-base-content/60 hover:text-red-600"
                      onClick={() =>
                        rejectMutation.mutate({
                          transaction_id: match.transaction_id,
                          document_id: match.document_id,
                        })
                      }
                      disabled={rejectMutation.isPending}
                    >
                      <XCircle className="w-4 h-4" />
                      Avvisa
                    </button>
                    <button
                      className="btn btn-sm btn-success gap-1"
                      onClick={() =>
                        approveMutation.mutate({
                          transaction_id: match.transaction_id,
                          document_id: match.document_id,
                        })
                      }
                      disabled={approveMutation.isPending}
                    >
                      <CheckCircle className="w-4 h-4" />
                      Godkänn
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Unreviewed documents */}
      {unreviewedDocs.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
            Ogranskade dokument
            <span className="ml-2 tabular-nums text-base-content/40">
              ({unreviewedDocs.length})
            </span>
          </h2>
          <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="tabular-nums text-base-content/40 w-12">ID</th>
                    <th>Leverantör</th>
                    <th className="text-right">Belopp</th>
                    <th>Datum</th>
                    <th>Typ</th>
                    <th>Åtgärd</th>
                  </tr>
                </thead>
                <tbody>
                  {unreviewedDocs.map((doc) => (
                    <tr key={doc.id} className="hover">
                      <td className="tabular-nums text-base-content/40">{doc.id}</td>
                      <td className="font-medium">
                        {doc.party_name ?? '—'}
                      </td>
                      <td className="text-right">
                        <AmountCell amount={doc.amount_sek ?? doc.amount} />
                      </td>
                      <td className="tabular-nums">
                        <DateCell date={doc.doc_date} />
                      </td>
                      <td>
                        <span className="badge badge-ghost badge-sm">
                          {label.docType(doc.doc_type)}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-ghost gap-1"
                          onClick={() => reviewMutation.mutate(doc.id)}
                          disabled={reviewMutation.isPending}
                        >
                          <ClipboardCheck className="w-4 h-4" />
                          Markera granskad
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
