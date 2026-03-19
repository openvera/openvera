import type {
  ChangeEvent,
  ComponentProps,
  KeyboardEvent,
  MouseEvent,
} from 'react'
import { useState } from 'react'
import { Spinner } from '@radix-ui/themes'
import { Button, Dropdown, TextField } from '@swedev/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, ChevronDown, Plus } from 'lucide-react'

import { createCompany } from '../api/companies'
import { useCompany } from '../hooks/useCompany'
import { cn } from '../utils'

type DropdownItemSelectEvent = Parameters<
  NonNullable<ComponentProps<typeof Dropdown.Item>['onSelect']>
>[0]

export default function CompanySelector() {
  const { companies, selected, setSelected, isLoading } = useCompany()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  const close = () => {
    setOpen(false)
    setShowCreate(false)
    setNewName('')
  }

  const createMut = useMutation({
    mutationFn: createCompany,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      setShowCreate(false)
      setNewName('')
    },
  })

  if (isLoading) {
    return <Spinner size="1" />
  }

  if (companies.length === 0) {
    return <span className="text-sm opacity-60">Inga företag</span>
  }

  return (
    <Dropdown.Root open={open} onOpenChange={setOpen}>
      <Dropdown.Trigger>
        <Button
          variant="ghost"
          size="2"
          icon={<Building2 />}
        >
          <span className="font-medium">{selected?.name ?? 'Välj företag'}</span>
          <ChevronDown />
        </Button>
      </Dropdown.Trigger>

      <Dropdown.Content
        variant="soft"
        align="end"
        className="min-w-56"
      >
        <Dropdown.Label>Välj företag</Dropdown.Label>

        {companies.map((c) => {
          const isActive = selected?.slug === c.slug
          return (
            <Dropdown.Item
              key={c.slug}
              className="h-auto py-2"
              onSelect={() => {
                setSelected(c)
                close()
              }}
            >
              <div className="flex items-center gap-3 w-full">
                <div
                  className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', {
                    'bg-primary/10 text-primary': isActive,
                    'bg-base-200/60 text-base-content/40': !isActive,
                  })}
                >
                  <Building2 />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn('text-sm text-nowrap', {
                      'font-semibold text-primary': isActive,
                      'font-medium': !isActive,
                    })}
                  >
                    {c.name}
                  </p>
                  {c.org_number && (
                    <p className="text-[11px] text-base-content/40 tabular-nums">
                      {c.org_number}
                    </p>
                  )}
                </div>
              </div>
            </Dropdown.Item>
          )
        })}

        <Dropdown.Separator />

        {showCreate
          ? (
              <div
                className="p-3 space-y-2"
                onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
                onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => e.stopPropagation()}
              >
                <TextField.Root
                  size="1"
                  variant="surface"
                  placeholder="Företagsnamn"
                  value={newName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter' && newName.trim()) {
                      createMut.mutate({ name: newName.trim() })
                    }
                  }}
                  autoFocus
                />
                <div className="flex justify-end gap-1.5">
                  <Button
                    variant="ghost"
                    size="1"
                    onClick={() => {
                      setShowCreate(false)
                      setNewName('')
                    }}
                    text="Avbryt"
                  />
                  <Button
                    semantic="action"
                    size="1"
                    disabled={!newName.trim() || createMut.isPending}
                    loading={createMut.isPending}
                    onClick={() => createMut.mutate({ name: newName.trim() })}
                    text="Skapa"
                  />
                </div>
              </div>
            )
          : (
              <Dropdown.Item
                onSelect={(e: DropdownItemSelectEvent) => {
                  e.preventDefault()
                  setShowCreate(true)
                }}
              >
                <div className="flex items-center gap-3 text-base-content/50">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-base-200/40 text-base-content/30">
                    <Plus className="w-4 h-4" />
                  </div>
                  Nytt företag
                </div>
              </Dropdown.Item>
            )}
      </Dropdown.Content>
    </Dropdown.Root>
  )
}
