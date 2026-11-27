/**
 * Browser half of `dsh-preset-switch`.
 *
 * Adds the switch affordance the shipped header lacks: the Agent-preset label
 * in the session header is static chrome, and the shipped selector lives only
 * on the new-task screen because the Host refuses a swap once a turn has run.
 * This module keeps the label as it is and puts one chevron button beside it.
 *
 * The actual swap travels through the Host command the package's `src/host/`
 * registers. The Client deliberately does no composition mutation of its own:
 * it reads the current and target declarations through `agentPresets.read`,
 * compares their plugin rows, and asks for confirmation only when the target
 * removes a row or disables one the current composition enables. That keeps the
 * judgement dynamic — a preset pair is never named in this file. Installing a
 * custom preset, or reordering rows in a shipped one, changes the comparison
 * without a code change.
 *
 * The comparison has one deliberate blind spot: a row whose `config` changes
 * without being added, removed, or disabled does not warn. Config edits are
 * mostly prompt wording (`persona`), and warning on those would make the
 * common "pure addition" switch noisy. Capability-bearing config (for example
 * `tool-fs` read/write flags in the Minimal preset) still warns because the
 * same preset also drops rows; a preset that only narrows config would not.
 *
 * Dependencies: `react`, `react/jsx-runtime`, and `@deepseek-ai/dsh-client-ui-primitives`
 * (`Menu`, `MenuItemButton`, `Modal`, `Button`, `Tag`, `IconChevronDownOutlineRegular`)
 * from the shared browser module table. Only the header hover-reveal trigger
 * and popup width/wrapping helpers carry plugin CSS via theme tokens.
 *
 * Fail-safe paths: an unavailable preset service hides the button; an
 * unreadable declaration cancels the switch instead of guessing; a rejected
 * command leaves the menu open with the failure text. None of these throw into
 * the header.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  IconChevronDownOutlineRegular,
  Menu,
  MenuItemButton,
  Modal,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context } from '@deepseek-ai/cordis'
import type { AgentPresetRow } from '@deepseek-ai/dsh-agent-preset-registry/types'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { BuiltInLocaleId, LocaleId, LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { InputTriggerServiceContract } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { COMMAND_NAME } from '../command-locale.js'
import { presetSwitchAlias } from './command-alias.js'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsLocale, PropsRuntime, Translate, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * The Client services this module consumes, named explicitly.
 *
 * One tsconfig compiles both halves, while the Host and Client assemblies
 * declare different `sessions` faces on the Cordis Context (`SessionStore` vs
 * `ISessions`). Reading the four services this module needs through its own
 * interface keeps the Client half's types independent of which declaration the
 * shared program resolves first.
 */
interface ClientContext {
  readonly locale: LocaleRuntime
  readonly slots: SlotRegistry
  readonly sessions: ISessions
  readonly inputTriggers: InputTriggerServiceContract
  readonly remote: ClientRemote
  readonly effect: Context['effect']
}

/** Dictionary keys this module owns; the locale namespace declaration is their union. */
type LabelKey =
  | 'triggerTitle'
  | 'menuTitle'
  | 'loading'
  | 'loadFailed'
  | 'empty'
  | 'errorRead'
  | 'errorNotReady'
  | 'errorNoCommand'
  | 'errorSwitch'
  | 'confirmTitle'
  | 'confirmRemoved'
  | 'confirmDisabled'
  | 'confirmAdded'
  | 'confirmNote'
  | 'confirmClose'
  | 'confirmCancel'
  | 'confirmApply'
  | 'switching'
  | 'noDescription'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-preset-switch': LabelKey
  }
}

const NS = 'dsh-preset-switch'
const COMMAND = `/${COMMAND_NAME} `
/** Built-in presets publish no name; the shipped UI dictionary owns them. */
const BUILTIN_TEXT_KEYS: Readonly<Partial<Record<string, readonly [nameKey: string, descriptionKey: string]>>> = {
  standard: ['presetStandardName', 'presetStandardDescription'],
  ptc: ['presetPtcName', 'presetPtcDescription'],
  minimal: ['presetMinimalName', 'presetMinimalDescription'],
  cordis: ['presetCordisName', 'presetCordisDescription'],
}

