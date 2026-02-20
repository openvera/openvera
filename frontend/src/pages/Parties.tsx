import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Link as LinkIcon, Pencil, Plus, Unlink } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  addPartyRelation,
  createParty,
  getBasAccounts,
  getCompanyParties,
  getParties,
  removePartyRelation,
  updateParty,
} from '../api/parties'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import FormModal from '../components/FormModal'
import { useCompany } from '../hooks/useCompany'
import { label } from '../labels'
import type { Party } from '../types'

const entityBadge: Record<string, string> = {
  business: 'badge-primary',
  person: 'badge-secondary',
  authority: 'badge-warning',
  charity: 'badge-accent',
}

export default function Parties() {
  const { selected } = useCompany()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editParty, setEditParty] = useState<Party | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [unlinkTarget, setUnlinkTarget] = useState<Party | null>(null)
  const newPartyActions = useRef<FormActions | null>(null)
  const editPartyActions = useRef<FormActions | null>(null)

  const { data: parties = [], isLoading } = useQuery({
    queryKey: ['company-parties', selected?.slug],
    queryFn: () => getCompanyParties(selected!.slug),
    enabled: !!selected,
  })

  const { data: basAccounts = [] } = useQuery({
    queryKey: ['bas-accounts'],
    queryFn: getBasAccounts,
  })

  const { data: allParties = [] } = useQuery({
    queryKey: ['all-parties'],
    queryFn: getParties,
    enabled: showLink,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['company-parties'] })
    queryClient.invalidateQueries({ queryKey: ['all-parties'] })
  }

  const createMutation = useMutation({
    mutationFn: createParty,
    onSuccess: () => {
      setShowNew(false)
      invalidate()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Parameters<typeof updateParty>[1];
    }) => updateParty(id, data),
    onSuccess: () => {
      setEditParty(null)
      invalidate()
    },
  })

  const unlinkMutation = useMutation({
    mutationFn: (partyId: number) =>
      removePartyRelation({
        company_id: selected!.id,
        party_id: partyId,
      }),
    onSuccess: () => {
      setUnlinkTarget(null)
      invalidate()
    },
  })

  const linkMutation = useMutation({
    mutationFn: addPartyRelation,
    onSuccess: () => {
      setShowLink(false)
      invalidate()
    },
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    )
  }

  const unlinkedParties = allParties.filter(
    (p) => !parties.some((cp) => cp.id === p.id),
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Parter</h1>
        <div className="flex gap-2">
          <button
            className="btn btn-ghost btn-sm gap-1"
            onClick={() => setShowLink(true)}
          >
            <LinkIcon className="w-4 h-4" />
            Lägg till befintlig
          </button>
          <button
            className="btn btn-primary btn-sm gap-1"
            onClick={() => setShowNew(true)}
          >
            <Plus className="w-4 h-4" />
            Ny part
          </button>
        </div>
      </div>

      {parties.length === 0
        ? (
            <EmptyState
              title="Inga parter"
              description="Skapa en ny part eller länka en befintlig"
            />
          )
        : (
            <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th className="tabular-nums text-base-content/40 w-12">ID</th>
                      <th>Namn</th>
                      <th>Typ</th>
                      <th>Relation</th>
                      <th>Mönster</th>
                      <th>Kontokod</th>
                      <th>Åtgärder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parties.map((party) => (
                      <tr
                        key={party.id}
                        className="hover cursor-pointer"
                        onClick={() => navigate(`/parties/${party.id}`)}
                      >
                        <td className="tabular-nums text-base-content/40">{party.id}</td>
                        <td className="font-medium">{party.name}</td>
                        <td>
                          <span
                            className={`badge badge-sm badge-soft ${entityBadge[party.entity_type] ?? 'badge-ghost'}`}
                          >
                            {label.entityType(party.entity_type)}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-sm badge-ghost">
                            {label.relationship(party.relationship)}
                          </span>
                        </td>
                        <td className="text-xs">
                          {party.patterns.length > 0
                            ? party.patterns.slice(0, 3).join(', ')
                            : '—'}
                          {party.patterns.length > 3 &&
                            ` +${party.patterns.length - 3}`}
                        </td>
                        <td className="tabular-nums">
                          {party.default_code
                            ? (
                                <>
                                  {party.default_code}
                                  {' '}
                                  <span className="text-base-content/40 font-normal">
                                    {basAccounts.find(
                                      (a) =>
                                        a.code === party.default_code,
                                    )?.name}
                                  </span>
                                </>
                              )
                            : '—'}
                        </td>
                        <td>
                          <div
                            className="flex gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              className="btn btn-ghost btn-xs tooltip"
                              data-tip="Redigera"
                              onClick={() => setEditParty(party)}
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              className="btn btn-ghost btn-xs text-red-400 hover:text-red-600 tooltip"
                              data-tip="Ta bort koppling"
                              onClick={() => setUnlinkTarget(party)}
                            >
                              <Unlink className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

      {/* New party modal */}
      <FormModal
        open={showNew}
        title="Ny part"
        onClose={() => setShowNew(false)}
        footer={
          <ModalFooter
            onCancel={() => setShowNew(false)}
            onSubmit={() => newPartyActions.current?.submit()}
            isPending={createMutation.isPending}
            submitLabel="Skapa"
          />
        }
      >
        <PartyForm
          basAccounts={basAccounts}
          companyId={selected?.id}
          onSave={(data) => createMutation.mutate(data)}
          onActionsReady={(a) => {
            newPartyActions.current = a
          }}
        />
      </FormModal>

      {/* Edit party modal */}
      <FormModal
        open={!!editParty}
        title="Redigera part"
        onClose={() => setEditParty(null)}
        footer={
          <ModalFooter
            onCancel={() => setEditParty(null)}
            onSubmit={() => editPartyActions.current?.submit()}
            isPending={updateMutation.isPending}
            submitLabel="Spara"
          />
        }
      >
        {editParty && (
          <PartyForm
            key={editParty.id}
            party={editParty}
            basAccounts={basAccounts}
            companyId={selected?.id}
            onSave={(data) =>
              updateMutation.mutate({ id: editParty.id, data })
            }
            onActionsReady={(a) => {
              editPartyActions.current = a
            }}
          />
        )}
      </FormModal>

      {/* Link existing party modal */}
      <FormModal
        open={showLink}
        title="Lägg till befintlig part"
        onClose={() => setShowLink(false)}
        footer={
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowLink(false)}
          >
            Stäng
          </button>
        }
      >
        <LinkPartyForm
          parties={unlinkedParties}
          onLink={(partyId, relationship) =>
            linkMutation.mutate({
              company_id: selected!.id,
              party_id: partyId,
              relationship,
            })
          }
          isPending={linkMutation.isPending}
        />
      </FormModal>

      <ConfirmDialog
        open={!!unlinkTarget}
        title="Ta bort koppling"
        message={`Vill du ta bort kopplingen till "${unlinkTarget?.name}"? Parten finns kvar i systemet.`}
        onConfirm={() =>
          unlinkTarget && unlinkMutation.mutate(unlinkTarget.id)
        }
        onCancel={() => setUnlinkTarget(null)}
      />
    </div>
  )
}

interface FormActions {
  submit: () => void;
  canSubmit: boolean;
}

function ModalFooter({
  onCancel,
  onSubmit,
  isPending,
  submitLabel,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={onCancel}>
        Avbryt
      </button>
      <button
        className="btn btn-primary btn-sm"
        onClick={onSubmit}
        disabled={isPending}
      >
        {isPending
          ? <span className="loading loading-spinner loading-xs" />
          : submitLabel}
      </button>
    </>
  )
}

function LinkPartyForm({
  parties,
  onLink,
  isPending,
}: {
  parties: Party[];
  onLink: (partyId: number, relationship: string) => void;
  isPending: boolean;
}) {
  const [search, setSearch] = useState('')
  const [relationship, setRelationship] = useState('vendor')

  const filtered = parties.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <input
          className="input input-bordered input-sm grow"
          placeholder="Sök part..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="select select-bordered select-sm"
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
        {filtered.length === 0
          ? (
              <p className="text-sm text-base-content/40 py-4 text-center">
                Inga olänkade parter
              </p>
            )
          : (
              <ul className="menu menu-sm">
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button
                      className="justify-between"
                      onClick={() => onLink(p.id, relationship)}
                      disabled={isPending}
                    >
                      <span>{p.name}</span>
                      <span
                        className={`badge badge-sm badge-soft ${entityBadge[p.entity_type] ?? 'badge-ghost'}`}
                      >
                        {label.entityType(p.entity_type)}
                      </span>
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
  companyId,
  onSave,
  onActionsReady,
}: {
  party?: Party;
  basAccounts: { code: string; name: string }[];
  companyId?: number;
  onSave: (data: {
    name: string;
    entity_type: string;
    patterns: string;
    default_code?: string;
    company_id?: number;
  }) => void;
  onActionsReady: (actions: FormActions) => void;
}) {
  const [name, setName] = useState(party?.name ?? '')
  const [entityType, setEntityType] = useState(
    party?.entity_type ?? 'business',
  )
  const [patterns, setPatterns] = useState(party?.patterns.join('\n') ?? '')
  const [defaultCode, setDefaultCode] = useState(party?.default_code ?? '')

  const canSubmit = !!name.trim()
  const submit = () => {
    if (!canSubmit) return
    onSave({
      name,
      entity_type: entityType,
      patterns,
      default_code: defaultCode || undefined,
      company_id: companyId,
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
