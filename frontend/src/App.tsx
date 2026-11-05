import { useState } from 'react'
import { type AuthUser, getStoredUser, logout } from './api/client'
import { MobileNav, type Page, Sidebar } from './components/Sidebar'
import { SiteProvider } from './components/SiteProvider'
import { WorkerDrawerProvider } from './components/WorkerDrawer'
import { Dashboard } from './pages/Dashboard'
import { Equipo } from './pages/Equipo'
import { Login } from './pages/Login'
import { RegistrosDiarios } from './pages/RegistrosDiarios'
import { Tareas } from './pages/Tareas'

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
    <SiteProvider>
    <WorkerDrawerProvider>
      <div className="flex min-h-screen bg-[#F2EDE4]">
        <Sidebar current={page} onNavigate={setPage} user={user} onLogout={handleLogout} />
        <div className="min-w-0 flex-1 pb-20 md:ml-56 md:pb-0">
          {page === 'dashboard' && <Dashboard userName={user.name} onNavigate={setPage} />}
          {page === 'registros' && <RegistrosDiarios />}
          {page === 'equipo' && <Equipo />}
          {page === 'tareas' && <Tareas />}
        </div>
        <MobileNav current={page} onNavigate={setPage} onLogout={handleLogout} />
      </div>
    </WorkerDrawerProvider>
    </SiteProvider>
  )
}
