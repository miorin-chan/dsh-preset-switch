/**
 * Host half of `dsh-preset-switch`.
 *
 * Registers the `/preset-switch <preset-id>` command that replaces the live
 * session's Agent preset in place. The registry's own `select` Remote refuses
 * any session whose conversation has started (`agent-preset/locked`); this
 * command is the deliberate, user-invoked bypass:
 *
 * - only between turns: an open turn or a running compaction refuses;
 * - the switch is serialized per Agent, like the registry's own select chain;
 * - `recompose()` mounts the target preset on the Agent's scope and announces
 *   the tool change; the command then appends the `agent-preset/selected`
 *   event, so the session projection, resume, and the Client surfaces all
 *   derive the new identity from the log.
 *
 * The composition stays a session fact until the user asks again. The model
 * learns about the change from the next request's header, tool-addition /
 * tool-removal developer messages, and the updated system prompt — the same
 * path DSH already uses for dynamic tool updates.
 *
 * The command does not judge whether the target removes capability; that
 * comparison belongs to the Client, which reads both declarations before it
 * dispatches this command. The Host only refuses states it cannot switch from.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { AgentPreset } from '@deepseek-ai/dsh-agent-preset-registry'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-compaction/types'
import type { Session, SessionId, SessionSeq } from '@deepseek-ai/dsh-session'

export const name = 'preset-switch'
export const inject = ['commands', 'agentPresets', 'agents']

const USAGE = 'Usage: /preset-switch <preset-id>'

/** The last standalone compaction bracket marker found while walking the log backwards. */
interface CompactionMarker {
  readonly type: 'compaction/start' | 'compaction/end'
  readonly seq: number
}

/**
 * Admit a scanned position as the Session sequence number it names. The log is
 * contiguous from 0, so position === seq for every committed event; the brand
 * only marks the value as an existing log position.
 * @param position - zero-based position in the committed log.
 * @returns the same number as a Session sequence number.
 */
function seqAt(position: number): SessionSeq {
  return position as SessionSeq
}

/**
 * Whether a compaction lock is open on this session.
 *
 * A lifecycle starts at the latest `session/end-seed`; only markers after it
 * belong to the current lifetime. Compaction operations are serialized, so the
 * last start/end marker pair answers the question: an unmatched `start` means
 * the summary work is still running. Stale starts from an earlier lifecycle
 * (for example after a crash) are ignored, matching the compaction service's
 * own recovery rule.
 * @param session - Session whose durable log is scanned.
 * @returns true while a compaction holds its lock.
 */
function compactionActive(session: Session): boolean {
  let latestEndSeedSeq = -1
  let marker: CompactionMarker | undefined
  for (let seq = session.seq - 1; seq >= 0; seq -= 1) {
    const event = session.eventAt(seqAt(seq))
    if (event === undefined) continue
    if (event.type === 'session/end-seed') {
      if (latestEndSeedSeq < 0) latestEndSeedSeq = seq
      if (marker !== undefined) break
      continue
    }
    if (marker === undefined && (event.type === 'compaction/start' || event.type === 'compaction/end')) {
      marker = { type: event.type, seq }
      if (latestEndSeedSeq >= 0) break
    }
  }
  if (marker === undefined || marker.type === 'compaction/end') return false
  return marker.seq > latestEndSeedSeq
}

/**
 * Switch one live session, refusing states a composition swap cannot safely
 * cross.
 * @param ctx - Host plugin context.
 * @param agent - Session Agent receiving the command.
 * @param target - Requested preset id.
 * @returns the command result rendered by the dispatching UI.
 */
async function switchPreset(ctx: Context, agent: Agent, target: string): Promise<CommandResult> {
  const boundary = ctx.agents.turnBoundaryOf(agent.session)
  if (boundary.openTurnStartSeq !== null) {
    return {
      kind: 'error',
      text: 'This session is running a turn. Wait for it to finish, then switch modes.',
    }
  }
  if (compactionActive(agent.session)) {
    return {
      kind: 'error',
      text: 'This session is compacting its history. Wait for compaction to finish, then switch modes.',
    }
  }

  let resolved: AgentPreset
  try {
    resolved = await ctx.agentPresets.resolve(target)
  } catch (error) {
    return { kind: 'error', text: `Cannot switch to "${target}": ${error instanceof Error ? error.message : String(error)}` }
  }
  if (resolved.broken !== undefined) {
    return { kind: 'error', text: `Cannot switch to "${target}": ${resolved.broken}` }
  }
  if (ctx.agentPresets.composedPreset(agent.ctx) === resolved.id) {
    return { kind: 'success', text: `This session already runs "${resolved.id}".` }
  }

  // Resolving awaits the activation audit; re-check the boundary so a turn
  // admitted during that window still refuses the swap.
  const settled = ctx.agents.turnBoundaryOf(agent.session)
  if (settled.openTurnStartSeq !== null || compactionActive(agent.session)) {
    return {
      kind: 'error',
      text: 'The session became busy. Wait for the current work to finish, then switch modes.',
    }
  }

  try {
    await ctx.agentPresets.recompose(agent.ctx, resolved.id)
  } catch (error) {
    return { kind: 'error', text: `Cannot switch to "${target}": ${error instanceof Error ? error.message : String(error)}` }
  }
  agent.session.append('agent-preset/selected', { agentPreset: resolved.id })
  return {
    kind: 'success',
    text: `Switched this session to "${resolved.id}". Later turns use the new mode; earlier turns keep the tools they ran with.`,
  }
}

/**
 * Parse the command's own grammar and serialize concurrent attempts for one
 * Agent. Only the preset id is accepted; the Client sends exactly that.
 * @param ctx - Host plugin context.
 * @param switches - Per-Agent tail of the last switch attempt.
 * @param invocation - Admitted command invocation.
 * @returns the settled command result.
 */
async function handleCommand(
  ctx: Context,
  switches: Map<SessionId, Promise<CommandResult | undefined>>,
  invocation: CommandInvocation,
): Promise<CommandResult> {
  if (invocation.attachments.length > 0) {
    return { kind: 'error', text: `The switch command takes no attachments. ${USAGE}` }
  }
  const target = invocation.rawInput.trim()
  if (target === '' || /\s/.test(target)) return { kind: 'error', text: USAGE }

  const agent = invocation.agent
  const previous = switches.get(agent.id) ?? Promise.resolve()
  const attempt = previous.then(() => switchPreset(ctx, agent, target))
  const guard = attempt.catch(() => undefined)
  switches.set(agent.id, guard)
  try {
    return await attempt
  } finally {
    if (switches.get(agent.id) === guard) switches.delete(agent.id)
  }
}

/**
 * Mount the switch command.
 * @param ctx - Host plugin context.
 */
export function apply(ctx: Context): void {
  const switches = new Map<SessionId, Promise<CommandResult | undefined>>()
  ctx.effect(() => ctx.commands.register({
    name: 'preset-switch',
    description: 'Switch this session to another Agent preset while it is idle',
    input: { hint: '<preset-id>' },
    // The committed `agent-preset/selected` event owns the authoritative input.
    recordInput: false,
    handler: invocation => handleCommand(ctx, switches, invocation),
  }), 'preset-switch: command')
}
