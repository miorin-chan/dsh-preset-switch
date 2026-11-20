# Changelog

## 0.1.0

- Add the session-header chevron that opens the Agent-mode picker for an idle session.
- Add the `/preset-switch <preset-id>` Host command; it refuses open turns and running compactions,
  then recomposes the session and records `agent-preset/selected`.
- Compare the current and target declarations by plugin row and confirm only when the target removes or disables a row.
