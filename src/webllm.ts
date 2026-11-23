import type { VibeConfig } from "@vibe-engineers/vibetools/_internal/vibe_config"
import type { ReturnTypeSpec } from "@vibe-engineers/vibetools/llms/return_type"
import { type WebLlmEngine, WebLlmWrapper } from "@vibe-engineers/vibetools/llms/webllm_wrapper"
import { defaultGenerationInstruction } from "./config/config.js"
import { createGenerator, type VibeGenerator } from "./generator.js"
import { console_logger } from "./utils/logger.js"
import { generationPrompt } from "./utils/prompt.js"

const examples = [
  [
    generationPrompt("upper(word: string) -> string", "Return the input in capital letters.", [
      "sky",
    ]),
    "SKY",
  ],
  [generationPrompt("triple(n: number) -> number", "Return the input times three.", [4]), "12"],
  [
    generationPrompt(
      "wrap(value: string) -> JSON",
      'Return a JSON object with a field named "value" containing the input.',
      ["lime"],
    ),
    '{"value":"lime"}',
  ],
] as const

class GenerationLlm extends WebLlmWrapper {
  protected override responseFormat(returnType?: ReturnTypeSpec) {
    if (
      returnType == null ||
      returnType === String ||
      returnType === Boolean ||
      returnType === Number ||
      returnType === BigInt
    ) {
      return super.responseFormat(returnType)
    }
    // A synchronous parser can accept any JSON value, including a scalar.
    let schema = "{}"
    if (returnType === Object) schema = '{"type":"object","additionalProperties":true}'
    else if (returnType === Array) schema = '{"type":"array","items":{}}'
    return { type: "json_object" as const, schema }
  }

  protected override examplesFor(returnType?: ReturnTypeSpec) {
    return returnType != null && this.config.system_instruction === defaultGenerationInstruction
      ? examples
      : []
  }

  protected override requiresCompleteResponse(returnType?: ReturnTypeSpec): boolean {
    return returnType != null
  }
}

export function localGenerator(
  engine: WebLlmEngine,
  model: string,
  settings: VibeConfig,
): VibeGenerator<WebLlmWrapper> {
  return createGenerator(new GenerationLlm(engine, model, settings, console_logger))
}
