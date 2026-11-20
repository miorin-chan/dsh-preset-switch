import assert from 'node:assert/strict'
import { test } from 'node:test'

/** Capture the module registration the browser module loader would receive. */
let registration
globalThis.window = {
  __ModuleLoader__: {
    load(entry) {
      registration = entry
    },
  },
}
await import('../client.js')

assert.equal(registration.id, 'dsh-preset-switch')

/** A React stub: enough for the component's first render, no page needed. */
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: value => [value, () => undefined],
  useEffect: () => undefined,
  useRef: () => ({ current: null }),
  useMemo: factory => factory(),
}
const plugin = registration.factory(name => {
  if (name === 'react') return reactStub
  throw new Error(`unexpected module ${name}`)
})

/** A minimal host: recorded effects, a locale service, and a slot registry. */
function fakeContext() {
  const effects = []
  const registered = new Map()
  const slots = []
  const ctx = {
    effect(install, label) {
      const dispose = install()
      effects.push({ label, dispose })
      return dispose
    },
    locale: {
      register(namespace, labels) {
        registered.set(namespace, labels)
        return () => {
          registered.delete(namespace)
        }
      },
      bind() {
        return key => key
      },
    },
    slots: {
      inject(owner, install) {
        return install()
      },
      register(options, component) {
        slots.push({ options, component })
        return () => {
          slots.length = 0
        }
      },
    },
    remote: {
      agentPresets: {
        list: async () => ({ ok: true, value: { presets: [] } }),
        read: async () => ({ ok: true, value: { content: '' } }),
      },
    },
    sessions: { binding: () => undefined },
  }
  return { ctx, effects, registered, slots }
}

test('declares the services it injects', () => {
  // `remote` alone gives the namespace table; each namespace is its own service.
  assert.deepEqual(plugin.inject, ['locale', 'slots', 'sessions', 'remote', 'remote.agentPresets'])
})

test('registers labels and the header action, then releases both', () => {
  const { ctx, effects, registered, slots } = fakeContext()
  plugin.apply(ctx)

  assert.equal(effects.length, 2, 'locale and header registrations are effects')
  assert.ok(registered.has('dsh-preset-switch'), 'labels live under the plugin id')
  assert.equal(Object.keys(registered.get('dsh-preset-switch')).length, 8, 'every locale has labels')
  assert.equal(slots.length, 1, 'one header action')
  assert.equal(slots[0].options.name, 'conversation.session.header.actions')
  assert.equal(slots[0].options.id, 'preset-switch')
  assert.equal(slots[0].options.order, -9, 'follows the shipped label at -10')
  assert.equal(slots[0].options.locale, 'dsh-preset-switch')
  assert.equal(typeof slots[0].component, 'function')

  for (const effect of effects) effect.dispose()
  assert.equal(registered.has('dsh-preset-switch'), false, 'disposing removes the locale namespace')
  assert.equal(slots.length, 0, 'disposing removes the header action')
})

/** A declaration with a group row, a conditional disable, and a config-only edit. */
const standard = `
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    prefix: You are a coding agent.
- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
  disabled: !!js process.platform === 'win32'
- id: planning
  name: cordis:group
  group: true
  config:
    - id: plan-mode
      name: '@deepseek-ai/dsh-plan-mode'
- id: workflow-ptc
  name: '@deepseek-ai/dsh-workflow-ptc'
- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'
`

test('parses rows, drops groups, and keeps conditional disables enabled', () => {
  const rows = plugin.internals.parseComposition(standard)
  assert.deepEqual(rows.map(row => row.id), ['persona', 'tool-bash', 'plan-mode', 'workflow-ptc', 'tool-fs'])
  assert.equal(rows.find(row => row.id === 'tool-bash').disabled, false, 'a !!js condition is not a literal disable')
  assert.ok(rows.every(row => row.name !== 'cordis:group'), 'group rows are structural')
})

test('an added row alone is not a loss', () => {
  const creator = `${standard}\n- id: tool-cordis\n  name: '@deepseek-ai/dsh-tool-cordis'\n`
    .replace('prefix: You are a coding agent.', 'prefix: You help customize DSH.')
  const impact = plugin.internals.diffCompositions(standard, creator)
  assert.deepEqual(impact.added.map(row => row.id), ['tool-cordis'])
  assert.deepEqual(impact.removed, [])
  assert.deepEqual(impact.disabled, [])
})

test('a missing row is reported as removed', () => {
  const minimal = `
- id: persona
  name: '@deepseek-ai/dsh-persona'
- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'
`
  const impact = plugin.internals.diffCompositions(standard, minimal)
  assert.deepEqual(impact.removed.map(row => row.id), ['tool-bash', 'plan-mode', 'workflow-ptc'])
  assert.deepEqual(impact.disabled, [])
})

test('a row the target disables is reported as disabled', () => {
  const ptc = standard.replace(
    '- id: workflow-ptc\n  name: \'@deepseek-ai/dsh-workflow-ptc\'\n',
    '- id: workflow-ptc\n  name: \'@deepseek-ai/dsh-workflow-ptc\'\n  disabled: true\n',
  )
  const impact = plugin.internals.diffCompositions(standard, ptc)
  assert.deepEqual(impact.disabled.map(row => row.id), ['workflow-ptc'])
  assert.deepEqual(impact.removed, [])
})

test('a conditional row that the target enables is not a loss', () => {
  const windows = standard.replace("disabled: !!js process.platform === 'win32'", 'disabled: true')
  const impact = plugin.internals.diffCompositions(windows, standard)
  assert.deepEqual(impact.removed, [])
  assert.deepEqual(impact.disabled, [], 'the target enables a row the current one disables')
})

test('a row id that now names another module is reported as a replacement', () => {
  const replaced = standard.replace(
    "- id: workflow-ptc\n  name: '@deepseek-ai/dsh-workflow-ptc'",
    "- id: workflow-ptc\n  name: '@deepseek-ai/dsh-workflow-native'",
  )
  const impact = plugin.internals.diffCompositions(standard, replaced)
  assert.deepEqual(impact.removed.map(row => row.id), ['workflow-ptc'])
  assert.deepEqual(impact.added.map(row => row.name), ['@deepseek-ai/dsh-workflow-native'])
})

test('renders the header chevron only when the session records a preset', () => {
  const { ctx, slots } = fakeContext()
  plugin.apply(ctx)
  const Component = slots[0].component
  assert.equal(Component({ sessionId: 'session-1', t: key => key, useSessions: () => undefined }), null)

  const tree = Component({ sessionId: 'session-1', t: key => key, useSessions: () => 'standard' })
  assert.equal(tree.type, 'span')
  assert.equal(tree.props['data-revealed'], false, 'the chevron rests collapsed until the header is hovered')
  const trigger = tree.children.find(child => child !== null && child.props?.className === 'dshps-trigger')
  assert.ok(trigger, 'the chevron button renders beside the shipped label')
  assert.equal(trigger.props['aria-haspopup'], 'menu')
  assert.equal(trigger.props['aria-expanded'], false)
})

test('renders nothing when the preset projection is null', () => {
  const { ctx, slots } = fakeContext()
  plugin.apply(ctx)
  const Component = slots[0].component
  assert.equal(
    Component({ sessionId: 'session-1', t: key => key, useSessions: () => null }),
    null,
    'a null projection records no preset, so the header entry stays hidden',
  )
})
