import {
  VibeConfig,
  type VibeConfigOptions,
  isPlainObject,
} from "@vibe-engineers/vibetools/_internal/vibe_config"

export const defaultGenerationInstruction =
  "You will be given: a function signature (name, parameters, and return type); " +
  "a docstring describing what the function is intended to do; " +
  "the concrete arguments passed to the function; and the declared return value type. " +
  "Your task is to: " +
  "(1) interpret the docstring to understand the intended behavior of the function, " +
  "(2) use the provided arguments to simulate what the function would logically produce, " +
  "(3) ensure your response strictly matches the declared return type, " +
  "both in structure and data type, and " +
  "(4) return only the value that fulfills the function’s contract, " +
  "with no explanations, commentary, or extra text."

/** Shared evaluation settings with the Python VibeGen system instruction. */
export class VibeGenConfig extends VibeConfig {
  constructor(options: VibeConfigOptions = {}) {
    if (!isPlainObject(options))
      throw new TypeError("VibeGenConfig options must be a plain object.")
    const { system_instruction = defaultGenerationInstruction, ...settings } = options
    super({ ...settings, system_instruction })
    if (new.target === VibeGenConfig) Object.freeze(this)
  }
}
