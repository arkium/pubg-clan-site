'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import MobileDropdownNav, { type MobileDropdownNavItem } from '@/components/ui/MobileDropdownNav'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useNavPermissions } from '@/hooks/useNavPermissions'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { getItemRole, getRoleLinkClass, NAV_REGISTRY, type NavRole, type NavSection } from '@/lib/nav-permissions-registry'

type Props = {
  section: NavSection
}

const SECTION_NAV_LABELS: Partial<Record<NavSection, string>> = {
  'clan-section': 'Navigation du clan',
  'member-section': 'Navigation membre',
  'admin-menu': 'Navigation admin',
  'owner-menu': 'Navigation owner',
  'superuser-menu': 'Navigation SuperUser',
}

// Items whose active state requires an exact pathname match (not startsWith)
const EXACT_MATCH_KEYS = new Set(['clan.stats'])

function renderNavIcon(label: string): ReactNode {
  const cls = 'h-4 w-4 shrink-0'

  const icons: Record<string, ReactNode> = {
    // ── Clan section ─────────────────────────────────────────────────────────
    "Vue d'ensemble": (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M3 3h6v6H3V3Zm0 8h6v6H3v-6Zm8-8h6v6h-6V3Zm0 8h6v6h-6v-6Z" />
      </svg>
    ),
    'Stats armes': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M3 10.5a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 3 10.5Zm0 3a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 3 13.5Zm0-6a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 3 7.5Zm6-2.25A.75.75 0 0 1 9.75 4.5h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 9 5.25Zm.75 3.75a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 4a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z" />
      </svg>
    ),
    'Heatmap kills': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12A6 6 0 0 1 10 4Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" />
      </svg>
    ),
    'Positions': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12A6 6 0 0 1 10 4Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" />
      </svg>
    ),
    'Drop zones': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M10 2.5a5.5 5.5 0 0 0-5.5 5.5c0 3.95 4.5 8.77 5.5 9.78 1-.99 5.5-5.83 5.5-9.78A5.5 5.5 0 0 0 10 2.5Zm0 7.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
      </svg>
    ),
    'Membres': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M10 3.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM4 16a6 6 0 1 1 12 0H4Z" />
      </svg>
    ),
    'Matchs': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M4.5 3A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 15.5 3h-11Zm.5 3h10v2H5V6Zm0 4h4v4H5v-4Zm6 0h4v4h-4v-4Z" />
      </svg>
    ),
    'Stats': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M4 16h3V9H4v7Zm4 0h4V5H8v11Zm5 0h3v-3h-3v3Z" />
      </svg>
    ),
    'Classement': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M5 3.5h3v10H5v-10Zm4.5 3h3v7h-3v-7ZM14 2.5h3v11h-3v-11ZM3.5 15.5h13V17h-13v-1.5Z" />
      </svg>
    ),
    'Rapports': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M5 3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10V7.8L12.2 5H5Zm7 1.7L14.3 7H12V4.7ZM6 10h8v1.5H6V10Zm0 3h8v1.5H6V13Z" />
      </svg>
    ),
    'Challenges': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M10 2a4.5 4.5 0 0 0-4.5 4.5c0 1.68.92 3.14 2.28 3.92l-.3 1.58H6a.75.75 0 0 0 0 1.5h.97l-.22 1.25a.75.75 0 0 0 .74.88h5.02a.75.75 0 0 0 .74-.88L13.03 13.5H14a.75.75 0 0 0 0-1.5h-1.48l-.3-1.58A4.5 4.5 0 0 0 10 2Zm0 1.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
      </svg>
    ),
    'Catégories armes': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M3 5h4v4H3V5Zm0 6h4v4H3v-4Zm6-6h8v1.5H9V5Zm0 3h8v1.5H9V8Zm0 3h8v1.5H9v-1.5Zm0 3h8v1.5H9v-1.5Z" />
      </svg>
    ),
    'Awards': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M5 3.5A1.5 1.5 0 0 0 3.5 5v2A3.5 3.5 0 0 0 7 10.5h.3A2.75 2.75 0 0 0 9.25 12v1.76l-1.9.63a.75.75 0 0 0 .24 1.46h4.82a.75.75 0 0 0 .24-1.46l-1.9-.63V12a2.75 2.75 0 0 0 1.95-1.5H13A3.5 3.5 0 0 0 16.5 7V5A1.5 1.5 0 0 0 15 3.5H5Zm0 1.5H7v4H7A2 2 0 0 1 5 7V5Zm8 0h2v2a2 2 0 0 1-2 2h-.01V5Z" />
      </svg>
    ),

    // ── Member section ────────────────────────────────────────────────────────
    'Tableau de bord': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M3 3h6v6H3V3Zm0 8h6v6H3v-6Zm8-8h6v6h-6V3Zm0 8h6v6h-6v-6Z" />
      </svg>
    ),
    'Stats globales': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M4 16h3V9H4v7Zm4 0h4V5H8v11Zm5 0h3v-3h-3v3Z" />
      </svg>
    ),
    'Armes': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M3 10.5a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 3 10.5Zm0 3a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 3 13.5Zm0-6a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 3 7.5Zm6-2.25A.75.75 0 0 1 9.75 4.5h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 9 5.25Zm.75 3.75a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 4a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z" />
      </svg>
    ),
    'Cartes': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M4.5 3.5A1.5 1.5 0 0 0 3 5v10a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 17 15V5a1.5 1.5 0 0 0-1.5-1.5h-11ZM6 7h8v1.4H6V7Zm0 2.9h5.5v1.4H6V9.9Zm0 2.9h8v1.4H6v-1.4Z" />
      </svg>
    ),
    'Calendrier': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M5 3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5Zm0 1.5h10a.5.5 0 0 1 .5.5v2.5h-11V5a.5.5 0 0 1 .5-.5ZM4.5 9h11v6a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V9Z" />
      </svg>
    ),
    'Récompenses': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M5 3.5A1.5 1.5 0 0 0 3.5 5v2A3.5 3.5 0 0 0 7 10.5h.3A2.75 2.75 0 0 0 9.25 12v1.76l-1.9.63a.75.75 0 0 0 .24 1.46h4.82a.75.75 0 0 0 .24-1.46l-1.9-.63V12a2.75 2.75 0 0 0 1.95-1.5H13A3.5 3.5 0 0 0 16.5 7V5A1.5 1.5 0 0 0 15 3.5H5Zm0 1.5H7v4H7A2 2 0 0 1 5 7V5Zm8 0h2v2a2 2 0 0 1-2 2h-.01V5Z" />
      </svg>
    ),
    'Préférences notifs': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M4.5 4A1.5 1.5 0 0 0 3 5.5v9A1.5 1.5 0 0 0 4.5 16h11a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 15.5 4h-11Zm0 1.5h11v.4L10 9.8 4.5 5.9v-.4Zm0 2.2 5 3.5a1 1 0 0 0 1 0l5-3.5v6.8h-11V7.7Z" />
      </svg>
    ),
    'Notifications': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M10 2a6 6 0 0 0-6 6v3.5L2.5 13v1h15v-1L16 11.5V8a6 6 0 0 0-6-6Zm0 16a2 2 0 0 0 2-2H8a2 2 0 0 0 2 2Z" />
      </svg>
    ),

    // ── Admin menu ────────────────────────────────────────────────────────────
    'Ajouter un joueur': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M10 3.3a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Zm0 8.2c-3 0-5.4 1.5-5.4 3.5 0 .6.4 1 1 1h9c.6 0 1-.4 1-1 0-2-2.4-3.5-5.4-3.5Zm.8 1.2h1.4v1.5h1.5v1.4h-1.5v1.5h-1.4v-1.5H9.3v-1.4h1.5v-1.5Z" />
      </svg>
    ),
    'Joueurs et rôles': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M7 4.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Zm6 0a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6ZM3.9 14.7c0-1.8 1.9-3.2 4.1-3.2s4.1 1.4 4.1 3.2v.8h-8.2v-.8Zm9.5.8v-.8c0-.8-.3-1.6-.8-2.2 1.7.1 3.1 1.1 3.1 2.4v.6h-2.3Z" />
      </svg>
    ),
    'Alias cartes PUBG': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M4.5 3.5A1.5 1.5 0 0 0 3 5v10a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 17 15V5a1.5 1.5 0 0 0-1.5-1.5h-11ZM6 7h8v1.4H6V7Zm0 2.9h5.5v1.4H6V9.9Zm0 2.9h8v1.4H6v-1.4Z" />
      </svg>
    ),
    'Alias armes PUBG': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M3 11.5 8.8 5.7a1.5 1.5 0 0 1 2.12 0l3.38 3.38a1.5 1.5 0 0 1 0 2.12L8.5 17H6v-2.5L3 11.5Zm10.8-7.3a1 1 0 0 1 1.4 0l.6.6a1 1 0 0 1 0 1.4l-1.2 1.2-2-2 1.2-1.2Z" />
      </svg>
    ),
    'Alias catégories armes': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M3 5h4v4H3V5Zm0 6h4v4H3v-4Zm6-6h8v1.5H9V5Zm0 3h8v1.5H9V8Zm0 3h8v1.5H9v-1.5Zm0 3h8v1.5H9v-1.5Z" />
      </svg>
    ),
    'Alias phases PUBG': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M4 4.5A1.5 1.5 0 0 1 5.5 3h9A1.5 1.5 0 0 1 16 4.5v2A1.5 1.5 0 0 1 14.5 8h-9A1.5 1.5 0 0 1 4 6.5v-2Zm0 6A1.5 1.5 0 0 1 5.5 9h5A1.5 1.5 0 0 1 12 10.5v2A1.5 1.5 0 0 1 10.5 14h-5A1.5 1.5 0 0 1 4 12.5v-2Z" />
      </svg>
    ),
    'Accueil login': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M10 3.2 3.4 8.3v8.5h4.3v-5.1h4.6v5.1h4.3V8.3L10 3.2Z" />
      </svg>
    ),

    // ── Owner menu ────────────────────────────────────────────────────────────
    'Dashboard télémétrie': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M3 3h6v6H3V3Zm0 8h6v6H3v-6Zm8-8h6v6h-6V3Zm0 8h6v6h-6v-6Z" />
      </svg>
    ),
    'Erreurs télémétrie': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Zm0 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm-.75 3.25v5h1.5v-5h-1.5Zm0 6.5v1.5h1.5v-1.5h-1.5Z" />
      </svg>
    ),
    'Sync batch manuel': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M10 3.2a6.8 6.8 0 1 0 6.8 6.8h-1.6A5.2 5.2 0 1 1 10 4.8V3.2Zm1.5 0v4.3l3.5-2-3.5-2.3Z" />
      </svg>
    ),
    'Ouvrir Ops Cron': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M10 4.1a5.9 5.9 0 1 0 0 11.8 5.9 5.9 0 0 0 0-11.8Zm0 1.5a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8Zm-.7 1.7v3.4c0 .2.1.4.3.6l2.3 1.8.9-1.1-2-1.5V7.3H9.3Z" />
      </svg>
    ),
    'Recoveries telemetry': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M10 3.2a6.8 6.8 0 1 0 6.8 6.8h-1.6A5.2 5.2 0 1 1 10 4.8V3.2Zm.8 3H9.2v4.6l3.8 2.3.8-1.3-3-1.8V6.2Zm4.7-1 .9.9-2.1 2.1-.9-.9 2.1-2.1Z" />
      </svg>
    ),
    'Télémétrie matchs': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Zm0 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm0 2.25a.75.75 0 0 0-.75.75v4.19l-2.72 2.72a.75.75 0 1 0 1.06 1.06l3-3A.75.75 0 0 0 10.75 11V6.5A.75.75 0 0 0 10 5.75Z" />
      </svg>
    ),
    'Test email': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M4.5 4A1.5 1.5 0 0 0 3 5.5v9A1.5 1.5 0 0 0 4.5 16h11a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 15.5 4h-11Zm0 1.5h11v.4L10 9.8 4.5 5.9v-.4Zm0 2.2 5 3.5a1 1 0 0 0 1 0l5-3.5v6.8h-11V7.7Z" />
      </svg>
    ),
    'Monitoring PUBG API': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M3.5 4.5h13v11h-13v-11Zm1.5 1.5V14h10V6h-10Zm1.5 5.5 1.8-2.2 1.8 1.4 2.5-3.1 1.2 1-3.4 4.2-2.1-1.6-1.2 1.5-.6-.6Z" />
      </svg>
    ),
    'Permissions nav': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" />
      </svg>
    ),
    'Changer de clan': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M6.2 3.8H4v12.4h2.2V3.8Zm9.8 0H7.8v5h8.2l-1.6-2.5L16 3.8Zm0 7.4H7.8v5H16l-1.6-2.5 1.6-2.5Z" />
      </svg>
    ),

    // ── SuperUser menu ────────────────────────────────────────────────────────
    'Tous les clans': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M6.2 3.8H4v12.4h2.2V3.8Zm9.8 0H7.8v5h8.2l-1.6-2.5L16 3.8Zm0 7.4H7.8v5H16l-1.6-2.5 1.6-2.5Z" />
      </svg>
    ),
    'Config plateforme': (
      <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
        <path fill="currentColor" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" />
      </svg>
    ),
  }

  return icons[label] ?? (
    <svg viewBox="0 0 20 20" className={cls} aria-hidden="true">
      <path fill="currentColor" d="M10 3a7 7 0 1 0 0 14A7 7 0 0 0 10 3Zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z" />
    </svg>
  )
}

