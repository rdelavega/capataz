interface Props {
  status: 'presente' | 'ausente' | 'tarde' | null
}

const LABEL: Record<string, string> = {
  presente: 'Presente',
  tarde: 'Tarde',
  ausente: 'Ausente',
}

const CLASS: Record<string, string> = {
  presente: 'att-presente',
  tarde: 'att-tarde',
  ausente: 'att-ausente',
}

export function StatusBadge({ status }: Props) {
  const cls = status ? CLASS[status] : 'att-null'
  const label = status ? LABEL[status] : 'Sin registro'
  return (
    <span className={`${cls} inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium`}>
      {label}
    </span>
  )
}
