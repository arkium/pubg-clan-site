'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { useRouter } from 'next/navigation'
import { useAuthSession } from '@/hooks/useAuthSession'
import { invalidateNavPermissionsCache } from '@/hooks/useNavPermissions'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import {
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

function getEffectiveDisplaySection(item: NavItemDef, pMap: PermissionMap): NavSection {
  const effectiveRole = (pMap[item.navKey] ?? item.defaultRole) as NavRole
  return (ROLE_TO_TARGET_SECTION[effectiveRole] ?? item.section) as NavSection
}

function buildDisplayOrder(items: NavItemDef[], positions: PositionMap, pMap: PermissionMap): Record<NavSection, string[]> {
  const allKeys = new Set(items.map((i) => i.navKey))
  const covered = new Set<string>()
  const result: Record<NavSection, string[]> = {
    'nav-primary': [],
    'clan-section': [],
    'member-section': [],
    'admin-menu': [],
    'owner-menu': [],
    'superuser-menu': [],
  }
  for (const s of SECTION_ORDER) {
    result[s] = (positions[s] ?? []).filter((k) => {
      if (!allKeys.has(k)) return false
      covered.add(k)
      return true
    })
  }
  for (const item of items) {
    if (!covered.has(item.navKey)) {
      result[getEffectiveDisplaySection(item, pMap)].push(item.navKey)
    }
  }
  return result
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
  const m = ROLE_META[currentRole]
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.dot}`} />
      <select
        value={currentRole}
        disabled={disabled}
        onChange={(e) => onChange(navKey, e.target.value as NavRole)}
        className={[
          'rounded-md border px-1.5 py-0.5 text-[11px] font-semibold outline-none transition-colors',
          m.bg,
          m.border,
          m.color,
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        ].join(' ')}
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_META[role].label}
            {defaultRole === role ? ' •' : ''}
          </option>
        ))}
      </select>
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
  onDelete,
  onEdit,
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
  onDelete: (navKey: string) => void
  onEdit: (navKey: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
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
      {/* Drag handle */}
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

        <p className="mt-0.5 font-mono text-[11px] text-slate-400">{item.hrefTemplate}</p>
        <p className="mt-1 text-[11px] text-slate-500">{item.description}</p>

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

      {/* Actions: position + edit + delete */}
      <div className="mt-0.5 flex shrink-0 flex-col items-end gap-2">
        <span className="text-[10px] text-slate-400 tabular-nums">{index + 1} / {total}</span>
        {confirmDelete ? (
          <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => { setConfirmDelete(false); onDelete(item.navKey) }}
              className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-red-700"
            >
              Confirmer
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-50"
            >
              Annuler
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(item.navKey)}
              onMouseDown={(e) => e.stopPropagation()}
              className="rounded p-0.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"
              title="Modifier hrefTemplate et description"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              onMouseDown={(e) => e.stopPropagation()}
              className="rounded p-0.5 text-slate-200 transition hover:bg-red-50 hover:text-red-500"
              title="Supprimer cet item"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
                <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
              </svg>
            </button>
          </div>
        )}
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
  onDelete,
  onEdit,
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
  onDragEnter: (section: NavSection, navKey: string) => void
  onDragEnd: () => void
  onDelete: (navKey: string) => void
  onEdit: (navKey: string) => void
}) {
  const counts: Record<NavRole, number> = { owner: 0, admin: 0, member: 0, none: 0, superuser: 0, hidden: 0 }
  items.forEach((item) => { counts[permissions[item.navKey] ?? item.defaultRole]++ })

  return (
    <section
      className="app-panel p-4 sm:p-5"
      onDragOver={(e) => e.preventDefault()}
    >
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
            onDragEnter={(key) => onDragEnter(section, key)}
            onDragEnd={onDragEnd}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        ))}
      </div>
    </section>
  )
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditItemModal({ item, onClose, onSave }: {
  item: NavItemDef
  onClose: () => void
  onSave: (navKey: string, patch: { label?: string; hrefTemplate?: string; description?: string; section?: NavSection }) => Promise<void>
}) {
  const [label, setLabel] = useState(item.label)
  const [hrefTemplate, setHrefTemplate] = useState(item.hrefTemplate)
  const [description, setDescription] = useState(item.description)
  const [section, setSection] = useState<NavSection>(item.section)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) { setError('Le label est requis.'); return }
    if (!hrefTemplate.trim() || !hrefTemplate.startsWith('/')) { setError('hrefTemplate doit commencer par /.'); return }
    setSaving(true)
    setError(null)
    try {
      await onSave(item.navKey, {
        label: label.trim() !== item.label ? label.trim() : undefined,
        hrefTemplate: hrefTemplate.trim() !== item.hrefTemplate ? hrefTemplate.trim() : undefined,
        description: description.trim() !== item.description ? description.trim() : undefined,
        section: section !== item.section ? section : undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Modifier un item</h2>
            <p className="mt-0.5 font-mono text-[11px] text-slate-400">{item.navKey}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>
        <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4 p-5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Menu (section)</label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value as NavSection)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
            >
              {SECTION_ORDER.map((s) => (
                <option key={s} value={s}>{NAV_SECTION_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Label <span className="text-red-500">*</span></label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              required
            />
            <p className="mt-1 text-[11px] text-slate-400">Label de base. Si un renommage inline existe, il prend le dessus.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">hrefTemplate <span className="text-red-500">*</span></label>
            <input
              value={hrefTemplate}
              onChange={(e) => setHrefTemplate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-none"
            />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Sauvegarde…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateItemModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (data: { navKey: string; section: NavSection; label: string; hrefTemplate: string; defaultRole: NavRole; description: string }) => Promise<void>
}) {
  const [navKey, setNavKey] = useState('')
  const [section, setSection] = useState<NavSection>('clan-section')
  const [label, setLabel] = useState('')
  const [hrefTemplate, setHrefTemplate] = useState('/')
  const [defaultRole, setDefaultRole] = useState<NavRole>('none')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!navKey.trim() || !label.trim() || !hrefTemplate.trim()) {
      setError('navKey, label et hrefTemplate sont requis.')
      return
    }
    if (!hrefTemplate.startsWith('/')) {
      setError('hrefTemplate doit commencer par /.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onCreate({ navKey: navKey.trim(), section, label: label.trim(), hrefTemplate: hrefTemplate.trim(), defaultRole, description: description.trim() })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">Ajouter un item de navigation</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>
        <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4 p-5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">navKey <span className="text-red-500">*</span></label>
            <input
              value={navKey}
              onChange={(e) => setNavKey(e.target.value)}
              placeholder="ex: clan.new-page"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Section <span className="text-red-500">*</span></label>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value as NavSection)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
              >
                {SECTION_ORDER.map((s) => (
                  <option key={s} value={s}>{NAV_SECTION_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Rôle par défaut</label>
              <select
                value={defaultRole}
                onChange={(e) => setDefaultRole(e.target.value as NavRole)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_META[r].label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Label <span className="text-red-500">*</span></label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex: Ma nouvelle page"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">hrefTemplate <span className="text-red-500">*</span></label>
            <input
              value={hrefTemplate}
              onChange={(e) => setHrefTemplate(e.target.value)}
              placeholder="ex: /clans/:clanId/ma-page"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Description optionnelle"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-none"
            />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NavPermissionsPage() {
  const router = useRouter()
  const { loading, authenticated, permissions, isSuperUser } = useAuthSession()
  const isOwner = permissions.includes('*')
  const canAccess = isOwner || isSuperUser

  const [allItems, setAllItems] = useState<NavItemDef[]>([])
  const [permissionMap, setPermissionMap] = useState<PermissionMap>({})
  const [labelMap, setLabelMap] = useState<LabelMap>({})
  const [displayOrder, setDisplayOrder] = useState<Record<NavSection, string[]>>(() => ({
    'nav-primary': [],
    'clan-section': [],
    'member-section': [],
    'admin-menu': [],
    'owner-menu': [],
    'superuser-menu': [],
  }))
  const [dataLoaded, setDataLoaded] = useState(false)
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  const [feedbacks, setFeedbacks] = useState<Record<string, 'saved' | 'error' | null>>({})
  const [labelSaveStates, setLabelSaveStates] = useState<Record<string, SaveState>>({})
  const [positionSaveStates, setPositionSaveStates] = useState<Record<NavSection, SaveState>>(
    () => Object.fromEntries(SECTION_ORDER.map((s) => [s, 'idle'])) as Record<NavSection, SaveState>
  )
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingItem, setEditingItem] = useState<NavItemDef | null>(null)

  function loadData() {
    return fetch('/api/settings/nav-permissions')
      .then((r) => r.json())
      .then((data: { items?: NavItemDef[]; roles: PermissionMap; positions: PositionMap; labels: LabelMap }) => {
        const items = Array.isArray(data.items) ? data.items : []
        const roles = data.roles ?? {}
        setAllItems(items)
        setPermissionMap(roles)
        setLabelMap(data.labels ?? {})
        setDisplayOrder(buildDisplayOrder(items, data.positions ?? {}, roles))
        setDataLoaded(true)
      })
      .catch(() => setDataLoaded(true))
  }

  useEffect(() => {
    if (!authenticated || !canAccess) return
    void loadData()
  }, [authenticated, canAccess])

  useEffect(() => {
    if (!loading && !authenticated) router.replace('/login')
  }, [loading, authenticated, router])

  // Flat ordered items per displayed section
  const displaySections = useMemo(() => {
    const itemByKey = Object.fromEntries(allItems.map((i) => [i.navKey, i]))
    return Object.fromEntries(
      SECTION_ORDER.map((s) => [
        s,
        (displayOrder[s] ?? []).map((k) => itemByKey[k]).filter((i): i is NavItemDef => Boolean(i)),
      ])
    ) as Record<NavSection, NavItemDef[]>
  }, [allItems, displayOrder])

  // DnD state
  const draggingKey = useRef<string | null>(null)
  const draggingSection = useRef<NavSection | null>(null)
  const draggingTargetSection = useRef<NavSection | null>(null)
  const dragOverKey = useRef<string | null>(null)
  const [draggingKeyState, setDraggingKeyState] = useState<string | null>(null)
  const [dragOverKeyState, setDragOverKeyState] = useState<string | null>(null)

  // ── Role change ──────────────────────────────────────────────────────────────

  async function handleRoleChange(navKey: string, role: NavRole) {
    const item = allItems.find((i) => i.navKey === navKey)
    if (!item) return

    const prevSection = getEffectiveDisplaySection(item, permissionMap)
    const newPermMap = { ...permissionMap, [navKey]: role }
    const newSection = getEffectiveDisplaySection(item, newPermMap)

    setPermissionMap(newPermMap)

    if (prevSection !== newSection) {
      setDisplayOrder((prev) => {
        const next = { ...prev }
        next[prevSection] = (prev[prevSection] ?? []).filter((k) => k !== navKey)
        next[newSection] = [...(prev[newSection] ?? []), navKey]
        return next
      })
    }

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
      setPermissionMap((prev) => ({ ...prev, [navKey]: item.defaultRole }))
      if (prevSection !== newSection) {
        setDisplayOrder((prev) => {
          const next = { ...prev }
          next[newSection] = (prev[newSection] ?? []).filter((k) => k !== navKey)
          next[prevSection] = [...(prev[prevSection] ?? []), navKey]
          return next
        })
      }
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
    const prevLabel = labelMap[navKey] ?? allItems.find((i) => i.navKey === navKey)?.label ?? ''
    const defaultLabel = allItems.find((i) => i.navKey === navKey)?.label ?? ''

    if (label === defaultLabel || !label.trim()) {
      setLabelMap((prev) => { const next = { ...prev }; delete next[navKey]; return next })
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

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function handleDelete(navKey: string) {
    const item = allItems.find((i) => i.navKey === navKey)
    if (!item) return

    const itemSection = getEffectiveDisplaySection(item, permissionMap)

    setAllItems((prev) => prev.filter((i) => i.navKey !== navKey))
    setDisplayOrder((prev) => ({
      ...prev,
      [itemSection]: (prev[itemSection] ?? []).filter((k) => k !== navKey),
    }))

    try {
      const r = await fetch('/api/settings/nav-permissions', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', navKey }),
      })
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Erreur')
      invalidateNavPermissionsCache()
    } catch {
      setAllItems((prev) => [...prev, item])
      setDisplayOrder((prev) => ({
        ...prev,
        [itemSection]: [...(prev[itemSection] ?? []), navKey],
      }))
    }
  }

  // ── Create ───────────────────────────────────────────────────────────────────

  async function handleCreate(data: { navKey: string; section: NavSection; label: string; hrefTemplate: string; defaultRole: NavRole; description: string }) {
    const r = await fetch('/api/settings/nav-permissions', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'create', data }),
    })
    if (!r.ok) {
      const json = await r.json() as { error?: string }
      throw new Error(json.error ?? 'Erreur')
    }
    invalidateNavPermissionsCache()
    await loadData()
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────

  async function handleEditSave(navKey: string, patch: { label?: string; hrefTemplate?: string; description?: string; section?: NavSection }) {
    const { section: targetSection, ...fieldPatch } = patch

    const hasFieldChanges = Object.values(fieldPatch).some((v) => v !== undefined)
    if (hasFieldChanges) {
      const r = await fetch('/api/settings/nav-permissions', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'update', navKey, patch: fieldPatch }),
      })
      if (!r.ok) {
        const json = await r.json() as { error?: string }
        throw new Error(json.error ?? 'Erreur')
      }
    }

    if (targetSection) {
      const r = await fetch('/api/settings/nav-permissions', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'move-section', navKey, targetSection }),
      })
      if (!r.ok) {
        const json = await r.json() as { error?: string }
        throw new Error(json.error ?? 'Erreur')
      }
    }

    invalidateNavPermissionsCache()
    await loadData()
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────────

  function handleDragStart(section: NavSection, navKey: string) {
    draggingKey.current = navKey
    draggingSection.current = section
    draggingTargetSection.current = section
    setDraggingKeyState(navKey)
  }

  function handleDragEnter(section: NavSection, navKey: string) {
    if (draggingKey.current === navKey) return
    dragOverKey.current = navKey
    draggingTargetSection.current = section
    setDragOverKeyState(navKey)
  }

  function handleDragEnd() {
    const srcKey = draggingKey.current
    const tgtKey = dragOverKey.current
    const srcSection = draggingSection.current
    const tgtSection = draggingTargetSection.current

    draggingKey.current = null
    draggingSection.current = null
    draggingTargetSection.current = null
    dragOverKey.current = null
    setDraggingKeyState(null)
    setDragOverKeyState(null)

    if (!srcKey || !srcSection || !tgtSection) return

    if (srcSection !== tgtSection) {
      void moveCrossSection(srcKey, tgtSection)
      return
    }

    if (!tgtKey || srcKey === tgtKey) return

    // Flat reorder within the displayed section — no native/promoted distinction
    const current = displaySections[srcSection] ?? []
    const srcIdx = current.findIndex((i) => i.navKey === srcKey)
    const tgtIdx = current.findIndex((i) => i.navKey === tgtKey)
    if (srcIdx === -1 || tgtIdx === -1) return

    const next = [...current]
    const [moved] = next.splice(srcIdx, 1)
    next.splice(tgtIdx, 0, moved)
    const orderedKeys = next.map((i) => i.navKey)

    setDisplayOrder((prev) => ({ ...prev, [srcSection]: orderedKeys }))
    void savePosition(srcSection, orderedKeys)
  }

  async function moveCrossSection(navKey: string, targetSection: NavSection) {
    const item = allItems.find((i) => i.navKey === navKey)
    if (!item) return

    const prevSection = getEffectiveDisplaySection(item, permissionMap)

    setAllItems((prev) => prev.map((i) => i.navKey === navKey ? { ...i, section: targetSection } : i))
    setDisplayOrder((prev) => {
      const next = { ...prev }
      next[prevSection] = (prev[prevSection] ?? []).filter((k) => k !== navKey)
      next[targetSection] = [...(prev[targetSection] ?? []), navKey]
      return next
    })

    try {
      const r = await fetch('/api/settings/nav-permissions', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'move-section', navKey, targetSection }),
      })
      if (!r.ok) throw new Error()
      invalidateNavPermissionsCache()
    } catch {
      setAllItems((prev) => prev.map((i) => i.navKey === navKey ? { ...i, section: prevSection } : i))
      setDisplayOrder((prev) => {
        const next = { ...prev }
        next[targetSection] = (prev[targetSection] ?? []).filter((k) => k !== navKey)
        next[prevSection] = [...(prev[prevSection] ?? []), navKey]
        return next
      })
    }
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
      {showCreateModal && (
        <CreateItemModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
        />
      )}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSave={handleEditSave}
        />
      )}

      <section className="app-panel mb-5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SettingsPageHeader
            title="Permissions &amp; ordre de navigation"
            subtitle="Accès, ordre et titre de chaque bouton. Toutes les modifications sont enregistrées automatiquement."
          />
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
              <path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z" />
            </svg>
            Ajouter un item
          </button>
        </div>

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
            Glisser pour réordonner ou changer de section
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
            const nativeNavKeys = new Set(allItems.filter((i) => i.section === section).map((i) => i.navKey))
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
                onDelete={handleDelete}
                onEdit={(navKey) => setEditingItem(allItems.find((i) => i.navKey === navKey) ?? null)}
              />
            )
          })}
        </div>
      )}
    </main>
  )
}
