import { Badge } from '@swedev/ui'
import {
  Archive,
  CheckCircle,
  ClipboardCheck,
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
            <Badge semantic="success">
              <ClipboardCheck className="w-3 h-3" />
              Verifierad
            </Badge>
          )
        : (
            <Badge semantic="warning">
              <XCircle className="w-3 h-3" />
              Ej verifierad
            </Badge>
          )
    }

    if (!verified) {
      return (
        <Badge semantic="warning">
          <XCircle className="w-3 h-3" />
          Ej verifierad
        </Badge>
      )
    }

    if (matched && approved) {
      return (
        <Badge semantic="success">
          <CheckCircle className="w-3 h-3" />
          Klar
        </Badge>
      )
    }

    if (matched) {
      return (
        <Badge semantic="info">
          <Link className="w-3 h-3" />
          Matchning vantar
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