/** Visible text this module renders itself; plugin-meta text lives in locale/*.json. */
const LABELS: Record<BuiltInLocaleId, Record<LabelKey, string>> & Record<LocaleId, Record<LabelKey, string>> = {
  en: {
    triggerTitle: 'Switch agent mode',
    menuTitle: 'Switch agent mode',
    loading: 'Loading modes…',
    loadFailed: 'Could not load agent modes.',
    empty: 'No other agent modes are available.',
    errorRead: 'Could not read the mode composition; nothing was switched.',
    errorNotReady: 'This session is not ready yet.',
    errorNoCommand: 'The host does not offer the switch command.',
    errorSwitch: 'The switch failed.',
    confirmTitle: 'Switch to {name}?',
    confirmRemoved: 'Removed',
    confirmDisabled: 'Disabled',
    confirmAdded: 'Added',
    confirmNote: 'Only later turns use the new mode. Earlier turns keep the tools they ran with.',
    confirmClose: 'Close',
    confirmCancel: 'Cancel',
    confirmApply: 'Switch',
    switching: 'Switching…',
    noDescription: 'No description.',
  },
  zh: {
    triggerTitle: '切换模式',
    menuTitle: '切换模式',
    loading: '正在读取模式…',
    loadFailed: '无法读取模式列表。',
    empty: '没有其他可用模式。',
    errorRead: '无法读取模式配置，未进行切换。',
    errorNotReady: '会话尚未就绪。',
    errorNoCommand: '宿主没有提供切换命令。',
    errorSwitch: '切换失败。',
    confirmTitle: '切换到「{name}」？',
    confirmRemoved: '移除',
    confirmDisabled: '停用',
    confirmAdded: '新增',
    confirmNote: '只有之后的回合使用新模式；已有回合保留它们运行时的工具。',
    confirmClose: '关闭',
    confirmCancel: '取消',
    confirmApply: '切换',
    switching: '正在切换…',
    noDescription: '暂无描述。',
  },
  ja: {
    triggerTitle: 'モードを切り替え',
    menuTitle: 'モードを切り替え',
    loading: 'モードを読み込み中…',
    loadFailed: 'モードを読み込めませんでした。',
    empty: '他に利用できるモードはありません。',
    errorRead: 'モードの構成を読み取れなかったため、切り替えていません。',
    errorNotReady: 'このセッションはまだ準備できていません。',
    errorNoCommand: 'ホストは切り替えコマンドを提供していません。',
    errorSwitch: '切り替えに失敗しました。',
    confirmTitle: '「{name}」に切り替えますか？',
    confirmRemoved: '削除',
    confirmDisabled: '無効化',
    confirmAdded: '追加',
    confirmNote: '以降のターンのみ新しいモードを使用します。以前のターンは実行時のツールを保持します。',
    confirmClose: '閉じる',
    confirmCancel: 'キャンセル',
    confirmApply: '切り替え',
    switching: '切り替え中…',
    noDescription: '説明はありません。',
  },
  de: {
    triggerTitle: 'Modus wechseln',
    menuTitle: 'Modus wechseln',
    loading: 'Modi werden geladen…',
    loadFailed: 'Modi konnten nicht geladen werden.',
    empty: 'Keine weiteren Modi verfügbar.',
    errorRead: 'Die Modus-Zusammensetzung konnte nicht gelesen werden; es wurde nichts gewechselt.',
    errorNotReady: 'Diese Sitzung ist noch nicht bereit.',
    errorNoCommand: 'Der Host bietet keinen Wechselbefehl an.',
    errorSwitch: 'Der Wechsel ist fehlgeschlagen.',
    confirmTitle: 'Zu {name} wechseln?',
    confirmRemoved: 'Entfernt',
    confirmDisabled: 'Deaktiviert',
    confirmAdded: 'Hinzugefügt',
    confirmNote: 'Nur spätere Runden verwenden den neuen Modus. Frühere Runden behalten ihre Werkzeuge.',
    confirmClose: 'Schließen',
    confirmCancel: 'Abbrechen',
    confirmApply: 'Wechseln',
    switching: 'Wird gewechselt…',
    noDescription: 'Keine Beschreibung.',
  },
  es: {
    triggerTitle: 'Cambiar de modo',
    menuTitle: 'Cambiar de modo',
    loading: 'Cargando modos…',
    loadFailed: 'No se pudieron cargar los modos.',
    empty: 'No hay otros modos disponibles.',
    errorRead: 'No se pudo leer la composición del modo; no se cambió nada.',
    errorNotReady: 'Esta sesión aún no está lista.',
    errorNoCommand: 'El host no ofrece el comando de cambio.',
    errorSwitch: 'El cambio falló.',
    confirmTitle: '¿Cambiar a {name}?',
    confirmRemoved: 'Se elimina',
    confirmDisabled: 'Se desactiva',
    confirmAdded: 'Se añade',
    confirmNote: 'Solo los turnos posteriores usan el nuevo modo. Los turnos anteriores conservan sus herramientas.',
    confirmClose: 'Cerrar',
    confirmCancel: 'Cancelar',
    confirmApply: 'Cambiar',
    switching: 'Cambiando…',
    noDescription: 'Sin descripción.',
  },
  fr: {
    triggerTitle: 'Changer de mode',
    menuTitle: 'Changer de mode',
    loading: 'Chargement des modes…',
    loadFailed: 'Impossible de charger les modes.',
    empty: 'Aucun autre mode disponible.',
    errorRead: 'Impossible de lire la composition du mode ; rien n’a été changé.',
    errorNotReady: 'Cette session n’est pas encore prête.',
    errorNoCommand: 'L’hôte ne propose pas la commande de changement.',
    errorSwitch: 'Le changement a échoué.',
    confirmTitle: 'Passer à {name} ?',
    confirmRemoved: 'Supprimé',
    confirmDisabled: 'Désactivé',
    confirmAdded: 'Ajouté',
    confirmNote: 'Seuls les tours suivants utilisent le nouveau mode. Les tours précédents conservent leurs outils.',
    confirmClose: 'Fermer',
    confirmCancel: 'Annuler',
    confirmApply: 'Changer',
    switching: 'Changement…',
    noDescription: 'Aucune description.',
  },
  pt: {
    triggerTitle: 'Mudar de modo',
    menuTitle: 'Mudar de modo',
    loading: 'A carregar modos…',
    loadFailed: 'Não foi possível carregar os modos.',
    empty: 'Não há outros modos disponíveis.',
    errorRead: 'Não foi possível ler a composição do modo; nada foi mudado.',
    errorNotReady: 'Esta sessão ainda não está pronta.',
    errorNoCommand: 'O host não oferece o comando de mudança.',
    errorSwitch: 'A mudança falhou.',
    confirmTitle: 'Mudar para {name}?',
    confirmRemoved: 'Removido',
    confirmDisabled: 'Desativado',
    confirmAdded: 'Adicionado',
    confirmNote: 'Apenas os turnos seguintes usam o novo modo. Os turnos anteriores mantêm as ferramentas com que correram.',
    confirmClose: 'Fechar',
    confirmCancel: 'Cancelar',
    confirmApply: 'Mudar',
    switching: 'A mudar…',
    noDescription: 'Sem descrição.',
  },
  ru: {
    triggerTitle: 'Сменить режим',
    menuTitle: 'Сменить режим',
    loading: 'Загрузка режимов…',
    loadFailed: 'Не удалось загрузить режимы.',
    empty: 'Других режимов нет.',
    errorRead: 'Не удалось прочитать состав режима; переключение не выполнено.',
    errorNotReady: 'Сеанс ещё не готов.',
    errorNoCommand: 'Хост не предоставляет команду переключения.',
    errorSwitch: 'Не удалось переключить режим.',
    confirmTitle: 'Переключиться на «{name}»?',
    confirmRemoved: 'Удаляется',
    confirmDisabled: 'Отключается',
    confirmAdded: 'Добавляется',
    confirmNote: 'Новый режим действует только для следующих ходов. Предыдущие ходы сохраняют свои инструменты.',
    confirmClose: 'Закрыть',
    confirmCancel: 'Отмена',
    confirmApply: 'Переключить',
    switching: 'Переключение…',
    noDescription: 'Нет описания.',
  },
}

