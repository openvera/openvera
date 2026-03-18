import { type ChangeEvent, useRef, useState } from 'react'
import { Button, Select, Table, TextField } from '@swedev/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  type Account,
  type Company,
  ConfirmDialog,
  createAccount,
  deleteAccount,
  deleteCompany,
  EmptyState,
  FormModal,
  getAccounts,
  label,
  updateAccount,
  updateCompany,
  useCompany,
} from 'openvera'

export default function Settings() {
  const { selected } = useCompany()
  const queryClient = useQueryClient()
  const [editingCompany, setEditingCompany] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(false)
  const [showNewAccount, setShowNewAccount] = useState(false)
  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [deleteAccountTarget, setDeleteAccountTarget]
    = useState<Account | null>(null)

  // Refs for form submit triggers (useRef to avoid re-render loops)
  const companyFormActions = useRef<FormActions | null>(null)
  const newAccountFormActions = useRef<FormActions | null>(null)
  const editAccountFormActions = useRef<FormActions | null>(null)

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', selected?.slug],
    queryFn: () => getAccounts(selected!.slug),
    enabled: !!selected,
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['companies'] })
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
  }

  const updateCompanyMut = useMutation({
    mutationFn: ({
      slug,
      data,
    }: {
      slug: string;
      data: Parameters<typeof updateCompany>[1];
    }) => updateCompany(slug, data),
    onSuccess: () => {
      setEditingCompany(false)
      invalidateAll()
    },
  })

  const deleteCompanyMut = useMutation({
    mutationFn: (slug: string) => deleteCompany(slug),
    onSuccess: () => {
      setDeleteTarget(false)
      invalidateAll()
    },
  })

  const createAccountMut = useMutation({
    mutationFn: (data: Parameters<typeof createAccount>[1]) =>
      createAccount(selected!.slug, data),
    onSuccess: () => {
      setShowNewAccount(false)
      invalidateAll()
    },
  })

  const updateAccountMut = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Parameters<typeof updateAccount>[1];
    }) => updateAccount(id, data),
    onSuccess: () => {
      setEditAccount(null)
      invalidateAll()
    },
  })

  const deleteAccountMut = useMutation({
    mutationFn: (id: number) => deleteAccount(id),
    onSuccess: () => {
      setDeleteAccountTarget(null)
      invalidateAll()
    },
  })

  if (!selected) {
    return <EmptyState title="Välj ett företag" />
  }

  return (
    <div className="space-y-8">
      <h1 className="page-title">Inställningar</h1>

      {/* Company details */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
            Företagsinformation
          </h2>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="2"
              onClick={() => setEditingCompany(true)}
              icon={<Pencil />}
              text="Redigera"
            />
            <Button
              variant="ghost"
              size="2"
              semantic="destructive"
              onClick={() => setDeleteTarget(true)}
              icon={<Trash2 />}
              text="Ta bort"
            />
          </div>
        </div>

        <div className="bg-base-100 rounded-xl shadow-sm p-5">
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-1">
                Namn
              </dt>
              <dd className="font-medium">{selected.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-1">
                Org.nr
              </dt>
              <dd className="tabular-nums">
                {selected.org_number ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-1">
                Räkenskapsår start
              </dt>
              <dd>{selected.fiscal_year_start ?? '—'}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Accounts section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-base-content/50">
            Konton
          </h2>
          <Button
            semantic="action"
            size="2"
            onClick={() => setShowNewAccount(true)}
            icon={<Plus />}
            text="Nytt konto"
          />
        </div>

        <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table.Root size="2">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell className="tabular-nums text-base-content/40 w-12">ID</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Namn</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Kontonummer</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Typ</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Valuta</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Åtgärder</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {accounts.map((a) => (
                  <Table.Row key={a.id}>
                    <Table.Cell className="tabular-nums text-base-content/40">{a.id}</Table.Cell>
                    <Table.Cell className="font-medium">{a.name}</Table.Cell>
                    <Table.Cell className="tabular-nums">
                      {a.account_number ?? '—'}
                    </Table.Cell>
                    <Table.Cell>
                      {label.accountType(a.account_type)}
                    </Table.Cell>
                    <Table.Cell>{a.currency}</Table.Cell>
                    <Table.Cell>
                      <div className="flex gap-0.5">
                        <Button
                          variant="ghost"
                          size="1"
                          className="tooltip"
                          data-tip="Redigera"
                          onClick={() => setEditAccount(a)}
                          icon={<Pencil />}
                        />
                        <Button
                          variant="ghost"
                          size="1"
                          semantic="destructive"
                          className="tooltip"
                          data-tip="Ta bort"
                          onClick={() => setDeleteAccountTarget(a)}
                          icon={<Trash2 />}
                        />
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </div>
        </div>
      </section>

      {/* Edit company modal */}
      <FormModal
        open={editingCompany}
        title="Redigera företag"
        onClose={() => setEditingCompany(false)}
        footer={
          <ModalFooter
            onCancel={() => setEditingCompany(false)}
            onSubmit={() => companyFormActions.current?.submit()}
            isPending={updateCompanyMut.isPending}
            submitLabel="Spara"
          />
        }
      >
        <CompanyForm
          company={selected}
          onSave={(data) =>
            updateCompanyMut.mutate({ slug: selected.slug, data })
          }
          onActionsReady={(a) => { companyFormActions.current = a }}
        />
      </FormModal>

      {/* New account modal */}
      <FormModal
        open={showNewAccount}
        title="Nytt konto"
        onClose={() => setShowNewAccount(false)}
        footer={
          <ModalFooter
            onCancel={() => setShowNewAccount(false)}
            onSubmit={() => newAccountFormActions.current?.submit()}
            isPending={createAccountMut.isPending}
            submitLabel="Skapa"
          />
        }
      >
        <AccountForm
          onSave={(data) => createAccountMut.mutate(data)}
          onActionsReady={(a) => { newAccountFormActions.current = a }}
        />
      </FormModal>

      {/* Edit account modal */}
      <FormModal
        open={!!editAccount}
        title="Redigera konto"
        onClose={() => setEditAccount(null)}
        footer={
          <ModalFooter
            onCancel={() => setEditAccount(null)}
            onSubmit={() => editAccountFormActions.current?.submit()}
            isPending={updateAccountMut.isPending}
            submitLabel="Spara"
          />
        }
      >
        {editAccount && (
          <AccountForm
            key={editAccount.id}
            account={editAccount}
            onSave={(data) =>
              updateAccountMut.mutate({ id: editAccount.id, data })
            }
            onActionsReady={(a) => { editAccountFormActions.current = a }}
          />
        )}
      </FormModal>

      <ConfirmDialog
        open={deleteTarget}
        title="Ta bort företag"
        message={`Vill du ta bort "${selected.name}"? ALL relaterad data (konton, transaktioner, dokument, matchningar) tas bort permanent.`}
        onConfirm={() => deleteCompanyMut.mutate(selected.slug)}
        onCancel={() => setDeleteTarget(false)}
      />

      <ConfirmDialog
        open={!!deleteAccountTarget}
        title="Ta bort konto"
        message={`Vill du ta bort "${deleteAccountTarget?.name}"? Alla transaktioner på kontot tas bort.`}
        onConfirm={() =>
          deleteAccountTarget &&
          deleteAccountMut.mutate(deleteAccountTarget.id)
        }
        onCancel={() => setDeleteAccountTarget(null)}
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

function CompanyForm({
  company,
  onSave,
  onActionsReady,
}: {
  company?: Company;
  onSave: (data: {
    name: string;
    org_number?: string;
    fiscal_year_start?: string;
  }) => void;
  onActionsReady: (actions: FormActions) => void;
}) {
  const [name, setName] = useState(company?.name ?? '')
  const [orgNumber, setOrgNumber] = useState(company?.org_number ?? '')
  const [fiscalStart, setFiscalStart] = useState(
    company?.fiscal_year_start ?? '01-01',
  )

  const canSubmit = !!name.trim()
  const submit = () => {
    if (!canSubmit) return
    onSave({
      name,
      org_number: orgNumber || undefined,
      fiscal_year_start: fiscalStart || undefined,
    })
  }

  // Keep parent updated with current actions
  const actionsRef = { submit, canSubmit }
  onActionsReady(actionsRef)

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label className="label text-sm">Namn</label>
        <TextField.Root size="2" variant="surface" value={name} onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label text-sm">Org.nr</label>
        <TextField.Root size="2" variant="surface" value={orgNumber} onChange={(e: ChangeEvent<HTMLInputElement>) => setOrgNumber(e.target.value)} placeholder="XXXXXX-XXXX" />
      </div>
      <div>
        <label className="label text-sm">Räkenskapsår start</label>
        <TextField.Root size="2" variant="surface" value={fiscalStart} onChange={(e: ChangeEvent<HTMLInputElement>) => setFiscalStart(e.target.value)} placeholder="MM-DD" />
      </div>
    </div>
  )
}

function AccountForm({
  account,
  onSave,
  onActionsReady,
}: {
  account?: Account;
  onSave: (data: {
    name: string;
    account_number?: string;
    account_type?: string;
    currency?: string;
  }) => void;
  onActionsReady: (actions: FormActions) => void;
}) {
  const [name, setName] = useState(account?.name ?? '')
  const [accountNumber, setAccountNumber] = useState(
    account?.account_number ?? '',
  )
  const [accountType, setAccountType] = useState(
    account?.account_type ?? 'bank',
  )
  const [currency, setCurrency] = useState(account?.currency ?? 'SEK')

  const canSubmit = !!name.trim()
  const submit = () => {
    if (!canSubmit) return
    onSave({
      name,
      account_number: accountNumber || undefined,
      account_type: accountType,
      currency,
    })
  }

  onActionsReady({ submit, canSubmit })

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="label text-sm">Namn</label>
        <TextField.Root size="2" variant="surface" value={name} onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label text-sm">Kontonummer</label>
        <TextField.Root size="2" variant="surface" value={accountNumber} onChange={(e: ChangeEvent<HTMLInputElement>) => setAccountNumber(e.target.value)} />
      </div>
      <div>
        <label className="label text-sm">Typ</label>
        <Select.Root value={accountType} onValueChange={(v: string | undefined) => setAccountType(v ?? 'bank')} size="2">
          <Select.Trigger variant="surface" />
          <Select.Content>
            <Select.Item value="bank">Bank</Select.Item>
            <Select.Item value="credit_card">Kreditkort</Select.Item>
            <Select.Item value="savings">Sparkonto</Select.Item>
            <Select.Item value="tax">Skattekonto</Select.Item>
          </Select.Content>
        </Select.Root>
      </div>
      <div>
        <label className="label text-sm">Valuta</label>
        <Select.Root value={currency} onValueChange={(v: string | undefined) => setCurrency(v ?? 'SEK')} size="2">
          <Select.Trigger variant="surface" />
          <Select.Content>
            <Select.Item value="SEK">SEK</Select.Item>
            <Select.Item value="EUR">EUR</Select.Item>
            <Select.Item value="USD">USD</Select.Item>
          </Select.Content>
        </Select.Root>
      </div>
    </div>
  )
}
