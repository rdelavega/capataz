import { useEffect } from 'react'

const ACTIVE_MS = 10_000
const HIDDEN_MS = 60_000

/**
 * Vuelve a cargar en silencio cada 10 s mientras la pestaña está a la vista
 * (cada minuto si está oculta), y al regresar a la pestaña. Para que lo que
 * mandan por WhatsApp aparezca solo, sin recargar.
 */
export function usePolling(refresh: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    let id = setInterval(refresh, document.hidden ? HIDDEN_MS : ACTIVE_MS)
    function onVisibility() {
      clearInterval(id)
      id = setInterval(refresh, document.hidden ? HIDDEN_MS : ACTIVE_MS)
      if (!document.hidden) refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh, enabled])
}
