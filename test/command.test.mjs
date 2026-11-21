import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply } from '../index.js'

/** A Host with command services, an optional locale preference, and a durable session stub. */
function fakeHost(options = {}) {
  const registered = []
  const localeListeners = new Set()
  let preference = options.preference
  const effects = []
  const appended = []
  const recomposed = []
  const warnings = []
  const events = options.events ?? []
  const session = {
    get seq() { return events.length },
    eventAt(index) { return events[index] },
    append(type, data) {
      appended.push({ type, data })
      return { seq: events.length + appended.length }
    },
  }
  const agent = { id: 'session-1', ctx: {}, session }
  const ctx = {
    get(key) {
      assert.equal(key, 'settings')
      return options.hasSettings === false ? undefined : { describe: () => [{ ns: 'locale', value: { preference } }] }
    },
    on(event, listener) {
      assert.equal(event, 'settings/document-updated')
      localeListeners.add(listener)
      return () => { localeListeners.delete(listener) }
    },
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
    logger: { warn: (...args) => { warnings.push(args) } },
    agentPresets: {
      resolve: async id => {
        if (id === 'missing') throw Object.assign(new Error('Unknown agent preset'), { code: 'agent-preset/not-found' })
        return options.broken === true ? { id, broken: 'not mountable' } : { id }
      },
      composedPreset: () => options.current ?? 'standard',
      recompose: async (_ctx, id) => { recomposed.push(id); return { id } },
    },
  }
  apply(ctx)
  assert.equal(registered.length, 1, 'apply registers one command')
  const invoke = (rawInput, attachments = []) => registered[0].handler({ agent, rawInput, attachments })
  const changePreference = (value, ns = 'locale') => {
    preference = value
    for (const listener of localeListeners) listener(ns)
  }
  return { registered, effects, appended, recomposed, warnings, invoke, changePreference }
}

test('registers the command with the authoritative log owning its input', () => {
  const { registered } = fakeHost({ hasSettings: false })
  assert.equal(registered[0].name, 'preset-switch')
  assert.equal(registered[0].recordInput, false)
  assert.equal(registered[0].input.hint, '<preset-id>')
})

test('the menu and feedback follow all eight saved languages', async () => {
  const samples = [
    ['en', '<preset-id>', 'Usage: ', 'already runs'],
    ['zh-CN', '<预设 ID>', '用法：', '已在使用'],
    ['ja', '<プリセットID>', '使い方：', 'すでに'],
    ['de', '<Voreinstellungs-ID>', 'Verwendung: ', 'verwendet bereits'],
    ['es', '<ID-del-preajuste>', 'Uso: ', 'ya usa'],
    ['fr', '<ID-du-préréglage>', 'Utilisation : ', 'utilise déjà'],
    ['pt', '<ID-da-predefinição>', 'Uso: ', 'já usa'],
    ['ru', '<ID-предустановки>', 'Использование: ', 'уже используется'],
  ]
  const host = fakeHost()
  const descriptions = new Set()
  for (const [preference, hint, usage, current] of samples) {
    host.changePreference(preference)
    await Promise.resolve()
    const [descriptor] = host.registered
    descriptions.add(descriptor.description)
    assert.equal(descriptor.input.hint, hint)
    assert.deepEqual(await host.invoke('two words'), { kind: 'error', text: `${usage}/preset-switch ${hint}` })
    const result = await host.invoke('standard')
    assert.equal(result.kind, 'success')
    assert.ok(result.text.includes(current), result.text)
    assert.ok(result.text.includes('standard'), result.text)
  }
  assert.equal(descriptions.size, samples.length)
  assert.deepEqual(host.recomposed, [])
  assert.deepEqual(host.appended, [])
  host.changePreference('unknown')
  await Promise.resolve()
  assert.equal(host.registered[0].input.hint, '<preset-id>')
})

test('a locale change keeps an in-flight command in its original language and cleans up on unload', async () => {
  const host = fakeHost()
  const result = host.invoke('cordis')
  host.changePreference('zh')
  await Promise.resolve()
  assert.match((await result).text, /^Switched this session/)
  assert.match((await host.invoke('cordis')).text, /^已将此会话切换到「cordis」/)
  assert.deepEqual(await host.invoke('missing'), { kind: 'error', text: '找不到 Agent 预设「missing」。' })
  assert.deepEqual(host.recomposed, ['cordis', 'cordis'])
  const rejected = await host.invoke('cordis', [{}])
  assert.deepEqual(rejected, { kind: 'error', text: '此命令不接受附件。用法：/preset-switch <预设 ID>' })
  host.changePreference('de', 'unrelated')
  await Promise.resolve()
  assert.equal(host.registered[0].input.hint, '<预设 ID>')
  host.changePreference('es')
  host.effects[0].dispose()
  await Promise.resolve()
  assert.deepEqual(host.registered, [])
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

test('a broken preset reports localized feedback and keeps its diagnostic in the Host log', async () => {
  const host = fakeHost({ broken: true, preference: 'zh' })
  assert.deepEqual(await host.invoke('cordis'), { kind: 'error', text: 'Agent 预设「cordis」当前不可用。' })
  assert.equal(host.warnings[0].at(-1), 'not mountable')
  assert.deepEqual(host.recomposed, [])
  assert.deepEqual(host.appended, [])
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
