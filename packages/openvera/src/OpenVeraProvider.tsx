import type { ReactNode } from 'react'

import { configure } from './config'

export function OpenVeraProvider({ url = '', children }: { url?: string; children: ReactNode }) {
  configure({ baseUrl: url })
  return <>{children}</>
}
