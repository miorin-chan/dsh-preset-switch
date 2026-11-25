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

assert.equal(registration.id, '@miorin/dsh-preset-switch')

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
  const sources = []
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
      getLocale: () => ({ active: 'en' }),
    },
    inputTriggers: {
      registerSource(source) {
        sources.push(source)
        return () => { sources.length = 0 }
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
    sessions: { binding: () => undefined, subagentAddress: () => undefined },
  }
  return { ctx, effects, registered, slots, sources }
}

test('declares the services it injects', () => {
  // `remote` alone gives the namespace table; each namespace is its own service.
  assert.deepEqual(plugin.inject, ['locale', 'slots', 'sessions', 'inputTriggers', 'remote', 'remote.agentPresets'])
})

test('registers labels, the slash source, and the header action, then releases them', () => {
  const { ctx, effects, registered, slots, sources } = fakeContext()
  plugin.apply(ctx)

  assert.equal(effects.length, 3, 'locale, slash source, and header registrations are effects')
  assert.equal(sources[0].trigger, '/')
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
  assert.equal(sources.length, 0, 'disposing removes the alias source')
})

test('the locale selects a menu spelling and every alias runs the canonical command', async () => {
  const { ctx, sources } = fakeContext()
  const submitted = []
  const session = { sessionId: 'session-1' }
  ctx.sessions.binding = () => ({ session: { command: async line => {
    submitted.push(line)
    return { ok: true, value: { matched: true } }
  } } })
  plugin.apply(ctx)
  const [source] = sources
  const signal = new AbortController().signal
  const request = { query: '', position: 'leading', signal }
  assert.deepEqual(await source.candidates(session, request), [], 'English uses the Host menu entry')
  assert.equal(source.matchSpace(session, '/preset-switch'), undefined, 'the Host owns the canonical token')
  for (const [active, token] of Object.entries({
    zh: '切换预设', ja: 'プリセット切替', de: 'voreinstellung-wechseln', es: 'cambiar-preajuste',
    fr: 'changer-préréglage', pt: 'mudar-predefinição', ru: 'сменить-предустановку',
  })) {
    ctx.locale.getLocale = () => ({ active })
    const [candidate] = await source.candidates(session, { ...request, query: token.slice(0, 1) })
    assert.equal(candidate.name, token)
    const line = `/${token}`
    const { claim } = source.onPick({ session, candidate, position: 'leading' })
    assert.equal(claim.token, `${line} `)
    assert.equal(claim.hint, candidate.hint)
    assert.equal(source.matchSpace(session, line).claim.token, claim.token)
    assert.equal((await source.matchEnter(session, `${line} standard`, signal, { attachments: 0 })).claim.name, 'preset-switch')
    assert.deepEqual(await claim.submit('standard', ctx, []), { kind: 'success' })
  }
  assert.deepEqual(submitted, Array(7).fill('/preset-switch standard'))

  ctx.locale.getLocale = () => ({ active: 'en' })
  assert.equal((await source.matchClaim(session, '/切换预设', signal)).token, '/切换预设 ')
  assert.equal(await source.matchEnter(session, '/切换预设其他 standard', signal, { attachments: 0 }), undefined)
  await assert.rejects(() => source.matchEnter(session, '/切换预设 standard', signal, { attachments: 1 }), /no attachments/)
  ctx.sessions.subagentAddress = () => ({})
  assert.equal(await source.matchClaim(session, '/切换预设', signal), undefined)
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
  assert.equal(Component({ sessionId: 'session-1', t: key => key, useProjection: () => undefined }), null)

  const tree = Component({ sessionId: 'session-1', t: key => key, useProjection: () => 'standard' })
  assert.equal(tree.type, 'span')
  assert.equal(tree.props['data-open'], false, 'the picker starts closed')
  const trigger = tree.children.find(child => child?.props?.className === 'dshps-trigger')
  assert.ok(trigger, 'the chevron button renders beside the shipped label')
  assert.equal(trigger.props['aria-haspopup'], 'menu')
  assert.equal(trigger.props['aria-expanded'], false)
  const [glyph] = trigger.children
  assert.equal(glyph.props.className, 'dshps-chevron', 'only the glyph moves within the button')
  assert.equal(glyph.props['aria-hidden'], 'true')
})

test('reopening waits for the roster and excludes the live preset even if the summary is stale', (t) => {
  const { ctx, slots } = fakeContext()
  plugin.apply(ctx)
  const roster = { status: 'ready', presets: [{ id: 'standard' }, { id: 'cordis' }] }
  const state = [false, null, roster]
  let nextState = 0
  let nextRef = 0
  t.mock.method(reactStub, 'useState', initial => {
    const index = nextState++
    if (index >= state.length) return [initial, () => undefined]
    return [state[index], update => {
      state[index] = typeof update === 'function' ? update(state[index]) : update
    }]
  })
  const buttonRef = { current: { getBoundingClientRect: () => ({ left: 100, bottom: 24 }) } }
  t.mock.method(reactStub, 'useRef', () => nextRef++ === 1 ? buttonRef : { current: null })

  const props = {
    sessionId: 'session-1',
    t: key => key,
    useSessions: select => select({ byId: { 'session-1': { projectionValues: { agentPreset: 'standard' } } } }),
    useProjection: key => {
      assert.equal(key, 'agentPreset')
      return 'cordis'
    },
  }
  const render = () => {
    nextState = 0
    nextRef = 0
    return slots[0].component(props)
  }
  const menuRows = () => {
    const menu = render().children.find(child => child?.props?.role === 'menu')
    assert.ok(menu)
    return menu.children.flat().filter(child => child?.props?.role === 'menuitem').map(child => child.props.key)
  }

  const trigger = render().children.find(child => child?.props?.className === 'dshps-trigger')
  assert.equal(trigger.props.ref, buttonRef)
  trigger.props.onClick()
  const opened = render()
  assert.equal(opened.props['data-open'], true, 'the chevron stays revealed once the picker opens')
  assert.equal(opened.children.find(child => child?.props?.className === 'dshps-trigger').props['aria-expanded'], true)
  assert.deepEqual(opened.children.find(child => child?.props?.role === 'menu').props.style, {
    '--dshps-menu-top': '30px',
    '--dshps-menu-left': '100px',
  }, 'opening anchors the menu to the button’s box')
  assert.deepEqual(menuRows(), [], 'the first render after opening cannot use the previous roster')
  state[2] = roster
  assert.deepEqual(menuRows(), ['standard'], 'the current preset is excluded as soon as the roster arrives')
})

