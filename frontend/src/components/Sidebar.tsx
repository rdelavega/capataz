const NAV = [
  { icon: '▦', label: 'Panel de Control', active: true },
  { icon: '≡', label: 'Registros Diarios', active: false },
  { icon: '⬡', label: 'Equipo',            active: false },
  { icon: '◈', label: 'Configuración',      active: false },
]

export function Sidebar() {
  return (
    <aside
      className="fixed left-0 top-0 z-20 flex h-screen w-56 flex-col border-r-2 border-[#2A2622] bg-[#FFF8F3]"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      {/* Wordmark */}
      <div className="border-b-2 border-[#2A2622] px-4 py-5">
        <h1 className="hl-md leading-none text-[#D85A30]">Capataz</h1>
        <p className="label mt-1.5 text-[#58423B]">Panel de obra</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map(({ icon, label, active }) => (
          <a
            key={label}
            href="#"
            className={[
              'flex items-center gap-3 px-3 py-2.5 border-2 transition-colors',
              active
                ? 'bg-[#D85A30] border-[#2A2622] shadow-hard-sm text-white'
                : 'border-transparent text-[#2A2622] hover:bg-[#ECE1D3] hover:border-[#2A2622]',
            ].join(' ')}
          >
            <span style={{ fontSize: '1rem', lineHeight: 1 }}>{icon}</span>
            <span className="label">{label}</span>
          </a>
        ))}
      </nav>

      {/* CTA */}
      <div className="border-t-2 border-[#2A2622] p-3">
        <button className="label w-full border-2 border-[#2A2622] bg-[#D85A30] py-3 text-white shadow-hard-sm transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:bg-[#A5360D]">
          + Nueva tarea
        </button>
      </div>
    </aside>
  )
}
