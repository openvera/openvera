interface Props {
  date: string | null | undefined;
}

export default function DateCell({ date }: Props) {
  if (!date) return <span className="opacity-40">—</span>
  return <span>{date}</span>
}