test('scopes pointer reveal to the adjacent preset label and chevron', () => {
  const { ctx, slots } = fakeContext()
  plugin.apply(ctx)
  const tree = slots[0].component({ sessionId: 'session-1', t: key => key, useProjection: () => 'standard' })
  const [styles] = tree.children.find(child => child?.type === 'style').children
  const [hoverRules] = styles.split('@media (hover: hover) {')[1].split('@media (hover: none), (any-pointer: coarse) {')
  const revealRule = hoverRules.match(/([^{}]+)\{ --dshps-revealed: 1; \}/)
  assert.deepEqual(revealRule?.[1].split(',').map(selector => selector.trim()), [
    '.nIjNjW_label:hover + .dshps-root',
    '.dshps-root:hover',
  ])
  assert.match(styles, /\.dshps-root:is\(\[data-open='true'\], :has\(\.dshps-trigger:focus-visible\)\)/)
  assert.match(styles, /@media \(hover: none\), \(any-pointer: coarse\) \{\s*\.dshps-root \{ --dshps-revealed: 1; \}/)
})

test('slides the clipped slot and glyph without moving or highlighting the button at rest', () => {
  const { ctx, slots } = fakeContext()
  plugin.apply(ctx)
  const tree = slots[0].component({ sessionId: 'session-1', t: key => key, useProjection: () => 'standard' })
  const [styles] = tree.children.find(child => child?.type === 'style').children
  const rule = selector => styles.split(`${selector} {`)[1]?.split('}')[0] ?? ''
  assert.match(rule('.dshps-root'), /width: calc\(28px \* var\(--dshps-revealed, 0\)\); overflow: clip;/)
  assert.match(rule('.dshps-root'), /transition: width 160ms/)
  assert.match(rule('.dshps-trigger'), /width: 24px; height: 24px;/)
  assert.doesNotMatch(rule('.dshps-trigger'), /\b(?:transform|translate|inset-inline-start):/)
  assert.match(rule('.dshps-chevron'), /transition: inset-inline-start 160ms/)
  assert.match(rule('.dshps-trigger'), /background: transparent;/)
  assert.doesNotMatch(rule('.dshps-trigger'), /transition:[^;]*\b(?:all|background(?:-color)?)\b/)
  assert.match(rule('.dshps-trigger:hover:not(:disabled)'), /background: var\(--dsw-alias-interactive-bg-hover\);/)
  assert.doesNotMatch(styles, /\.dshps-trigger\[aria-expanded[^}]*background/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{\s*\.dshps-root, \.dshps-chevron \{ transition: none; \}/)
})

test('follows button movement while the menu is open and cancels the pending frame on close', () => {
  const frames = new Map<number, () => void>()
  let nextFrame = 0
  const view = {
    requestAnimationFrame(callback) {
      frames.set(++nextFrame, callback)
      return nextFrame
    },
    cancelAnimationFrame(frame) { frames.delete(frame) },
  }
  const advance = () => {
    const [frame, callback] = [...frames.entries()][0]
    frames.delete(frame)
    callback()
  }
  let rect = { left: 100, bottom: 24 }
  const button = { getBoundingClientRect: () => rect }
  const updates = []
  const stop = plugin.internals.trackMenuAnchor(button, anchor => updates.push(anchor), view)
  advance()
  rect = { left: 83, bottom: 24 }
  advance()
  advance()
  rect = { left: 83, bottom: 20 }
  advance()
  assert.deepEqual(updates, [{ left: 100, top: 30 }, { left: 83, top: 30 }, { left: 83, top: 26 }])
  stop()
  assert.equal(frames.size, 0)
})

test('uses the host primary button foreground in the confirmation dialog', () => {
  const { ctx, slots } = fakeContext()
  plugin.apply(ctx)
  const tree = slots[0].component({ sessionId: 'session-1', t: key => key, useProjection: () => 'standard' })
  const [styles] = tree.children.find(child => child?.type === 'style').children
  const primaryButton = styles.match(/\.dshps-button-primary \{([^}]+)\}/)?.[1]
  assert.match(primaryButton ?? '', /color:\s*var\(--dsw-alias-label-primary-foreground\)/)
})

test('renders nothing when the preset projection is null', () => {
  const { ctx, slots } = fakeContext()
  plugin.apply(ctx)
  const Component = slots[0].component
  assert.equal(
    Component({ sessionId: 'session-1', t: key => key, useProjection: () => null }),
    null,
    'a null projection records no preset, so the header entry stays hidden',
  )
})
