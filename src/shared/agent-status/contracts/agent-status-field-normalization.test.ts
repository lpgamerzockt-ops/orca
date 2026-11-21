import { describe, expect, it } from 'vitest'
import {
  normalizeInteractivePromptField,
  normalizePromptField
} from './agent-status-field-normalization'
import { parseAskFromStatus } from '../../native-chat/input/native-chat-ask'

function layoutQuestion(preview: (index: number) => string): string {
  return JSON.stringify({
    questions: [
      {
        question: 'Which layout?',
        header: 'Layout',
        multiSelect: false,
        options: ['Sidebar', 'Top bar', 'Split', 'Tabs'].map((label, index) => ({
          label,
          description: `Layout ${index + 1}`,
          preview: preview(index)
        }))
      }
    ]
  })
}

describe('normalizeInteractivePromptField', () => {
  it('shortens oversize previews and keeps every option and the preview layout', () => {
    const fitted = normalizeInteractivePromptField(
      layoutQuestion((index) => `+--${index}--+\n`.repeat(600)),
      4000
    )
    const ask = parseAskFromStatus(fitted, 'AskUserQuestion')
    const question = ask!.questions[0]!
    expect(question.options.map((option) => option.label)).toEqual([
      'Sidebar',
      'Top bar',
      'Split',
      'Tabs'
    ])
    expect(question.hasPreviews).toBe(true)
    expect(question.options.every((option) => option.preview?.endsWith('…'))).toBe(true)
  })

  it('never turns blank previews into previews', () => {
    const fitted = normalizeInteractivePromptField(
      layoutQuestion(() => ' '.repeat(1200)),
      4000
    )
    const question = parseAskFromStatus(fitted, 'AskUserQuestion')!.questions[0]!
    expect(question.options).toHaveLength(4)
    expect(question.hasPreviews).toBeUndefined()
  })
})

describe('normalizePromptField dispatch previews', () => {
  const preamble = 'You are working inside Orca, a multi-agent IDE.'
  const taskId = 'x'.repeat(122)
  const cases = [
    {
      name: 'a body the length cap would cut off',
      prompt: `${preamble}\nYour task ID is: ${taskId}\n=== TASK ===\nShip it`,
      expected: `${preamble} Your task ID is: ${taskId}`
    },
    {
      name: 'a preamble split across lines',
      prompt: `You are working inside Orca,\na multi-agent IDE. === TASK === Your task ID\tis: ${taskId}`,
      expected: `${preamble} === TASK === Your task ID is: ${taskId}`
    },
    {
      name: 'an id phrase inside the task body',
      prompt: `${preamble} === TASK === Your task ID is: ${taskId}`,
      expected: `${preamble} === TASK === Your task ID is: ${taskId}`
    }
  ]

  it.each(cases)('normalizes $name to a preview a second pass leaves unchanged', (row) => {
    expect(normalizePromptField(row.prompt)).toBe(row.expected)
    expect(normalizePromptField(row.expected)).toBe(row.expected)
  })
})
