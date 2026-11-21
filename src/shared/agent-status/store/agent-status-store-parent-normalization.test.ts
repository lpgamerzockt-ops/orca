import { describe, expect, it } from 'vitest'
import { createAgentStatusStore } from './agent-status-store'
import { makeStructuredAgentStatusSubject } from '../contracts/agent-status-subject'

const subject = makeStructuredAgentStatusSubject(
  { executionHostId: 'local', wslDistro: null, workspaceId: 'folder-one', workspaceKind: 'folder' },
  'session-one'
)
const taskId = 'x'.repeat(122)

function storedPrompt(prompt: string): string | undefined {
  const store = createAgentStatusStore({ epoch: 'host', mode: 'authority' })
  store.applyMutation({
    parent: {
      subject,
      status: {
        state: 'working',
        prompt,
        paneKey: 'pane-one',
        connectionId: null,
        receivedAt: 1,
        stateStartedAt: 1
      }
    }
  })
  return store.getParent(subject)?.status?.prompt
}

describe('stored status prompt previews', () => {
  it('stores the same preview for a steer whose dispatch preamble only differs in whitespace', () => {
    const first = `You are working inside Orca, a multi-agent IDE. Your task ID is: ${taskId}`
    const steer = `You are working inside Orca,\na multi-agent IDE. === TASK === Your task ID\tis: ${taskId}`

    expect(storedPrompt(first)).toBeDefined()
    expect(storedPrompt(steer)).toBe(storedPrompt(first))
  })
})
