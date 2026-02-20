interface Props {
  amount: number | null | undefined;
  currency?: string;
}

export default function AmountCell({ amount, currency = 'SEK' }: Props) {
  if (amount === null || amount === undefined) return <span className="opacity-40">—</span>

  const formatted = new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)

  return (
    <span
      className="tabular-nums font-medium"
    >
      {formatted}
    </span>
  )
}
