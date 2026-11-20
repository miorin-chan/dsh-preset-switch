import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply } from '../index.js'

/** A host with the three services the command injects and a durable session stub. */
function fakeHost(options = {}) {
  const registered = []
  const effects = []
  const appended = []
  const recomposed = []
  const session = {
    events: options.events ?? [],
    append(type, data) {
      appended.push({ type, data })
      return { seq: appended.length }
    },
  }
  const agent = { id: 'session-1', ctx: {}, session }
  const ctx = {
    effect(install, label) {
      const dispose = install()
      effects.push({ label, dispose })
      return dispose
    },
    commands: {
      register(definition) {
        registered.push(definition)
        return () => { registered.length = 0 }
      },
    },
    agents: {
      turnBoundaryOf: () => options.boundary ?? { openTurnStartSeq: null, lastTurn: 0 },
    },
    agentPresets: {
      resolve: async id => options.broken === true ? { id, broken: 'not mountable' } : { id },
      composedPreset: () => options.current ?? 'standard',
      recompose: async (_ctx, id) => { recomposed.push(id); return { id } },
    },
  }
  apply(ctx)
  assert.equal(registered.length, 1, 'apply registers one command')
  const invoke = rawInput => registered[0].handler({ agent, rawInput, attachments: [] })
  return { ctx, registered, effects, appended, recomposed, invoke }
}

test('registers the command with the authoritative log owning its input', () => {
  const { registered } = fakeHost()
  assert.equal(registered[0].name, 'preset-switch')
  assert.equal(registered[0].recordInput, false)
  assert.equal(registered[0].input.hint, '<preset-id>')
})

test('an idle session recomposes and records the new preset', async () => {
  const host = fakeHost({ current: 'standard' })
  const result = await host.invoke('cordis')
  assert.equal(result.kind, 'success')
  assert.deepEqual(host.recomposed, ['cordis'])
  assert.deepEqual(host.appended, [{ type: 'agent-preset/selected', data: { agentPreset: 'cordis' } }])
})

test('an open turn refuses the switch and leaves the composition alone', async () => {
  const host = fakeHost({ boundary: { openTurnStartSeq: 12, lastTurn: 1 } })
  const result = await host.invoke('cordis')
  assert.equal(result.kind, 'error')
  assert.match(result.text, /running a turn/)
  assert.deepEqual(host.recomposed, [])
  assert.deepEqual(host.appended, [])
})

test('a running compaction refuses the switch', async () => {
  const host = fakeHost({
    events: [
      { type: 'session/end-seed' },
      { type: 'compaction/start', data: { turn: 1 } },
      { type: 'compaction/summary', data: {} },
    ],
  })
  const result = await host.invoke('cordis')
  assert.equal(result.kind, 'error')
  assert.match(result.text, /compacting/)
  assert.deepEqual(host.recomposed, [])
})

test('a stale compaction start before the latest lifecycle is ignored', async () => {
  const host = fakeHost({
    events: [
      { type: 'compaction/start', data: { turn: 1 } },
      { type: 'session/end-seed' },
      { type: 'user/message', data: {} },
    ],
  })
  const result = await host.invoke('cordis')
  assert.equal(result.kind, 'success')
  assert.deepEqual(host.recomposed, ['cordis'])
})

test('a broken target is refused before recomposition', async () => {
  const host = fakeHost({ broken: true })
  const result = await host.invoke('cordis')
  assert.equal(result.kind, 'error')
  assert.match(result.text, /not mountable/)
  assert.deepEqual(host.recomposed, [])
})

test('the current preset is a no-op', async () => {
  const host = fakeHost({ current: 'cordis' })
  const result = await host.invoke('cordis')
  assert.equal(result.kind, 'success')
  assert.match(result.text, /already runs/)
  assert.deepEqual(host.recomposed, [])
  assert.deepEqual(host.appended, [])
})

test('malformed input reports usage without touching the session', async () => {
  const host = fakeHost()
  for (const input of ['', '  ', 'two words', '\t']) {
    const result = await host.invoke(input)
    assert.equal(result.kind, 'error')
    assert.match(result.text, /Usage/)
  }
  assert.deepEqual(host.recomposed, [])
})
