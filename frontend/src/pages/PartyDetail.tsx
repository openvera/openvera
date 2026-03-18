import type { ChangeEvent, MouseEvent } from 'react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Link as RadixLink, Spinner } from '@radix-ui/themes'
import { Badge, Button, Select, type Semantic, Table, TextArea, TextField } from '@swedev/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  addPartyRelation,
  AmountCell,
  ConfirmDialog,
  deleteParty,
  FormModal,
  getBasAccounts,
  getCompanies,
  getParty,
  getPartyRelations,
  getPartyTransactions,
  label,
  type Party,
  type PartyRelation,
  removePartyRelation,
  updateParty,
} from 'openvera'

const entitySemantic: Record<string, Semantic> = {
  business: 'action',
  person: 'neutral',
  authority: 'warning',
  charity: 'success',
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
        <Spinner size="3" />
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
        <Button
          variant="ghost"
          size="2"
          onClick={() => navigate(-1)}
          icon={<ArrowLeft />}
        />
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="page-title">{party.name}</h1>
            <Badge semantic={entitySemantic[party.entity_type] ?? 'neutral'} text={label.entityType(party.entity_type)} />
          </div>
        </div>
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
                    <Badge key={i} semantic="neutral" className="font-mono" text={p} />
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
            <Button
              variant="ghost"
              size="1"
              onClick={() => setShowAddRelation(true)}
              icon={<Plus />}
              text="Lägg till"
            />
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
                        <Badge semantic="neutral" ml="2" text={label.relationship(rel.relationship)} />
                      </span>
                      <Button
                        variant="ghost"
                        size="1"
                        semantic="destructive"
                        onClick={() => setRemoveRelTarget(rel)}
                        icon={<Trash2 />}
                      />
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
              <Badge semantic="neutral" ml="2" text={transactions.length} />
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
                <Table.Root size="2">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell className="tabular-nums text-base-content/40 w-12">ID</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Datum</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Referens</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end">Belopp</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Konto</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Företag</Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {transactions.map((t) => (
                      <Table.Row
                        key={t.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/transactions/${t.id}`)}
                      >
                        <Table.Cell className="tabular-nums text-base-content/40">{t.id}</Table.Cell>
                        <Table.Cell className="tabular-nums">
                          {t.date}
                        </Table.Cell>
                        <Table.Cell className="truncate max-w-xs">{t.reference}</Table.Cell>
                        <Table.Cell justify="end">
                          <AmountCell amount={t.amount} />
                        </Table.Cell>
                        <Table.Cell>
                          <RadixLink underline="hover" size="2" asChild>
                            <Link
                              to={`/transactions?account=${t.account_id}`}
                              onClick={(e: MouseEvent) => e.stopPropagation()}
                            >
                              {t.account}
                            </Link>
                          </RadixLink>
                        </Table.Cell>
                        <Table.Cell>
                          <RadixLink underline="hover" size="2" asChild>
                            <Link
                              to={`/settings?company=${t.company_slug}`}
                              onClick={(e: MouseEvent) => e.stopPropagation()}
                            >
                              {t.company}
                            </Link>
                          </RadixLink>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
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
          <Button
            variant="ghost"
            size="2"
            onClick={() => setShowAddRelation(false)}
            text="Stäng"
          />
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
  companies: { id: number; name: string }[];
  onAdd: (companyId: number, relationship: string) => void;
  isPending: boolean;
}) {
  const [relationship, setRelationship] = useState('vendor')

  return (
    <div className="space-y-4">
      <div>
        <label className="label text-sm">Relationstyp</label>
        <Select.Root value={relationship} onValueChange={(v: string | undefined) => setRelationship(v ?? 'vendor')} size="2">
          <Select.Trigger variant="surface" />
          <Select.Content>
            <Select.Item value="vendor">Leverantör</Select.Item>
            <Select.Item value="customer">Kund</Select.Item>
            <Select.Item value="authority">Myndighet</Select.Item>
            <Select.Item value="charity">Välgörenhet</Select.Item>
          </Select.Content>
        </Select.Root>
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
  party: Party;
  basAccounts: { code: string; name: string }[];
  onSave: (data: {
    name: string;
    entity_type: string;
    patterns: string;
    default_code?: string;
  }) => void;
  onActionsReady: (actions: { submit: () => void; canSubmit: boolean }) => void;
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
          <TextField.Root size="2" variant="surface" value={name} onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label text-sm">Typ</label>
          <Select.Root value={entityType} onValueChange={(v: string | undefined) => setEntityType(v ?? party.entity_type)} size="2">
            <Select.Trigger variant="surface" />
            <Select.Content>
              <Select.Item value="business">Företag</Select.Item>
              <Select.Item value="person">Person</Select.Item>
              <Select.Item value="authority">Myndighet</Select.Item>
              <Select.Item value="charity">Välgörenhet</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
        <div>
          <label className="label text-sm">Kontokod (BAS)</label>
          <Select.Root value={defaultCode || undefined} onValueChange={(v: string | undefined) => setDefaultCode(v === '__clear__' ? '' : (v ?? ''))} size="2">
            <Select.Trigger variant="surface" placeholder="Ingen" />
            <Select.Content>
              <Select.Item value="__clear__">Ingen</Select.Item>
              {basAccounts.map((a) => (
                <Select.Item key={a.code} value={a.code}>
                  {a.code} — {a.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </div>
      </div>
      <div>
        <label className="label text-sm">Mönster (ett per rad)</label>
        <TextArea.Root size="2" variant="surface" rows={3} value={patterns} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setPatterns(e.target.value)} placeholder={'LEVERANTÖR AB\nLEV-NR 12345'} />
      </div>
    </div>
  )
}
