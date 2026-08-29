/** @jsxImportSource @opentui/solid */
import type { AssistantMessage } from "@opencode-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createMemo, createSignal, onCleanup, Show } from "solid-js"

const CHARS_PER_TOKEN = 3.5

function TpsView(props: { api: TuiPluginApi; getSessionID: () => string }) {
  const theme = () => props.api.theme.current
  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => setNow(Date.now()), 500)
  onCleanup(() => clearInterval(timer))

  const tps = createMemo(() => {
    const msgs = props.api.state.session.messages(props.getSessionID())
    if (!msgs) return undefined
    const start = msgs.findLastIndex((m) => m.role === "user")
    if (start === -1) return undefined
    const turn = msgs.slice(start).filter((m): m is AssistantMessage => m.role === "assistant")
    if (!turn.length) return undefined

    let tokens = 0
    let genMs = 0
    let streamChars = 0
    let inflight = false
    for (const m of turn) {
      tokens += (m.tokens?.output ?? 0) + (m.tokens?.reasoning ?? 0)
      if (m.time.completed) {
        genMs += Math.max(0, m.time.completed - m.time.created)
      } else {
        inflight = true
        for (const part of props.api.state.part(m.id) ?? []) {
          if (part.type === "text" || part.type === "reasoning") streamChars += part.text.length
        }
        genMs += Math.max(0, now() - m.time.created)
      }
    }

    const est = tokens + Math.round(streamChars / CHARS_PER_TOKEN)
    const secs = genMs / 1000
    if (secs < 1 || est < 20) return undefined
    return { value: est / secs, est, secs, inflight }
  })

  const color = (value: number) => {
    if (value >= 20) return theme().success
    if (value >= 10) return theme().warning
    return theme().error
  }

  return (
    <Show when={tps()}>
      {(t) => (
        <text fg={theme().textMuted}>
          <span style={{ fg: color(t().value) }}>
            <b>
              {t().inflight ? "~" : ""}
              {t().value.toFixed(1)}
            </b>
          </span>
          <span style={{ fg: theme().textMuted }}>
            {" "}
            tok/s {t().inflight ? "· generating" : `· ${t().est} tok / ${t().secs.toFixed(1)}s`}
          </span>
        </text>
      )}
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 300,
    slots: {
      sidebar_content(_ctx, props) {
        return <TpsView api={api} getSessionID={() => props.session_id} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "gray.tps-sidebar",
  tui,
}

export default plugin
