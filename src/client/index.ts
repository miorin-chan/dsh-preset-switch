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
 * Dependencies: `react` from the shared browser module table. The Host
 * primitives package is intentionally not imported — its API is private to the
 * page build, and a throwing import would blank the header entry. The popover
 * and dialog therefore carry their own markup and theme-token styles.
 *
 * Fail-safe paths: an unavailable preset service hides the button; an
 * unreadable declaration cancels the switch instead of guessing; a rejected
 * command leaves the menu open with the failure text. None of these throw into
 * the header.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { AgentPresetRow } from '@deepseek-ai/dsh-agent-preset-registry/types'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { BuiltInLocaleId, LocaleId, LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsLocale, PropsRuntime, Translate, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type * as React from 'react'

type ReactModule = typeof React

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
const COMMAND = '/preset-switch '
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
    confirmCancel: 'Cancel',
    confirmApply: 'Switch',
    switching: 'Switching…',
    noDescription: 'No description.',
  },
  zh: {
    triggerTitle: '切换 Agent 模式',
    menuTitle: '切换 Agent 模式',
    loading: '正在读取模式…',
    loadFailed: '无法读取 Agent 模式列表。',
    empty: '没有其他可用的 Agent 模式。',
    errorRead: '无法读取模式配置，未进行切换。',
    errorNotReady: '会话尚未就绪。',
    errorNoCommand: '宿主没有提供切换命令。',
    errorSwitch: '切换失败。',
    confirmTitle: '切换到「{name}」？',
    confirmRemoved: '移除',
    confirmDisabled: '停用',
    confirmAdded: '新增',
    confirmNote: '只有之后的回合使用新模式；已有回合保留它们运行时的工具。',
    confirmCancel: '取消',
    confirmApply: '切换',
    switching: '正在切换…',
    noDescription: '暂无描述。',
  },
  ja: {
    triggerTitle: 'エージェントモードを切り替え',
    menuTitle: 'エージェントモードを切り替え',
    loading: 'モードを読み込み中…',
    loadFailed: 'エージェントモードを読み込めませんでした。',
    empty: '他に利用できるエージェントモードはありません。',
    errorRead: 'モードの構成を読み取れなかったため、切り替えていません。',
    errorNotReady: 'このセッションはまだ準備できていません。',
    errorNoCommand: 'ホストは切り替えコマンドを提供していません。',
    errorSwitch: '切り替えに失敗しました。',
    confirmTitle: '「{name}」に切り替えますか？',
    confirmRemoved: '削除',
    confirmDisabled: '無効化',
    confirmAdded: '追加',
    confirmNote: '以降のターンのみ新しいモードを使用します。以前のターンは実行時のツールを保持します。',
    confirmCancel: 'キャンセル',
    confirmApply: '切り替え',
    switching: '切り替え中…',
    noDescription: '説明はありません。',
  },
  de: {
    triggerTitle: 'Agent-Modus wechseln',
    menuTitle: 'Agent-Modus wechseln',
    loading: 'Modi werden geladen…',
    loadFailed: 'Agent-Modi konnten nicht geladen werden.',
    empty: 'Keine weiteren Agent-Modi verfügbar.',
    errorRead: 'Die Modus-Zusammensetzung konnte nicht gelesen werden; es wurde nichts gewechselt.',
    errorNotReady: 'Diese Sitzung ist noch nicht bereit.',
    errorNoCommand: 'Der Host bietet keinen Wechselbefehl an.',
    errorSwitch: 'Der Wechsel ist fehlgeschlagen.',
    confirmTitle: 'Zu {name} wechseln?',
    confirmRemoved: 'Entfernt',
    confirmDisabled: 'Deaktiviert',
    confirmAdded: 'Hinzugefügt',
    confirmNote: 'Nur spätere Runden verwenden den neuen Modus. Frühere Runden behalten ihre Werkzeuge.',
    confirmCancel: 'Abbrechen',
    confirmApply: 'Wechseln',
    switching: 'Wird gewechselt…',
    noDescription: 'Keine Beschreibung.',
  },
  es: {
    triggerTitle: 'Cambiar el modo del agente',
    menuTitle: 'Cambiar el modo del agente',
    loading: 'Cargando modos…',
    loadFailed: 'No se pudieron cargar los modos del agente.',
    empty: 'No hay otros modos del agente disponibles.',
    errorRead: 'No se pudo leer la composición del modo; no se cambió nada.',
    errorNotReady: 'Esta sesión aún no está lista.',
    errorNoCommand: 'El host no ofrece el comando de cambio.',
    errorSwitch: 'El cambio falló.',
    confirmTitle: '¿Cambiar a {name}?',
    confirmRemoved: 'Se elimina',
    confirmDisabled: 'Se desactiva',
    confirmAdded: 'Se añade',
    confirmNote: 'Solo los turnos posteriores usan el nuevo modo. Los turnos anteriores conservan sus herramientas.',
    confirmCancel: 'Cancelar',
    confirmApply: 'Cambiar',
    switching: 'Cambiando…',
    noDescription: 'Sin descripción.',
  },
  fr: {
    triggerTitle: 'Changer le mode de l’agent',
    menuTitle: 'Changer le mode de l’agent',
    loading: 'Chargement des modes…',
    loadFailed: 'Impossible de charger les modes de l’agent.',
    empty: 'Aucun autre mode d’agent disponible.',
    errorRead: 'Impossible de lire la composition du mode ; rien n’a été changé.',
    errorNotReady: 'Cette session n’est pas encore prête.',
    errorNoCommand: 'L’hôte ne propose pas la commande de changement.',
    errorSwitch: 'Le changement a échoué.',
    confirmTitle: 'Passer à {name} ?',
    confirmRemoved: 'Supprimé',
    confirmDisabled: 'Désactivé',
    confirmAdded: 'Ajouté',
    confirmNote: 'Seuls les tours suivants utilisent le nouveau mode. Les tours précédents conservent leurs outils.',
    confirmCancel: 'Annuler',
    confirmApply: 'Changer',
    switching: 'Changement…',
    noDescription: 'Aucune description.',
  },
  pt: {
    triggerTitle: 'Mudar o modo do agente',
    menuTitle: 'Mudar o modo do agente',
    loading: 'A carregar modos…',
    loadFailed: 'Não foi possível carregar os modos do agente.',
    empty: 'Não há outros modos do agente disponíveis.',
    errorRead: 'Não foi possível ler a composição do modo; nada foi mudado.',
    errorNotReady: 'Esta sessão ainda não está pronta.',
    errorNoCommand: 'O host não oferece o comando de mudança.',
    errorSwitch: 'A mudança falhou.',
    confirmTitle: 'Mudar para {name}?',
    confirmRemoved: 'Removido',
    confirmDisabled: 'Desativado',
    confirmAdded: 'Adicionado',
    confirmNote: 'Apenas os turnos seguintes usam o novo modo. Os turnos anteriores mantêm as ferramentas com que correram.',
    confirmCancel: 'Cancelar',
    confirmApply: 'Mudar',
    switching: 'A mudar…',
    noDescription: 'Sem descrição.',
  },
  ru: {
    triggerTitle: 'Сменить режим агента',
    menuTitle: 'Сменить режим агента',
    loading: 'Загрузка режимов…',
    loadFailed: 'Не удалось загрузить режимы агента.',
    empty: 'Других режимов агента нет.',
    errorRead: 'Не удалось прочитать состав режима; переключение не выполнено.',
    errorNotReady: 'Сеанс ещё не готов.',
    errorNoCommand: 'Хост не предоставляет команду переключения.',
    errorSwitch: 'Не удалось переключить режим.',
    confirmTitle: 'Переключиться на «{name}»?',
    confirmRemoved: 'Удаляется',
    confirmDisabled: 'Отключается',
    confirmAdded: 'Добавляется',
    confirmNote: 'Новый режим действует только для следующих ходов. Предыдущие ходы сохраняют свои инструменты.',
    confirmCancel: 'Отмена',
    confirmApply: 'Переключить',
    switching: 'Переключение…',
    noDescription: 'Нет описания.',
  },
}

