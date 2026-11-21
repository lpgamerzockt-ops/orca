import { describe, expect, it } from 'vitest'
import { getOrcaDispatchTaskId } from './agent-row-primary-text'

const preamble = 'You are working inside Orca, a multi-agent IDE.'

describe('getOrcaDispatchTaskId', () => {
  it('reads the id from the preamble, not from the task body', () => {
    expect(getOrcaDispatchTaskId(`${preamble} Your task ID is: task_1 === TASK === Ship it`)).toBe(
      'task_1'
    )
    expect(getOrcaDispatchTaskId(`${preamble} === TASK === Your task ID is: foo`)).toBeNull()
  })
})