// Same mapping as nav-permissions page: role → section where the item should appear
const ROLE_TO_TARGET_SECTION: Partial<Record<NavRole, NavSection>> = {
  admin: 'admin-menu',
  owner: 'owner-menu',
  superuser: 'superuser-menu',
}

function canAccess(role: NavRole, isOwner: boolean, isAdmin: boolean, isSuperUser: boolean): boolean {
  if (role === 'hidden') return false
  if (role === 'superuser') return isSuperUser
  if (role === 'owner') return isOwner || isSuperUser
  if (role === 'admin') return isAdmin || isSuperUser
  return true
}

export default function SectionNav({ section }: Props) {
  const pathname = usePathname()
  const navPerms = useNavPermissions()
  const { activeMemberId, permissions, isSuperUser } = useAuthSession()
  const { clanId } = useSelectedClan()

  const hasWildcard = permissions.includes('*')
  const isOwner = hasWildcard
  const isAdmin =
    hasWildcard ||
    permissions.includes('manage_members') ||
    permissions.includes('manage_roles') ||
    permissions.includes('manage_settings')

  function resolveHref(template: string): string {
    return (
      template
        .replace(':clanId', clanId ? String(clanId) : '')
        .replace(':memberId', activeMemberId ? String(activeMemberId) : '')
        .replace(/\/:[^/]+/g, '') || '/'
    )
  }

  function isActive(navKey: string, href: string): boolean {
    if (EXACT_MATCH_KEYS.has(navKey)) return pathname === href
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  // Native items that stay in this section (not migrated to another)
  const nativeItems = NAV_REGISTRY.filter((i) => {
    if (i.section !== section) return false
    const effectiveRole = getItemRole(i.navKey, navPerms.roles)
    const target = ROLE_TO_TARGET_SECTION[effectiveRole]
    return !target || target === section
  })

  const posOrder = navPerms.positions[section] as string[] | undefined
  const orderedNative = posOrder
    ? [...nativeItems].sort((a, b) => {
        const ai = posOrder.indexOf(a.navKey)
        const bi = posOrder.indexOf(b.navKey)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
    : nativeItems

  // Items promoted from other sections whose effective role targets this section
  const promotedItems = NAV_REGISTRY.filter((i) => {
    if (i.section === section) return false
    const effectiveRole = getItemRole(i.navKey, navPerms.roles)
    return ROLE_TO_TARGET_SECTION[effectiveRole] === section
  })

  const promotedOrder = navPerms.promotedPositions[section] as string[] | undefined
  const orderedPromoted = promotedOrder && promotedOrder.length > 0
    ? [...promotedItems].sort((a, b) => {
        const ai = promotedOrder.indexOf(a.navKey)
        const bi = promotedOrder.indexOf(b.navKey)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
    : promotedItems

  const visibleItems = [...orderedNative, ...orderedPromoted]
    .filter((i) => canAccess(getItemRole(i.navKey, navPerms.roles), isOwner, isAdmin, isSuperUser))
    .map((i) => ({
      navKey: i.navKey,
      label: i.label,
      displayLabel: navPerms.labels[i.navKey] ?? i.label,
      href: resolveHref(i.hrefTemplate),
    }))

  if (visibleItems.length === 0) return null

  const activeItem =
    visibleItems.find((i) => isActive(i.navKey, i.href)) ?? visibleItems[0]

  const mobileItems: MobileDropdownNavItem[] = visibleItems.map((i) => ({
    key: i.navKey,
    href: i.href,
    label: i.displayLabel,
    active: isActive(i.navKey, i.href),
    icon: renderNavIcon(i.label),
    role: (() => {
      const r = getItemRole(i.navKey, navPerms.roles)
      return r === 'admin' || r === 'owner' ? r : undefined
    })(),
  }))

  const navLabel = SECTION_NAV_LABELS[section] ?? 'Navigation'

  return (
    <div className="mt-4">
      {/* Mobile dropdown */}
      <MobileDropdownNav
        id={`section-nav-${section}`}
        label={navLabel}
        currentLabel={activeItem.displayLabel}
        items={mobileItems}
        variant="compact"
        visibilityClass="block md:hidden"
        className="w-full max-w-xs"
      />

      {/* Desktop nav */}
      <nav className="hidden flex-wrap items-center gap-2 md:flex" aria-label={navLabel}>
        {visibleItems.map((item) => {
          const active = isActive(item.navKey, item.href)
          const role = getItemRole(item.navKey, navPerms.roles)
          const roleClass = getRoleLinkClass(role, active, 'section')

          return (
            <Link
              key={item.navKey}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={['clan-section-nav-link', roleClass, active ? 'shadow-sm' : '']
                .filter(Boolean)
                .join(' ')}
            >
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                {renderNavIcon(item.label)}
              </span>
              {item.displayLabel}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
