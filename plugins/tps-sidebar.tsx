/** @jsxImportSource @opentui/solid */
import type { AssistantMessage } from "@opencode-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createMemo, createSignal, createEffect, onCleanup, Show } from "solid-js"

// only used to estimate the in-flight (not yet completed) message, where the
// server token count is not finalized yet. completed messages use real tokens.
const CHARS_PER_TOKEN = 3.5

function TpsView(props: { api: TuiPluginApi; getSessionID: () => string }) {
  const theme = () => props.api.theme.current
  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => setNow(Date.now()), 500)
  onCleanup(() => clearInterval(timer))

  // Decode throughput = generated content tokens / content streaming time.
  //
  // This memo reads `now()` so it re-evaluates on every timer tick. That keeps
  // the read fresh even if the TUI state API is not itself reactive.
  const tps = createMemo(() => {
    const msgs = props.api.state.session.messages(props.getSessionID())
    if (!msgs) return undefined
    const start = msgs.findLastIndex((m) => m.role === "user")
    if (start === -1) return undefined
    const turn = msgs.slice(start).filter((m): m is AssistantMessage => m.role === "assistant")
    if (!turn.length) return undefined

    let tokens = 0
    let genMs = 0
    let idleMs = 0
    let inflight = false
    let streamChars = 0
    let thinking = 0
    let thinkingLive = 0
    for (const m of turn) {
      const completed = !!m.time.completed
      tokens += (m.tokens?.output ?? 0) + (m.tokens?.reasoning ?? 0)
      const parts = props.api.state.part(m.id) ?? []
      let genStart: number | undefined
      let genEnd: number | undefined
      let curLive = 0
      for (const part of parts) {
        if (part.type !== "text" && part.type !== "reasoning") continue
        if (!completed) streamChars += part.text.length
        if (part.type === "reasoning") {
          const rt = Math.round(part.text.length / CHARS_PER_TOKEN)
          if (completed) thinking += m.tokens?.reasoning || rt
          else curLive += rt
        }
        const t0: number | undefined = (part as any).time?.start
        const t1: number | undefined = (part as any).time?.end
        if (t0 && (genStart === undefined || t0 < genStart)) genStart = t0
        const end = t1 ?? (completed ? undefined : now())
        if (end !== undefined && (genEnd === undefined || end > genEnd)) genEnd = end
      }
      if (!completed) {
        inflight = true
        thinkingLive += curLive
      }
      if (genStart === undefined) {
        // no text parts yet: fall back to the raw message window
        genMs += Math.max(0, (m.time.completed ?? now()) - m.time.created)
      } else {
        const from = Math.max(m.time.created, genStart)
        const to = Math.min(m.time.completed ?? now(), genEnd ?? now())
        genMs += Math.max(0, to - from)
        idleMs += Math.max(0, from - m.time.created)
        if (m.time.completed) idleMs += Math.max(0, m.time.completed - (genEnd ?? m.time.created))
      }
    }
    // in-flight message: server token count is not final yet, estimate by chars
    if (inflight) tokens += Math.round(streamChars / CHARS_PER_TOKEN)

    const secs = genMs / 1000
    const thinkingTotal = thinking + thinkingLive
    if ((secs < 1 || tokens < 20) && thinkingTotal === 0) return undefined
    return { value: secs >= 1 && tokens >= 20 ? tokens / secs : 0, est: tokens, secs, inflight, idle: idleMs / 1000, thinking: thinkingTotal }
  })

  // Keep the last valid value so the number stays visible after a turn
  // completes, even if the memo briefly returns undefined.
  const [last, setLast] = createSignal<{ value: number; est: number; secs: number; inflight: boolean; idle: number; thinking: number }>()
  createEffect(() => {
    const t = tps()
    if (t) setLast(t)
  })

  const color = (value: number) => {
    if (value >= 20) return theme().success
    if (value >= 10) return theme().warning
    return theme().error
  }

  return (
    <Show when={tps() ?? last()}>
      {(t) => (
        <text fg={theme().textMuted}>
          <Show when={t().value > 0}>
            <span style={{ fg: color(t().value) }}>
              <b>
                {t().inflight ? "~" : ""}
                {t().value.toFixed(1)}
              </b>
            </span>
            <span style={{ fg: theme().textMuted }}>
              {" "}
              tok/s{" "}
              {t().inflight
                ? "· generating"
                : `· ${t().est} tok / ${t().secs.toFixed(1)}s${t().idle >= 0.5 ? ` (idle ${t().idle.toFixed(1)}s excluded)` : ""}`}
            </span>
          </Show>
          <Show when={t().thinking > 0}>
            <span style={{ fg: theme().textMuted }}>
              {"  "}
              <span style={{ fg: theme().warning }}>
                <b>{t().thinking}</b>
              </span>{" "}
              think
            </span>
          </Show>
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
