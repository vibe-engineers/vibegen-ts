import assert from "node:assert/strict"
import test from "node:test"
import { inspect } from "node:util"
import { VibeGen } from "@vibe-engineers/vibegen"
import { VibeGenConfig } from "@vibe-engineers/vibegen/config/config"
import { console_logger } from "@vibe-engineers/vibegen/utils/logger"
import {
  VibeConfig,
  VibeLlmClientException,
  VibeResponseParseException,
  VibeTimeoutException,
} from "@vibe-engineers/vibetools"
import OpenAI from "openai"

const client = () => new OpenAI({ apiKey: "offline" })

function recordingGen() {
  const gen = VibeGen(client(), "model")
  const calls = []
  gen.llm.vibe_eval = async (...args) => {
    calls.push(args)
    return "generated"
  }
  return { gen, calls }
}

test("one evaluation receives the original prompt layout, cleaned docstring, and runtime type", async () => {
  const { gen, calls } = recordingGen()
  const generated = gen({
    signature: "add_numbers(a: int, b: int) -> int",
    docstring: "\n\tReturn the sum.\n\t\tInclude both numbers.\n\t",
    return_type: BigInt,
  })(function add_numbers(_a, _b) {
    assert.fail("stub ran")
  })
  assert.equal(await generated(3, 7), "generated")
  assert.deepEqual(calls, [
    [
      "\n            Function Signature: add_numbers(a: int, b: int) -> int" +
        "\n            Docstring: Return the sum.\n        Include both numbers." +
        "\n            Arguments: (3, 7), {}\n            ",
      BigInt,
    ],
  ])
})

test("bare and empty-option calls default to text and never execute the body or its defaults", async (t) => {
  const { gen, calls } = recordingGen()
  const defaultValue = t.mock.fn(() => true)
  function answer(_x = defaultValue()) {
    assert.fail("stub ran")
  }
  for (const wrapped of [gen(answer), gen()(answer), gen(answer, {})]) {
    assert.equal(await wrapped(), "generated")
  }
  assert.equal(defaultValue.mock.callCount(), 0)
  assert.deepEqual(
    calls,
    Array(3).fill([
      "\n            Function Signature: answer(...args)\n            Docstring: None" +
        "\n            Arguments: (), {}\n            ",
      String,
    ]),
  )
  await gen(answer, { signature: "answer()", docstring: "", return_type: null })("o'clock")
  assert.deepEqual(calls.at(-1), [
    "\n            Function Signature: answer()\n            Docstring: " +
      '\n            Arguments: ("o\'clock",), {}\n            ',
    String,
  ])
})

test("fallback signatures describe built-in results and explicit signatures are used verbatim", async () => {
  const { gen, calls } = recordingGen()
  function lookup() {}
  for (const [return_type, label] of [
    [String, "string"],
    [Boolean, "boolean"],
    [Number, "number"],
    [BigInt, "bigint"],
    [Array, "Array"],
    [Object, "Object"],
    [{ parse: (value) => value }, "JSON"],
  ]) {
    await gen(lookup, { return_type })()
    assert.ok(calls.at(-1)[0].includes(`Function Signature: lookup(...args) -> ${label}\n`))
    assert.equal(calls.at(-1)[1], return_type)
  }
  await gen(() => {})()
  assert.match(calls.at(-1)[0], /Function Signature: <anonymous>\(\.\.\.args\)/)
  await gen(lookup, { signature: "lookup(x: string): Id", return_type: Object })("a")
  assert.match(calls.at(-1)[0], /Function Signature: lookup\(x: string\): Id\n/)
})

test("positional arguments are inspected with ordinary property getters and custom inspectors disabled", async () => {
  const { gen, calls } = recordingGen()
  const arg = {
    id: 9007199254740993n,
    get hidden() {
      throw new Error("getter ran")
    },
    [inspect.custom]() {
      assert.fail("custom inspect ran")
    },
  }
  arg.circular = arg
  const wrapped = gen(function read(_item) {
    throw new Error("stub ran")
  })
  assert.equal(wrapped.name, "read")
  assert.equal(wrapped.length, 1)
  await wrapped.call({ secretReceiver: true }, arg)
  const prompt = calls[0][0]
  assert.match(prompt, /id: 9007199254740993n/)
  assert.match(prompt, /hidden: \[Getter\]/)
  assert.match(prompt, /\[Circular \*1\]/)
  assert.doesNotMatch(prompt, /secretReceiver/)
  assert.ok(prompt.endsWith(",), {}\n            "))
})

