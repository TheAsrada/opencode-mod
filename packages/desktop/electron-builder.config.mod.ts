import type { Configuration } from "electron-builder"

import getConfig from "./electron-builder.config"

// Unsigned mod distribution config. Wraps the base per-channel config and
// disables everything that requires paid/third-party credentials:
// - mac notarization + dmg signing (no Apple Developer account)
// - (Windows Azure signing is already a graceful no-op without env config)
//
// Note: electron-builder calls a function default export, so this must stay
// a function returning the config (a plain object export fails with
// "(0, _electronBuilder.default) is not a function").
export default function getModConfig(): Configuration {
  const base = (getConfig as unknown as () => Configuration)()
  return {
    ...base,
    mac: {
      ...(base.mac ?? {}),
      notarize: false,
    },
    dmg: {
      ...(base.dmg ?? {}),
      sign: false,
    },
  }
}
