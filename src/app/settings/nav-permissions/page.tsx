'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthSession } from '@/hooks/useAuthSession'
import { invalidateNavPermissionsCache } from '@/hooks/useNavPermissions'
import {
  NAV_REGISTRY,
  NAV_SECTION_LABELS,
  type NavRole,
  type NavSection,
  type NavItemDef,
} from '@/lib/nav-permissions-registry'

// ─── Types ────────────────────────────────────────────────────────────────────

type PermissionMap = Record<string, NavRole>
type PositionMap = Record<string, string[]>
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES: NavRole[] = ['none', 'member', 'admin', 'owner']

const ROLE_META: Record<NavRole, { label: string; color: string; bg: string; border: string; dot: string }> = {
  none:   { label: 'Tous',    color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-300', dot: 'bg-slate-400' },
  member: { label: 'Membre',  color: 'text-sky-700',   bg: 'bg-sky-50',    border: 'border-sky-300',   dot: 'bg-sky-500'   },
  admin:  { label: 'Admin',   color: 'text-red-700',   bg: 'bg-red-50',    border: 'border-red-300',   dot: 'bg-red-500'   },
  owner:  { label: 'Owner',   color: 'text-amber-700', bg: 'bg-amber-50',  border: 'border-amber-400', dot: 'bg-amber-500' },
}

const SECTION_ORDER: NavSection[] = ['clan-section', 'member-section', 'admin-menu', 'owner-menu']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applyPositions(items: NavItemDef[], order: string[] | undefined): NavItemDef[] {
  if (!order || order.length === 0) return items
  return [...items].sort((a, b) => {
    const ai = order.indexOf(a.navKey)
    const bi = order.indexOf(b.navKey)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: NavRole }) {
  const m = ROLE_META[role]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${m.color} ${m.bg} ${m.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

function RoleSelector({ navKey, currentRole, defaultRole, disabled, onChange }: {
  navKey: string
  currentRole: NavRole
  defaultRole: NavRole
  disabled: boolean
  onChange: (navKey: string, role: NavRole) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {ROLES.map((role) => {
        const m = ROLE_META[role]
        const active = currentRole === role
        const isDefault = defaultRole === role
        return (
          <button
            key={role}
            type="button"
            disabled={disabled}
            onClick={() => onChange(navKey, role)}
            title={isDefault ? `Défaut : ${m.label}` : m.label}
            className={[
              'relative inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-all duration-150',
              active
                ? `${m.bg} ${m.border} ${m.color} shadow-sm`
                : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600',
              disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            ].join(' ')}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${active ? m.dot : 'bg-slate-300'}`} />
            {m.label}
            {isDefault && (
              <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-slate-400 text-[7px] text-white">✦</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Drag-and-drop row ────────────────────────────────────────────────────────

function SortableRow({
  item,
  index,
  total,
  currentRole,
  saveState,
  feedback,
  isDragging,
  isDragOver,
  onRoleChange,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  item: NavItemDef
  index: number
  total: number
  currentRole: NavRole
  saveState: SaveState
  feedback: 'saved' | 'error' | null
  isDragging: boolean
  isDragOver: boolean
  onRoleChange: (navKey: string, role: NavRole) => void
  onDragStart: (navKey: string) => void
  onDragEnter: (navKey: string) => void
  onDragEnd: () => void
}) {
  const isOverridden = currentRole !== item.defaultRole

  return (
    <div
      draggable
      onDragStart={() => onDragStart(item.navKey)}
      onDragEnter={() => onDragEnter(item.navKey)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className={[
        'group flex items-start gap-3 rounded-xl border p-3 transition-all duration-150 select-none',
        isDragging ? 'opacity-40 scale-[0.98] cursor-grabbing' : 'cursor-grab',
        isDragOver ? 'border-blue-400 bg-blue-50 shadow-md ring-1 ring-blue-300' :
          isOverridden ? 'border-slate-300 bg-white shadow-sm' : 'border-slate-200 bg-slate-50/60',
      ].join(' ')}
    >
      {/* Drag handle */}
      <div className="mt-0.5 flex shrink-0 flex-col items-center gap-1.5">
        <svg viewBox="0 0 20 20" className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" fill="currentColor">
          <circle cx="7" cy="5" r="1.5" /><circle cx="13" cy="5" r="1.5" />
          <circle cx="7" cy="10" r="1.5" /><circle cx="13" cy="10" r="1.5" />
          <circle cx="7" cy="15" r="1.5" /><circle cx="13" cy="15" r="1.5" />
        </svg>
      </div>

      {/* Position badge */}
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
        {index + 1}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sm text-slate-900">{item.label}</span>
          <RoleBadge role={currentRole} />
          {isOverridden && (
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
              Modifié
            </span>
          )}
          {feedback === 'saved' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">✓ Sauvegardé</span>
          )}
          {feedback === 'error' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">✗ Erreur</span>
          )}
        </div>

        {/* Route */}
        <p className="mt-0.5 font-mono text-[11px] text-slate-400">{item.hrefTemplate}</p>

        {/* Description */}
        <p className="mt-1 text-[11px] text-slate-500">{item.description}</p>

        {/* Role selector */}
        <div className="mt-2">
          <RoleSelector
            navKey={item.navKey}
            currentRole={currentRole}
            defaultRole={item.defaultRole}
            disabled={saveState === 'saving'}
            onChange={onRoleChange}
          />
        </div>
      </div>

      {/* Position indicator (total) */}
      <div className="mt-0.5 shrink-0 text-right">
        <span className="text-[10px] text-slate-400 tabular-nums">{index + 1} / {total}</span>
      </div>
    </div>
  )
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({
  section,
  items,
  permissions,
  saveStates,
  feedbacks,
  positionSaveState,
  draggingKey,
  dragOverKey,
  onRoleChange,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  section: NavSection
  items: NavItemDef[]
  permissions: PermissionMap
  saveStates: Record<string, SaveState>
  feedbacks: Record<string, 'saved' | 'error' | null>
  positionSaveState: SaveState
  draggingKey: string | null
  dragOverKey: string | null
  onRoleChange: (navKey: string, role: NavRole) => void
  onDragStart: (section: NavSection, navKey: string) => void
  onDragEnter: (navKey: string) => void
  onDragEnd: () => void
}) {
  const counts = { owner: 0, admin: 0, member: 0, none: 0 }
  items.forEach((item) => { counts[permissions[item.navKey] ?? item.defaultRole]++ })

  return (
    <section className="app-panel p-5 sm:p-6">
      {/* Section header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">{NAV_SECTION_LABELS[section]}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {items.length} élément{items.length > 1 ? 's' : ''} · Glisser-déposer pour réordonner
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {positionSaveState === 'saving' && <span className="text-xs text-slate-400 italic">Sauvegarde…</span>}
          {positionSaveState === 'saved' && <span className="text-xs text-emerald-600">✓ Ordre sauvegardé</span>}
          {positionSaveState === 'error' && <span className="text-xs text-red-600">✗ Erreur ordre</span>}
          {(['owner', 'admin', 'member', 'none'] as NavRole[]).map((role) =>
            counts[role] > 0 ? (
              <span key={role} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ROLE_META[role].color} ${ROLE_META[role].bg} ${ROLE_META[role].border}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${ROLE_META[role].dot}`} />{counts[role]}
              </span>
            ) : null
          )}
        </div>
      </div>

      {/* Sortable list */}
      <div className="space-y-2">
        {items.map((item, index) => (
          <SortableRow
            key={item.navKey}
            item={item}
            index={index}
            total={items.length}
            currentRole={permissions[item.navKey] ?? item.defaultRole}
            saveState={saveStates[item.navKey] ?? 'idle'}
            feedback={feedbacks[item.navKey] ?? null}
            isDragging={draggingKey === item.navKey}
            isDragOver={dragOverKey === item.navKey && draggingKey !== item.navKey}
            onRoleChange={onRoleChange}
            onDragStart={(key) => onDragStart(section, key)}
            onDragEnter={onDragEnter}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NavPermissionsPage() {
  const router = useRouter()
  const { loading, authenticated, permissions } = useAuthSession()
  const isOwner = permissions.includes('*')

  const [permissionMap, setPermissionMap] = useState<PermissionMap>({})
  const [orderedSections, setOrderedSections] = useState<Record<NavSection, NavItemDef[]>>(
    () => Object.fromEntries(SECTION_ORDER.map((s) => [s, NAV_REGISTRY.filter((i) => i.section === s)])) as Record<NavSection, NavItemDef[]>
  )
  const [dataLoaded, setDataLoaded] = useState(false)
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  const [feedbacks, setFeedbacks] = useState<Record<string, 'saved' | 'error' | null>>({})
  const [positionSaveStates, setPositionSaveStates] = useState<Record<NavSection, SaveState>>(
    () => Object.fromEntries(SECTION_ORDER.map((s) => [s, 'idle'])) as Record<NavSection, SaveState>
  )

  // DnD state — refs for reliable cross-render logic, state for visual feedback
  const draggingKey = useRef<string | null>(null)
  const draggingSection = useRef<NavSection | null>(null)
  const dragOverKey = useRef<string | null>(null)
  const [draggingKeyState, setDraggingKeyState] = useState<string | null>(null)
  const [dragOverKeyState, setDragOverKeyState] = useState<string | null>(null)

  useEffect(() => {
    if (!authenticated || !isOwner) return
    fetch('/api/settings/nav-permissions')
      .then((r) => r.json())
      .then((data: { roles: PermissionMap; positions: PositionMap }) => {
        setPermissionMap(data.roles ?? {})
        const pos = data.positions ?? {}
        setOrderedSections(
          Object.fromEntries(
            SECTION_ORDER.map((s) => [s, applyPositions(NAV_REGISTRY.filter((i) => i.section === s), pos[s])])
          ) as Record<NavSection, NavItemDef[]>
        )
        setDataLoaded(true)
      })
      .catch(() => setDataLoaded(true))
  }, [authenticated, isOwner])

  useEffect(() => {
    if (!loading && !authenticated) router.replace('/login')
  }, [loading, authenticated, router])

  // ── Role change ──────────────────────────────────────────────────────────────

  async function handleRoleChange(navKey: string, role: NavRole) {
    setPermissionMap((prev) => ({ ...prev, [navKey]: role }))
    setSaveStates((prev) => ({ ...prev, [navKey]: 'saving' }))
    setFeedbacks((prev) => ({ ...prev, [navKey]: null }))

    try {
      const r = await fetch('/api/settings/nav-permissions', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'role', navKey, role }),
      })
      if (!r.ok) throw new Error()
      setSaveStates((prev) => ({ ...prev, [navKey]: 'saved' }))
      setFeedbacks((prev) => ({ ...prev, [navKey]: 'saved' }))
      invalidateNavPermissionsCache()
    } catch {
      const item = NAV_REGISTRY.find((i) => i.navKey === navKey)
      if (item) setPermissionMap((prev) => ({ ...prev, [navKey]: item.defaultRole }))
      setSaveStates((prev) => ({ ...prev, [navKey]: 'error' }))
      setFeedbacks((prev) => ({ ...prev, [navKey]: 'error' }))
    } finally {
      setTimeout(() => {
        setSaveStates((prev) => ({ ...prev, [navKey]: 'idle' }))
        setFeedbacks((prev) => ({ ...prev, [navKey]: null }))
      }, 2000)
    }
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────────

  function handleDragStart(section: NavSection, navKey: string) {
    draggingKey.current = navKey
    draggingSection.current = section
    setDraggingKeyState(navKey)
  }

  function handleDragEnter(navKey: string) {
    if (draggingKey.current === navKey) return
    dragOverKey.current = navKey
    setDragOverKeyState(navKey)
  }

  function handleDragEnd() {
    const srcKey = draggingKey.current
    const tgtKey = dragOverKey.current
    const section = draggingSection.current

    draggingKey.current = null
    draggingSection.current = null
    dragOverKey.current = null
    setDraggingKeyState(null)
    setDragOverKeyState(null)

    if (!srcKey || !tgtKey || srcKey === tgtKey || !section) return

    setOrderedSections((prev) => {
      const current = prev[section] ?? []
      const srcIdx = current.findIndex((i) => i.navKey === srcKey)
      const tgtIdx = current.findIndex((i) => i.navKey === tgtKey)
      if (srcIdx === -1 || tgtIdx === -1) return prev
      const next = [...current]
      const [moved] = next.splice(srcIdx, 1)
      next.splice(tgtIdx, 0, moved)
      void savePosition(section, next.map((i) => i.navKey))
      return { ...prev, [section]: next }
    })
  }

  async function savePosition(section: NavSection, orderedKeys: string[]) {
    setPositionSaveStates((prev) => ({ ...prev, [section]: 'saving' }))
    try {
      const r = await fetch('/api/settings/nav-permissions', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'position', section, orderedKeys }),
      })
      if (!r.ok) throw new Error()
      setPositionSaveStates((prev) => ({ ...prev, [section]: 'saved' }))
      invalidateNavPermissionsCache()
    } catch {
      setPositionSaveStates((prev) => ({ ...prev, [section]: 'error' }))
    } finally {
      setTimeout(() => {
        setPositionSaveStates((prev) => ({ ...prev, [section]: 'idle' }))
      }, 2500)
    }
  }

  // ── Guards ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="app-container app-main">
        <div className="flex h-48 items-center justify-center">
          <span className="text-sm text-slate-500">Vérification de la session…</span>
        </div>
      </main>
    )
  }

  if (!isOwner) {
    return (
      <main className="app-container app-main">
        <div className="app-panel flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg viewBox="0 0 20 20" className="h-6 w-6 text-red-500" fill="currentColor">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="font-semibold text-slate-800">Accès réservé aux Owners</p>
          <p className="max-w-xs text-sm text-slate-500">Seul un Owner peut modifier les paramètres de navigation.</p>
        </div>
      </main>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <main className="app-container app-main">
      {/* Header */}
      <section className="app-panel mb-4 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Owner
              </span>
              <h1 className="text-lg font-bold text-slate-900">Permissions &amp; ordre de navigation</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Configurez le niveau d&apos;accès et l&apos;ordre d&apos;affichage de chaque bouton de navigation.
              Les changements sont enregistrés automatiquement.
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          <div className="flex flex-wrap gap-2">
            {ROLES.map((role) => {
              const m = ROLE_META[role]
              return (
                <span key={role} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${m.color} ${m.bg} ${m.border}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}
                </span>
              )
            })}
          </div>
          <span className="hidden sm:inline text-slate-300">·</span>
          <span className="flex items-center gap-1">
            <span className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-full bg-slate-400 text-[7px] text-white">✦</span>
            Valeur par défaut du code
          </span>
          <span className="flex items-center gap-1">
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-slate-400" fill="currentColor">
              <circle cx="7" cy="5" r="1.5" /><circle cx="13" cy="5" r="1.5" />
              <circle cx="7" cy="10" r="1.5" /><circle cx="13" cy="10" r="1.5" />
              <circle cx="7" cy="15" r="1.5" /><circle cx="13" cy="15" r="1.5" />
            </svg>
            Glisser pour réordonner
          </span>
        </div>
      </section>

      {!dataLoaded ? (
        <div className="app-panel flex h-32 items-center justify-center">
          <span className="text-sm text-slate-500">Chargement…</span>
        </div>
      ) : (
        <div className="space-y-4">
          {SECTION_ORDER.map((section) => {
            const items = orderedSections[section] ?? []
            if (items.length === 0) return null
            return (
              <SectionCard
                key={section}
                section={section}
                items={items}
                permissions={permissionMap}
                saveStates={saveStates}
                feedbacks={feedbacks}
                positionSaveState={positionSaveStates[section] ?? 'idle'}
                draggingKey={draggingKeyState}
                dragOverKey={dragOverKeyState}
                onRoleChange={handleRoleChange}
                onDragStart={handleDragStart}
                onDragEnter={handleDragEnter}
                onDragEnd={handleDragEnd}
              />
            )
          })}
        </div>
      )}
    </main>
  )
}
