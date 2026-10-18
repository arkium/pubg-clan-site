'use client'

import { createContext, useContext } from 'react'

import type { ShellBootstrap } from '@/lib/shell-bootstrap'

const ShellBootstrapContext = createContext<ShellBootstrap | null>(null)

/** Posé par le layout racine : l'état connu du serveur au premier rendu (`src/lib/shell-bootstrap.ts`). */
export function ShellBootstrapProvider({ value, children }: { value: ShellBootstrap; children: React.ReactNode }) {
  return <ShellBootstrapContext.Provider value={value}>{children}</ShellBootstrapContext.Provider>
}

/** `null` hors du layout racine (tests, page d'erreur de base) : les composants retombent sur leur ancien comportement. */
export function useShellBootstrap() {
  return useContext(ShellBootstrapContext)
}
