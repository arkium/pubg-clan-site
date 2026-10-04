/**
 * Base en mémoire pour les tests de la Carte des ressources — **aucun accès à la base réelle** (DATABASE_URL est la
 * production). Simule le sous-ensemble de l'API Prisma utilisé par `resource-service*.ts` : `where` (égalité, `in`,
 * `notIn`, `not`, `gt`/`gte`/`lt`/`lte`, `OR`/`AND`/`NOT`, filtres de relation « à un »), `select` (relations « à un »
 * comprises), `orderBy`, `skip`/`take`, `count`, `groupBy` + `_count`, `create`, `update` (`increment`), `updateMany`,
 * `upsert`, `delete`, `deleteMany` (cascades du schéma), `$transaction` interactif avec retour arrière sur erreur.
 *
 * Fichier d'aide aux tests (pas un `*.test.ts`) : importé par les tests et par le `vi.mock('@/lib/prisma')`.
 */

type Row = Record<string, unknown>
type Args = Record<string, unknown>

const MODELS = [
  'resourcePoint',
  'resourceReport',
  'resourceConfirmation',
  'resourceMapState',
  'resourceAction',
  'resourceVehicleSpot',
  'resourceVehicleMapStat',
  'userAccount',
  'memberIdentity',
  'clanMember',
  'dropPressureStat',
  'appConfig',
] as const
export type FakeModel = (typeof MODELS)[number]

/** Relations « à un » : champ de relation → modèle visé et clé étrangère locale. */
const RELATIONS: Partial<Record<FakeModel, Record<string, { model: FakeModel; field: string }>>> = {
  resourceReport: { point: { model: 'resourcePoint', field: 'pointId' }, user: { model: 'userAccount', field: 'userId' } },
  resourceConfirmation: { point: { model: 'resourcePoint', field: 'pointId' }, user: { model: 'userAccount', field: 'userId' } },
  memberIdentity: { member: { model: 'clanMember', field: 'memberId' }, user: { model: 'userAccount', field: 'userId' } },
  dropPressureStat: { member: { model: 'clanMember', field: 'memberId' } },
}

/** `onDelete: Cascade` du schéma. */
const CASCADES: Partial<Record<FakeModel, Array<{ model: FakeModel; field: string }>>> = {
  resourcePoint: [
    { model: 'resourceReport', field: 'pointId' },
    { model: 'resourceConfirmation', field: 'pointId' },
  ],
}

/** Clé primaire quand ce n'est pas `id`. */
const PRIMARY_KEYS: Partial<Record<FakeModel, string>> = { resourceMapState: 'mapName', resourceVehicleMapStat: 'mapName', appConfig: 'key' }
const INT_IDS = new Set<FakeModel>(['resourceVehicleSpot', 'userAccount', 'memberIdentity', 'clanMember'])
const UPDATED_AT = new Set<FakeModel>(['resourcePoint', 'resourceMapState', 'userAccount'])
const CREATED_AT = new Set<FakeModel>(['resourcePoint', 'resourceReport', 'resourceConfirmation', 'resourceAction', 'userAccount', 'memberIdentity'])
const JSON_FIELDS: Partial<Record<FakeModel, string[]>> = { resourceAction: ['before', 'after'] }

const DEFAULTS: Partial<Record<FakeModel, Row>> = {
  resourcePoint: { status: 'pending', comment: null, createdByUserId: null, validatedByUserId: null, validatedAt: null, lastConfirmedAt: null, confirmationCount: 0 },
  resourceReport: { proposedX: null, proposedY: null, proposedKind: null, comment: null, status: 'pending', resolvedByUserId: null, resolvedAt: null },
  resourceMapState: { verifiedAt: null, recheckSince: null, updatedByUserId: null },
  resourceAction: { actorUserId: null, pointId: null, before: null, after: null, undoneAt: null, undoneByUserId: null },
  userAccount: { displayName: null, isSuperUser: false, status: 'active' },
  memberIdentity: { isPrimary: false },
  clanMember: { isActive: true, clanId: null },
}

const isPlainObject = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !(value instanceof Date) && !Array.isArray(value)

const clone = <T>(value: T): T => structuredClone(value)
const jsonClone = (value: unknown) => (value === null || value === undefined ? null : JSON.parse(JSON.stringify(value)))
const comparable = (value: unknown) => (value instanceof Date ? value.getTime() : value)

function equal(left: unknown, right: unknown) {
  if (left === null || left === undefined) return right === null || right === undefined
  return comparable(left) === comparable(right)
}

function compare(left: unknown, right: unknown) {
  const a = comparable(left)
  const b = comparable(right)
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  return (a as number) < (b as number) ? -1 : 1
}

