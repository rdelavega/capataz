import { useState } from 'react'
import { login, type AuthUser } from '../api/client'

export function Login({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const emailVal    = (form.elements.namedItem('email')    as HTMLInputElement).value
    const passwordVal = (form.elements.namedItem('password') as HTMLInputElement).value
    setLoading(true)
    setError(null)
    try {
      const user = await login(emailVal, passwordVal)
      onLogin(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F2EDE4] px-4">
      <div className="w-full max-w-sm border-2 border-[#2A2622] bg-[#FFF8F3] shadow-hard">

        <div className="border-b-2 border-[#2A2622] bg-[#D85A30] px-6 py-5 flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Capataz"
            className="h-10 w-10 shrink-0 border-2 border-[#2A2622] object-cover"
          />
          <div>
            <h1 className="hl-md text-white leading-none">Capataz</h1>
            <p className="label text-[#FDDCC8]">Panel de control</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label text-[#58423B]">Correo</label>
            <input
              type="email"
              name="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="dueno@empresa.com"
              autoFocus
              required
              className="mt-1 w-full border-2 border-[#2A2622] bg-white px-3 py-2 mono text-sm text-[#2A2622] focus:outline-none focus:border-[#D85A30]"
            />
          </div>

          <div>
            <label className="label text-[#58423B]">Contraseña</label>
            <input
              type="password"
              name="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="mt-1 w-full border-2 border-[#2A2622] bg-white px-3 py-2 mono text-sm text-[#2A2622] focus:outline-none focus:border-[#D85A30]"
            />
          </div>

          {error && <p className="label text-[#A32D2D]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full border-2 border-[#2A2622] bg-[#D85A30] py-2.5 label text-white shadow-hard-sm transition-all hover:bg-[#A5360D] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
