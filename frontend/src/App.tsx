import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'

export default function App() {
  return (
    <div className="flex min-h-screen bg-[#F2EDE4]">
      <Sidebar />
      <div className="ml-56 flex-1">
        <Dashboard />
      </div>
    </div>
  )
}
