import { type ChangeEvent, useState } from 'react'
import { Spinner } from '@radix-ui/themes'
import { Button, Table, TextField } from '@swedev/ui'
import { useQuery } from '@tanstack/react-query'
import { FileOutput } from 'lucide-react'
import { AmountCell, EmptyState, getReport, getSieExportUrl, getVatReport, useCompany } from 'openvera'

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
        <Spinner size="3" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Rapporter</h1>
        <Button
          variant="outline"
          size="2"
          href={getSieExportUrl(selected.id, currentYear)}
          download
          icon={<FileOutput />}
          text="Exportera SIE4"
        />
      </div>

      <div className="flex gap-3 items-end">
        <div>
          <label className="label text-sm">Från</label>
          <TextField.Root type="date" size="2" variant="surface" value={from} onChange={(e: ChangeEvent<HTMLInputElement>) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label text-sm">Till</label>
          <TextField.Root type="date" size="2" variant="surface" value={to} onChange={(e: ChangeEvent<HTMLInputElement>) => setTo(e.target.value)} />
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
                  <Table.Root size="2">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeaderCell>Period</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell justify="end">Intäkter</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell justify="end">Kostnader</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell justify="end">Netto</Table.ColumnHeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {report.by_period.map((p) => (
                        <Table.Row key={p.period}>
                          <Table.Cell className="font-medium">{p.period}</Table.Cell>
                          <Table.Cell justify="end">
                            <AmountCell amount={p.income} />
                          </Table.Cell>
                          <Table.Cell justify="end">
                            <AmountCell amount={p.expenses} />
                          </Table.Cell>
                          <Table.Cell justify="end">
                            <AmountCell amount={p.income + p.expenses} />
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
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
                  <Table.Root size="2">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeaderCell>Momssats</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell justify="end">Netto (SEK)</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell justify="end">Moms (SEK)</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell justify="end">Antal</Table.ColumnHeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {vatReport.by_rate.map((r) => (
                        <Table.Row key={r.rate}>
                          <Table.Cell className="font-medium">
                            {r.rate === 0 ? 'Okänd sats' : `${r.rate}%`}
                          </Table.Cell>
                          <Table.Cell className="tabular-nums" justify="end">
                            {r.net_sek.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Table.Cell>
                          <Table.Cell className="tabular-nums" justify="end">
                            {r.vat_sek.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Table.Cell>
                          <Table.Cell className="tabular-nums" justify="end">{r.count}</Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
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
                  </Table.Root>
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
                  <Table.Root size="2">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeaderCell>Konto</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>Beskrivning</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell justify="end">Antal</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell justify="end">Totalt</Table.ColumnHeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {report.by_account.map((a, i) => (
                        <Table.Row key={i}>
                          <Table.Cell className="tabular-nums font-medium">
                            {a.code ?? '—'}
                          </Table.Cell>
                          <Table.Cell>
                            {a.name ?? '—'}
                          </Table.Cell>
                          <Table.Cell className="tabular-nums" justify="end">{a.count}</Table.Cell>
                          <Table.Cell justify="end">
                            <AmountCell amount={a.total} />
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
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
                  <Table.Root size="2">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeaderCell>Leverantör</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell justify="end">Antal</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell justify="end">Totalt</Table.ColumnHeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {report.by_party.map((v, i) => (
                        <Table.Row key={i}>
                          <Table.Cell className="font-medium">{v.party}</Table.Cell>
                          <Table.Cell className="tabular-nums" justify="end">{v.count}</Table.Cell>
                          <Table.Cell justify="end">
                            <AmountCell amount={v.total} />
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
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
                  <Table.Root size="2">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeaderCell>Datum</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>Referens</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell justify="end">Belopp</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>Konto</Table.ColumnHeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {report.missing.map((m, i) => (
                        <Table.Row key={i}>
                          <Table.Cell className="tabular-nums">
                            {m.date}
                          </Table.Cell>
                          <Table.Cell className="truncate max-w-xs font-medium">
                            {m.reference}
                          </Table.Cell>
                          <Table.Cell justify="end">
                            <AmountCell amount={m.amount} />
                          </Table.Cell>
                          <Table.Cell>{m.account}</Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