function matchField(value: unknown, condition: unknown): boolean {
  if (!isPlainObject(condition)) return equal(value, condition)
  for (const [operator, operand] of Object.entries(condition)) {
    if (operand === undefined) continue
    switch (operator) {
      case 'equals':
        if (!equal(value, operand)) return false
        break
      case 'in':
        if (!(operand as unknown[]).some((item) => equal(value, item))) return false
        break
      case 'notIn':
        if ((operand as unknown[]).some((item) => equal(value, item))) return false
        break
      case 'not':
        if (isPlainObject(operand) ? matchField(value, operand) : equal(value, operand)) return false
        break
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        if (value === null || value === undefined) return false
        const order = compare(value, operand)
        if (operator === 'gt' && !(order > 0)) return false
        if (operator === 'gte' && !(order >= 0)) return false
        if (operator === 'lt' && !(order < 0)) return false
        if (operator === 'lte' && !(order <= 0)) return false
        break
      }
      default:
        throw new Error(`Opérateur Prisma non simulé : ${operator}`)
    }
  }
  return true
}

export class FakeResourceDb {
  tables = {} as Record<FakeModel, Row[]>
  /** Écritures effectuées (`modèle.opération`), pour vérifier qu'une lecture n'écrit rien. */
  writes: string[] = []
  private sequence = 0
  readonly client: Record<string, unknown>

  constructor() {
    this.reset()
    const client: Record<string, unknown> = {}
    for (const model of MODELS) client[model] = this.delegate(model)
    client.$transaction = async (arg: unknown) => {
      if (typeof arg === 'function') {
        const snapshot = clone(this.tables)
        const writes = this.writes.length
        try {
          return await (arg as (tx: unknown) => Promise<unknown>)(client)
        } catch (error) {
          this.tables = snapshot
          this.writes.length = writes
          throw error
        }
      }
      return Promise.all(arg as Promise<unknown>[])
    }
    this.client = client
  }

  reset() {
    this.tables = Object.fromEntries(MODELS.map((model) => [model, []])) as unknown as Record<FakeModel, Row[]>
    this.writes = []
    this.sequence = 0
  }

  /** Insère une ligne (valeurs par défaut du schéma, identifiant généré) — sert aussi à préparer les données d'un test. */
  insert(model: FakeModel, data: Row): Row {
    this.sequence += 1
    const key = PRIMARY_KEYS[model] ?? 'id'
    const row: Row = { ...clone(DEFAULTS[model] ?? {}) }
    if (key === 'id') row.id = INT_IDS.has(model) ? 10_000 + this.sequence : `c${model.slice(8, 12).toLowerCase() || 'row'}${String(this.sequence).padStart(6, '0')}`
    if (CREATED_AT.has(model)) row.createdAt = new Date()
    if (UPDATED_AT.has(model)) row.updatedAt = new Date()
    this.assign(model, row, data)
    this.tables[model].push(row)
    return row
  }

  rows(model: FakeModel) {
    return this.tables[model]
  }

  find(model: FakeModel, where: Row) {
    return this.tables[model].find((row) => this.matches(model, row, where)) ?? null
  }

  private assign(model: FakeModel, row: Row, data: Row) {
    const jsonFields = JSON_FIELDS[model] ?? []
    for (const [field, value] of Object.entries(data)) {
      if (value === undefined) continue
      if (jsonFields.includes(field)) row[field] = jsonClone(value)
      else if (isPlainObject(value) && 'increment' in value) row[field] = Number(row[field] ?? 0) + Number(value.increment)
      else if (isPlainObject(value) && 'decrement' in value) row[field] = Number(row[field] ?? 0) - Number(value.decrement)
      else if (isPlainObject(value) && 'set' in value) row[field] = clone(value.set)
      else row[field] = clone(value)
    }
  }

  private related(model: FakeModel, row: Row, field: string) {
    const relation = RELATIONS[model]?.[field]
    if (!relation) return undefined
    const foreignKey = row[relation.field]
    return this.tables[relation.model].find((candidate) => equal(candidate[PRIMARY_KEYS[relation.model] ?? 'id'], foreignKey)) ?? null
  }

  matches(model: FakeModel, row: Row, where: unknown): boolean {
    if (!isPlainObject(where)) return true
    for (const [field, condition] of Object.entries(where)) {
      if (condition === undefined) continue
      if (field === 'AND') {
        if (!(Array.isArray(condition) ? condition : [condition]).every((inner) => this.matches(model, row, inner))) return false
      } else if (field === 'OR') {
        if (!(condition as unknown[]).some((inner) => this.matches(model, row, inner))) return false
      } else if (field === 'NOT') {
        if ((Array.isArray(condition) ? condition : [condition]).some((inner) => this.matches(model, row, inner))) return false
      } else if (RELATIONS[model]?.[field]) {
        const relation = RELATIONS[model]![field]
        const related = this.related(model, row, field)
        const inner = isPlainObject(condition) && 'is' in condition ? condition.is : condition
        if (inner === null) {
          if (related) return false
        } else if (!related || !this.matches(relation.model, related, inner)) {
          return false
        }
      } else if (!matchField(row[field], condition)) {
        return false
      }
    }
    return true
  }

