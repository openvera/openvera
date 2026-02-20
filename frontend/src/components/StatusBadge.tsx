import {
  Archive,
  CheckCircle,
  Link,
  XCircle,
} from 'lucide-react'

import { label } from '../labels'

interface Props {
  matched: boolean;
  reviewed?: boolean;
  archived?: boolean;
  confidence?: number | null;
  docType?: string | null;
}

export default function StatusBadge({
  matched,
  reviewed,
  archived,
  confidence,
  docType,
}: Props) {
  if (archived) {
    return (
      <span className="badge badge-ghost badge-sm gap-1">
        <Archive className="w-3 h-3" />
        Arkiverad
      </span>
    )
  }
  if (matched && reviewed) {
    return (
      <span className="badge badge-success badge-sm gap-1">
        <CheckCircle className="w-3 h-3" />
        Matchad
      </span>
    )
  }
  if (matched) {
    return (
      <span className="badge badge-info badge-sm gap-1">
        <Link className="w-3 h-3" />
        Matchad{confidence ? ` ${confidence}%` : ''}
      </span>
    )
  }
  if (!label.isMatchable(docType)) {
    return null
  }
  return (
    <span className="badge badge-error badge-sm gap-1">
      <XCircle className="w-3 h-3" />
      Ej matchad
    </span>
  )
}
