'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check,
  Compass,
  Crown,
  GripVertical,
  Loader2,
  type LucideIcon,
  PanelsTopLeft,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Shield,
  Star,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'

import AdminPageBanner, { BANNER_GLASS_BUTTON } from '@/components/settings/AdminPageBanner'
import { ADMIN_PAGE_CLASS, AdminPageLoading, AdminPageRestricted, FormFeedback } from '@/components/settings/AdminPageStates'
import { ChoiceMenu, ConfirmDialog, IconTile, ListSkeleton, Tag, toneStyle } from '@/components/ui/CharteKit'
import { useAuthSession } from '@/hooks/useAuthSession'
import { invalidateNavPermissionsCache } from '@/hooks/useNavPermissions'
import { NAV_SECTION_LABELS, type NavRole, type NavSection, type NavItemDef } from '@/lib/nav-permissions-registry'

// ─── Types ────────────────────────────────────────────────────────────────────

type PermissionMap = Record<string, NavRole>
type PositionMap = Record<string, string[]>
type LabelMap = Record<string, string>
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES: NavRole[] = ['none', 'member', 'owner', 'superuser', 'hidden']

const ROLE_LABELS: Record<NavRole, string> = {
  none: 'Tous',
  member: 'Membre',
  owner: 'Owner',
  superuser: 'SuperUser',
  hidden: 'Masqué',
}

/** Couleur d'un rôle : jetons de jeu, et pour le SuperUser son violet d'identité (`--theme-superuser-nav-*`). */
function roleStyle(role: NavRole): CSSProperties {
  if (role === 'superuser') {
    return {
      backgroundColor: 'var(--theme-superuser-nav-bg)',
      borderColor: 'var(--theme-superuser-nav-border)',
      color: 'var(--theme-superuser-nav-text)',
    }
  }
  if (role === 'member') return toneStyle('sky')
  if (role === 'owner') return toneStyle('warn')
  if (role === 'hidden') return { ...toneStyle('neutral'), opacity: 0.7 }
  return toneStyle('neutral')
}

const SECTION_ORDER: NavSection[] = ['nav-primary', 'clan-section', 'member-section', 'admin-menu', 'owner-menu', 'superuser-menu']

const SECTION_ICONS: Record<NavSection, LucideIcon> = {
  'nav-primary': Compass,
  'clan-section': Shield,
  'member-section': UserRound,
  'admin-menu': Settings2,
  'owner-menu': Crown,
  'superuser-menu': Star,
}

const ROLE_TO_TARGET_SECTION: Partial<Record<NavRole, NavSection>> = {
  owner: 'owner-menu',
  superuser: 'superuser-menu',
}

const SECTION_OPTIONS = SECTION_ORDER.map((section) => ({ value: section, label: NAV_SECTION_LABELS[section] }))

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

function RoleChip({ role, children }: { role: NavRole; children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-bold" style={roleStyle(role)}>
      {children ?? ROLE_LABELS[role]}
    </span>
  )
}

function SaveStateIcon({ state }: { state: SaveState }) {
  if (state === 'saving') return <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" aria-label="Enregistrement…" />
  if (state === 'saved') return <Check className="h-3.5 w-3.5" style={{ color: 'var(--game-pos)' }} aria-label="Enregistré" />
  if (state === 'error') return <X className="h-3.5 w-3.5" style={{ color: 'var(--game-neg)' }} aria-label="Échec de l’enregistrement" />
  return null
}

