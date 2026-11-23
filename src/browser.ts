import { VibeLlmClientException } from "@vibe-engineers/vibetools"
import {
  type WebLlmEngine,
  type WebLlmWrapper,
  isWebLlmEngine,
} from "@vibe-engineers/vibetools/llms/webllm_wrapper"
import { type Config, type VibeGenerator as Generator, generationSettings } from "./generator.js"
import { localGenerator } from "./webllm.js"

export type { GenerationOptions, GeneratorWrapper } from "./generator.js"
export interface VibeGenerator<Evaluator = WebLlmWrapper> extends Generator<Evaluator> {}
export interface VibeGenFactory {
  // biome-ignore lint/style/useShorthandFunctionType: Consumers can augment the public factory interface.
  <Engine extends WebLlmEngine>(engine: Engine, model: string, config?: Config): VibeGenerator
}

/** Generate function results with an engine initialized by the browser application. */
export const VibeGen: VibeGenFactory = (engine, model, config) => {
  if (!isWebLlmEngine(engine)) {
    throw new VibeLlmClientException("A browser VibeGen requires a WebLLM engine.")
  }
  return localGenerator(engine, model, generationSettings(config))
}
