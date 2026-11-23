import type { GoogleGenAI } from "@google/genai"
import { VibeGen, type VibeGenerator } from "@vibe-engineers/vibegen"
import { VibeGenConfig } from "@vibe-engineers/vibegen/config/config"
import type { GenerationOptions } from "@vibe-engineers/vibegen/vibegen"
import { VibeConfig } from "@vibe-engineers/vibetools"
import type { SharedClient, VibeLlmClient } from "@vibe-engineers/vibetools/_internal"
import type { WebLlmEngine, WebLlmWrapper } from "@vibe-engineers/vibetools/llms/webllm_wrapper"
import type OpenAI from "openai"

declare const openai: OpenAI
declare const gemini: GoogleGenAI
declare function expectType<T>(value: T): void

declare module "@vibe-engineers/vibegen/vibegen" {
  interface VibeGenerator {
    applicationLabel?: string
  }
  interface GeneratorWrapper<T> {
    applicationDefault?: T
  }
}

export const gen = VibeGen(openai, "model")
export function hostedGenerator<C extends SharedClient>(client: C): VibeGenerator {
  return VibeGen(client, "model")
}
expectType<string | undefined>(gen.applicationLabel)
const hosted: VibeGenerator = gen
expectType<VibeLlmClient>(hosted.llm)
declare const overlap: OpenAI & WebLlmEngine
expectType<VibeLlmClient>(VibeGen(overlap, "model").llm)
declare const anyProvider: SharedClient | WebLlmEngine
expectType<VibeLlmClient | WebLlmWrapper>(VibeGen(anyProvider, "model").llm)
declare const previous: ReturnType<typeof VibeGen>
expectType<VibeLlmClient>(previous.llm)
declare const untyped: ReturnType<typeof JSON.parse>
expectType<VibeLlmClient>(VibeGen(untyped, "model").llm)
export const alternateFactory = VibeGen
export const factories = { gen: VibeGen }
gen.llm = VibeGen(gemini, "model", new VibeGenConfig()).llm
VibeGen(openai, "model", { system_instruction: null, timeout: 100, vibe_mode: "eager" })
VibeGen(openai, "model", null)
VibeGen(gemini, "model", new VibeConfig())

function find(id: number, suffix = "", ...labels: string[]): void {
  throw new Error([id, suffix, ...labels].join())
}
export const generateNumber = gen({ return_type: Number })
expectType<number | undefined>(generateNumber.applicationDefault)
export const text = gen(find)
expectType<Promise<string>>(text(1))
expectType<Promise<string>>(gen()(find)(1, undefined, "blue"))
expectType<Promise<string>>(gen({ docstring: "Look up an id" })(find)(1, "x", "s", "t"))
expectType<Promise<string>>(gen(find, { return_type: null })(1))
const options: GenerationOptions<typeof BigInt> = { return_type: BigInt, signature: "find(id)" }
expectType<Promise<bigint>>(gen(find, options)(8))
expectType<Promise<bigint>>(gen(options)(find)(8))
expectType<Promise<number>>(gen({ return_type: Number })(find)(1))
expectType<Promise<unknown[]>>(gen(find, { return_type: Array })(1))
expectType<Promise<Record<string, unknown>>>(gen({ return_type: Object })(find)(1))
expectType<Promise<boolean>>(gen(find, { return_type: Boolean })(1))
expectType<Promise<string>>(gen(find, { return_type: String })(1))
declare const dynamicType: typeof Number | typeof String
expectType<Promise<string | number>>(gen(find, { return_type: dynamicType })(1))
declare const optionalType: GenerationOptions<typeof Number> | GenerationOptions
expectType<Promise<number | string>>(gen(find, optionalType)(1))
expectType<Promise<number | string>>(gen(optionalType)(find)(1))
declare const optionalField: { docstring: string; return_type?: typeof Boolean }
expectType<Promise<boolean | string>>(gen(find, optionalField)(1))
// @ts-expect-error Absent descriptors can produce text.
expectType<Promise<boolean>>(gen(optionalField)(find)(1))

class User {
  constructor(public name: string) {}
  static parse(value: unknown) {
    if (typeof value !== "string") throw new TypeError("Expected a name")
    return new User(value)
  }
}
const user = gen({ return_type: User })(find)
expectType<Promise<User>>(user(8))
const count = {
  parse(value: unknown) {
    return Array.isArray(value) ? value.length : 0
  },
}
expectType<Promise<number>>(gen(find, { return_type: count })(5))
function withReceiver(this: { id: number }, name: string) {
  return this.id + name
}
const method = gen(withReceiver)
expectType<Promise<string>>(method.call({ id: 1 }, "a"))
// @ts-expect-error Original parameters are required.
text()
// @ts-expect-error Positional and rest types are preserved.
text(1, "suffix", 7)
// @ts-expect-error An explicit receiver is preserved.
method("x")
// @ts-expect-error Generated values are asynchronous.
expectType<string>(text(1))
// @ts-expect-error A typed options variable must actually provide a runtime descriptor.
const _missing: GenerationOptions<typeof Number> = { signature: "find(id)" }
const asyncSchema = {
  async parse(_value: unknown) {
    return 1
  },
}
// @ts-expect-error Async schema parsers do not match the shared synchronous contract.
gen(find, { return_type: asyncSchema })
// @ts-expect-error The curried overload also rejects async schema parsers.
gen({ return_type: asyncSchema })
// @ts-expect-error A generator supports the same runtime response types as VibeTools.
gen({ return_type: Map })
// @ts-expect-error Text metadata must be a string.
gen(find, { docstring: 1 })
// @ts-expect-error Per-function metadata belongs on the wrapper.
VibeGen(openai, "model", { signature: "find()" })
// @ts-expect-error Call the factory without new.
new VibeGen(openai, "model")

class Service {
  @gen
  async text(): Promise<string> {
    throw new Error()
  }
  @gen({ return_type: Number })
  static async number(id: string): Promise<number> {
    throw new Error(id)
  }
  @gen({ return_type: Number })
  async wider(): Promise<number | null> {
    throw new Error()
  }
  @gen
  async detached(this: void, id: number): Promise<string> {
    throw new Error(String(id))
  }
  // @ts-expect-error Bare decoration generates text.
  @gen
  async wrongDefault(): Promise<number> {
    throw new Error()
  }
  // @ts-expect-error Declared result must accept the actual generated value.
  @gen({ return_type: Boolean })
  async wrongResult(): Promise<string> {
    throw new Error()
  }
  // @ts-expect-error Native decorated methods have asynchronous results.
  @gen
  sync(): string {
    return "x"
  }
  // @ts-expect-error Sync void methods must also reject decoration.
  @gen()
  syncVoid(): void {}
  // @ts-expect-error Decorators only target methods.
  @gen
  field = 1
  // @ts-expect-error An async function stored in a field is not a method.
  @gen
  handler = async (word: string) => word
  // @ts-expect-error Configured decorators also require a method.
  @gen({ return_type: String })
  configuredHandler = async (word: string) => word
}
expectType<Promise<string>>(new Service().text())
expectType<Promise<number>>(Service.number("1"))
const detached = new Service().detached
expectType<Promise<string>>(detached(1))
