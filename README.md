# opencode-tps-sidebar

A [OpenCode](https://opencode.ai) TUI plugin that shows live **tokens/second (TPS)** in the session sidebar.

- While the model is generating: a live estimate (`~24.3 tok/s`, refreshed every 500 ms, based on streamed text length).
- After the turn completes: the exact value from message token usage (`24.3 tok/s · 512 tok / 21.1s`).
- Color coded by speed: green ≥ 20, yellow ≥ 10, red < 10.
- Skips trivial turns (< 20 estimated tokens or < 1 s) so the sidebar stays quiet.

## Preview

```
~26.1 tok/s · generating          # during generation
26.2 tok/s · 2048 tok / 78.2s     # after completion
```

## Install

1. Copy the plugin into the global plugin directory:

   ```bash
   mkdir -p ~/.config/opencode/plugins
   cp plugins/tps-sidebar.tsx ~/.config/opencode/plugins/
   ```

2. **Register it explicitly in `~/.config/opencode/tui.json`** — TUI plugins are *not* auto-loaded from the plugins directory (unlike server-side plugins):

   ```json
   {
     "$schema": "https://opencode.ai/tui.json",
     "plugin": ["./plugins/tps-sidebar.tsx"]
   }
   ```

   If you already have a `tui.json`, just append the path to the `plugin` array.

3. Restart OpenCode. Check `/plugins` to confirm `gray.tps-sidebar` is loaded.

## How it works

The plugin registers a `sidebar_content` slot (order 300) and computes TPS reactively from `api.state.session.messages()` + `api.state.part()`:

- **Completed assistant messages**: `tokens.output + tokens.reasoning` over `time.completed - time.created`.
- **In-flight message**: estimated tokens from streamed text/reasoning part length (`chars / 3.5`) over elapsed time.

No dependencies to install — `solid-js` and `@opentui/solid` are injected by the OpenCode TUI runtime.

## Gotchas (learned the hard way)

These are non-obvious OpenCode TUI plugin rules this plugin already handles:

1. **No directory auto-load for TUI plugins** — you must list the file in `tui.json` → `plugin` array.
2. The module must `export default { id, tui }` and the TSX needs the `/** @jsxImportSource @opentui/solid */` pragma.
3. **`sidebar_footer` is a `single_winner` slot won by the *lowest* `order`** — the built-in footer uses order 100, so anything higher never renders. `sidebar_content` is an append-mode slot; that's why this plugin uses it.
4. In Solid, `return null` on an initially-undefined memo never re-renders — wrap with `<Show>` instead.
5. Reactive props must be passed as closures (`() => props.x`); `get` getters in JSX attributes fail to parse.
6. `api.state.session.messages(id)` can return `undefined` (e.g. unauthenticated sessions) — guard it.

## License

MIT
