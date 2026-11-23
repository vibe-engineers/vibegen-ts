import type { MLCEngineInterface } from "@mlc-ai/web-llm"
import { VibeGen, type VibeGenFactory, type VibeGenerator } from "@vibe-engineers/vibegen"
import {
  VibeGen as fromSubpath,
  type VibeGenerator as SubpathGenerator,
} from "@vibe-engineers/vibegen/vibegen"

declare module "@vibe-engineers/vibegen" {
  interface VibeGenFactory {
    applicationLabel?: string
  }
}
declare module "@vibe-engineers/vibegen/vibegen" {
  interface VibeGenerator {
    applicationLabel?: string
  }
}

declare const engine: MLCEngineInterface
const factory: VibeGenFactory = VibeGen
const gen: VibeGenerator = factory(engine, "loaded-model")
const other: SubpathGenerator = fromSubpath(engine, "loaded-model")
export const factoryLabel: string | undefined = fromSubpath.applicationLabel
export const generatorLabel: string | undefined = VibeGen(engine, "loaded-model").applicationLabel
export const vendor: Promise<string> = gen.llm.client.getGPUVendor()
export const otherVendor: Promise<string> = other.llm.client.getGPUVendor()
const cloud = { responses: { create: async () => ({ output_text: "generated" }) } }
// @ts-expect-error The browser entry takes a local engine.
VibeGen(cloud, "model")
// @ts-expect-error The subpath selects the same browser entry.
fromSubpath(cloud, "model")
