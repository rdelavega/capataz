import { type ReactElement, useState } from 'react'
import { type AuthUser, getStoredUser, logout } from './api/client'
import { MobileNav, type Page, Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { Equipo } from './pages/Equipo'
import { Login } from './pages/Login'
import { RegistrosDiarios } from './pages/RegistrosDiarios'
import { Tareas } from './pages/Tareas'

const PAGES: Record<Page, ReactElement> = {
  dashboard: <Dashboard />,
  registros: <RegistrosDiarios />,
  equipo:    <Equipo />,
  tareas:    <Tareas />,
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser)
  const [page, setPage] = useState<Page>('dashboard')

  if (!user) {
    return <Login onLogin={setUser} />
  }

  function handleLogout() {
    logout()
    setUser(null)
  }

  return (
    <div className="flex min-h-screen bg-[#F2EDE4]">
      <Sidebar current={page} onNavigate={setPage} user={user} onLogout={handleLogout} />
      <div className="min-w-0 flex-1 pb-20 md:ml-56 md:pb-0">{PAGES[page]}</div>
      <MobileNav current={page} onNavigate={setPage} onLogout={handleLogout} />
    </div>
  )
}
