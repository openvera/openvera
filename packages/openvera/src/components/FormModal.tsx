import { Modal } from '@swedev/ui'

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}

export default function FormModal({ open, title, onClose, children, footer }: Props) {
  return (
    <Modal.Root open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <Modal.Header title={title} closeButton onClose={onClose} />
      <Modal.Body>{children}</Modal.Body>
      <Modal.Footer>{footer}</Modal.Footer>
    </Modal.Root>
  )
}