// The header slot renders the shipped AgentPresetLabel and this entry as siblings.
// The label has no public DOM marker. If its CSS module class changes, keep the
// switch visible so the picker still has a pointer-accessible entry point.
const PRESET_LABEL = '.nIjNjW_label'

const MENU_WIDTH = 320

const STYLES = `
.dshps-root {
  /* Cancel the strip's 10px gap so the 4px inset bridges the hover targets. */
  position: relative; display: inline-flex; align-items: center; flex: none;
  height: 24px; width: calc(28px * var(--dshps-revealed, 0)); overflow: clip;
  margin-inline-start: -10px;
  transition: width 160ms ease;
}
.dshps-root:is([data-open='true'], :has(.dshps-trigger:focus-visible)),
.dshps-root:not(${PRESET_LABEL} + .dshps-root) {
  --dshps-revealed: 1;
}
.dshps-trigger {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  box-sizing: border-box; width: 24px; height: 24px; padding: 0; margin-inline-start: 4px;
  border: none; border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-tertiary); cursor: pointer;
  transition: color 120ms ease;
}
.dshps-chevron {
  /* Move only the glyph: the button bounds stay steady even mid-transition. */
  position: relative; inset-inline-start: calc(-8px * (1 - var(--dshps-revealed, 0)));
  pointer-events: none; opacity: var(--dshps-revealed, 0);
  transition: inset-inline-start 160ms ease, opacity 120ms ease;
}
@media (hover: hover) {
  ${PRESET_LABEL}:hover + .dshps-root,
  .dshps-root:hover { --dshps-revealed: 1; }
  .dshps-trigger:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
}
@media (hover: none), (any-pointer: coarse) {
  .dshps-root { --dshps-revealed: 1; }
}
/* AgentPresetLabel.module.css hides the adjacent label at this container width. */
@container (max-width: 540px) {
  .dshps-root { --dshps-revealed: 1; margin-inline-start: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .dshps-root, .dshps-chevron { transition: none; }
}
.dshps-trigger:focus-visible { outline: 2px solid var(--dsw-alias-border-selected); outline-offset: -2px; }
.dshps-trigger:disabled { cursor: default; color: var(--dsw-alias-label-dimmed); }
.dshps-menu[role='menu'] {
  width: min(${MENU_WIDTH}px, calc(100vw - 24px));
  padding: 6px;
  overflow-wrap: anywhere;
}
/* The header sits inside the window frame's reserved strip, and the host's
   overlay top (48px clearance + 20px on macOS) would leave this picker up to a
   header's height below the chevron. Cap the margin at the trigger instead —
   the same rule the host's own header overlays apply — while keeping the
   viewport edge as the floor. */
.dshps-menu[role='menu'][data-anchor-side='bottom'] {
  top: max(12px, calc(anchor(bottom) + 6px));
}
.dshps-menu [role='menuitem'] {
  height: auto;
  padding: 8px 10px;
}
.dshps-menu [role='menuitem'] > span {
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
}
.dshps-menu-head { padding: 6px 10px 8px; font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
.dshps-note { padding: 8px 10px; font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dshps-error { margin: 6px 4px 2px; padding: 8px 10px; border-radius: var(--dsw-radius-sm); font-size: 12px; line-height: 17px; color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-interactive-bg-hover-danger); }
.dshps-item { display: flex; flex-direction: column; gap: 2px; white-space: normal; overflow-wrap: anywhere; }
.dshps-item-name { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }
.dshps-item-desc { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
.dshps-section + .dshps-section { margin-top: 12px; }
.dshps-section-title { font-size: 12px; line-height: 16px; font-weight: 500; color: var(--dsw-alias-label-secondary); }
.dshps-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 0; padding: 0; list-style: none; }
.dshps-chips > li { min-width: 0; max-width: 100%; }
.dshps-tag { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
`

