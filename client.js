/**
 * Browser half of `dsh-preset-switch`.
 *
 * Adds the switch affordance the shipped header lacks: the Agent-preset label
 * in the session header is static chrome, and the shipped selector lives only
 * on the new-task screen because the Host refuses a swap once a turn has run.
 * This module keeps the label as it is and puts one chevron button beside it.
 *
 * The actual swap travels through the Host command the package's `index.js`
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
window.__ModuleLoader__.load({
  id: 'dsh-preset-switch',
  factory(require) {
    const NS = 'dsh-preset-switch'
    const COMMAND = '/preset-switch '
    /** Built-in presets publish no name; the shipped UI dictionary owns them. */
    const BUILTIN_TEXT_KEYS = {
      standard: ['presetStandardName', 'presetStandardDescription'],
      ptc: ['presetPtcName', 'presetPtcDescription'],
      minimal: ['presetMinimalName', 'presetMinimalDescription'],
      cordis: ['presetCordisName', 'presetCordisDescription'],
    }

    /** Visible text this module renders itself; plugin-meta text lives in locale/*.json. */
    const LABELS = {
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
.dshps-root { position: relative; display: inline-flex; align-items: center; }
.dshps-trigger {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0; margin-left: 2px;
  border: none; border-radius: var(--dsw-radius-xs);
  background: var(--dsw-alias-fill-tsp-secondary);
  color: var(--dsw-alias-label-tertiary); cursor: pointer;
}
@media (hover: hover) {
  .dshps-trigger:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
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

    let React
    try { React = require('react') } catch { React = undefined }

    /** @param {string} value - scalar rendered by the loader's YAML dialect. */
    function unquote(value) {
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
    function parseComposition(text) {
      const rows = []
      let row
      const finish = () => {
        if (row === undefined) return
        rows.push(row)
        row = undefined
      }
      for (const line of String(text).split('\n')) {
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
        const indent = /^\s*/.exec(line)[0].length
        if (indent <= row.indent) { finish(); continue }
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

    /** @param {string} name - package specifier or short module name. */
    function shortModule(name) {
      const prefix = '@deepseek-ai/dsh-'
      return name.startsWith(prefix) ? name.slice(prefix.length) : name
    }

    /** @param {{ id?: string, name?: string }} row - composition row. */
    function rowLabel(row) {
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
    function diffCompositions(currentText, targetText) {
      const byKey = (rows) => {
        const map = new Map()
        for (const row of rows) if (!map.has(row.key)) map.set(row.key, row)
        return map
      }
      const current = byKey(parseComposition(currentText))
      const target = byKey(parseComposition(targetText))
      const added = []
      const removed = []
      const disabled = []
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

    /** @param {string} key - locale key. @param {Record<string, unknown>} labels - one dictionary. */
    function translator(labels) {
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
    /** @param {string} message - single diagnostic for a missing shared module. */
    function warnMissingReact(message) {
      if (warnedMissingReact) return
      warnedMissingReact = true
      console.warn(`[${NS}] ${message}`)
    }

    /**
     * Read one preset's declared composition.
     * @param {object} ctx - Client context.
     * @param {string} id - preset id.
     * @returns {Promise<string>} declaration YAML.
     */
    async function readComposition(ctx, id) {
      const result = await ctx.remote.agentPresets.read(id)
      if (!result.ok) throw new Error(result.error.message)
      return result.value.content
    }

    /**
     * Build the header component. The context stays in the closure because the
     * slot registration owns the component's lifetime; every Remote service
     * call is effect-safe and can fail into a visible message.
     * @param {object} ctx - Client context.
     * @returns {Function} React component for the header slot.
     */
    function createModeButton(ctx) {
      return function ModeButton(props) {
        const t = typeof props.t === 'function' ? props.t : translator(LABELS.en)
        const sessionId = props.sessionId
        const useSessions = typeof props.useSessions === 'function' ? props.useSessions : undefined
        const current = useSessions === undefined
          ? undefined
          : useSessions(state => state.byId[sessionId]?.projectionValues?.agentPreset)

        const [open, setOpen] = React.useState(false)
        const [anchor, setAnchor] = React.useState(null)
        const [roster, setRoster] = React.useState({ status: 'loading', presets: [], error: null })
        const [busy, setBusy] = React.useState(false)
        const [error, setError] = React.useState(null)
        const [confirm, setConfirm] = React.useState(null)
        const rootRef = React.useRef(null)
        const triggerRef = React.useRef(null)
        const cancelRef = React.useRef(null)

        React.useEffect(() => {
          let alive = true
          if (ctx.remote?.agentPresets === undefined) {
            setRoster({ status: 'error', presets: [], error: t('loadFailed') })
            return undefined
          }
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
          }, (failure) => {
            if (alive) setRoster({ status: 'error', presets: [], error: failure instanceof Error ? failure.message : String(failure) })
          })
          return () => { alive = false }
        }, [])

        React.useEffect(() => {
          if (!open) return undefined
          const onPointer = (event) => {
            if (rootRef.current !== null && !rootRef.current.contains(event.target)) setOpen(false)
          }
          const onKey = (event) => {
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

        React.useEffect(() => {
          if (confirm !== null) cancelRef.current?.focus()
        }, [confirm])

        /** The shipped dictionary gives built-in presets their localized names. */
        const officialT = React.useMemo(() => {
          try { return ctx.locale.bind('settings.agentPreset') } catch { return undefined }
        }, [])
        const officialText = (key) => {
          if (typeof officialT !== 'function') return undefined
          try {
            const value = officialT(key)
            return typeof value === 'string' && value !== key && value !== '' ? value : undefined
          } catch { return undefined }
        }
        const nameOf = (preset) => {
          if (preset.name !== undefined) return preset.name
          const keys = BUILTIN_TEXT_KEYS[preset.id]
          return (keys === undefined ? undefined : officialText(keys[0])) ?? preset.id
        }
        const descriptionOf = (preset) => {
          if (preset.description !== undefined) return preset.description
          const keys = BUILTIN_TEXT_KEYS[preset.id]
          return (keys === undefined ? undefined : officialText(keys[1])) ?? t('noDescription')
        }

        const close = () => {
          setOpen(false)
          setConfirm(null)
          setError(null)
        }

        const toggle = () => {
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

        const dispatch = async (id) => {
          const live = ctx.sessions?.binding(sessionId)?.session
          if (live === undefined) throw new Error(t('errorNotReady'))
          const result = await live.command(COMMAND + id)
          if (!result.ok) throw new Error(result.error.message)
          if (!result.value.matched) throw new Error(t('errorNoCommand'))
        }

        const choose = async (preset) => {
          if (busy || preset.id === current) {
            if (preset.id === current) close()
            return
          }
          setBusy(true)
          setError(null)
          try {
            const currentText = await readComposition(ctx, current)
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

        const apply = async () => {
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
        if (current === undefined) return null

        const others = roster.presets.filter(preset => preset.id !== current)
        const menu = open && anchor !== null
          ? React.createElement('div', {
            className: 'dshps-menu',
            role: 'menu',
            'aria-label': t('menuTitle'),
            style: { top: `${anchor.top}px`, left: `${anchor.left}px` },
          },
          React.createElement('div', { className: 'dshps-menu-head' }, t('menuTitle')),
          roster.status === 'loading' && React.createElement('div', { className: 'dshps-note' }, t('loading')),
          roster.status === 'error' && React.createElement('div', { className: 'dshps-note' }, t('loadFailed')),
          roster.status === 'ready' && others.length === 0 && React.createElement('div', { className: 'dshps-note' }, t('empty')),
          others.map(preset => React.createElement('button', {
            key: preset.id,
            type: 'button',
            role: 'menuitem',
            className: 'dshps-item',
            disabled: busy,
            onClick: () => { void choose(preset) },
          },
          React.createElement('span', { className: 'dshps-item-name' }, nameOf(preset)),
          React.createElement('span', { className: 'dshps-item-desc' }, descriptionOf(preset)))),
          busy && React.createElement('div', { className: 'dshps-note' }, t('switching')),
          error !== null && React.createElement('div', { className: 'dshps-error', role: 'alert' }, error))
          : null

        const dialog = confirm === null
          ? null
          : React.createElement('div', {
            className: 'dshps-backdrop',
            onMouseDown: event => { if (event.target === event.currentTarget) setConfirm(null) },
          },
          React.createElement('div', {
            className: 'dshps-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'dshps-confirm-title',
          },
          React.createElement('h2', { className: 'dshps-dialog-title', id: 'dshps-confirm-title' },
            t('confirmTitle', { name: nameOf(confirm.preset) })),
          React.createElement('p', { className: 'dshps-dialog-note' }, t('confirmNote')),
          confirm.impact.removed.length > 0 && React.createElement('div', { className: 'dshps-section' },
            React.createElement('div', { className: 'dshps-section-title' }, t('confirmRemoved')),
            React.createElement('ul', { className: 'dshps-chips' },
              confirm.impact.removed.map(row => React.createElement('li', {
                key: row.key,
                className: 'dshps-chip',
                'data-kind': 'loss',
              }, rowLabel(row))))),
          confirm.impact.disabled.length > 0 && React.createElement('div', { className: 'dshps-section' },
            React.createElement('div', { className: 'dshps-section-title' }, t('confirmDisabled')),
            React.createElement('ul', { className: 'dshps-chips' },
              confirm.impact.disabled.map(row => React.createElement('li', {
                key: row.key,
                className: 'dshps-chip',
                'data-kind': 'loss',
              }, rowLabel(row))))),
          confirm.impact.added.length > 0 && React.createElement('div', { className: 'dshps-section' },
            React.createElement('div', { className: 'dshps-section-title' }, t('confirmAdded')),
            React.createElement('ul', { className: 'dshps-chips' },
              confirm.impact.added.map(row => React.createElement('li', {
                key: row.key,
                className: 'dshps-chip',
              }, rowLabel(row))))),
          React.createElement('div', { className: 'dshps-actions' },
            React.createElement('button', {
              ref: cancelRef,
              type: 'button',
              className: 'dshps-button',
              disabled: busy,
              onClick: () => { setConfirm(null) },
            }, t('confirmCancel')),
            React.createElement('button', {
              type: 'button',
              className: 'dshps-button dshps-button-primary',
              disabled: busy,
              onClick: () => { void apply() },
            }, busy ? t('switching') : t('confirmApply')))))

        return React.createElement('span', { className: 'dshps-root', ref: rootRef },
          React.createElement('style', null, STYLES),
          React.createElement('button', {
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
          React.createElement('svg', {
            width: 14,
            height: 14,
            viewBox: '0 0 16 16',
            'aria-hidden': 'true',
          },
          React.createElement('path', {
            d: 'M4 6l4 4 4-4',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.5,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }))),
          menu,
          dialog)
      }
    }

    return {
      inject: ['locale', 'slots', 'sessions', 'remote'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, LABELS), `${NS}: locale`)
        if (React === undefined) {
          warnMissingReact('the shared react module is unavailable; the header switch is disabled')
          return
        }
        if (ctx.slots === undefined) return
        ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions',
          id: 'preset-switch',
          // The shipped preset label sits at -10; the chevron follows it.
          order: -9,
          locale: NS,
        }, createModeButton(ctx))), `${NS}: header action`)
      },
      // Exposed for the node test only; the page never reads this field.
      internals: { parseComposition, diffCompositions, rowLabel, shortModule },
    }
  },
})
