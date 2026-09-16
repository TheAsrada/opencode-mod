import { createContext, useContext, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { Identifier } from "@/utils/id"
import type { DirectorySDK } from "@/context/sdk"
import type { DirectorySync } from "@/context/sync"

export type BtwStatus = "working" | "done" | "error"

export type BtwEntry = {
  question: string
  answer: string
  status: BtwStatus
  childID?: string
  usage?: boolean
}

type BtwStore = {
  open: boolean
  current: BtwEntry | null
  history: BtwEntry[]
}

export type BtwAskInput = {
  api: DirectorySDK["api"]["session"]
  sync: DirectorySync
  sessionID: string
  question: string
  agent: string
  model: { providerID: string; modelID: string }
  variant?: string
  files?: { uri: string; name: string }[]
}

const POLL_MS = 400
const TIMEOUT_MS = 5 * 60 * 1000
const HISTORY_LIMIT = 10

function errText(err: unknown) {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === "string" && err) return err
  return "request failed"
}

function childAnswer(sync: DirectorySync, childID: string) {
  const messages = sync.data.message[childID] ?? []
  const chunks: string[] = []
  for (const message of messages) {
    if (message.role !== "assistant") continue
    const parts = sync.data.part[message.id] ?? []
    for (const part of parts) {
      if (part.type === "text" && typeof (part as { text?: unknown }).text === "string") {
        const text = ((part as { text: string }).text ?? "").trim()
        if (text) chunks.push(text)
      }
    }
  }
  return chunks.join("\n\n").trim()
}

function init() {
  const [store, setStore] = createStore<BtwStore>({ open: false, current: null, history: [] })
  let timer: ReturnType<typeof setInterval> | undefined

  const stop = () => {
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }

  const pushHistory = (entry: BtwEntry) => {
    setStore("history", (items) => [entry, ...items].slice(0, HISTORY_LIMIT))
  }

  const close = () => {
    stop()
    const current = store.current
    if (current && current.status !== "working") pushHistory(current)
    setStore({ open: false, current: null })
  }

  const showLast = () => {
    const last = store.history[0]
    if (!last) return false
    setStore({ open: true, current: { ...last } })
    return true
  }

  const showUsage = () => {
    stop()
    const prev = store.current
    if (prev && prev.status !== "working") pushHistory(prev)
    setStore({ open: true, current: { question: "/btw", answer: "", status: "done", usage: true } })
  }

  const ask = (input: BtwAskInput) => {
    stop()
    const prev = store.current
    if (prev && prev.status !== "working") pushHistory(prev)
    setStore({ open: true, current: { question: input.question, answer: "", status: "working" } })

    const startedAt = Date.now()
    let childID: string | undefined

    const finish = (patch: Partial<BtwEntry> & { status: BtwStatus }) => {
      stop()
      setStore("current", (entry) => (entry ? { ...entry, ...patch } : entry))
    }

    const tick = () => {
      if (Date.now() - startedAt > TIMEOUT_MS) {
        finish({ status: "error", answer: "timed out waiting for the side answer" })
        return
      }
      const sessions = input.sync.data.session ?? []
      if (!childID) {
        const child = sessions.find(
          (s) => s.parentID === input.sessionID && typeof s.time?.created === "number" && s.time.created >= startedAt,
        )
        if (!child) return
        childID = child.id
        setStore("current", (entry) => (entry ? { ...entry, childID } : entry))
      }
      const answer = childAnswer(input.sync, childID)
      if (answer) setStore("current", (entry) => (entry && entry.answer !== answer ? { ...entry, answer } : entry))
      let idle = true
      try {
        idle = !input.sync.data.session_working(childID)
      } catch {
        idle = true
      }
      if (idle && answer) finish({ status: "done", answer })
    }

    const messageID = Identifier.ascending("message")
    input.api
      .command({
        sessionID: input.sessionID,
        id: messageID,
        command: "btw",
        arguments: input.question,
        agent: input.agent,
        model: { id: input.model.modelID, providerID: input.model.providerID, variant: input.variant },
        files: input.files ?? [],
      })
      .then(() => {
        timer = setInterval(tick, POLL_MS)
        tick()
      })
      .catch((err: unknown) => {
        finish({ status: "error", answer: errText(err) })
      })
  }

  return { store, ask, close, showLast, showUsage }
}

type BtwContext = ReturnType<typeof init>

const Context = createContext<BtwContext>()

export function BtwProvider(props: ParentProps) {
  return <Context.Provider value={init()}>{props.children}</Context.Provider>
}

export function useBtw() {
  const ctx = useContext(Context)
  if (!ctx) throw new Error("useBtw must be used within a BtwProvider")
  return ctx
}
