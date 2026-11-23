import type { CreateMLCEngine, CreateWebWorkerMLCEngine } from "@mlc-ai/web-llm"
import { VibeGen } from "@vibe-engineers/vibegen"
import { VibeGenConfig } from "@vibe-engineers/vibegen/config/config"
import { VibeGen as fromSubpath, type GenerationOptions } from "@vibe-engineers/vibegen/vibegen"

declare const engine: Awaited<ReturnType<typeof CreateMLCEngine>>
declare const worker: Awaited<ReturnType<typeof CreateWebWorkerMLCEngine>>

export const local = VibeGen(engine, "loaded-model", { timeout: 30_000 })
const workerFactory = fromSubpath<typeof worker>
export const inWorker = workerFactory(worker, "loaded-model", new VibeGenConfig())
local.llm = inWorker.llm
export const vendor: Promise<string> = local.llm.client.getGPUVendor()

const options: GenerationOptions<typeof BigInt> = { return_type: BigInt, docstring: "Add one." }
const next = local(options)(function next(_number: bigint) {})
export const total: Promise<bigint> = next(10n)
// @ts-expect-error Wrapped calls preserve the parameter type.
next("ten")

export class Glossary {
  @inWorker
  async define(_word: string): Promise<string> {
    throw new Error()
  }
}
