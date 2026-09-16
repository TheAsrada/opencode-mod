import { Show, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useTerminalDimensions } from "@opentui/solid"
import type { FilePart } from "@opencode-ai/sdk/v2"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { useDialog, type DialogContext } from "../../ui/dialog"
import { useBindings } from "../../keymap"
import { Spinner } from "../spinner"

export const BTW_USAGE =
  "Usage: /btw <question> — ask a quick side question answered from conversation context only, without tools or history pollution."

type Status = "working" | "done" | "error"

type Entry = {
  question: string
  answer: string
  status: Status
  childID?: string
  usage?: boolean
}

const history: Entry[] = []

const POLL_MS = 400
const TIMEOUT_MS = 5 * 60 * 1000

export type BtwRequest = {
  sessionID: string
  question: string
  agent: string
  model: string
  variant?: string
  parts?: Omit<FilePart, "id" | "messageID" | "sessionID">[]
  send: (req: Omit<BtwRequest, "send">) => Promise<unknown>
}

export function askBtw(dialog: DialogContext, request: BtwRequest) {
  dialog.replace(() => <BtwOverlay request={request} />)
}

function BtwOverlay(props: { request: BtwRequest }) {
  const { theme, syntax } = useTheme()
  const sync = useSync()
  const dialog = useDialog()
  const dimensions = useTerminalDimensions()
  const [store, setStore] = createStore<Entry>({ question: props.request.question, answer: "", status: "working" })

  useBindings(() => ({
    bindings: [
      {
        key: "return",
        desc: "Dismiss side answer",
        group: "Dialog",
        cmd: () => dialog.clear(),
      },
      {
        key: "space",
        desc: "Dismiss side answer",
        group: "Dialog",
        cmd: () => dialog.clear(),
      },
    ],
  }))

  let timer: ReturnType<typeof setInterval> | undefined
  const startedAt = Date.now()
  onCleanup(() => {
    if (timer !== undefined) clearInterval(timer)
  })

  const stop = () => {
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }

  const finish = (patch: Partial<Entry> & { status: Status }) => {
    stop()
    setStore((entry) => ({ ...entry, ...patch }))
    if (patch.status === "done" && patch.answer && store.question !== "/btw") {
      history.unshift({ question: store.question, answer: patch.answer, status: "done", childID: store.childID })
    }
  }

  const collect = (childID: string) => {
    const chunks: string[] = []
    for (const message of sync.data.message[childID] ?? []) {
      if (message.role !== "assistant") continue
      for (const part of sync.data.part[message.id] ?? []) {
        if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
          chunks.push(part.text.trim())
        }
      }
    }
    return chunks.join("\n\n").trim()
  }

  const tick = () => {
    if (Date.now() - startedAt > TIMEOUT_MS) {
      finish({ status: "error", answer: "timed out waiting for the side answer" })
      return
    }
    let childID = store.childID
    if (!childID) {
      const child = (sync.data.session ?? []).find(
        (s) => s.parentID === props.request.sessionID && typeof s.time?.created === "number" && s.time.created >= startedAt,
      )
      if (!child) return
      childID = child.id
      setStore("childID", childID)
    }
    const text = collect(childID)
    if (text && text !== store.answer) setStore("answer", text)
    const status = sync.data.session_status[childID]
    if (!status || status.type === "busy") return
    if (text) {
      finish({ status: "done", answer: text })
      return
    }
    if (status.type !== "retry" && Date.now() - startedAt > 15_000) {
      finish({ status: "error", answer: "no answer" })
    }
  }

  onMount(() => {
    const question = props.request.question.trim()
    if (!question) {
      const last = history[0]
      if (last) {
        setStore({ ...last })
      } else {
        setStore({ question: "/btw", answer: "", status: "done", usage: true })
      }
      return
    }
    const req = props.request
    void req
      .send({
        sessionID: req.sessionID,
        question: req.question,
        agent: req.agent,
        model: req.model,
        variant: req.variant,
        parts: req.parts,
      })
      .then(() => {
        timer = setInterval(tick, POLL_MS)
        tick()
      })
      .catch((err: unknown) => {
        finish({ status: "error", answer: err instanceof Error && err.message ? err.message : "request failed" })
      })
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} flexDirection="column">
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text}>btw · side question</text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <box>
        <text fg={theme.textMuted}>{store.question}</text>
      </box>
      <scrollbox maxHeight={Math.max(10, dimensions().height - 12)} scrollbarOptions={{ visible: false }}>
        <Show when={store.usage}>
          <text fg={theme.textMuted}>{BTW_USAGE}</text>
        </Show>
        <Show when={!store.usage && store.status === "working" && !store.answer}>
          <Spinner>Thinking…</Spinner>
        </Show>
        <Show when={!store.usage && store.answer}>
          <markdown
            syntaxStyle={syntax()}
            streaming={store.status === "working"}
            internalBlockMode="top-level"
            content={store.answer}
            tableOptions={{ style: "grid" }}
            fg={theme.markdownText}
            bg={theme.background}
          />
        </Show>
        <Show when={!store.usage && store.status === "error" && !store.answer}>
          <text fg={theme.textMuted}>Could not get a side answer.</text>
        </Show>
      </scrollbox>
      <box paddingBottom={1}>
        <text fg={theme.textMuted}>space, enter or esc to dismiss</text>
      </box>
    </box>
  )
}
