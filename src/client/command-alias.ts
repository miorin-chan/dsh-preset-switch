import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { CommandClaim, InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { COMMAND_ALIASES, COMMAND_NAME, commandMessages } from '../command-locale.js'

/** Adds the current language's input spelling and submits it as the canonical Host command. */
export function presetSwitchAlias(locale: LocaleRuntime, sessions: ISessions): InputTriggerSource {
  const labels = () => commandMessages(locale.getLocale().active)
  const sessionOf = (id: SessionId) => sessions.subagentAddress(id) === undefined ? sessions.binding(id)?.session : undefined

  const claimFor = (id: SessionId, token: string): CommandClaim | undefined => {
    const messages = labels()
    if (!COMMAND_ALIASES.has(token) || sessionOf(id) === undefined) return undefined
    return {
      name: COMMAND_NAME,
      token: `${token} `,
      hint: messages.hint,
      async submit(args, _actx, attachments) {
        if (attachments.length > 0) {
          return { kind: 'error', text: messages.noAttachments(messages.usage(`${token} ${messages.hint}`)) }
        }
        const session = sessionOf(id)
        const t = locale.bind('dsh-preset-switch')
        if (session === undefined) return { kind: 'error', text: t('errorNotReady') }
        const result = await session.command(`/${COMMAND_NAME} ${args}`)
        if (!result.ok) return { kind: 'error', text: t('errorSwitch') }
        // The conversation shows the durable Host result for an admitted command.
        return result.value.matched ? { kind: 'success' } : { kind: 'error', text: t('errorNoCommand') }
      },
    }
  }

  return {
    trigger: '/',
    name: 'dsh-preset-switch',
    showGroupTitle: false,
    order: -1,
    async candidates({ sessionId }, { query, position }) {
      const messages = labels()
      if (position !== 'leading' || messages.token === COMMAND_NAME || sessionOf(sessionId) === undefined
        || !messages.token.startsWith(query.toLowerCase())) return []
      return [{ name: messages.token, description: messages.description, hint: messages.hint }]
    },
    onPick({ session: { sessionId }, candidate, position }) {
      const claim = position === 'leading' ? claimFor(sessionId, `/${candidate.name}`) : undefined
      return claim === undefined ? undefined : { claim }
    },
    matchSpace({ sessionId }, token) {
      const claim = claimFor(sessionId, token)
      return claim === undefined ? undefined : { claim }
    },
    async matchClaim({ sessionId }, token) {
      return claimFor(sessionId, token)
    },
    async matchEnter({ sessionId }, line, _signal, envelope) {
      const token = line.split(/\s/u, 1)[0] ?? ''
      const claim = claimFor(sessionId, token)
      if (claim === undefined) return undefined
      if (envelope.attachments > 0) {
        const messages = labels()
        throw new Error(messages.noAttachments(messages.usage(`${token} ${messages.hint}`)))
      }
      return { claim }
    },
  }
}
