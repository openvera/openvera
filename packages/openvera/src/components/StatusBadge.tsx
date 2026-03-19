import { Badge } from '@swedev/ui'
import {
  Archive,
  ClipboardCheck,
  CheckCircle,
  Link,
  XCircle,
} from 'lucide-react'

import { label } from '../labels'

interface Props {
  matched: boolean;
  reviewed?: boolean;
  dataVerified?: boolean;
  matchApproved?: boolean;
  archived?: boolean;
  confidence?: number | null;
  docType?: string | null;
}

export default function StatusBadge({
  matched,
  reviewed,
  dataVerified,
  matchApproved,
  archived,
  confidence,
  docType,
}: Props) {
  const approved = matchApproved ?? reviewed ?? false
  const verified = dataVerified ?? false

  if (archived) {
    return (
      <Badge semantic="neutral">
        <Archive className="w-3 h-3" />
        Arkiverad
      </Badge>
    )
  }

  if (docType) {
    if (!label.isMatchable(docType)) {
      return verified
        ? (
            <span className="badge badge-success badge-sm gap-1">
              <ClipboardCheck className="w-3 h-3" />
              Verifierad
            </span>
          )
        : (
            <span className="badge badge-warning badge-sm gap-1">
              <XCircle className="w-3 h-3" />
              Ej verifierad
            </span>
          )
    }

    if (!verified) {
      return (
        <span className="badge badge-warning badge-sm gap-1">
          <XCircle className="w-3 h-3" />
          Ej verifierad
        </span>
      )
    }

    if (matched && approved) {
      return (
        <span className="badge badge-success badge-sm gap-1">
          <CheckCircle className="w-3 h-3" />
          Klar
        </span>
      )
    }

    if (matched) {
      return (
        <span className="badge badge-info badge-sm gap-1">
          <Link className="w-3 h-3" />
          Matchning vantar
        </span>
      )
    }

    return (
      <span className="badge badge-error badge-sm gap-1">
        <XCircle className="w-3 h-3" />
        Ej matchad
      </span>
    )
  }

  if (matched && approved) {
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

  return (
    <Badge semantic="error">
      <XCircle className="w-3 h-3" />
      Ej matchad
    </Badge>
  )
}
