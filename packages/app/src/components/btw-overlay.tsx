import { createEffect, onCleanup, Show } from "solid-js"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useBtw } from "@/context/btw"
import { useLanguage } from "@/context/language"

function focusInEditable() {
  const active = document.activeElement
  if (!active || active === document.body) return false
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)
    return true
  if (active instanceof HTMLElement && active.isContentEditable) return true
  return false
}

export function BtwOverlay() {
  const btw = useBtw()
  const language = useLanguage()

  const onKeyDown = (event: KeyboardEvent) => {
    if (!btw.store.open) return
    if (event.key === "Escape") {
      if (focusInEditable()) return
      event.preventDefault()
      event.stopPropagation()
      btw.close()
      return
    }
    if (event.key === "Enter" || event.key === " ") {
      if (focusInEditable()) return
      const target = event.target
      if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return
      event.preventDefault()
      event.stopPropagation()
      btw.close()
    }
  }

  createEffect(() => {
    if (!btw.store.open) return
    window.addEventListener("keydown", onKeyDown, { capture: true })
    onCleanup(() => window.removeEventListener("keydown", onKeyDown, { capture: true }))
  })

  return (
    <Show when={btw.store.open && btw.store.current}>
      {(entry) => (
        <div
          data-component="btw-overlay"
          class="pointer-events-none fixed inset-x-0 top-14 z-40 flex justify-center px-4"
        >
          <div class="pointer-events-auto w-full max-w-2xl overflow-hidden rounded-xl border border-border-base bg-surface-raised-base shadow-2xl">
            <div class="flex items-center gap-2 border-b border-border-weak-base px-4 py-2.5">
              <span class="text-13-medium text-text-strong">{language.t("btw.title")}</span>
              <Show when={entry().status === "working"}>
                <Spinner />
              </Show>
              <button
                type="button"
                aria-label={language.t("btw.dismiss")}
                class="ml-auto rounded-md px-2 py-0.5 text-12-regular text-text-weak hover:bg-background-stronger hover:text-text-strong"
                onClick={() => btw.close()}
              >
                ✕
              </button>
            </div>
            <div class="px-4 pt-2.5 text-13-regular text-text-weak">{entry().question}</div>
            <div class="max-h-[40vh] overflow-y-auto px-4 py-2.5">
              <Show when={entry().usage}>
                <span class="text-13-regular text-text-weak">{language.t("btw.usage")}</span>
              </Show>
              <Show
                when={!entry().usage && entry().answer}
                fallback={
                  <Show when={!entry().usage && entry().status === "working"}>
                    <span class="text-13-regular text-text-weak">{language.t("btw.working")}</span>
                  </Show>
                }
              >
                <Markdown
                  text={entry().answer}
                  cacheKey={entry().childID ?? "btw-overlay"}
                  streaming={entry().status === "working"}
                />
              </Show>
              <Show when={entry().status === "error" && !entry().answer}>
                <span class="text-13-regular text-text-danger-base">{language.t("btw.failed")}</span>
              </Show>
            </div>
            <div class="border-t border-border-weak-base px-4 py-1.5 text-12-regular text-text-weak">
              {language.t("btw.dismissHint")}
            </div>
          </div>
        </div>
      )}
    </Show>
  )
}