function RoleSelector({
  navKey,
  currentRole,
  defaultRole,
  disabled,
  onChange,
}: {
  navKey: string
  currentRole: NavRole
  defaultRole: NavRole
  disabled: boolean
  onChange: (navKey: string, role: NavRole) => void
}) {
  return (
    <div className={`w-44 ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
      <ChoiceMenu<NavRole>
        label="Accès"
        value={currentRole}
        onChange={(role) => onChange(navKey, role)}
        options={ROLES.map((role) => ({ value: role, label: `${ROLE_LABELS[role]}${defaultRole === role ? ' (défaut)' : ''}` }))}
      />
    </div>
  )
}

// ─── Label editor inline ──────────────────────────────────────────────────────

function LabelEditor({
  navKey,
  currentLabel,
  defaultLabel,
  labelSaveState,
  onSave,
}: {
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
    if (e.key === 'Enter') {
      e.preventDefault()
      commitEdit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  if (editing) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          autoFocus
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={onKeyDown}
          maxLength={60}
          aria-label="Titre du bouton"
          className="app-input h-8 min-w-0 flex-1"
        />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            cancelEdit()
          }}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-gray-500 hover:bg-gray-100"
          title="Annuler (Échap)"
          aria-label="Annuler"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="t-card-title truncate">{currentLabel}</span>
      {isOverridden ? <Tag tone="sky">Renommé</Tag> : null}
      <SaveStateIcon state={labelSaveState} />
      <button
        type="button"
        onClick={startEdit}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        title="Renommer ce bouton"
        aria-label={`Renommer « ${currentLabel} »`}
      >
        <Pencil className="h-3 w-3" aria-hidden="true" />
      </button>
      {isOverridden ? (
        <button
          type="button"
          onClick={() => onSave(navKey, defaultLabel)}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          title={`Remettre le titre par défaut : « ${defaultLabel} »`}
          aria-label="Remettre le titre par défaut"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
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
  const isRoleOverridden = currentRole !== item.defaultRole

  return (
    <li
      draggable
      onDragStart={() => onDragStart(item.navKey)}
      onDragEnter={() => onDragEnter(item.navKey)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className={`app-panel-muted group flex select-none items-start gap-2.5 px-3 py-2.5 transition-all duration-150 ${
        isDragging ? 'scale-[0.98] cursor-grabbing opacity-40' : 'cursor-grab'
      } ${isPromoted ? 'border-dashed' : ''}`}
      style={isDragOver ? { borderColor: 'var(--theme-ui-accent)', backgroundColor: 'var(--theme-ui-accent-tint)' } : undefined}
      title={isPromoted ? 'Bouton déplacé dans ce menu par son rôle d’accès' : undefined}
    >
      <GripVertical className="mt-1 h-4 w-4 shrink-0 text-gray-500 opacity-60 group-hover:opacity-100" aria-hidden="true" />
      <span className="t-num mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--theme-ui-surface-strong)] text-[11px] font-bold text-gray-700">
        {index + 1}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <LabelEditor
            navKey={item.navKey}
            currentLabel={currentLabel}
            defaultLabel={item.label}
            labelSaveState={labelSaveState}
            onSave={onLabelSave}
          />
          <RoleChip role={currentRole} />
          {isRoleOverridden ? <Tag tone="sky">Accès modifié</Tag> : null}
          {feedback === 'saved' ? <Tag tone="pos">Enregistré</Tag> : null}
          {feedback === 'error' ? <Tag tone="neg">Erreur</Tag> : null}
        </div>
        <span className="t-meta break-all font-mono">{item.hrefTemplate}</span>
        {item.description ? <span className="t-meta">{item.description}</span> : null}
        <div className="mt-1">
          <RoleSelector
            navKey={item.navKey}
            currentRole={currentRole}
            defaultRole={item.defaultRole}
            disabled={saveState === 'saving'}
            onChange={onRoleChange}
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="t-meta t-num">
          {index + 1} / {total}
        </span>
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onEdit(item.navKey)}
            onMouseDown={(e) => e.stopPropagation()}
            className="grid h-7 w-7 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            title="Modifier le lien, la description ou le menu"
            aria-label={`Modifier « ${currentLabel} »`}
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(item.navKey)}
            onMouseDown={(e) => e.stopPropagation()}
            className="grid h-7 w-7 place-items-center rounded-md text-gray-500 hover:bg-gray-100"
            title="Supprimer ce bouton"
            aria-label={`Supprimer « ${currentLabel} »`}
          >
            <Trash2 className="h-3.5 w-3.5" style={{ color: 'var(--game-neg)' }} aria-hidden="true" />
          </button>
        </span>
      </div>
    </li>
  )
}

// ─── Section card ─────────────────────────────────────────────────────────────

function NavSectionCard({
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
  const counts: Record<NavRole, number> = { owner: 0, member: 0, none: 0, superuser: 0, hidden: 0 }
  items.forEach((item) => {
    counts[permissions[item.navKey] ?? item.defaultRole]++
  })
  const titleId = `nav-section-${section}`

  return (
    <section className="app-panel flex flex-col gap-3 p-4 sm:p-5" aria-labelledby={titleId} onDragOver={(e) => e.preventDefault()}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <IconTile icon={SECTION_ICONS[section]} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={titleId} className="t-card-title">
              {NAV_SECTION_LABELS[section]}
            </h2>
            <p className="t-meta m-0">
              {items.length} bouton{items.length > 1 ? 's' : ''}
              {positionSaveState === 'saving' ? ' · ordre en cours d’enregistrement…' : ''}
              {positionSaveState === 'saved' ? ' · ordre enregistré' : ''}
              {positionSaveState === 'error' ? ' · échec de l’enregistrement de l’ordre' : ''}
            </p>
          </div>
        </div>
        <span className="flex flex-wrap items-center gap-1">
          {(['superuser', 'owner', 'member', 'none', 'hidden'] as NavRole[]).map((role) =>
            counts[role] > 0 ? (
              <RoleChip key={role} role={role}>
                <span className="t-num">{counts[role]}</span> {ROLE_LABELS[role]}
              </RoleChip>
            ) : null
          )}
        </span>
      </div>

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
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
      </ul>
    </section>
  )
}

// ─── Modales (charte : voile `app-modal-backdrop`, carte `app-panel`) ─────────

function ItemModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nav-item-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="app-panel w-full max-w-md p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id="nav-item-modal-title" className="t-section-title m-0">
              {title}
            </h2>
            {subtitle ? <p className="t-meta m-0 font-mono">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-gray-500 hover:bg-gray-100"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, required = false, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="t-label">
        {label}
        {required ? <span style={{ color: 'var(--game-neg)' }}> *</span> : null}
      </span>
      {children}
      {hint ? <span className="t-meta">{hint}</span> : null}
    </label>
  )
}

function ModalActions({ onClose, saving, submitLabel, savingLabel }: { onClose: () => void; saving: boolean; submitLabel: string; savingLabel: string }) {
  return (
    <div className="flex justify-end gap-2.5 pt-1">
      <button type="button" onClick={onClose} className="app-btn app-btn--md app-btn--secondary">
        Annuler
      </button>
      <button type="submit" disabled={saving} className="app-btn app-btn--md app-btn--primary">
        {saving ? savingLabel : submitLabel}
      </button>
    </div>
  )
}

function EditItemModal({
  item,
  onClose,
  onSave,
}: {
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
    if (!label.trim()) {
      setError('Le titre est requis.')
      return
    }
    if (!hrefTemplate.trim() || !hrefTemplate.startsWith('/')) {
      setError('Le lien doit commencer par /.')
      return
    }
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
    <ItemModal title="Modifier un bouton" subtitle={item.navKey} onClose={onClose}>
      <form
        onSubmit={(e) => {
          void handleSubmit(e)
        }}
        className="flex flex-col gap-3.5"
      >
        <div className="flex flex-col gap-1">
          <span className="t-label">Menu</span>
          <ChoiceMenu<NavSection> label="Menu" value={section} onChange={setSection} options={SECTION_OPTIONS} />
        </div>
        <Field label="Titre" required hint="Titre de base ; un renommage depuis la liste reste prioritaire.">
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="app-input" required />
        </Field>
        <Field label="Lien (hrefTemplate)" required>
          <input value={hrefTemplate} onChange={(e) => setHrefTemplate(e.target.value)} className="app-input font-mono" required />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="app-input resize-none" />
        </Field>
        <FormFeedback error={error ?? undefined} />
        <ModalActions onClose={onClose} saving={saving} submitLabel="Enregistrer" savingLabel="Enregistrement…" />
      </form>
    </ItemModal>
  )
}

function CreateItemModal({
  onClose,
  onCreate,
}: {
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
      setError('La clé, le titre et le lien sont requis.')
      return
    }
    if (!hrefTemplate.startsWith('/')) {
      setError('Le lien doit commencer par /.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onCreate({
        navKey: navKey.trim(),
        section,
        label: label.trim(),
        hrefTemplate: hrefTemplate.trim(),
        defaultRole,
        description: description.trim(),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ItemModal title="Ajouter un bouton de navigation" onClose={onClose}>
      <form
        onSubmit={(e) => {
          void handleSubmit(e)
        }}
        className="flex flex-col gap-3.5"
      >
        <Field label="Clé (navKey)" required>
          <input value={navKey} onChange={(e) => setNavKey(e.target.value)} placeholder="clan.nouvelle-page" className="app-input font-mono" required />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="t-label">Menu</span>
            <ChoiceMenu<NavSection> label="Menu" value={section} onChange={setSection} options={SECTION_OPTIONS} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="t-label">Accès par défaut</span>
            <ChoiceMenu<NavRole>
              label="Accès par défaut"
              value={defaultRole}
              onChange={setDefaultRole}
              options={ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
            />
          </div>
        </div>
        <Field label="Titre" required>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ma nouvelle page" className="app-input" required />
        </Field>
        <Field label="Lien (hrefTemplate)" required>
          <input
            value={hrefTemplate}
            onChange={(e) => setHrefTemplate(e.target.value)}
            placeholder="/clans/:clanId/ma-page"
            className="app-input font-mono"
            required
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Facultative"
            className="app-input resize-none"
          />
        </Field>
        <FormFeedback error={error ?? undefined} />
        <ModalActions onClose={onClose} saving={saving} submitLabel="Créer" savingLabel="Création…" />
      </form>
    </ItemModal>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * Navigation du site (SuperUser), selon la charte UI (docs/ui/index.html) : accès, ordre et titre de chaque bouton des
 * menus, enregistrés aussitôt. Un bouton glissé dans un autre menu y change de section ; les menus servent aussi de
 * gardes d'API.
 */
export default function NavPermissionsPage() {
  const router = useRouter()
  const { loading, authenticated, isSuperUser } = useAuthSession()
  // Les menus servent aussi de gardes d'API : SuperUser seulement, comme PUT /api/settings/nav-permissions
  const canAccess = isSuperUser

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
  // Suppression d’un bouton : confirmée dans la page (charte), plus sur la ligne elle-même.
  const [deleteTarget, setDeleteTarget] = useState<NavItemDef | null>(null)

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
    return <AdminPageLoading />
  }

  if (!canAccess) {
    return <AdminPageRestricted message="Seul le SuperUser modifie la navigation : les menus servent aussi de gardes d’accès." />
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const visibleSections = SECTION_ORDER.filter((section) => (displaySections[section] ?? []).length > 0)

  return (
    <div className={ADMIN_PAGE_CLASS}>
      <AdminPageBanner
        title="Navigation"
        subtitle="Accès, ordre et titre de chaque bouton des menus ; chaque modification est enregistrée aussitôt."
        icon={Compass}
        image="/map-stats.jpg"
        currentHref="/settings/nav-permissions"
        parent={{ href: '/settings', label: 'Plateforme' }}
        pills={[
          <>
            <span className="t-num">{allItems.length}</span> boutons
          </>,
          <>
            <span className="t-num">{visibleSections.length}</span> menus
          </>,
          'Réservé au SuperUser',
        ]}
        action={
          <button type="button" onClick={() => setShowCreateModal(true)} className={BANNER_GLASS_BUTTON}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Ajouter un bouton
          </button>
        }
      />

      <div className="app-panel-muted t-meta flex flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-2.5">
        <span className="flex flex-wrap items-center gap-1">
          {ROLES.map((role) => (
            <RoleChip key={role} role={role} />
          ))}
        </span>
        <span>« (défaut) » : accès prévu par le code</span>
        <span className="inline-flex items-center gap-1">
          <Pencil className="h-3 w-3" aria-hidden="true" />
          renommer
        </span>
        <span className="inline-flex items-center gap-1">
          <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
          glisser pour réordonner ou changer de menu
        </span>
        <span className="inline-flex items-center gap-1">
          <PanelsTopLeft className="h-3.5 w-3.5" aria-hidden="true" />
          bord pointillé : bouton placé dans ce menu par son accès
        </span>
      </div>

      {!dataLoaded ? (
        <ListSkeleton rows={4} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {visibleSections.map((section) => {
            const items = displaySections[section] ?? []
            const nativeNavKeys = new Set(allItems.filter((i) => i.section === section).map((i) => i.navKey))
            return (
              <NavSectionCard
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
                onDelete={(navKey) => setDeleteTarget(allItems.find((i) => i.navKey === navKey) ?? null)}
                onEdit={(navKey) => setEditingItem(allItems.find((i) => i.navKey === navKey) ?? null)}
              />
            )
          })}
        </div>
      )}

      {showCreateModal ? <CreateItemModal onClose={() => setShowCreateModal(false)} onCreate={handleCreate} /> : null}
      {editingItem ? <EditItemModal item={editingItem} onClose={() => setEditingItem(null)} onSave={handleEditSave} /> : null}
      {deleteTarget ? (
        <ConfirmDialog
          icon={Trash2}
          title="Supprimer ce bouton ?"
          confirmLabel="Supprimer"
          tone="danger"
          busy={false}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const navKey = deleteTarget.navKey
            setDeleteTarget(null)
            void handleDelete(navKey)
          }}
        >
          « {labelMap[deleteTarget.navKey] ?? deleteTarget.label} » ({deleteTarget.hrefTemplate}) disparaîtra de son menu pour tout le
          monde.
        </ConfirmDialog>
      ) : null}
    </div>
  )
}
