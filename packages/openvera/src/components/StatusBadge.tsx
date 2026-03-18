import {
  Archive,
  CheckCircle,
  Link,
  XCircle,
} from 'lucide-react'
import { Badge } from '@swedev/ui'

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
      <Badge semantic="neutral">
        <Archive className="w-3 h-3" />
        Arkiverad
      </Badge>
    )
  }
  if (matched && reviewed) {
    return (
      <Badge semantic="success">
        <CheckCircle className="w-3 h-3" />
        Matchad
      </Badge>
    )
  }
  if (matched) {
    return (
      <Badge semantic="info">
        <Link className="w-3 h-3" />
        Matchad{confidence ? ` ${confidence}%` : ''}
      </Badge>
    )
  }
  if (!label.isMatchable(docType)) {
    return null
  }
  return (
    <Badge semantic="error">
      <XCircle className="w-3 h-3" />
      Ej matchad
    </Badge>
  )
}
