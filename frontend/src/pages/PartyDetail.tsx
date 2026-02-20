import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { MouseEvent } from 'react'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  addPartyRelation,
  deleteParty,
  getBasAccounts,
  getParty,
  getPartyRelations,
  getPartyTransactions,
  removePartyRelation,
  updateParty,
} from '../api/parties'
import { getCompanies } from '../api/companies'
import AmountCell from '../components/AmountCell'
import ConfirmDialog from '../components/ConfirmDialog'
import FormModal from '../components/FormModal'
import { label } from '../labels'
import type { Party, PartyRelation } from '../types'

const entityBadge: Record<string, string> = {
  business: 'badge-primary',
  person: 'badge-secondary',
  authority: 'badge-warning',
  charity: 'badge-accent',
}

export default function PartyDetail() {
  const { partyId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const id = Number(partyId)

  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showAddRelation, setShowAddRelation] = useState(false)
  const [removeRelTarget, setRemoveRelTarget] = useState<PartyRelation | null>(
    null,
  )
  const editActions = useRef<{ submit: () => void; canSubmit: boolean } | null>(
    null,
  )

  const { data: party, isLoading } = useQuery({
    queryKey: ['party', id],
    queryFn: () => getParty(id),
  })

  const { data: relations = [] } = useQuery({
    queryKey: ['party-relations', id],
    queryFn: () => getPartyRelations(id),
  })

  const { data: txnData } = useQuery({
    queryKey: ['party-transactions', id],
    queryFn: () => getPartyTransactions(id),
  })

  const { data: basAccounts = [] } = useQuery({
    queryKey: ['bas-accounts'],
    queryFn: getBasAccounts,
  })

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: getCompanies,
    enabled: showAddRelation,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['party', id] })
    queryClient.invalidateQueries({ queryKey: ['party-relations', id] })
    queryClient.invalidateQueries({ queryKey: ['party-transactions', id] })
    queryClient.invalidateQueries({ queryKey: ['company-parties'] })
  }

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateParty>[1]) =>
      updateParty(id, data),
    onSuccess: () => {
      setShowEdit(false)
      invalidate()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteParty(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-parties'] })
      navigate('/parties')
    },
  })

  const addRelMutation = useMutation({
    mutationFn: addPartyRelation,
    onSuccess: () => {
      setShowAddRelation(false)
      invalidate()
    },
  })

  const removeRelMutation = useMutation({
    mutationFn: (rel: PartyRelation) =>
      removePartyRelation({
        company_id: rel.company_id,
        party_id: id,
        relationship: rel.relationship,
      }),
    onSuccess: () => {
      setRemoveRelTarget(null)
      invalidate()
    },
  })

  if (isLoading || !party) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    )
  }

  const basName = basAccounts.find(
    (a) => a.code === party.default_code,
  )?.name
  const transactions = txnData?.transactions ?? []

  // Companies not yet linked to this party
  const linkedCompanyIds = new Set(relations.map((r) => r.company_id))
  const unlinkedCompanies = companies.filter(
    (c) => !linkedCompanyIds.has(c.id),
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
            <h1 className="page-title">{party.name}</h1>
            <span
              className={`badge badge-soft ${entityBadge[party.entity_type] ?? 'badge-ghost'}`}
            >
              {label.entityType(party.entity_type)}
            </span>
          </div>
        </div>
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

      {/* Info + Relations cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Info card */}
        <div className="bg-base-100 rounded-xl shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
            Information
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-base-content/50">Org.nr</dt>
            <dd>{party.org_number ?? '—'}</dd>

            <dt className="text-base-content/50">Kontokod</dt>
            <dd className="tabular-nums">
              {party.default_code
                ? (
                    <>
                      {party.default_code}
                      {' '}
                      <span className="text-base-content/40">{basName}</span>
                    </>
                  )
                : '—'}
            </dd>

            <dt className="text-base-content/50">Mönster</dt>
            <dd className="flex flex-wrap gap-1">
              {party.patterns.length > 0
                ? party.patterns.map((p, i) => (
                    <span
                      key={i}
                      className="badge badge-ghost badge-sm font-mono"
                    >
                      {p}
                    </span>
                  ))
                : <span className="text-base-content/40">—</span>}
            </dd>
          </dl>
        </div>

        {/* Relations card */}
        <div className="bg-base-100 rounded-xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
              Företagskopplingar
            </h2>
            <button
              className="btn btn-ghost btn-xs gap-1"
              onClick={() => setShowAddRelation(true)}
            >
              <Plus className="w-3 h-3" />
              Lägg till
            </button>
          </div>
          {relations.length === 0
            ? (
                <p className="text-sm text-base-content/40">Inga kopplingar</p>
              )
            : (
                <ul className="space-y-2">
                  {relations.map((rel, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>
                        {rel.company_name}
                        <span className="badge badge-sm badge-ghost ml-2">
                          {label.relationship(rel.relationship)}
                        </span>
                      </span>
                      <button
                        className="btn btn-ghost btn-xs text-red-400 hover:text-red-600"
                        onClick={() => setRemoveRelTarget(rel)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-base-200">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
            Matchande transaktioner
            {transactions.length > 0 && (
              <span className="badge badge-sm badge-ghost ml-2">
                {transactions.length}
              </span>
            )}
          </h2>
        </div>
        {transactions.length === 0
          ? (
              <p className="text-sm text-base-content/40 px-5 py-6">
                Inga matchande transaktioner
              </p>
            )
          : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th className="tabular-nums text-base-content/40 w-12">ID</th>
                      <th>Datum</th>
                      <th>Referens</th>
                      <th className="text-right">Belopp</th>
                      <th>Konto</th>
                      <th>Företag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr
                        key={t.id}
                        className="hover cursor-pointer"
                        onClick={() => navigate(`/transactions/${t.id}`)}
                      >
                        <td className="tabular-nums text-base-content/40">{t.id}</td>
                        <td className="tabular-nums">
                          {t.date}
                        </td>
                        <td className="truncate max-w-xs">{t.reference}</td>
                        <td className="text-right">
                          <AmountCell amount={t.amount} />
                        </td>
                        <td>
                          <Link
                            to={`/transactions?account=${t.account_id}`}
                            className="link link-hover link-primary text-sm"
                            onClick={(e: MouseEvent) => e.stopPropagation()}
                          >
                            {t.account}
                          </Link>
                        </td>
                        <td>
                          <Link
                            to={`/settings?company=${t.company_slug}`}
                            className="link link-hover link-primary text-sm"
                            onClick={(e: MouseEvent) => e.stopPropagation()}
                          >
                            {t.company}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </div>

      {/* Edit modal */}
      <FormModal
        open={showEdit}
        title="Redigera part"
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
              {updateMutation.isPending
                ? <span className="loading loading-spinner loading-xs" />
                : 'Spara'}
            </button>
          </>
        }
      >
        <PartyForm
          party={party}
          basAccounts={basAccounts}
          onSave={(data) => updateMutation.mutate(data)}
          onActionsReady={(a) => {
            editActions.current = a
          }}
        />
      </FormModal>

      {/* Add relation modal */}
      <FormModal
        open={showAddRelation}
        title="Lägg till koppling"
        onClose={() => setShowAddRelation(false)}
        footer={
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowAddRelation(false)}
          >
            Stäng
          </button>
        }
      >
        <AddRelationForm
          companies={unlinkedCompanies}
          onAdd={(companyId, relationship) =>
            addRelMutation.mutate({
              company_id: companyId,
              party_id: id,
              relationship,
            })
          }
          isPending={addRelMutation.isPending}
        />
      </FormModal>

      {/* Delete party confirm */}
      <ConfirmDialog
        open={showDelete}
        title="Ta bort part"
        message={`Vill du ta bort "${party.name}" permanent? Alla kopplingar tas också bort.`}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setShowDelete(false)}
      />

      {/* Remove relation confirm */}
      <ConfirmDialog
        open={!!removeRelTarget}
        title="Ta bort koppling"
        message={`Vill du ta bort kopplingen till "${removeRelTarget?.company_name}"?`}
        onConfirm={() =>
          removeRelTarget && removeRelMutation.mutate(removeRelTarget)
        }
        onCancel={() => setRemoveRelTarget(null)}
      />
    </div>
  )
}

function AddRelationForm({
  companies,
  onAdd,
  isPending,
}: {
  companies: { id: number; name: string }[]
  onAdd: (companyId: number, relationship: string) => void
  isPending: boolean
}) {
  const [relationship, setRelationship] = useState('vendor')

  return (
    <div className="space-y-4">
      <div>
        <label className="label text-sm">Relationstyp</label>
        <select
          className="select select-bordered select-sm w-full"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
        >
          <option value="vendor">Leverantör</option>
          <option value="customer">Kund</option>
          <option value="authority">Myndighet</option>
          <option value="charity">Välgörenhet</option>
        </select>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {companies.length === 0
          ? (
              <p className="text-sm text-base-content/40 py-4 text-center">
                Alla företag är redan kopplade
              </p>
            )
          : (
              <ul className="menu menu-sm">
                {companies.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => onAdd(c.id, relationship)}
                      disabled={isPending}
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
      </div>
    </div>
  )
}

function PartyForm({
  party,
  basAccounts,
  onSave,
  onActionsReady,
}: {
  party: Party
  basAccounts: { code: string; name: string }[]
  onSave: (data: {
    name: string
    entity_type: string
    patterns: string
    default_code?: string
  }) => void
  onActionsReady: (actions: { submit: () => void; canSubmit: boolean }) => void
}) {
  const [name, setName] = useState(party.name)
  const [entityType, setEntityType] = useState(party.entity_type)
  const [patterns, setPatterns] = useState(party.patterns.join('\n'))
  const [defaultCode, setDefaultCode] = useState(party.default_code ?? '')

  const canSubmit = !!name.trim()
  const submit = () => {
    if (!canSubmit) return
    onSave({
      name,
      entity_type: entityType,
      patterns,
      default_code: defaultCode || undefined,
    })
  }

  onActionsReady({ submit, canSubmit })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label text-sm">Namn</label>
          <input
            className="input input-bordered input-sm w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label text-sm">Typ</label>
          <select
            className="select select-bordered select-sm w-full"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
          >
            <option value="business">Företag</option>
            <option value="person">Person</option>
            <option value="authority">Myndighet</option>
            <option value="charity">Välgörenhet</option>
          </select>
        </div>
        <div>
          <label className="label text-sm">Kontokod (BAS)</label>
          <select
            className="select select-bordered select-sm w-full"
            value={defaultCode}
            onChange={(e) => setDefaultCode(e.target.value)}
          >
            <option value="">Ingen</option>
            {basAccounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label text-sm">Mönster (ett per rad)</label>
        <textarea
          className="textarea textarea-bordered w-full text-sm"
          rows={3}
          value={patterns}
          onChange={(e) => setPatterns(e.target.value)}
          placeholder={'LEVERANTÖR AB\nLEV-NR 12345'}
        />
      </div>
    </div>
  )
}