/**
 * One plugin row of a declared preset, kept to the fields the comparison needs.
 * `id` and `name` are both optional because the Loader's entry list may use
 * either; `key` is the identity the diff matches on.
 */
interface CompositionRow {
  readonly id?: string
  readonly name?: string
  readonly key: string
  readonly disabled: boolean
}

/** One parsed entry-list row before group and identity filtering. */
interface ParsedRow {
  readonly indent: number
  readonly fields: Record<string, string | undefined>
}

/** Rows added, removed, or disabled by a target composition. */
interface CompositionImpact {
  readonly added: CompositionRow[]
  readonly removed: CompositionRow[]
  readonly disabled: CompositionRow[]
}

/** Roster read state for the menu. */
type RosterState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly presets: readonly AgentPresetRow[] }
  | { readonly status: 'error'; readonly error: string }

/** Pending confirmation after a lossy comparison. */
interface ConfirmState {
  readonly preset: AgentPresetRow
  readonly impact: CompositionImpact
}

/**
 * The module loader's `require`, present inside the factory wrapper that
 * scripts/build.mjs emits. Internal shape, verified against 0.2.2-rc.5: the
 * Client artifact is CommonJS and the shell seeds `react` in its frozen module
 * table; a page build without it throws, which the probe catches.
 */
