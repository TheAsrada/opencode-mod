import type { Configuration } from "electron-builder"

import baseConfig from "./electron-builder.config"

// Unsigned mod distribution config. Wraps the base per-channel config object
// (the base file default-exports the evaluated object, NOT a function) and
// disables everything that requires paid/third-party credentials:
// - mac notarization + dmg signing (no Apple Developer account)
// - (Windows Azure signing is already a graceful no-op without env config)
const base = baseConfig as unknown as Configuration

const mod: Configuration = {
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

export default mod
