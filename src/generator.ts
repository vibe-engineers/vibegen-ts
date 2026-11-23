import { readProperty } from "@vibe-engineers/vibetools/_internal/prompt"
import {
  VibeConfig,
  type VibeConfigOptions,
  isPlainObject,
} from "@vibe-engineers/vibetools/_internal/vibe_config"
import type { VibeLlmClient } from "@vibe-engineers/vibetools/_internal/vibe_llm_client"
import type {
  Evaluated,
  ReturnTypeSpec,
  SynchronousSpec,
} from "@vibe-engineers/vibetools/llms/return_type"
import type { VibeBaseLlm } from "@vibe-engineers/vibetools/llms/vibe_base_llm"
import { VibeGenConfig } from "./config/config.js"
import { cleanDocstring, generationPrompt, returnTypeLabel } from "./utils/prompt.js"

interface Description {
  /** Complete signature as it should appear in the prompt, including the function name. */
  signature?: string
  /** Natural-language description of what the function should do. */
  docstring?: string | null
}

type TypedOptions<S extends ReturnTypeSpec> = Description & { return_type: S & SynchronousSpec<S> }
type OptionalOptions<S extends ReturnTypeSpec> = Description & {
  return_type?: S & SynchronousSpec<S>
}

/** Metadata available at runtime. A non-text result requires an explicit response type. */
export type GenerationOptions<S extends ReturnTypeSpec = null | undefined> =
  // Checking for a union member also works when strictNullChecks is disabled.
  [Extract<S, undefined>] extends [never] ? TypedOptions<S> : OptionalOptions<S>

type RuntimeOptions = Description & { return_type?: ReturnTypeSpec }
type Operation<This, Args extends unknown[], R = unknown> = (this: This, ...args: Args) => R
type Generated<This, Args extends unknown[], T> = Operation<This, Args, Promise<T>>
type MethodContext = Pick<ClassMethodDecoratorContext, "kind" | "addInitializer">

export interface GeneratorWrapper<T> {
  <This, Args extends unknown[]>(
    stub: Operation<This, Args>,
    context?: undefined,
  ): Generated<This, Args, T>
  <This, Args extends unknown[]>(
    stub: Operation<This, Args, Promise<unknown>>,
    context: MethodContext,
  ): Generated<This, Args, T>
}

/** The configured generator wraps a stub or decorates a promise-returning method. */
export interface VibeGenerator<Evaluator = VibeLlmClient> {
  <This, Args extends unknown[], S extends ReturnTypeSpec>(
    stub: Operation<This, Args>,
    options: TypedOptions<S>,
  ): Generated<This, Args, Evaluated<S>>
  <This, Args extends unknown[], S extends ReturnTypeSpec = undefined>(
    stub: Operation<This, Args>,
    options?: OptionalOptions<S> | OptionalOptions<null | undefined>,
  ): Generated<This, Args, string | Evaluated<S>>
  <This, Args extends unknown[]>(
    stub: Operation<This, Args, Promise<unknown>>,
    context: MethodContext,
  ): Generated<This, Args, string>
  <S extends ReturnTypeSpec>(
    options: TypedOptions<S>,
    context?: undefined,
  ): GeneratorWrapper<Evaluated<S>>
  <S extends ReturnTypeSpec = undefined>(
    options?: OptionalOptions<S> | OptionalOptions<null | undefined>,
    context?: undefined,
  ): GeneratorWrapper<string | Evaluated<S>>
  llm: Evaluator
}

function generationOptions(options: RuntimeOptions = {}) {
  if (!isPlainObject(options)) throw new TypeError("Generation options must be a plain object.")
  for (const key of Object.keys(options)) {
    if (key !== "signature" && key !== "docstring" && key !== "return_type") {
      throw new TypeError(`Unexpected generation option: ${key}`)
    }
  }
  const { signature, docstring, return_type }: RuntimeOptions = options
  if (signature !== undefined && typeof signature !== "string")
    throw new TypeError("signature must be a string.")
  if (docstring != null && typeof docstring !== "string")
    throw new TypeError("docstring must be a string.")
  return {
    signature,
    docstring: docstring == null ? "None" : cleanDocstring(docstring),
    label: returnTypeLabel(return_type),
    return_type: return_type ?? String,
  }
}

export type Config = VibeConfig | VibeConfigOptions | null

export function generationSettings(config?: Config): VibeConfig {
  return config instanceof VibeConfig ? config : new VibeGenConfig(config ?? {})
}

export function createGenerator<Evaluator extends VibeBaseLlm>(
  llm: Evaluator,
): VibeGenerator<Evaluator> {
  function withOptions(options?: RuntimeOptions) {
    const { signature, docstring, label, return_type } = generationOptions(options)
    return function wrap<This, Args extends unknown[]>(
      stub: Operation<This, Args>,
      context?: MethodContext,
    ): Generated<This, Args, unknown> {
      if (typeof stub !== "function" || (context !== undefined && context?.kind !== "method")) {
        throw new TypeError("VibeGen wraps functions and decorates methods.")
      }
      const originalName = readProperty(stub, "name")
      const name = typeof originalName === "string" ? originalName : ""
      const length = readProperty(stub, "length")
      const display = signature ?? `${name || "<anonymous>"}(...args)${label ? ` -> ${label}` : ""}`
      async function generated(this: This, ...args: Args) {
        return gen.llm.vibe_eval(generationPrompt(display, docstring, args), return_type)
      }
      Object.defineProperties(generated, {
        name: { value: name, configurable: true },
        length: { value: typeof length === "number" ? length : 0, configurable: true },
      })
      return generated
    }
  }

  function gen<This, Args extends unknown[]>(
    arg?: Operation<This, Args> | RuntimeOptions,
    second?: RuntimeOptions | MethodContext,
  ) {
    if (second && typeof second === "object" && "kind" in second && "addInitializer" in second) {
      if (
        typeof arg !== "function" ||
        typeof second.addInitializer !== "function" ||
        second.kind !== "method"
      ) {
        throw new TypeError("VibeGen decorates methods.")
      }
      return withOptions()(arg)
    }
    if (typeof arg === "function") return withOptions(second)(arg)
    if (second !== undefined)
      throw new TypeError("Expected a function before the generation options.")
    return withOptions(arg)
  }
  gen.llm = llm
  return gen as VibeGenerator<Evaluator>
}
