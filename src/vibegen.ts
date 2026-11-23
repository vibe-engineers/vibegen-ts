import {
  type SharedClient,
  VibeLlmClient,
  usesLocalEngine,
} from "@vibe-engineers/vibetools/_internal/vibe_llm_client"
import type { WebLlmEngine, WebLlmWrapper } from "@vibe-engineers/vibetools/llms/webllm_wrapper"
import {
  type Config,
  type VibeGenerator,
  createGenerator,
  generationSettings,
} from "./generator.js"
import { console_logger } from "./utils/logger.js"
import { localGenerator } from "./webllm.js"

export type { GenerationOptions, GeneratorWrapper, VibeGenerator } from "./generator.js"

type Client = SharedClient | WebLlmEngine
type GeneratorFor<C extends Client> = unknown extends C
  ? VibeGenerator
  : C extends SharedClient
    ? VibeGenerator
    : VibeGenerator<WebLlmWrapper>

export interface VibeGenFactory {
  <C extends Client>(client: C, model: string, config?: Config): GeneratorFor<C>
  // Keep the hosted evaluator in ReturnType<typeof VibeGen> for existing consumers.
  (client: SharedClient, model: string, config?: Config): VibeGenerator
}

/** Generate function results with an OpenAI or Google GenAI client, or a local WebLLM engine. */
export const VibeGen = ((client: Client, model: string, config?: Config) => {
  const settings = generationSettings(config)
  if (usesLocalEngine(client)) return localGenerator(client, model, settings)
  return createGenerator(new VibeLlmClient(client, model, settings, console_logger))
}) as VibeGenFactory
