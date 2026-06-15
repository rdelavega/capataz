interface Props {
  status: 'presente' | 'ausente' | 'tarde' | null
}

const CFG: Record<string, { chip: string; label: string }> = {
  presente: { chip: 'chip chip-green',  label: 'Presente' },
  tarde:    { chip: 'chip chip-amber',  label: 'Tarde'    },
  ausente:  { chip: 'chip chip-red',    label: 'Ausente'  },
  null:     { chip: 'chip chip-gray',   label: 'S/R'      },
}

export function StatusBadge({ status }: Props) {
  const { chip, label } = CFG[status ?? 'null']
  return <span className={chip}>{label}</span>
}
