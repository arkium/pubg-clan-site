'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import {
  Search,
  Monitor,
  Users,
  BarChart3,
  Settings,
  Shield,
  Award,
  Map,
  Swords,
  Trophy,
  Target
} from 'lucide-react'
import { useSelectedClan } from '@/hooks/useSelectedClan'

export function GlobalCommandPalette() {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()
  const { clanId } = useSelectedClan()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const runCommand = React.useCallback(
    (command: () => void) => {
      setOpen(false)
      command()
    },
    []
  )

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Palette de commande" className="command-palette-dialog">
      <div className="flex items-center border-b border-slate-200/20 px-3" cmdk-input-wrapper="">
        <Search className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
        <Command.Input
          placeholder="Rechercher une page ou un outil..."
          className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50 text-[var(--theme-ui-text)]"
        />
      </div>
      <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-2 text-[var(--theme-ui-text)]">
        <Command.Empty className="py-6 text-center text-sm text-[var(--theme-ui-text-muted)]">
          Aucun résultat trouvé.
        </Command.Empty>

        <Command.Group heading="Navigation Générale">
          <Command.Item onSelect={() => runCommand(() => router.push('/'))}>
            <Monitor className="mr-2 h-4 w-4" /> Accueil
          </Command.Item>
          <Command.Item onSelect={() => runCommand(() => router.push('/clans'))}>
            <Users className="mr-2 h-4 w-4" /> Liste des clans
          </Command.Item>
          <Command.Item onSelect={() => runCommand(() => router.push('/clans-leaderboard'))}>
            <Trophy className="mr-2 h-4 w-4" /> Ligue
          </Command.Item>
          <Command.Item onSelect={() => runCommand(() => router.push('/clans/comparator'))}>
            <Target className="mr-2 h-4 w-4" /> Comparateur
          </Command.Item>
          <Command.Item onSelect={() => runCommand(() => router.push('/account'))}>
            <Settings className="mr-2 h-4 w-4" /> Mon compte
          </Command.Item>
        </Command.Group>

        {clanId && (
          <Command.Group heading="Clan Courant">
            <Command.Item onSelect={() => runCommand(() => router.push(`/clans/${clanId}/overview`))}>
              <BarChart3 className="mr-2 h-4 w-4" /> Vue d'ensemble
            </Command.Item>
            <Command.Item onSelect={() => runCommand(() => router.push(`/clans/${clanId}/members`))}>
              <Users className="mr-2 h-4 w-4" /> Membres
            </Command.Item>
            <Command.Item onSelect={() => runCommand(() => router.push(`/clans/${clanId}/matches`))}>
              <Swords className="mr-2 h-4 w-4" /> Matchs
            </Command.Item>
            <Command.Item onSelect={() => runCommand(() => router.push(`/clans/${clanId}/stats`))}>
              <BarChart3 className="mr-2 h-4 w-4" /> Stats
            </Command.Item>
            <Command.Item onSelect={() => runCommand(() => router.push(`/clans/${clanId}/leaderboard`))}>
              <Trophy className="mr-2 h-4 w-4" /> Classement
            </Command.Item>
            <Command.Item onSelect={() => runCommand(() => router.push(`/clans/${clanId}/awards`))}>
              <Award className="mr-2 h-4 w-4" /> Awards
            </Command.Item>
            <Command.Item onSelect={() => runCommand(() => router.push(`/clans/${clanId}/drop-zones`))}>
              <Map className="mr-2 h-4 w-4" /> Drop Zones
            </Command.Item>
          </Command.Group>
        )}

        {clanId && (
          <Command.Group heading="Télémétrie & Administration">
            <Command.Item onSelect={() => runCommand(() => router.push(`/clans/${clanId}/telemetry/dashboard`))}>
              <Shield className="mr-2 h-4 w-4" /> Dashboard Télémétrie
            </Command.Item>
            <Command.Item onSelect={() => runCommand(() => router.push(`/clans/${clanId}/telemetry/matches`))}>
              <Swords className="mr-2 h-4 w-4" /> Matchs bruts
            </Command.Item>
            <Command.Item onSelect={() => runCommand(() => router.push(`/clans/${clanId}/telemetry/opponents`))}>
              <Target className="mr-2 h-4 w-4" /> Adversaires
            </Command.Item>
            <Command.Item onSelect={() => runCommand(() => router.push(`/clans/${clanId}/telemetry/errors`))}>
              <Shield className="mr-2 h-4 w-4" /> Erreurs d'analyse
            </Command.Item>
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  )
}
