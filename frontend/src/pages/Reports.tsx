import { useState } from 'react'
import { FileOutput } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { getReport, getVatReport, getSieExportUrl } from '../api/reports'
import AmountCell from '../components/AmountCell'
import EmptyState from '../components/EmptyState'
import { useCompany } from '../hooks/useCompany'

export default function Reports() {
  const { selected } = useCompany()
  const currentYear = new Date().getFullYear()
  const [from, setFrom] = useState(`${currentYear}-01-01`)
  const [to, setTo] = useState(`${currentYear}-12-31`)

  const { data: report, isLoading } = useQuery({
    queryKey: ['report', selected?.id, from, to],
    queryFn: () => getReport({ company_id: selected!.id, from, to }),
    enabled: !!selected,
  })

  const { data: vatReport } = useQuery({
    queryKey: ['vat-report', selected?.id, from, to],
    queryFn: () => getVatReport({ company_id: selected!.id, from, to }),
    enabled: !!selected,
  })

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Rapporter</h1>
        <a
          href={getSieExportUrl(selected.id, currentYear)}
          className="btn btn-sm btn-outline gap-1"
          download
        >
          <FileOutput className="w-4 h-4" />
          Exportera SIE4
        </a>
      </div>

      <div className="flex gap-3 items-end">
        <div>
          <label className="label text-sm">Från</label>
          <input
            type="date"
            className="input input-bordered input-sm"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="label text-sm">Till</label>
          <input
            type="date"
            className="input input-bordered input-sm"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      {report && (
        <>
          {/* Summary stats */}
          <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-3 divide-x divide-base-200">
              <div className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-base-content/50 mb-1">
                  Intäkter
                </p>
                <p className="text-xl font-bold text-emerald-600 tabular-nums">
                  <AmountCell amount={report.total_income} />
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-base-content/50 mb-1">
                  Kostnader
                </p>
                <p className="text-xl font-bold text-red-600 tabular-nums">
                  <AmountCell amount={report.total_expenses} />
                </p>
              </div>
              <div className="p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-base-content/50 mb-1">
                  Netto
                </p>
                <p className="text-xl font-bold tabular-nums">
                  <AmountCell
                    amount={report.total_income + report.total_expenses}
                  />
                </p>
              </div>
            </div>
          </div>

          {report.by_period.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
                Per period
              </h2>
              <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th className="text-right">Intäkter</th>
                        <th className="text-right">Kostnader</th>
                        <th className="text-right">Netto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.by_period.map((p) => (
                        <tr key={p.period}>
                          <td className="font-medium">{p.period}</td>
                          <td className="text-right">
                            <AmountCell amount={p.income} />
                          </td>
                          <td className="text-right">
                            <AmountCell amount={p.expenses} />
                          </td>
                          <td className="text-right">
                            <AmountCell amount={p.income + p.expenses} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* VAT report (Momsrapport) */}
          {vatReport && vatReport.by_rate.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
                Momsrapport
              </h2>
              <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-3 divide-x divide-base-200">
                  <div className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wider text-base-content/50 mb-1">
                      Ingående moms
                    </p>
                    <p className="text-xl font-bold text-emerald-600 tabular-nums">
                      <AmountCell amount={vatReport.incoming_vat_sek} />
                    </p>
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wider text-base-content/50 mb-1">
                      Utgående moms
                    </p>
                    <p className="text-xl font-bold text-red-600 tabular-nums">
                      <AmountCell amount={-vatReport.outgoing_vat_sek} />
                    </p>
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-medium uppercase tracking-wider text-base-content/50 mb-1">
                      Netto moms (att betala/få tillbaka)
                    </p>
                    <p className="text-xl font-bold tabular-nums">
                      <AmountCell amount={vatReport.incoming_vat_sek - vatReport.outgoing_vat_sek} />
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto border-t border-base-200">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Momssats</th>
                        <th className="text-right">Netto (SEK)</th>
                        <th className="text-right">Moms (SEK)</th>
                        <th className="text-right">Antal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vatReport.by_rate.map((r) => (
                        <tr key={r.rate}>
                          <td className="font-medium">
                            {r.rate === 0 ? 'Okänd sats' : `${r.rate}%`}
                          </td>
                          <td className="text-right tabular-nums">
                            {r.net_sek.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="text-right tabular-nums">
                            {r.vat_sek.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="text-right tabular-nums">{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold">
                        <td>Totalt</td>
                        <td className="text-right tabular-nums">
                          {vatReport.totals.net_sek.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="text-right tabular-nums">
                          {vatReport.totals.vat_sek.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </section>
          )}

          {report.by_account.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
                Per konto
              </h2>
              <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Konto</th>
                        <th>Beskrivning</th>
                        <th className="text-right">Antal</th>
                        <th className="text-right">Totalt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.by_account.map((a, i) => (
                        <tr key={i}>
                          <td className="tabular-nums font-medium">
                            {a.code ?? '—'}
                          </td>
                          <td>
                            {a.name ?? '—'}
                          </td>
                          <td className="text-right tabular-nums">{a.count}</td>
                          <td className="text-right">
                            <AmountCell amount={a.total} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {report.by_party.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
                Per leverantör
              </h2>
              <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Leverantör</th>
                        <th className="text-right">Antal</th>
                        <th className="text-right">Totalt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.by_party.map((v, i) => (
                        <tr key={i}>
                          <td className="font-medium">{v.party}</td>
                          <td className="text-right tabular-nums">{v.count}</td>
                          <td className="text-right">
                            <AmountCell amount={v.total} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {report.missing.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
                Saknade kvitton
                <span className="ml-2 tabular-nums text-base-content/40">
                  ({report.missing_count})
                </span>
              </h2>
              <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Datum</th>
                        <th>Referens</th>
                        <th className="text-right">Belopp</th>
                        <th>Konto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.missing.map((m, i) => (
                        <tr key={i}>
                          <td className="tabular-nums">
                            {m.date}
                          </td>
                          <td className="truncate max-w-xs font-medium">
                            {m.reference}
                          </td>
                          <td className="text-right">
                            <AmountCell amount={m.amount} />
                          </td>
                          <td>{m.account}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
