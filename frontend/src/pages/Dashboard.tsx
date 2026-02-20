import { Link } from 'react-router'
import {
  ArrowLeftRight,
  ArrowRight,
  FileText,
  Percent,
  Receipt,
  Scale,
  TrendingDown,
  TrendingUp,
  Unlink,
  UserX,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { getReport, getStats, useCompany } from 'openvera'

export default function Dashboard() {
  const { selected } = useCompany()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
  })

  const { data: report } = useQuery({
    queryKey: ['report', selected?.id],
    queryFn: () => getReport({ company_id: selected!.id }),
    enabled: !!selected,
  })

  if (statsLoading) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h1 className="page-title">Översikt</h1>

      {/* Key metrics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-base-100 rounded-xl p-5 shadow-sm stat-accent-primary">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-base-content/50">
                  Dokument
                </p>
                <p className="text-3xl font-bold mt-1 tabular-nums">
                  {stats.total_documents}
                </p>
                <p className="text-sm text-base-content/50 mt-1">
                  {stats.matched_documents} matchade
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
            </div>
          </div>

          <div className="bg-base-100 rounded-xl p-5 shadow-sm stat-accent-secondary">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-base-content/50">
                  Matchningsgrad
                </p>
                <p className="text-3xl font-bold mt-1 tabular-nums">
                  {stats.match_rate}%
                </p>
                <p className="text-sm text-base-content/50 mt-1">
                  {stats.unmatched_documents} omatchade
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center">
                <Percent className="w-5 h-5 text-secondary" />
              </div>
            </div>
          </div>

          <div className="bg-base-100 rounded-xl p-5 shadow-sm stat-accent-accent">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-base-content/50">
                  Transaktioner
                </p>
                <p className="text-3xl font-bold mt-1 tabular-nums">
                  {stats.total_expense_transactions}
                </p>
                <p className="text-sm text-base-content/50 mt-1">
                  {stats.matched_transactions} matchade
                </p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <ArrowLeftRight className="w-5 h-5 text-accent" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attention items */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.unmatched_documents > 0 && (
            <Link
              to="/documents?filter=unmatched"
              className="bg-base-100 rounded-xl p-5 shadow-sm alert-accent-error card-hover flex items-center gap-4 group"
            >
              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <Unlink className="w-4 h-4 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-2xl font-bold text-red-600 tabular-nums">
                  {stats.unmatched_documents}
                </p>
                <p className="text-sm text-base-content/60">
                  Omatchade dokument
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-base-content/20 group-hover:text-base-content/50 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          )}

          {report && report.missing_count > 0 && (
            <Link
              to="/transactions?match=unmatched"
              className="bg-base-100 rounded-xl p-5 shadow-sm alert-accent-warning card-hover flex items-center gap-4 group"
            >
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <Receipt className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-2xl font-bold text-amber-600 tabular-nums">
                  {report.missing_count}
                </p>
                <p className="text-sm text-base-content/60">Saknade kvitton</p>
              </div>
              <ArrowRight className="w-4 h-4 text-base-content/20 group-hover:text-base-content/50 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          )}

          {stats.documents_without_party > 0 && (
            <Link
              to="/documents?filter=no_party"
              className="bg-base-100 rounded-xl p-5 shadow-sm alert-accent-info card-hover flex items-center gap-4 group"
            >
              <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
                <UserX className="w-4 h-4 text-sky-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-2xl font-bold text-sky-600 tabular-nums">
                  {stats.documents_without_party}
                </p>
                <p className="text-sm text-base-content/60">
                  Utan part
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-base-content/20 group-hover:text-base-content/50 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          )}
        </div>
      )}

      {/* Financial summary */}
      {report && (
        <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-base-200">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-base">
                Ekonomisk sammanfattning
              </h2>
              {selected && (
                <span className="badge badge-ghost badge-sm">
                  {selected.name}
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-x divide-base-200">
            <div className="p-6">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium uppercase tracking-wider text-base-content/50">
                  Intäkter
                </span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-xl font-bold text-emerald-600 tabular-nums">
                {fmt(report.total_income)}
              </p>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium uppercase tracking-wider text-base-content/50">
                  Kostnader
                </span>
                <TrendingDown className="w-4 h-4 text-red-400" />
              </div>
              <p className="text-xl font-bold text-red-600 tabular-nums">
                {fmt(report.total_expenses)}
              </p>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium uppercase tracking-wider text-base-content/50">
                  Netto
                </span>
                <Scale className="w-4 h-4 text-base-content/30" />
              </div>
              <p className="text-xl font-bold tabular-nums">
                {fmt(report.total_income + report.total_expenses)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function fmt(n: number) {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}
