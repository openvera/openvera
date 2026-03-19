import { ConfirmModal } from '@swedev/ui'

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Ta bort',
  onConfirm,
  onCancel,
}: Props) {
  return (
    <ConfirmModal
      open={open}
      onOpenChange={(v: boolean) => { if (!v) onCancel() }}
      title={title}
      description={message}
      confirmText={confirmLabel}
      cancelText="Avbryt"
      onConfirm={onConfirm}
      onCancel={onCancel}
      confirmSemantic="destructive"
    />
  )
}