/**
 * Styles use only the theme tokens the shipped header and dialogs use, so
 * the control follows light and dark appearance without importing the
 * page's private primitives.
 */
const STYLES = `
.dshps-root {
  position: relative; display: inline-flex; align-items: center; flex: none;
  height: 24px; width: 0; overflow: clip;
  transition: width 160ms ease, margin-inline-start 160ms ease;
}
.dshps-root[data-revealed='true'] { width: 22px; margin-inline-start: 2px; }
.dshps-trigger {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0;
  border: none; border-radius: var(--dsw-radius-xs);
  background: var(--dsw-alias-fill-tsp-secondary);
  color: var(--dsw-alias-label-tertiary); cursor: pointer;
  opacity: 0; transform: translateX(-8px); pointer-events: none;
  transition: opacity 120ms ease, transform 160ms ease, background-color 120ms ease, color 120ms ease;
}
.dshps-root[data-revealed='true'] .dshps-trigger { opacity: 1; transform: none; pointer-events: auto; }
@media (hover: hover) {
  .dshps-trigger:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
}
@media (hover: none) {
  .dshps-root { width: 22px; margin-inline-start: 2px; }
  .dshps-trigger { opacity: 1; transform: none; pointer-events: auto; }
}
.dshps-trigger:focus-visible { outline: 2px solid var(--dsw-alias-border-selected); outline-offset: 1px; }
.dshps-trigger:disabled { cursor: default; color: var(--dsw-alias-label-quaternary); }
.dshps-trigger[aria-expanded='true'] { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dshps-menu {
  position: fixed; z-index: 1000; width: 320px; max-height: min(60vh, 440px);
  overflow: auto; padding: 6px; box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-shadow-lv2);
}
.dshps-menu-head { padding: 6px 10px 8px; font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-caption); }
.dshps-note { padding: 8px 10px; font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-caption); }
.dshps-error { margin: 6px 4px 2px; padding: 8px 10px; border-radius: var(--dsw-radius-sm); font-size: 12px; line-height: 17px; color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-fill-tsp-secondary); }
.dshps-item {
  display: flex; flex-direction: column; gap: 2px; width: 100%;
  padding: 8px 10px; border: none; border-radius: var(--dsw-radius-sm);
  background: transparent; text-align: left; cursor: pointer;
}
@media (hover: hover) { .dshps-item:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); } }
.dshps-item:focus-visible { outline: 2px solid var(--dsw-alias-border-selected); outline-offset: -2px; }
.dshps-item:disabled { cursor: default; opacity: 0.6; }
.dshps-item-name { display: flex; align-items: center; gap: 6px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }
.dshps-item-mark { font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-caption); }
.dshps-item-desc { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-caption); overflow: hidden; }
.dshps-backdrop {
  position: fixed; inset: 0; z-index: 1100; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: var(--dsw-alias-bg-mask-1);
}
.dshps-dialog {
  width: min(440px, 100%); max-height: 80vh; overflow: auto; box-sizing: border-box;
  padding: 20px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1); box-shadow: var(--dsw-shadow-lv3);
}
.dshps-dialog-title { margin: 0; font-size: 15px; line-height: 22px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.dshps-dialog-note { margin: 8px 0 0; font-size: 13px; line-height: 19px; color: var(--dsw-alias-label-secondary); }
.dshps-section { margin-top: 14px; }
.dshps-section-title { font-size: 12px; line-height: 16px; font-weight: 500; color: var(--dsw-alias-label-caption); }
.dshps-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 0; padding: 0; list-style: none; }
.dshps-chip { padding: 2px 7px; border-radius: var(--dsw-radius-xs); background: var(--dsw-alias-fill-tsp-secondary); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dshps-chip[data-kind='loss'] { color: var(--dsw-alias-state-error-primary); }
.dshps-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.dshps-button {
  height: 32px; padding: 0 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
  font-size: 13px; line-height: 20px; cursor: pointer;
}
@media (hover: hover) { .dshps-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); } }
.dshps-button:disabled { cursor: default; opacity: 0.6; }
.dshps-button-primary { border-color: transparent; background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-on-color); }
@media (hover: hover) { .dshps-button-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); } }
.dshps-button:focus-visible { outline: 2px solid var(--dsw-alias-border-selected); outline-offset: 2px; }
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
interface RosterState {
  readonly status: 'loading' | 'ready' | 'error'
  readonly presets: readonly AgentPresetRow[]
  readonly error: string | null
}

/** Pending confirmation after a lossy comparison. */
interface ConfirmState {
  readonly preset: AgentPresetRow
  readonly impact: CompositionImpact
}

/** Menu anchor in viewport coordinates. */
interface MenuAnchor {
  readonly top: number
  readonly left: number
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
  const finish = (): void => {
    if (row === undefined) return
    rows.push(row)
    row = undefined
  }
  for (const line of text.split('\n')) {
    const marker = /^(\s*)-\s+(.*)$/.exec(line)
    if (marker !== null) {
      finish()
      row = { indent: marker[1].length, fields: {} }
      const field = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(marker[2])
      if (field !== null) row.fields[field[1]] = unquote(field[2])
      continue
    }
    if (row === undefined || line.trim() === '') continue
    const field = /^\s+([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (field === null) continue
    const indent = /^\s*/.exec(line)?.[0].length ?? 0
    if (indent <= row.indent) {
      finish()
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

/** Global, once per module: React absence is a page-build problem, not a switch problem. */
let warnedMissingReact = false
/** @param message - single diagnostic for a missing shared module. */
function warnMissingReact(message: string): void {
  if (warnedMissingReact) return
  warnedMissingReact = true
  console.warn(`[${NS}] ${message}`)
}

/**
 * Whether a value is the shared `react` module: the hooks and element factory
 * this module uses, probed rather than asserted so a page build that seeds a
 * different shape falls back to the disabled-header warning.
 * @param value - the value the module table returned for `react`.
 */
function isReactModule(value: unknown): value is ReactModule {
  if (typeof value !== 'object' || value === null) return false
  if (!('createElement' in value) || typeof value.createElement !== 'function') return false
  if (!('useState' in value) || typeof value.useState !== 'function') return false
  if (!('useEffect' in value) || typeof value.useEffect !== 'function') return false
  if (!('useRef' in value) || typeof value.useRef !== 'function') return false
  if (!('useMemo' in value) || typeof value.useMemo !== 'function') return false
  return true
}

/**
 * Read the shared `react` module the shell seeds into the module table.
 * @returns the module, or undefined when the page build did not seed it.
 */
function loadReact(): ReactModule | undefined {
  try {
    const loaded = require('react')
    return isReactModule(loaded) ? loaded : undefined
  } catch {
    return undefined
  }
}

const react = loadReact()

/** The static `react-dom` module's portal factory, narrowed to what this module calls. */
interface ReactDomModule {
  readonly createPortal: (children: React.ReactNode, container: Element) => React.ReactNode
}

/**
 * Read the shared `react-dom` module for `createPortal`. The header clips its
 * layout, so the menu and dialog mount on `document.body` instead of inheriting
 * that box.
 * @returns the portal factory, or undefined when the page does not seed it.
 */
function loadReactDom(): ReactDomModule | undefined {
  try {
    const loaded: unknown = require('react-dom')
    if (typeof loaded !== 'object' || loaded === null || !('createPortal' in loaded)) return undefined
    return typeof loaded.createPortal === 'function' ? loaded as ReactDomModule : undefined
  } catch {
    return undefined
  }
}

const reactDom = loadReactDom()

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
function createModeButton(ctx: ClientContext, reactModule: ReactModule) {
  return function ModeButton(props: ModeButtonProps): React.ReactNode {
    const t: TranslateNS<typeof NS> = typeof props.t === 'function' ? props.t : translator(LABELS.en)
    const sessionId = props.sessionId
    const current = typeof props.useSessions === 'function'
      ? props.useSessions(state => state.byId[sessionId]?.projectionValues?.agentPreset)
      : undefined
    const currentPresetId = current === null ? undefined : current

    const [open, setOpen] = reactModule.useState(false)
    const [revealed, setRevealed] = reactModule.useState(false)
    const [anchor, setAnchor] = reactModule.useState<MenuAnchor | null>(null)
    const [roster, setRoster] = reactModule.useState<RosterState>({ status: 'loading', presets: [], error: null })
    const [busy, setBusy] = reactModule.useState(false)
    const [error, setError] = reactModule.useState<string | null>(null)
    const [confirm, setConfirm] = reactModule.useState<ConfirmState | null>(null)
    const rootRef = reactModule.useRef<HTMLSpanElement>(null)
    const triggerRef = reactModule.useRef<HTMLButtonElement>(null)
    const menuRef = reactModule.useRef<HTMLDivElement>(null)
    const dialogRef = reactModule.useRef<HTMLDivElement>(null)
    const cancelRef = reactModule.useRef<HTMLButtonElement>(null)

    reactModule.useEffect(() => {
      // Read the roster each time the menu opens: the first attempt may have
      // raced the Remote namespace, and a shipped preset can appear or break
      // while the conversation stays open.
      if (!open) return undefined
      let alive = true
      setRoster(state => ({ status: 'loading', presets: state.presets, error: null }))
      ctx.remote.agentPresets.list().then((result) => {
        if (!alive) return
        if (!result.ok) {
          if (result.error.code === 'gateway/invocation-unavailable') {
            setRoster({ status: 'ready', presets: [], error: null })
          } else {
            setRoster({ status: 'error', presets: [], error: result.error.message })
          }
          return
        }
        setRoster({
          status: 'ready',
          presets: result.value.presets.filter(preset => preset.broken === undefined),
          error: null,
        })
      }, (failure: unknown) => {
        if (alive) setRoster({ status: 'error', presets: [], error: failure instanceof Error ? failure.message : String(failure) })
      })
      return () => { alive = false }
    }, [open])

    // The chevron rests collapsed. Hovering the conversation header — which
    // holds the shipped mode label — slides it out, and keyboard focus does
    // the same. Devices without hover keep it permanently visible.
    reactModule.useEffect(() => {
      const root = rootRef.current
      const host = root?.closest('header') ?? root?.parentElement
      if (host === null || host === undefined) return undefined
      const hoverCapable = typeof window.matchMedia === 'function'
        ? window.matchMedia('(hover: hover)').matches
        : true
      if (!hoverCapable) {
        setRevealed(true)
        return undefined
      }
      const show = (): void => { setRevealed(true) }
      const hide = (): void => { setRevealed(false) }
      const focusOut = (event: FocusEvent): void => {
        const next = event.relatedTarget
        if (!(next instanceof Node) || !host.contains(next)) setRevealed(false)
      }
      host.addEventListener('pointerenter', show)
      host.addEventListener('pointerleave', hide)
      host.addEventListener('focusin', show)
      host.addEventListener('focusout', focusOut)
      return () => {
        host.removeEventListener('pointerenter', show)
        host.removeEventListener('pointerleave', hide)
        host.removeEventListener('focusin', show)
        host.removeEventListener('focusout', focusOut)
      }
    }, [])

    reactModule.useEffect(() => {
      if (!open) return undefined
      const onPointer = (event: PointerEvent): void => {
        const target = event.target
        if (!(target instanceof Node)) return
        const inside = rootRef.current?.contains(target) === true
          || menuRef.current?.contains(target) === true
          || dialogRef.current?.contains(target) === true
        if (!inside) setOpen(false)
      }
      const onKey = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return
        if (confirm !== null) setConfirm(null)
        else setOpen(false)
      }
      document.addEventListener('pointerdown', onPointer, true)
      document.addEventListener('keydown', onKey)
      return () => {
        document.removeEventListener('pointerdown', onPointer, true)
        document.removeEventListener('keydown', onKey)
      }
    }, [open, confirm])

    reactModule.useEffect(() => {
      if (confirm !== null) cancelRef.current?.focus()
    }, [confirm])

    /** The shipped dictionary gives built-in presets their localized names. */
    const officialT = reactModule.useMemo((): Translate | undefined => {
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
      if (busy) return
      setError(null)
      const rect = triggerRef.current?.getBoundingClientRect()
      const width = 320
      const viewport = typeof window === 'undefined' ? width + 16 : window.innerWidth
      setAnchor(rect === undefined
        ? { top: 64, left: 64 }
        : { top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, viewport - width - 8)) })
      setOpen(value => !value)
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
      if (currentPresetId === undefined) return
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
    if (currentPresetId === undefined) return null

    const others = roster.presets.filter(preset => preset.id !== currentPresetId)
    const menu = open && anchor !== null
      ? reactModule.createElement('div', {
        className: 'dshps-menu',
        ref: menuRef,
        role: 'menu',
        'aria-label': t('menuTitle'),
        style: { top: `${anchor.top}px`, left: `${anchor.left}px` },
      },
      reactModule.createElement('div', { className: 'dshps-menu-head' }, t('menuTitle')),
      roster.status === 'loading' && reactModule.createElement('div', { className: 'dshps-note' }, t('loading')),
      roster.status === 'error' && reactModule.createElement('div', { className: 'dshps-note' }, t('loadFailed')),
      roster.status === 'error' && roster.error !== null && reactModule.createElement('div', { className: 'dshps-error', role: 'alert' }, roster.error),
      roster.status === 'ready' && others.length === 0 && reactModule.createElement('div', { className: 'dshps-note' }, t('empty')),
      others.map(preset => reactModule.createElement('button', {
        key: preset.id,
        type: 'button',
        role: 'menuitem',
        className: 'dshps-item',
        disabled: busy,
        onClick: () => { void choose(preset) },
      },
      reactModule.createElement('span', { className: 'dshps-item-name' }, nameOf(preset)),
      reactModule.createElement('span', { className: 'dshps-item-desc' }, descriptionOf(preset)))),
      busy && reactModule.createElement('div', { className: 'dshps-note' }, t('switching')),
      error !== null && reactModule.createElement('div', { className: 'dshps-error', role: 'alert' }, error))
      : null

    const dialog = confirm === null
      ? null
      : reactModule.createElement('div', {
        className: 'dshps-backdrop',
        ref: dialogRef,
        onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => {
          if (event.target === event.currentTarget) setConfirm(null)
        },
      },
      reactModule.createElement('div', {
        className: 'dshps-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'dshps-confirm-title',
      },
      reactModule.createElement('h2', { className: 'dshps-dialog-title', id: 'dshps-confirm-title' },
        t('confirmTitle', { name: nameOf(confirm.preset) })),
      reactModule.createElement('p', { className: 'dshps-dialog-note' }, t('confirmNote')),
      confirm.impact.removed.length > 0 && reactModule.createElement('div', { className: 'dshps-section' },
        reactModule.createElement('div', { className: 'dshps-section-title' }, t('confirmRemoved')),
        reactModule.createElement('ul', { className: 'dshps-chips' },
          confirm.impact.removed.map(row => reactModule.createElement('li', {
            key: row.key,
            className: 'dshps-chip',
            'data-kind': 'loss',
          }, rowLabel(row))))),
      confirm.impact.disabled.length > 0 && reactModule.createElement('div', { className: 'dshps-section' },
        reactModule.createElement('div', { className: 'dshps-section-title' }, t('confirmDisabled')),
        reactModule.createElement('ul', { className: 'dshps-chips' },
          confirm.impact.disabled.map(row => reactModule.createElement('li', {
            key: row.key,
            className: 'dshps-chip',
            'data-kind': 'loss',
          }, rowLabel(row))))),
      confirm.impact.added.length > 0 && reactModule.createElement('div', { className: 'dshps-section' },
        reactModule.createElement('div', { className: 'dshps-section-title' }, t('confirmAdded')),
        reactModule.createElement('ul', { className: 'dshps-chips' },
          confirm.impact.added.map(row => reactModule.createElement('li', {
            key: row.key,
            className: 'dshps-chip',
          }, rowLabel(row))))),
      reactModule.createElement('div', { className: 'dshps-actions' },
        reactModule.createElement('button', {
          ref: cancelRef,
          type: 'button',
          className: 'dshps-button',
          disabled: busy,
          onClick: () => { setConfirm(null) },
        }, t('confirmCancel')),
        reactModule.createElement('button', {
          type: 'button',
          className: 'dshps-button dshps-button-primary',
          disabled: busy,
          onClick: () => { void apply() },
        }, busy ? t('switching') : t('confirmApply')))))

    // The header animates and clips its actions row, so a `position: fixed`
    // child is still at the mercy of an ancestor transform. Mounting the
    // popups on `document.body` keeps them outside that box entirely.
    const mount = (node: React.ReactNode): React.ReactNode => {
      if (node === null) return null
      if (typeof document === 'undefined' || reactDom === undefined) return node
      return reactDom.createPortal(node, document.body)
    }

    return reactModule.createElement('span', {
      className: 'dshps-root',
      ref: rootRef,
      'data-revealed': revealed || open || confirm !== null,
    },
      reactModule.createElement('style', null, STYLES),
      reactModule.createElement('button', {
        ref: triggerRef,
        type: 'button',
        className: 'dshps-trigger',
        title: t('triggerTitle'),
        'aria-label': t('triggerTitle'),
        'aria-haspopup': 'menu',
        'aria-expanded': open && anchor !== null,
        disabled: busy,
        onClick: toggle,
      },
      reactModule.createElement('svg', {
        width: 14,
        height: 14,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
      },
      reactModule.createElement('path', {
        d: 'M4 6l4 4 4-4',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }))),
      mount(menu),
      mount(dialog))
  }
}

/** Props the header actions slot composes for this entry. */
type ModeButtonProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<typeof NS>

/** Services this module needs before `apply` runs. */
export const inject = ['locale', 'slots', 'sessions', 'remote', 'remote.agentPresets']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, LABELS), `${NS}: locale`)
  if (react === undefined) {
    warnMissingReact('the shared react module is unavailable; the header switch is disabled')
    return
  }
  ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'preset-switch',
    // The shipped preset label sits at -10; the chevron follows it.
    order: -9,
    locale: NS,
  }, createModeButton(ctx, react))), `${NS}: header action`)
}

// Exposed for the node test only; the page never reads this field.
export const internals = { parseComposition, diffCompositions, rowLabel, shortModule }
