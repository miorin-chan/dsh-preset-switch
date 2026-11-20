# dsh-preset-switch

[简体中文](README.zh.md)

Switches a session’s Agent preset while it is idle.
A chevron beside the preset label in the session header opens the picker; the switch itself runs through a Host command,
so the session log records the new preset like any other selection.

The confirmation step is dynamic. The plugin reads the current and target declarations, compares their plugin rows,
and warns only when the target removes a row or disables one the session currently runs.
A switch that only adds rows applies immediately — switching to Creator mode is one example.
Preset pairs are never listed in code, so custom presets and edited shipped presets follow the same rule.

Requires DeepSeek Harness 0.2.2-rc.3 or newer and a deployment that composes Agent presets (the Web
and Desktop profiles do).

## Install

In **Plugins** > **Add plugin**, choose this directory, or call `plugin_manager` with `install_bundle`.
The bundle appears as **Agent mode switch**.
Disable it in **Plugins** to unload it.

## Use

1. Open a session that already has a preset recorded.
2. Hover the header to slide out the chevron beside the preset name, then click it.
3. Pick a mode. A purely additive switch happens at once; a switch that removes
   or disables plugins first shows what it would take away.

The same switch is available as `/preset-switch <preset-id>`.

## Limits

- **Idle sessions only.** An open turn or a running compaction refuses the switch; the command reports why.
- **Earlier turns keep their tools.** The new tools, prompt, and tool-removal notices begin with the next turn.
  Tool calls already in history are not rewritten.
- **Plugin rows, not tools.** The warning lists the plugin rows a mode removes or disables.
  It does not enumerate individual tools, and a row that only changes its `config` does not warn.
- **Session state is not migrated.** Goals, plans, background jobs, terminals,
  and subagents belong to plugins the target mode may not mount.
  The switch does not close, stop, or carry them; stop what matters before switching to a mode that drops its owner.
- **No automatic mode selection.** The user picks the mode; the plugin only judges whether the pick needs confirmation.

[Project documentation](docs/README.md)
