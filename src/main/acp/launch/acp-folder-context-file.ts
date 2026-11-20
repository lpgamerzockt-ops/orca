import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const HEADER = '<!-- Orca writes this file for chats in this folder; edits are replaced. -->'

/** Replaces `path` in `cwd` whole, so the agent never reads a half-written file. */
export async function writeFolderContextFile(
  cwd: string,
  path: string,
  text: string
): Promise<void> {
  const target = join(cwd, path)
  await mkdir(dirname(target), { recursive: true })
  const staged = `${target}.${randomUUID()}`
  try {
    await writeFile(staged, `${HEADER}\n\n${text}\n`, { mode: 0o600 })
    await rename(staged, target)
  } catch (error) {
    await rm(staged, { force: true }).catch(() => undefined)
    throw error
  }
}
