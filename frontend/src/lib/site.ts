import { createContext, useContext } from 'react'
import type { SiteLabel } from '../api/client'

const PLURAL: Record<SiteLabel, string> = { obra: 'obras', sucursal: 'sucursales', ruta: 'rutas', zona: 'zonas' }
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export interface SiteWords {
  label: SiteLabel
  /** 'obra' · 'obras' · 'Obra' · 'Obras'. Las cuatro opciones son femeninas: "la", "una", "nueva", "sin" sirven igual. */
  one: string
  many: string
  One: string
  Many: string
  options: SiteLabel[]
  setLabel: (label: SiteLabel) => Promise<void>
}

export function siteWords(label: SiteLabel, setLabel: SiteWords['setLabel']): SiteWords {
  return {
    label, one: label, many: PLURAL[label], One: cap(label), Many: cap(PLURAL[label]),
    options: Object.keys(PLURAL) as SiteLabel[], setLabel,
  }
}

export const SiteContext = createContext<SiteWords>(siteWords('obra', async () => {}))

/** Cómo le llama esta empresa a sus lugares de trabajo (Obra, Sucursal, Ruta o Zona). */
export const useSite = () => useContext(SiteContext)
