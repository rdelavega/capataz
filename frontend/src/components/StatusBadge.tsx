interface Props {
  status: 'presente' | 'ausente' | 'tarde' | null
}

const config = {
  presente: { label: 'Presente', classes: 'bg-green-100 text-green-800' },
  tarde: { label: 'Tarde', classes: 'bg-yellow-100 text-yellow-800' },
  ausente: { label: 'Ausente', classes: 'bg-red-100 text-red-800' },
  null: { label: 'Sin registro', classes: 'bg-gray-100 text-gray-500' },
}

export function StatusBadge({ status }: Props) {
  const key = status ?? 'null'
  const { label, classes } = config[key]
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}>
      {label}
    </span>
  )
}
