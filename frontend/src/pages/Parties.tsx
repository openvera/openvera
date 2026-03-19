import { type ChangeEvent, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Spinner } from '@radix-ui/themes'
import { Badge, Button, Select, type Semantic, Table, TextArea, TextField } from '@swedev/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link as LinkIcon, Pencil, Plus, Unlink } from 'lucide-react'
import {
  addPartyRelation,
  ConfirmDialog,
  createParty,
  EmptyState,
  FormModal,
  getBasAccounts,
  getCompanyParties,
  getParties,
  label,
  type Party,
  removePartyRelation,
  updateParty,
  useCompany,
} from 'openvera'

const entitySemantic: Record<string, Semantic> = {
  business: 'action',
  person: 'neutral',
  authority: 'warning',
  charity: 'success',
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
        <Spinner size="3" />
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
          <Button
            variant="ghost"
            size="2"
            onClick={() => setShowLink(true)}
            icon={<LinkIcon />}
            text="Lägg till befintlig"
          />
          <Button
            semantic="action"
            size="2"
            onClick={() => setShowNew(true)}
            icon={<Plus />}
            text="Ny part"
          />
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
                <Table.Root size="2">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell className="tabular-nums text-base-content/40 w-12">ID</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Namn</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Typ</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Relation</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Mönster</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Kontokod</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell>Åtgärder</Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {parties.map((party) => (
                      <Table.Row
                        key={party.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/parties/${party.id}`)}
                      >
                        <Table.Cell className="tabular-nums text-base-content/40">{party.id}</Table.Cell>
                        <Table.Cell className="font-medium">{party.name}</Table.Cell>
                        <Table.Cell>
                          <Badge semantic={entitySemantic[party.entity_type] ?? 'neutral'} text={label.entityType(party.entity_type)} />
                        </Table.Cell>
                        <Table.Cell>
                          <Badge semantic="neutral" text={label.relationship(party.relationship)} />
                        </Table.Cell>
                        <Table.Cell className="text-xs">
                          {party.patterns.length > 0
                            ? party.patterns.slice(0, 3).join(', ')
                            : '—'}
                          {party.patterns.length > 3 &&
                            ` +${party.patterns.length - 3}`}
                        </Table.Cell>
                        <Table.Cell className="tabular-nums">
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
                        </Table.Cell>
                        <Table.Cell>
                          <div
                            className="flex gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="1"
                              className="tooltip"
                              data-tip="Redigera"
                              onClick={() => setEditParty(party)}
                              icon={<Pencil />}
                            />
                            <Button
                              variant="ghost"
                              size="1"
                              semantic="destructive"
                              className="tooltip"
                              data-tip="Ta bort koppling"
                              onClick={() => setUnlinkTarget(party)}
                              icon={<Unlink />}
                            />
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
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
          <Button
            variant="ghost"
            size="2"
            onClick={() => setShowLink(false)}
            text="Stäng"
          />
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
      <Button
        variant="ghost"
        size="2"
        onClick={onCancel}
        text="Avbryt"
      />
      <Button
        semantic="action"
        size="2"
        onClick={onSubmit}
        disabled={isPending}
        loading={isPending}
        text={submitLabel}
      />
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
        <TextField.Root size="2" variant="surface" placeholder="Sök part..." value={search} onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} className="grow" />
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
                      <Badge semantic={entitySemantic[p.entity_type] ?? 'neutral'} text={label.entityType(p.entity_type)} />
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
      <div className="grid grid-cols-10 gap-4">
        <div className="col-span-4">
          <label className="field-label">Namn</label>
          <TextField.Root size="2" variant="surface" value={name} onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
        </div>
        <div className="col-span-3">
          <label className="field-label">Typ</label>
          <Select.Root value={entityType} onValueChange={(v: string | undefined) => setEntityType(v ?? 'business')} size="2">
            <Select.Trigger variant="surface" className="w-full" />
            <Select.Content>
              <Select.Item value="business">Företag</Select.Item>
              <Select.Item value="person">Person</Select.Item>
              <Select.Item value="authority">Myndighet</Select.Item>
              <Select.Item value="charity">Välgörenhet</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
        <div className="col-span-3">
          <label className="field-label">Kontokod (BAS)</label>
          <Select.Root value={defaultCode || undefined} onValueChange={(v: string | undefined) => setDefaultCode(v === '__clear__' ? '' : (v ?? ''))} size="2">
            <Select.Trigger variant="surface" className="w-full" placeholder="Ingen" />
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
        <label className="field-label">Mönster (ett per rad)</label>
        <TextArea.Root size="2" variant="surface" rows={3} value={patterns} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setPatterns(e.target.value)} placeholder={'LEVERANTÖR AB\nLEV-NR 12345'} />
      </div>
    </div>
  )
}
