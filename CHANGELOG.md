# Changelog

## 0.1.0

- Add the session-header chevron that opens the Agent-mode picker for an idle session.
- Add the `/preset-switch <preset-id>` Host command; it refuses open turns and running compactions,
  then recomposes the session and records `agent-preset/selected`.
- Compare the current and target declarations by plugin row and confirm only when the target removes or disables a row.
- Build both halves from the TypeScript sources in `src/`; `index.js` and `client.js` are committed artifacts now.
- Hide the header chevron when the session's `agentPreset` projection is `null`, which records no preset.
  The pre-migration script tested only `undefined`, so a preset-free deployment showed the chevron.
- Drop the runtime `undefined` guards around `ctx.slots` and `ctx.remote.agentPresets`; the injected services guarantee both.
- Inject `remote.agentPresets`: without it Cordis refuses the namespace lookup, so the header slot crashed on every
  started session and the chevron never rendered. Found by driving the running Web UI against a disposable profile.
- Ignore picker-outside pointer events whose target is not a DOM `Node`; real pointer events always carry one.
