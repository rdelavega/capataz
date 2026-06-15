import { useState } from 'react'
import { type Page, Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { RegistrosDiarios } from './pages/RegistrosDiarios'
import { Equipo } from './pages/Equipo'

const PAGES: Record<Page, JSX.Element> = {
  dashboard: <Dashboard />,
  registros: <RegistrosDiarios />,
  equipo:    <Equipo />,
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')

  return (
    <div className="flex min-h-screen bg-[#F2EDE4]">
      <Sidebar current={page} onNavigate={setPage} />
      <div className="ml-56 flex-1">{PAGES[page]}</div>
    </div>
  )
}
