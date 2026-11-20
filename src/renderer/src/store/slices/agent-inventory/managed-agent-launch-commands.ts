import type { TuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent'
import { isTuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent-config'
import type { ManagedAgentCommands } from '../../../../../shared/agent-launch/startup/managed-agent-launch-program'

// Launches read these synchronously; they're host facts, not UI state, so they stay out of Zustand.
const commandsByInventory = new Map<string, ManagedAgentCommands>()

export function localManagedAgentInventoryKey(contextKey: string): string {
  return `local:${contextKey}`
}

export function runtimeManagedAgentInventoryKey(runtimeInventoryKey: string): string {
  return `runtime:${runtimeInventoryKey}`
}

/** A host's detection reply: older hosts answer the agent list alone. */
export type AgentDetectionReply =
  | readonly string[]
  | { agents: readonly string[]; managedAgentCommands?: Record<string, string> }

/** The reply's agents; Orca's copy paths it reports are kept for that inventory's launches. */
export function readAgentDetectionReply(reply: AgentDetectionReply, inventoryKey: string): TuiAgent[] {
  if (Array.isArray(reply)) {
    commandsByInventory.delete(inventoryKey)
    return reply.filter(isTuiAgent)
  }
  const { agents, managedAgentCommands } = reply as Exclude<AgentDetectionReply, readonly string[]>
  rememberManagedAgentCommands(inventoryKey, managedAgentCommands)
  return agents.filter(isTuiAgent)
}

export function rememberManagedAgentCommands(
  inventoryKey: string,
  commands: Record<string, string> | undefined
): void {
  const typed = Object.fromEntries(
    Object.entries(commands ?? {}).filter(
      ([agent, path]) => isTuiAgent(agent) && typeof path === 'string' && path.length > 0
    )
  ) as ManagedAgentCommands
  if (Object.keys(typed).length > 0) {
    commandsByInventory.set(inventoryKey, typed)
  } else {
    commandsByInventory.delete(inventoryKey)
  }
}

export function readManagedAgentCommands(inventoryKey: string): ManagedAgentCommands | undefined {
  return commandsByInventory.get(inventoryKey)
}

export function forgetManagedAgentCommands(
  prefix: 'local:' | 'runtime:',
  drop: (key: string) => boolean = () => true
): void {
  for (const key of [...commandsByInventory.keys()]) {
    if (key.startsWith(prefix) && drop(key)) {
      commandsByInventory.delete(key)
    }
  }
}
