/** Swedish display labels for API enum values */

const docType: Record<string, string> = {
  invoice: 'Faktura',
  receipt: 'Kvitto',
  kvittens: 'Kvittens',
  outgoing_invoice: 'Utgående faktura',
  credit_note: 'Kreditnota',
  contract: 'Avtal',
  statement: 'Kontoutdrag',
  salary: 'Lönebesked',
  reminder: 'Påminnelse',
  balansrapport: 'Balansrapport',
  resultatrapport: 'Resultatrapport',
  betalningssammanstalning: 'Betalningssammanställning',
  other: 'Övrigt',
}

/** Document types that should be matched against bank transactions */
const matchableDocTypes = new Set([
  'invoice',
  'receipt',
  'outgoing_invoice',
  'credit_note',
])

const entityType: Record<string, string> = {
  business: 'Företag',
  person: 'Person',
  authority: 'Myndighet',
  charity: 'Välgörenhet',
}

const accountType: Record<string, string> = {
  bank: 'Bank',
  credit_card: 'Kreditkort',
  savings: 'Sparkonto',
  tax: 'Skattekonto',
}

const relationship: Record<string, string> = {
  vendor: 'Leverantör',
  customer: 'Kund',
  authority: 'Myndighet',
  charity: 'Välgörenhet',
}

const category: Record<string, string> = {
  expense: 'Utgift',
  income: 'Intäkt',
  transfer: 'Överföring',
  salary: 'Lön',
}

function lookup(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return '—'
  return map[key] ?? key
}

export const label = {
  docType: (v: string | null | undefined) => lookup(docType, v),
  isMatchable: (v: string | null | undefined) => !!v && matchableDocTypes.has(v),
  entityType: (v: string | null | undefined) => lookup(entityType, v),
  accountType: (v: string | null | undefined) => lookup(accountType, v),
  category: (v: string | null | undefined) => lookup(category, v),
  relationship: (v: string | null | undefined) => lookup(relationship, v),
}
