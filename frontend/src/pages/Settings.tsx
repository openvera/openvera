import { useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createAccount,
  deleteAccount,
  deleteCompany,
  getAccounts,
  updateAccount,
  updateCompany,
} from '../api/companies'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import FormModal from '../components/FormModal'
import { useCompany } from '../hooks/useCompany'
import { label } from '../labels'
import type { Account, Company } from '../types'

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
      slug: string
      data: Parameters<typeof updateCompany>[1]
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
      id: number
      data: Parameters<typeof updateAccount>[1]
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
            <button
              className="btn btn-ghost btn-sm gap-1"
              onClick={() => setEditingCompany(true)}
            >
              <Pencil className="w-4 h-4" />
              Redigera
            </button>
            <button
              className="btn btn-ghost btn-sm gap-1 text-red-400 hover:text-red-600"
              onClick={() => setDeleteTarget(true)}
            >
              <Trash2 className="w-4 h-4" />
              Ta bort
            </button>
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
          <button
            className="btn btn-primary btn-sm gap-1"
            onClick={() => setShowNewAccount(true)}
          >
            <Plus className="w-4 h-4" />
            Nytt konto
          </button>
        </div>

        <div className="bg-base-100 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th className="tabular-nums text-base-content/40 w-12">ID</th>
                  <th>Namn</th>
                  <th>Kontonummer</th>
                  <th>Typ</th>
                  <th>Valuta</th>
                  <th>Åtgärder</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="hover">
                    <td className="tabular-nums text-base-content/40">{a.id}</td>
                    <td className="font-medium">{a.name}</td>
                    <td className="tabular-nums">
                      {a.account_number ?? '—'}
                    </td>
                    <td>
                      {label.accountType(a.account_type)}
                    </td>
                    <td>{a.currency}</td>
                    <td>
                      <div className="flex gap-0.5">
                        <button
                          className="btn btn-ghost btn-xs tooltip"
                          data-tip="Redigera"
                          onClick={() => setEditAccount(a)}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          className="btn btn-ghost btn-xs text-red-400 hover:text-red-600 tooltip"
                          data-tip="Ta bort"
                          onClick={() => setDeleteAccountTarget(a)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  submit: () => void
  canSubmit: boolean
}

function ModalFooter({
  onCancel,
  onSubmit,
  isPending,
  submitLabel,
}: {
  onCancel: () => void
  onSubmit: () => void
  isPending: boolean
  submitLabel: string
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

function CompanyForm({
  company,
  onSave,
  onActionsReady,
}: {
  company?: Company
  onSave: (data: {
    name: string
    org_number?: string
    fiscal_year_start?: string
  }) => void
  onActionsReady: (actions: FormActions) => void
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
        <input
          className="input input-bordered input-sm w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="label text-sm">Org.nr</label>
        <input
          className="input input-bordered input-sm w-full"
          value={orgNumber}
          onChange={(e) => setOrgNumber(e.target.value)}
          placeholder="XXXXXX-XXXX"
        />
      </div>
      <div>
        <label className="label text-sm">Räkenskapsår start</label>
        <input
          className="input input-bordered input-sm w-full"
          value={fiscalStart}
          onChange={(e) => setFiscalStart(e.target.value)}
          placeholder="MM-DD"
        />
      </div>
    </div>
  )
}

function AccountForm({
  account,
  onSave,
  onActionsReady,
}: {
  account?: Account
  onSave: (data: {
    name: string
    account_number?: string
    account_type?: string
    currency?: string
  }) => void
  onActionsReady: (actions: FormActions) => void
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
        <input
          className="input input-bordered input-sm w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="label text-sm">Kontonummer</label>
        <input
          className="input input-bordered input-sm w-full"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
        />
      </div>
      <div>
        <label className="label text-sm">Typ</label>
        <select
          className="select select-bordered select-sm w-full"
          value={accountType}
          onChange={(e) => setAccountType(e.target.value)}
        >
          <option value="bank">Bank</option>
          <option value="credit_card">Kreditkort</option>
          <option value="savings">Sparkonto</option>
          <option value="tax">Skattekonto</option>
        </select>
      </div>
      <div>
        <label className="label text-sm">Valuta</label>
        <select
          className="select select-bordered select-sm w-full"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          <option value="SEK">SEK</option>
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
        </select>
      </div>
    </div>
  )
}
