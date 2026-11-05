import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchCompany, updateCompany, type SiteLabel } from '../api/client'
import { SiteContext, siteWords } from '../lib/site'

export function SiteProvider({ children }: { children: ReactNode }) {
  const [label, setLabelState] = useState<SiteLabel>('obra')

  useEffect(() => {
    fetchCompany().then(c => setLabelState(c.site_label)).catch(() => {})
  }, [])

  const setLabel = useCallback(async (next: SiteLabel) => {
    const c = await updateCompany(next)
    setLabelState(c.site_label)
  }, [])

  const value = useMemo(() => siteWords(label, setLabel), [label, setLabel])
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>
}