test("separate generated functions consult the current client and keep overlapping calls independent", async () => {
  const { gen, calls } = recordingGen()
  const a = gen({ signature: "a(id)", return_type: Number })(() => {})
  const b = gen({ signature: "b(id)" })(() => {})
  gen.llm = VibeGen(client(), "new-model").llm
  const pending = []
  gen.llm.vibe_eval = (prompt, type) =>
    new Promise((resolve) => pending.push({ prompt, type, resolve }))
  const first = a(1)
  const second = b(2)
  assert.match(pending[0].prompt, /Function Signature: a\(id\)[\s\S]*Arguments: \(1,\)/)
  assert.match(pending[1].prompt, /Function Signature: b\(id\)[\s\S]*Arguments: \(2,\)/)
  assert.deepEqual(
    pending.map(({ type }) => type),
    [Number, String],
  )
  pending[1].resolve("two")
  pending[0].resolve(1)
  assert.deepEqual(await Promise.all([first, second]), [1, "two"])
  assert.deepEqual(calls, [])
})

test("configuration and logger match the Python defaults, overrides and existing config instances", () => {
  for (const value of [undefined, null, {}]) {
    const { llm } = VibeGen(client(), "chosen-model", value)
    assert.ok(llm.config instanceof VibeGenConfig)
    assert.equal(llm.llm.config, llm.config)
    assert.equal(llm.logger, console_logger)
    assert.equal(console_logger.name, "VibeGen")
    assert.equal(llm.config.vibe_mode, "chill")
    assert.equal(llm.config.timeout, 10_000)
    assert.ok(Object.isFrozen(llm.config))
    assert.match(
      llm.config.system_instruction,
      /only the value that fulfills the function’s contract/,
    )
  }
  for (const instruction of [null, "", "Return a single word."]) {
    const options = { system_instruction: instruction, timeout: 150, vibe_mode: "eager" }
    const { llm } = VibeGen(client(), "model", options)
    assert.equal(llm.config.system_instruction, instruction)
    assert.equal(llm.config.vibe_mode, "eager")
    assert.equal(llm.config.timeout, 150)
  }
  for (const config of [new VibeGenConfig(), new VibeConfig()]) {
    assert.equal(VibeGen(client(), "model", config).llm.config, config)
  }
  assert.throws(() => VibeGen({}, "model"), VibeLlmClientException)
  assert.throws(() => VibeGen(client(), "model", { unexpected: 2 }), /configuration key/)
})

test("a system instruction getter is read once when creating the generator", () => {
  let reads = 0
  const gen = VibeGen(client(), "model", {
    get system_instruction() {
      return `Instruction ${++reads}`
    },
  })
  assert.equal(gen.llm.config.system_instruction, "Instruction 1")
  assert.equal(reads, 1)
})

test("invalid options or decorator targets fail at setup", () => {
  const { gen, calls } = recordingGen()
  for (const options of [
    null,
    3,
    [],
    { remarks: "other package" },
    { signature: 1 },
    { docstring: false },
    { return_type: {} },
    { return_type: Map },
  ]) {
    assert.throws(() => gen(options), TypeError)
  }
  assert.throws(() => gen({})("missing function"), TypeError)
  assert.throws(() => gen({}, {}), TypeError)
  for (const kind of ["field", "getter", "setter", "class"]) {
    const context = { kind, addInitializer() {} }
    assert.throws(() => gen(() => {}, context), /method/)
    assert.throws(() => gen({})(() => {}, context), /method/)
  }
  assert.deepEqual(calls, [])
})

test("generated calls surface shared timeouts and evaluator failures as rejected promises", async () => {
  const sdk = client()
  sdk.responses.create = () => new Promise(() => {})
  const gen = VibeGen(sdk, "model", { timeout: 15 })
  const generated = gen(() => {})
  await assert.rejects(generated(), VibeTimeoutException)
  const cause = new Error("custom evaluator failure")
  gen.llm.vibe_eval = () => {
    throw cause
  }
  await assert.rejects(generated(), (error) => error === cause)
})

test("a JavaScript caller returning a promise from parse gets the shared response parse error", async () => {
  const sdk = client()
  sdk.responses.create = async () => ({ output_text: '{"word":"cold"}' })
  const gen = VibeGen(sdk, "model")
  const result = gen(() => {}, {
    return_type: {
      async parse() {
        throw new Error("async validator")
      },
    },
  })
  await assert.rejects(result(), (error) => {
    assert.ok(error.cause instanceof VibeResponseParseException)
    assert.ok(error.cause.cause instanceof TypeError)
    assert.match(error.cause.cause.message, /synchronously/)
    return true
  })
})
