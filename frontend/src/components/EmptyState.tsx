import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'

interface Props {
  title: string;
  description?: string;
  icon?: LucideIcon;
}

export default function EmptyState({ title, description, icon: Icon = Inbox }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="w-10 h-10 opacity-30 mb-3" />
      <h3 className="text-lg font-medium opacity-70">{title}</h3>
      {description && (
        <p className="mt-1 text-sm opacity-50">{description}</p>
      )}
    </div>
  )
}
