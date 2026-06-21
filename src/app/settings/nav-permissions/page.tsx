'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthSession } from '@/hooks/useAuthSession'
import { invalidateNavPermissionsCache } from '@/hooks/useNavPermissions'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import SectionNav from '@/components/SectionNav'
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
type LabelMap = Record<string, string>
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES: NavRole[] = ['none', 'member', 'admin', 'owner', 'superuser', 'hidden']

const ROLE_META: Record<NavRole, { label: string; color: string; bg: string; border: string; dot: string }> = {
  none:      { label: 'Tous',      color: 'text-slate-600',  bg: 'bg-slate-100',  border: 'border-slate-300',  dot: 'bg-slate-400'  },
  member:    { label: 'Membre',    color: 'text-sky-700',    bg: 'bg-sky-50',     border: 'border-sky-300',    dot: 'bg-sky-500'    },
  admin:     { label: 'Admin',     color: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-300',    dot: 'bg-red-500'    },
  owner:     { label: 'Owner',     color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-400',  dot: 'bg-amber-500'  },
  superuser: { label: 'SuperUser', color: 'text-violet-700', bg: 'bg-violet-50',  border: 'border-violet-400', dot: 'bg-violet-500' },
  hidden:    { label: 'Masqué',    color: 'text-slate-500',  bg: 'bg-slate-200',  border: 'border-slate-400',  dot: 'bg-slate-500'  },
}

const SECTION_ORDER: NavSection[] = ['nav-primary', 'clan-section', 'member-section', 'admin-menu', 'owner-menu', 'superuser-menu']

const ROLE_TO_TARGET_SECTION: Partial<Record<NavRole, NavSection>> = {
  admin: 'admin-menu',
  owner: 'owner-menu',
  superuser: 'superuser-menu',
}

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

// ─── Label editor inline ──────────────────────────────────────────────────────

function LabelEditor({ navKey, currentLabel, defaultLabel, labelSaveState, onSave }: {
  navKey: string
  currentLabel: string
  defaultLabel: string
  labelSaveState: SaveState
  onSave: (navKey: string, label: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState(currentLabel)
  const inputRef = useRef<HTMLInputElement>(null)
  const isOverridden = currentLabel !== defaultLabel

  useEffect(() => {
    if (!editing) setInputVal(currentLabel)
  }, [currentLabel, editing])

  function startEdit() {
    setInputVal(currentLabel)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function cancelEdit() {
    setEditing(false)
    setInputVal(currentLabel)
  }

  function commitEdit() {
    setEditing(false)
    const trimmed = inputVal.trim()
    if (trimmed && trimmed !== currentLabel) {
      onSave(navKey, trimmed)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          autoFocus
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={onKeyDown}
          maxLength={60}
          className="h-6 min-w-0 flex-1 rounded border border-blue-400 bg-blue-50 px-2 text-sm font-semibold text-slate-900 outline-none ring-1 ring-blue-400 focus:ring-2"
        />
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); cancelEdit() }}
          className="shrink-0 text-[10px] text-slate-400 hover:text-slate-700"
          title="Annuler (Échap)"
        >✕</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="font-semibold text-sm text-slate-900">{currentLabel}</span>
      {isOverridden && (
        <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700">
          Renommé
        </span>
      )}
      {labelSaveState === 'saving' && <span className="text-[10px] text-slate-400 italic">…</span>}
      {labelSaveState === 'saved' && <span className="text-[10px] text-emerald-600">✓</span>}
      {labelSaveState === 'error' && <span className="text-[10px] text-red-600">✗</span>}
      <button
        type="button"
        onClick={startEdit}
        className="shrink-0 rounded p-0.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"
        title="Renommer ce bouton"
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
          <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" />
        </svg>
      </button>
      {isOverridden && (
        <button
          type="button"
          onClick={() => onSave(navKey, defaultLabel)}
          className="shrink-0 rounded p-0.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-500"
          title={`Remettre le titre par défaut : « ${defaultLabel} »`}
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
            <path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ─── Drag-and-drop row ────────────────────────────────────────────────────────

function SortableRow({
  item,
  index,
  total,
  currentRole,
  currentLabel,
  saveState,
  feedback,
  labelSaveState,
  isDragging,
  isDragOver,
  isPromoted,
  onRoleChange,
  onLabelSave,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  item: NavItemDef
  index: number
  total: number
  currentRole: NavRole
  currentLabel: string
  saveState: SaveState
  feedback: 'saved' | 'error' | null
  labelSaveState: SaveState
  isDragging: boolean
  isDragOver: boolean
  isPromoted: boolean
  onRoleChange: (navKey: string, role: NavRole) => void
  onLabelSave: (navKey: string, label: string) => void
  onDragStart: (navKey: string) => void
  onDragEnter: (navKey: string) => void
  onDragEnd: () => void
}) {
  const isRoleOverridden = currentRole !== item.defaultRole

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
          isPromoted ? 'border-dashed border-slate-300 bg-slate-50/40' :
          isRoleOverridden ? 'border-slate-300 bg-white shadow-sm' : 'border-slate-200 bg-slate-50/60',
      ].join(' ')}
    >
      {/* Drag handle — lighter style for promoted items */}
      <div className="mt-0.5 shrink-0">
        <svg
          viewBox="0 0 20 20"
          className={['h-4 w-4 transition-colors', isPromoted ? 'text-slate-200 group-hover:text-slate-400' : 'text-slate-300 group-hover:text-slate-500'].join(' ')}
          fill="currentColor"
        >
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
        {/* Header: label editor + role badge */}
        <div className="flex flex-wrap items-center gap-2">
          <LabelEditor
            navKey={item.navKey}
            currentLabel={currentLabel}
            defaultLabel={item.label}
            labelSaveState={labelSaveState}
            onSave={onLabelSave}
          />
          <RoleBadge role={currentRole} />
          {isRoleOverridden && (
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

      {/* Position counter */}
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
  nativeNavKeys,
  permissions,
  labels,
  saveStates,
  feedbacks,
  labelSaveStates,
  positionSaveState,
  draggingKey,
  dragOverKey,
  onRoleChange,
  onLabelSave,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  section: NavSection
  items: NavItemDef[]
  nativeNavKeys: Set<string>
  permissions: PermissionMap
  labels: LabelMap
  saveStates: Record<string, SaveState>
  feedbacks: Record<string, 'saved' | 'error' | null>
  labelSaveStates: Record<string, SaveState>
  positionSaveState: SaveState
  draggingKey: string | null
  dragOverKey: string | null
  onRoleChange: (navKey: string, role: NavRole) => void
  onLabelSave: (navKey: string, label: string) => void
  onDragStart: (section: NavSection, navKey: string) => void
  onDragEnter: (navKey: string) => void
  onDragEnd: () => void
}) {
  const counts: Record<NavRole, number> = { owner: 0, admin: 0, member: 0, none: 0, superuser: 0, hidden: 0 }
  items.forEach((item) => { counts[permissions[item.navKey] ?? item.defaultRole]++ })

  return (
    <section className="app-panel p-4 sm:p-5">
      {/* Section header */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{NAV_SECTION_LABELS[section]}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {items.length} élément{items.length > 1 ? 's' : ''} · Glisser pour réordonner · Crayon pour renommer
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {positionSaveState === 'saving' && <span className="text-xs text-slate-400 italic">Sauvegarde…</span>}
          {positionSaveState === 'saved' && <span className="text-xs text-emerald-600">✓ Ordre sauvegardé</span>}
          {positionSaveState === 'error' && <span className="text-xs text-red-600">✗ Erreur ordre</span>}
          {(['superuser', 'owner', 'admin', 'member', 'none', 'hidden'] as NavRole[]).map((role) =>
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
            currentLabel={labels[item.navKey] ?? item.label}
            saveState={saveStates[item.navKey] ?? 'idle'}
            feedback={feedbacks[item.navKey] ?? null}
            labelSaveState={labelSaveStates[item.navKey] ?? 'idle'}
            isDragging={draggingKey === item.navKey}
            isDragOver={dragOverKey === item.navKey && draggingKey !== item.navKey}
            isPromoted={!nativeNavKeys.has(item.navKey)}
            onRoleChange={onRoleChange}
            onLabelSave={onLabelSave}
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
  const { loading, authenticated, permissions, isSuperUser } = useAuthSession()
  const isOwner = permissions.includes('*')
  const canAccess = isOwner || isSuperUser

  const [permissionMap, setPermissionMap] = useState<PermissionMap>({})
  const [labelMap, setLabelMap] = useState<LabelMap>({})
  const [promotedOrderMap, setPromotedOrderMap] = useState<Record<string, string[]>>({})
  const [orderedSections, setOrderedSections] = useState<Record<NavSection, NavItemDef[]>>(
    () => Object.fromEntries(SECTION_ORDER.map((s) => [s, NAV_REGISTRY.filter((i) => i.section === s)])) as Record<NavSection, NavItemDef[]>
  )
  const [dataLoaded, setDataLoaded] = useState(false)
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  const [feedbacks, setFeedbacks] = useState<Record<string, 'saved' | 'error' | null>>({})
  const [labelSaveStates, setLabelSaveStates] = useState<Record<string, SaveState>>({})
  const [positionSaveStates, setPositionSaveStates] = useState<Record<NavSection, SaveState>>(
    () => Object.fromEntries(SECTION_ORDER.map((s) => [s, 'idle'])) as Record<NavSection, SaveState>
  )

  // Items displayed per section — items with role admin/owner/superuser migrate to their target section card
  const displaySections = useMemo(() => {
    const result: Record<NavSection, NavItemDef[]> = Object.fromEntries(
      SECTION_ORDER.map((s) => [s, [] as NavItemDef[]])
    ) as Record<NavSection, NavItemDef[]>

    // First pass: native items that stay in their section (no target or target === own section)
    for (const section of SECTION_ORDER) {
      for (const item of (orderedSections[section] ?? [])) {
        const effectiveRole = permissionMap[item.navKey] ?? item.defaultRole
        const target = ROLE_TO_TARGET_SECTION[effectiveRole]
        if (!target || target === section) result[section].push(item)
      }
    }

    // Second pass: promoted items — collect per target section, then apply saved promoted order
    for (const targetSection of SECTION_ORDER) {
      const promoted: NavItemDef[] = []
      for (const section of SECTION_ORDER) {
        if (section === targetSection) continue
        for (const item of (orderedSections[section] ?? [])) {
          const effectiveRole = permissionMap[item.navKey] ?? item.defaultRole
          if (ROLE_TO_TARGET_SECTION[effectiveRole] === targetSection) promoted.push(item)
        }
      }
      const order = promotedOrderMap[targetSection]
      if (order && order.length > 0) {
        promoted.sort((a, b) => {
          const ai = order.indexOf(a.navKey)
          const bi = order.indexOf(b.navKey)
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        })
      }
      result[targetSection].push(...promoted)
    }

    return result
  }, [orderedSections, permissionMap, promotedOrderMap])

  // DnD state — refs for reliable cross-render logic, state for visual feedback
  const draggingKey = useRef<string | null>(null)
  const draggingSection = useRef<NavSection | null>(null)
  const dragOverKey = useRef<string | null>(null)
  const [draggingKeyState, setDraggingKeyState] = useState<string | null>(null)
  const [dragOverKeyState, setDragOverKeyState] = useState<string | null>(null)

  useEffect(() => {
    if (!authenticated || !canAccess) return
    fetch('/api/settings/nav-permissions')
      .then((r) => r.json())
      .then((data: { roles: PermissionMap; positions: PositionMap; promotedPositions: Record<string, string[]>; labels: LabelMap }) => {
        setPermissionMap(data.roles ?? {})
        setLabelMap(data.labels ?? {})
        setPromotedOrderMap(data.promotedPositions ?? {})
        const pos = data.positions ?? {}
        setOrderedSections(
          Object.fromEntries(
            SECTION_ORDER.map((s) => [s, applyPositions(NAV_REGISTRY.filter((i) => i.section === s), pos[s])])
          ) as Record<NavSection, NavItemDef[]>
        )
        setDataLoaded(true)
      })
      .catch(() => setDataLoaded(true))
  }, [authenticated, canAccess])

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

  // ── Label change ─────────────────────────────────────────────────────────────

  async function handleLabelSave(navKey: string, label: string) {
    const prevLabel = labelMap[navKey] ?? NAV_REGISTRY.find((i) => i.navKey === navKey)?.label ?? ''
    const defaultLabel = NAV_REGISTRY.find((i) => i.navKey === navKey)?.label ?? ''

    // Optimistic: if restoring default, remove from map; otherwise set new value
    if (label === defaultLabel || !label.trim()) {
      setLabelMap((prev) => {
        const next = { ...prev }
        delete next[navKey]
        return next
      })
    } else {
      setLabelMap((prev) => ({ ...prev, [navKey]: label }))
    }
    setLabelSaveStates((prev) => ({ ...prev, [navKey]: 'saving' }))

    try {
      const r = await fetch('/api/settings/nav-permissions', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'label', navKey, label }),
      })
      if (!r.ok) throw new Error()
      setLabelSaveStates((prev) => ({ ...prev, [navKey]: 'saved' }))
      invalidateNavPermissionsCache()
    } catch {
      // rollback
      if (prevLabel && prevLabel !== defaultLabel) {
        setLabelMap((prev) => ({ ...prev, [navKey]: prevLabel }))
      } else {
        setLabelMap((prev) => { const next = { ...prev }; delete next[navKey]; return next })
      }
      setLabelSaveStates((prev) => ({ ...prev, [navKey]: 'error' }))
    } finally {
      setTimeout(() => {
        setLabelSaveStates((prev) => ({ ...prev, [navKey]: 'idle' }))
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

    const nativeKeys = new Set((orderedSections[section] ?? []).map((i) => i.navKey))
    const srcIsNative = nativeKeys.has(srcKey)
    const tgtIsNative = nativeKeys.has(tgtKey)

    if (srcIsNative && tgtIsNative) {
      // Reorder native items in their native section
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
    } else if (!srcIsNative && !tgtIsNative) {
      // Reorder promoted items within the display section
      const promotedDisplay = (displaySections[section] ?? []).filter((i) => !nativeKeys.has(i.navKey))
      const srcIdx = promotedDisplay.findIndex((i) => i.navKey === srcKey)
      const tgtIdx = promotedDisplay.findIndex((i) => i.navKey === tgtKey)
      if (srcIdx === -1 || tgtIdx === -1) return
      const next = [...promotedDisplay]
      const [moved] = next.splice(srcIdx, 1)
      next.splice(tgtIdx, 0, moved)
      const newOrder = next.map((i) => i.navKey)
      setPromotedOrderMap((prev) => ({ ...prev, [section]: newOrder }))
      void savePromotedPosition(section, newOrder)
    }
    // cross-drag native ↔ promoted: silently ignored
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

  async function savePromotedPosition(section: NavSection, orderedKeys: string[]) {
    setPositionSaveStates((prev) => ({ ...prev, [section]: 'saving' }))
    try {
      const r = await fetch('/api/settings/nav-permissions', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'promoted-position', section, orderedKeys }),
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

  if (!canAccess) {
    return (
      <main className="app-container app-main">
        <div className="app-panel flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg viewBox="0 0 20 20" className="h-6 w-6 text-red-500" fill="currentColor">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="font-semibold text-slate-800">Accès réservé aux Owners et SuperUsers</p>
          <p className="max-w-xs text-sm text-slate-500">Seul un Owner ou un SuperUser peut modifier les paramètres de navigation.</p>
        </div>
      </main>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <main className="app-container app-main">
      <section className="app-panel mb-5 p-4">
        <SettingsPageHeader
          title="Permissions &amp; ordre de navigation"
          subtitle="Accès, ordre et titre de chaque bouton. Toutes les modifications sont enregistrées automatiquement."
        />
        <SectionNav section="owner-menu" />

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
            Valeur par défaut
          </span>
          <span className="flex items-center gap-1">
            <svg viewBox="0 0 16 16" className="h-3 w-3 text-slate-400" fill="currentColor">
              <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" />
            </svg>
            Crayon pour renommer
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {SECTION_ORDER.map((section) => {
            const items = displaySections[section] ?? []
            if (items.length === 0) return null
            const nativeNavKeys = new Set((orderedSections[section] ?? []).map((i) => i.navKey))
            return (
              <SectionCard
                key={section}
                section={section}
                items={items}
                nativeNavKeys={nativeNavKeys}
                permissions={permissionMap}
                labels={labelMap}
                saveStates={saveStates}
                feedbacks={feedbacks}
                labelSaveStates={labelSaveStates}
                positionSaveState={positionSaveStates[section] ?? 'idle'}
                draggingKey={draggingKeyState}
                dragOverKey={dragOverKeyState}
                onRoleChange={handleRoleChange}
                onLabelSave={handleLabelSave}
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