interface ModuleLoaderRequire {
  (id: 'react' | 'react-dom'): unknown
}

declare const require: ModuleLoaderRequire

/** @param value - scalar rendered by the loader's YAML dialect. */
function unquote(value: string): string {
  const text = value.trim()
  if (text.length >= 2) {
    const first = text[0]
    const last = text[text.length - 1]
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
      return text.slice(1, -1).replace(/''/g, "'")
    }
  }
  return text
}

/**
 * Parse the plugin rows of a declared preset.
 *
 * The document is the Loader's entry-list YAML, not arbitrary YAML: every
 * row begins with `- ` and carries its fields at a deeper indent. Nested
 * `config` lists (skill directories, group children) also begin with `- `;
 * group rows are recognised by `name: cordis:group` and dropped, while
 * rows without an id or name are ignored. Only fields that decide the
 * comparison are kept: identity, module name, and a literal `disabled`.
 * @param text - declaration YAML returned by `agentPresets.read`.
 * @returns one record per plugin row, in declaration order.
 */
export function parseComposition(text: string): CompositionRow[] {
  const rows: ParsedRow[] = []
  let row: ParsedRow | undefined
  let ignoredIndent: number | undefined
  const finish = (): void => {
    if (row === undefined) return
    rows.push(row)
    row = undefined
  }
  for (const line of text.split('\n')) {
    if (line.trim() === '' || /^\s*#/.test(line)) continue
    const indent = /^\s*/.exec(line)?.[0].length ?? 0
    if (ignoredIndent !== undefined) {
      if (indent > ignoredIndent) continue
      ignoredIndent = undefined
    }
    const marker = /^(\s*)-\s+(.*)$/.exec(line)
    if (marker !== null) {
      finish()
      row = { indent: marker[1].length, fields: {} }
      const field = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(marker[2])
      if (field !== null) row.fields[field[1]] = unquote(field[2])
      continue
    }
    if (row === undefined) continue
    const field = /^\s+([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (field === null) continue
    if (indent <= row.indent) {
      finish()
      continue
    }
    if (
      field[1] === 'config'
      && field[2].trim() === ''
      && row.fields.name !== 'cordis:group'
      && row.fields.group !== 'true'
    ) {
      ignoredIndent = indent
      continue
    }
    row.fields[field[1]] = unquote(field[2])
  }
  finish()

  return rows
    .filter(entry => entry.fields.name !== undefined && entry.fields.name !== 'cordis:group')
    .map(entry => ({
      id: entry.fields.id,
      name: entry.fields.name,
      key: entry.fields.id !== undefined ? `id:${entry.fields.id}` : `name:${entry.fields.name}`,
      disabled: entry.fields.disabled === 'true',
    }))
    .filter(entry => entry.id !== undefined || entry.name !== undefined)
}

/** @param name - package specifier or short module name. */
export function shortModule(name: string): string {
  const prefix = '@deepseek-ai/dsh-'
  return name.startsWith(prefix) ? name.slice(prefix.length) : name
}

/** @param row - composition row. */
export function rowLabel(row: CompositionRow): string {
  return row.id !== undefined && row.id !== '' ? row.id : shortModule(row.name ?? '')
}

/**
 * Compare two declarations by plugin row.
 *
 * Additions are informational and never block. A row missing from the
 * target, or present there with `disabled: true` while enabled here, is a
 * loss the caller confirms. A row whose own condition is a `!!js` expression
 * is treated as enabled: the Client cannot evaluate the Host's platform
 * expression, and flagging every platform row would warn on switches that
 * change nothing on this machine.
 * @param currentText - the composition the session runs now.
 * @param targetText - the composition it would run after the switch.
 * @returns added rows, removed rows, and rows the target disables.
 */
export function diffCompositions(currentText: string, targetText: string): CompositionImpact {
  const byKey = (rows: readonly CompositionRow[]): Map<string, CompositionRow> => {
    const map = new Map<string, CompositionRow>()
    for (const row of rows) if (!map.has(row.key)) map.set(row.key, row)
    return map
  }
  const current = byKey(parseComposition(currentText))
  const target = byKey(parseComposition(targetText))
  const added: CompositionRow[] = []
  const removed: CompositionRow[] = []
  const disabled: CompositionRow[] = []
  for (const [key, row] of target) {
    if (!current.has(key)) added.push(row)
  }
  for (const [key, row] of current) {
    const next = target.get(key)
    if (next === undefined) {
      removed.push(row)
    } else if (next.name !== row.name) {
      // The same row id now names a different module: the old provider is
      // gone even though the row is present, so treat it as a replacement.
      removed.push(row)
      added.push(next)
    } else if (!row.disabled && next.disabled) {
      disabled.push(next)
    }
  }
  return { added, removed, disabled }
}

/** @param labels - one dictionary. */
function translator(labels: Readonly<Record<string, string>>): Translate {
  return (key, params) => {
    const template = labels[key] ?? key
    if (params === undefined) return template
    return Object.entries(params).reduce(
      (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
      template,
    )
  }
}

/**
 * Read one preset's declared composition.
 * @param ctx - Client context.
 * @param id - preset id.
 * @returns declaration YAML.
 */
async function readComposition(ctx: ClientContext, id: string): Promise<string> {
  const result = await ctx.remote.agentPresets.read(id)
  if (!result.ok) throw new Error(result.error.message)
  return result.value.content
}

/** Build the header component. The context stays in the closure because the
 * slot registration owns the component's lifetime; every Remote service call
 * is effect-safe and can fail into a visible message. */
function createModeButton(ctx: ClientContext) {
  return function ModeButton(props: ModeButtonProps): ReactNode {
    const t: TranslateNS<typeof NS> = typeof props.t === 'function' ? props.t : translator(LABELS.en)
    const sessionId = props.sessionId
    // The per-session projection updates before the session list summary.
    const currentPresetId = props.useProjection('agentPreset')
    const hasPreset = typeof currentPresetId === 'string'

    const [open, setOpen] = useState(false)
    const [roster, setRoster] = useState<RosterState>({ status: 'loading' })
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [confirm, setConfirm] = useState<ConfirmState | null>(null)
    const rootRef = useRef<HTMLSpanElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
      // Read the roster each time the menu opens: the first attempt may have
      // raced the Remote namespace, and a shipped preset can appear or break
      // while the conversation stays open.
      if (!open) return undefined
      let alive = true
      ctx.remote.agentPresets.list().then((result) => {
        if (!alive) return
        if (!result.ok) {
          if (result.error.code === 'gateway/invocation-unavailable') {
            setRoster({ status: 'ready', presets: [] })
          } else {
            setRoster({ status: 'error', error: result.error.message })
          }
          return
        }
        setRoster({
          status: 'ready',
          presets: result.value.presets.filter(preset => preset.broken === undefined),
        })
      }, (failure: unknown) => {
        if (alive) setRoster({ status: 'error', error: failure instanceof Error ? failure.message : String(failure) })
      })
      return () => { alive = false }
    }, [open])

    /** The shipped dictionary gives built-in presets their localized names. */
    const officialT = useMemo((): Translate | undefined => {
      try { return ctx.locale.bind('settings.agentPreset') } catch { return undefined }
    }, [])
    const officialText = (key: string): string | undefined => {
      if (typeof officialT !== 'function') return undefined
      try {
        const value = officialT(key)
        return typeof value === 'string' && value !== key && value !== '' ? value : undefined
      } catch { return undefined }
    }
    const nameOf = (preset: AgentPresetRow): string => {
      if (preset.name !== undefined) return preset.name
      const keys = BUILTIN_TEXT_KEYS[preset.id]
      return (keys === undefined ? undefined : officialText(keys[0])) ?? preset.id
    }
    const descriptionOf = (preset: AgentPresetRow): string => {
      if (preset.description !== undefined) return preset.description
      const keys = BUILTIN_TEXT_KEYS[preset.id]
      return (keys === undefined ? undefined : officialText(keys[1])) ?? t('noDescription')
    }

    const close = (): void => {
      setOpen(false)
      setConfirm(null)
      setError(null)
    }

    const toggle = (): void => {
      if (busy || triggerRef.current === null) return
      if (open) {
        close()
        return
      }
      setError(null)
      // Reset before the first open render, while the roster read runs in the effect.
      setRoster({ status: 'loading' })
      setOpen(true)
    }

    const dispatch = async (id: string): Promise<void> => {
      const live = ctx.sessions.binding(sessionId)?.session
      if (live === undefined) throw new Error(t('errorNotReady'))
      const result = await live.command(COMMAND + id)
      if (!result.ok) throw new Error(result.error.message)
      if (!result.value.matched) throw new Error(t('errorNoCommand'))
    }

    const choose = async (preset: AgentPresetRow): Promise<void> => {
      if (busy || preset.id === currentPresetId) {
        if (preset.id === currentPresetId) close()
        return
      }
      if (typeof currentPresetId !== 'string') return
      setBusy(true)
      setError(null)
      try {
        const currentText = await readComposition(ctx, currentPresetId)
        const targetText = await readComposition(ctx, preset.id)
        const impact = diffCompositions(currentText, targetText)
        if (impact.removed.length === 0 && impact.disabled.length === 0) {
          await dispatch(preset.id)
          close()
          return
        }
        setConfirm({ preset, impact })
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : t('errorRead'))
      } finally {
        setBusy(false)
      }
    }

    const apply = async (): Promise<void> => {
      if (confirm === null) return
      setBusy(true)
      setError(null)
      try {
        await dispatch(confirm.preset.id)
        close()
      } catch (failure) {
        setConfirm(null)
        setError(failure instanceof Error ? failure.message : t('errorSwitch'))
      } finally {
        setBusy(false)
      }
    }

    // Hooks above run for every render; hiding here keeps the header clean
    // when the deployment composes no presets or the session records none.
    if (!hasPreset) return null

    const menuOpen = open && confirm === null
    const others = roster.status === 'ready' ? roster.presets.filter(preset => preset.id !== currentPresetId) : []
    const trigger = (
      <button
        ref={triggerRef}
        type="button"
        className="dshps-trigger"
        title={t('triggerTitle')}
        aria-label={t('triggerTitle')}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        disabled={busy}
        onClick={toggle}
      >
        <IconChevronDownOutlineRegular size={14} className="dshps-chevron" />
      </button>
    )

    const impactGroups = confirm === null
      ? []
      : ([
          { key: 'confirmRemoved', rows: confirm.impact.removed, tone: 'danger' },
          { key: 'confirmDisabled', rows: confirm.impact.disabled, tone: 'danger' },
          { key: 'confirmAdded', rows: confirm.impact.added, tone: 'neutral' },
        ] as const).filter(group => group.rows.length > 0)

    return (
      <span className="dshps-root" ref={rootRef} data-open={open || confirm !== null}>
        <style>{STYLES}</style>
        <Menu
          open={menuOpen}
          onClose={close}
          portal
          align="start"
          side="bottom"
          listClassName="dshps-menu"
          anchor={trigger}
        >
          <div className="dshps-menu-head">{t('menuTitle')}</div>
          {roster.status === 'loading' && <div className="dshps-note">{t('loading')}</div>}
          {roster.status === 'error' && <div className="dshps-note">{t('loadFailed')}</div>}
          {roster.status === 'error' && <div className="dshps-error" role="alert">{roster.error}</div>}
          {roster.status === 'ready' && others.length === 0 && <div className="dshps-note">{t('empty')}</div>}
          {others.map(preset => (
            <MenuItemButton
              key={preset.id}
              disabled={busy}
              onSelect={() => { void choose(preset) }}
            >
              <span className="dshps-item">
                <span className="dshps-item-name">{nameOf(preset)}</span>
                <span className="dshps-item-desc">{descriptionOf(preset)}</span>
              </span>
            </MenuItemButton>
          ))}
          {busy && <div className="dshps-note">{t('switching')}</div>}
          {error !== null && <div className="dshps-error" role="alert">{error}</div>}
        </Menu>
        <Modal
          open={confirm !== null}
          onClose={() => { setConfirm(null) }}
          title={confirm !== null ? t('confirmTitle', { name: nameOf(confirm.preset) }) : ''}
          closeLabel={t('confirmClose')}
          tone="warning"
          description={t('confirmNote')}
          footer={(
            <>
              <Button
                variant="ghost"
                disabled={busy}
                data-modal-autofocus=""
                onClick={() => { setConfirm(null) }}
              >
                {t('confirmCancel')}
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => { void apply() }}
              >
                {busy ? t('switching') : t('confirmApply')}
              </Button>
            </>
          )}
        >
          {impactGroups.map(group => (
            <div key={group.key} className="dshps-section">
              <div className="dshps-section-title">{t(group.key)}</div>
              <ul className="dshps-chips">
                {group.rows.map(row => (
                  <li key={row.key}>
                    <Tag tone={group.tone} className="dshps-tag">{rowLabel(row)}</Tag>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Modal>
      </span>
    )
  }
}

/** Props the header actions slot composes for this entry. */
type ModeButtonProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<typeof NS>

/** Services this module needs before `apply` runs. */
export const inject = ['locale', 'slots', 'sessions', 'inputTriggers', 'remote', 'remote.agentPresets']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, LABELS), `${NS}: locale`)
  ctx.effect(() => ctx.inputTriggers.registerSource(presetSwitchAlias(ctx.locale, ctx.sessions)), `${NS}: command alias`)
  ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'preset-switch',
    // The shipped preset label sits at -10; the chevron follows it.
    order: -9,
    locale: NS,
  }, createModeButton(ctx))), `${NS}: header action`)
}

// Exposed for the node test only; the page never reads this field.
export const internals = { parseComposition, diffCompositions, rowLabel, shortModule }