  private project(model: FakeModel, row: Row, select: unknown): Row {
    if (!isPlainObject(select)) return clone(row)
    const out: Row = {}
    for (const [field, spec] of Object.entries(select)) {
      if (!spec) continue
      const relation = RELATIONS[model]?.[field]
      if (relation) {
        const related = this.related(model, row, field)
        out[field] = related ? this.project(relation.model, related, isPlainObject(spec) ? spec.select : undefined) : null
      } else {
        out[field] = clone(row[field])
      }
    }
    return out
  }

  private select(model: FakeModel, args: Args = {}) {
    const filtered = this.tables[model].filter((row) => this.matches(model, row, args.where))
    const order = (Array.isArray(args.orderBy) ? args.orderBy : args.orderBy ? [args.orderBy] : []).flatMap((entry) => Object.entries(entry as Row))
    filtered.sort((a, b) => {
      for (const [field, direction] of order) {
        const result = compare(a[field], b[field])
        if (result) return direction === 'desc' ? -result : result
      }
      return 0
    })
    const skip = typeof args.skip === 'number' ? args.skip : 0
    const take = typeof args.take === 'number' ? args.take : undefined
    return filtered.slice(skip, take === undefined ? undefined : skip + take)
  }

  private remove(model: FakeModel, rows: Row[]) {
    const removed = new Set(rows)
    this.tables[model] = this.tables[model].filter((row) => !removed.has(row))
    for (const cascade of CASCADES[model] ?? []) {
      const ids = new Set(rows.map((row) => row[PRIMARY_KEYS[model] ?? 'id']))
      this.remove(cascade.model, this.tables[cascade.model].filter((row) => ids.has(row[cascade.field])))
    }
  }

  private notFound(model: FakeModel) {
    return Object.assign(new Error(`${model} : enregistrement introuvable (P2025)`), { code: 'P2025' })
  }

  private delegate(model: FakeModel) {
    const touch = (row: Row) => {
      if (UPDATED_AT.has(model)) row.updatedAt = new Date()
    }
    return {
      findMany: async (args: Args = {}) => this.select(model, args).map((row) => this.project(model, row, args.select)),
      findFirst: async (args: Args = {}) => {
        const row = this.select(model, { ...args, take: 1 })[0]
        return row ? this.project(model, row, args.select) : null
      },
      findUnique: async (args: Args) => {
        const row = this.find(model, args.where as Row)
        return row ? this.project(model, row, args.select) : null
      },
      count: async (args: Args = {}) => this.tables[model].filter((row) => this.matches(model, row, args.where)).length,
      groupBy: async (args: Args) => {
        const by = args.by as string[]
        const groups = new Map<string, { keys: Row; count: number }>()
        for (const row of this.select(model, { where: args.where })) {
          const key = JSON.stringify(by.map((field) => comparable(row[field])))
          const group = groups.get(key) ?? { keys: Object.fromEntries(by.map((field) => [field, clone(row[field])])), count: 0 }
          group.count += 1
          groups.set(key, group)
        }
        return [...groups.values()].map((group) => ({ ...group.keys, _count: { _all: group.count } }))
      },
      create: async (args: Args) => {
        this.writes.push(`${model}.create`)
        return this.project(model, this.insert(model, args.data as Row), args.select)
      },
      update: async (args: Args) => {
        const row = this.find(model, args.where as Row)
        if (!row) throw this.notFound(model)
        this.writes.push(`${model}.update`)
        this.assign(model, row, args.data as Row)
        touch(row)
        return this.project(model, row, args.select)
      },
      updateMany: async (args: Args) => {
        const rows = this.tables[model].filter((row) => this.matches(model, row, args.where))
        this.writes.push(`${model}.updateMany`)
        for (const row of rows) {
          this.assign(model, row, args.data as Row)
          touch(row)
        }
        return { count: rows.length }
      },
      upsert: async (args: Args) => {
        const row = this.find(model, args.where as Row)
        this.writes.push(`${model}.upsert`)
        if (!row) return this.project(model, this.insert(model, args.create as Row), args.select)
        this.assign(model, row, args.update as Row)
        touch(row)
        return this.project(model, row, args.select)
      },
      delete: async (args: Args) => {
        const row = this.find(model, args.where as Row)
        if (!row) throw this.notFound(model)
        this.writes.push(`${model}.delete`)
        this.remove(model, [row])
        return clone(row)
      },
      deleteMany: async (args: Args = {}) => {
        const rows = this.tables[model].filter((row) => this.matches(model, row, args.where))
        this.writes.push(`${model}.deleteMany`)
        this.remove(model, rows)
        return { count: rows.length }
      },
    }
  }
}

/** Instance partagée entre le test et le `vi.mock('@/lib/prisma')`. */
export const resourceTestDb = new FakeResourceDb()
