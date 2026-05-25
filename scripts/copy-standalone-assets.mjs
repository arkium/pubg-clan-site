import { cp, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const standaloneRoot = join(projectRoot, '.next', 'standalone')
const standaloneNextRoot = join(standaloneRoot, '.next')
const staticSource = join(projectRoot, '.next', 'static')
const publicSource = join(projectRoot, 'public')
const staticTarget = join(standaloneNextRoot, 'static')
const publicTarget = join(standaloneRoot, 'public')

async function copyIfExists(source, target) {
  await mkdir(dirname(target), { recursive: true })
  await cp(source, target, { recursive: true, force: true })
}

async function main() {
  await mkdir(standaloneNextRoot, { recursive: true })

  await copyIfExists(staticSource, staticTarget)
  await copyIfExists(publicSource, publicTarget)

  console.log(`[standalone] Copied assets to ${standaloneRoot}`)
}

main().catch((error) => {
  console.error('[standalone] Failed to copy assets:', error)
  process.exit(1)
})
