import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { GoogleGenAI } from "@google/genai"
import { VibeGen } from "@vibe-engineers/vibegen"
import { VibeGenConfig } from "@vibe-engineers/vibegen/config/config"
import OpenAI from "openai"

const cases = [
  { name: "no annotations or docstring", target: "invent", replies: ['  {"text":1}  '] },
  { name: "explicitly empty docstring", target: "empty_doc", replies: [""] },
  {
    name: "literal carriage return before a tab in a docstring",
    target: "literal_doc",
    replies: ["ok"],
  },
  {
    name: "one wrapper, default parameter, multiline docstring, and Unicode argument",
    target: "greet",
    calls: [[], ["Zoë 🐕"]],
    replies: ["Hello, world!", "  Bonjour, Zoë!  "],
  },
  {
    name: "two positional arguments, unquoted and quoted integers",
    target: "add_numbers",
    calls: [
      [3, 7],
      [-4, 2],
    ],
    replies: ["10", '"-2"'],
  },
  {
    name: "integer beyond binary64 precision",
    target: "add_numbers",
    calls: [[4503599627370496, 4503599627370497]],
    replies: ["9007199254740993"],
  },
  { name: "invalid integer", target: "add_numbers", calls: [[1, 2]], replies: ["2.5"] },
  {
    name: "decimal and exponent",
    target: "probability",
    calls: [["sample"]],
    replies: ["1.25e-2"],
  },
  { name: "invalid float", target: "probability", calls: [["sample"]], replies: ["unknown"] },
  { name: "quoted false", target: "is_positive", calls: [[-2]], replies: ['"NO"'] },
  { name: "invalid boolean", target: "is_positive", calls: [[1]], replies: ["unknown"] },
  {
    name: "variadic positional arguments and nested list",
    target: "items",
    calls: [["one", "two", "three"]],
    replies: ['[1, {"name":"三","present":true}, null]'],
  },
  {
    name: "structured numbers on both sides of the safe integer range",
    target: "fields",
    replies: [
      '{"safe":9007199254740991,"high":[9007199254740993],"low":-9007199254740992,"quoted":"9007199254740993"}',
    ],
  },
  { name: "malformed JSON", target: "items", replies: ["[1,]"] },
  { name: "wrong outer collection", target: "fields", replies: ["[]"] },
  {
    name: "typed list with unquoted small and large integers",
    target: "scores",
    replies: ["[1,-9007199254740993]"],
  },
  { name: "typed list with an invalid member", target: "scores", replies: ['[1,"2"]'] },
  {
    name: "TypedDict-compatible schema drops extraneous fields and reads an exact integer",
    target: "person",
    replies: ['{"extra":true,"identifier":900719925474099312345,"name":"Milo"}'],
  },
  { name: "TypedDict missing required field", target: "person", replies: ['{"name":"Milo"}'] },
  {
    name: "TypedDict invalid field type",
    target: "person",
    replies: ['{"name":4,"identifier":3}'],
  },
  {
    name: "dataclass-compatible constructor",
    target: "point",
    replies: ['{"x":3.5,"y":-4.1,"unused":2}'],
  },
  { name: "dataclass missing required field", target: "point", replies: ['{"x":3.5}'] },
  {
    name: "plain configuration with a custom instruction",
    target: "invent",
    config: { system_instruction: "Answer in Malay." },
    replies: ["Selamat pagi"],
  },
  {
    name: "explicit null instruction on a configuration instance",
    target: "greet",
    config: { system_instruction: null },
    config_instance: true,
    replies: ["Hi!"],
  },
  { name: "provider failure", target: "invent", replies: [null] },
  {
    name: "eager parse retry",
    target: "add_numbers",
    calls: [[5, 9]],
    config: { vibe_mode: "EAGER" },
    replies: ["invalid", "14"],
  },
  {
    name: "aggressive provider and parse retries",
    target: "fields",
    config: { vibe_mode: "aggressive" },
    replies: [null, "not JSON", '{"ok":true}'],
  },
  {
    name: "aggressive exhaustion returns the final provider error",
    target: "items",
    config: { vibe_mode: "AGGRESSIVE" },
    replies: ["{}", null, null],
  },
  {
    name: "separate calls receive fresh retry budgets",
    target: "is_positive",
    calls: [[-1], [1]],
    config: { vibe_mode: "eager" },
    replies: ["maybe", "n", null, "y"],
  },
  {
    name: "Python keywords and a JavaScript positional options object",
    target: "salutation",
    kwargs: { name: "Milo", formal: true },
    replies: ["Good morning, Milo."],
  },
]

const person = {
  parse(value) {
    if (
      typeof value?.name !== "string" ||
      !(typeof value.identifier === "bigint" || Number.isInteger(value.identifier))
    ) {
      throw new TypeError("Expected a name and an integer identifier")
    }
    return { name: value.name, identifier: value.identifier }
  },
}

class Point {
  constructor(x, y) {
    this.x = x
    this.y = y
  }

  static parse(value) {
    if (!value || !Object.hasOwn(value, "x") || !Object.hasOwn(value, "y")) {
      throw new TypeError("Expected x and y")
    }
    return new Point(value.x, value.y)
  }
}

const returnTypes = {
  greet: String,
  add_numbers: BigInt,
  probability: Number,
  is_positive: Boolean,
  items: Array,
  fields: Object,
  scores: {
    parse(value) {
      if (
        !Array.isArray(value) ||
        !value.every((item) => typeof item === "bigint" || Number.isInteger(item))
      ) {
        throw new TypeError("Expected an array of integers")
      }
      return value
    },
  },
  person,
  point: Point,
  salutation: String,
}

function wireValue(value) {
  if (typeof value === "bigint") return { integer: String(value) }
  if (Array.isArray(value)) return value.map(wireValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, wireValue(item)]))
  }
  return value
}

function sdkFor(provider, answer, offline) {
  if (provider === "openai") {
    const sdk = new OpenAI({ apiKey: "offline", fetch: offline, maxRetries: 0 })
    sdk.responses.create = async ({ model, instructions, input }) => ({
      output_text: answer(model, instructions, input),
    })
    return sdk
  }
  const sdk = new GoogleGenAI({ apiKey: "offline" })
  sdk.models.generateContent = async ({ model, config, contents }) => ({
    text: answer(model, config.systemInstruction ?? null, contents),
  })
  return sdk
}

async function runCase(provider, scenario, contract, events, offline) {
  let nextReply = 0
  const sdk = sdkFor(
    provider,
    (model, instruction, prompt) => {
      events.push(["consult", model, instruction, prompt])
      const reply = scenario.replies[nextReply++]
      if (reply === null) throw new Error("offline provider failure")
      return reply
    },
    offline,
  )

  const config = scenario.config_instance ? new VibeGenConfig(scenario.config) : scenario.config
  const generate = VibeGen(sdk, "offline-model", config)
  const options = { signature: contract.signature }
  if (contract.docstring !== null) options.docstring = contract.docstring
  if (scenario.target in returnTypes) options.return_type = returnTypes[scenario.target]
  let executions = 0
  const wrapped = generate(options)(() => {
    executions++
    throw new Error("The generator executed the stub")
  })

  const outcomes = []
  for (const args of scenario.calls ?? [[]]) {
    let value
    try {
      value = await wrapped(...(scenario.kwargs ? [...args, scenario.kwargs] : args))
    } catch (error) {
      outcomes.push({ error: (error.cause ?? error).name, wrapped: error.cause !== undefined })
      continue
    }
    if (scenario.target === "point") assert.ok(value instanceof Point)
    outcomes.push({ value: wireValue(value) })
  }
  assert.equal(executions, 0, "stub executed")
  assert.equal(nextReply, scenario.replies.length, "unexpected provider call count")
  return { outcomes, events }
}

test("both providers match Python generation, prompts, converted results and errors", async (t) => {
  const python = process.env.VIBE_PYTHON ?? (process.platform === "win32" ? "python" : "python3")
  const reference = spawnSync(
    python,
    ["-B", fileURLToPath(new URL("./python_reference.py", import.meta.url))],
    { input: JSON.stringify(cases), encoding: "utf8", timeout: 60_000 },
  )
  assert.equal(reference.status, 0, reference.error?.message ?? reference.stderr)
  const { contracts, results } = JSON.parse(reference.stdout)
  const offline = () => {
    throw new Error("Unexpected network transport")
  }
  t.mock.method(globalThis, "fetch", offline)
  let events
  const originalTimer = globalThis.setTimeout
  t.mock.method(globalThis, "setTimeout", (callback, delay, ...args) => {
    if (delay === 1000) {
      events.push(["wait", 1])
      return originalTimer(callback, 0, ...args)
    }
    return originalTimer(callback, delay, ...args)
  })
  for (const provider of ["openai", "gemini"]) {
    assert.equal(results[provider].length, cases.length)
    for (const [index, scenario] of cases.entries()) {
      events = []
      const actual = await runCase(provider, scenario, contracts[scenario.target], events, offline)
      const expected = results[provider][index]
      if (scenario.kwargs) {
        // These are the exact language-native formats for this one fixture.
        const pythonArgs = "Arguments: (), {'name': 'Milo', 'formal': True}"
        const tsArgs = "Arguments: ({ name: 'Milo', formal: true },), {}"
        assert.ok(expected.events[0][3].includes(pythonArgs))
        expected.events[0][3] = expected.events[0][3].replace(pythonArgs, tsArgs)
      }
      assert.deepEqual(actual, expected, `${provider}, ${scenario.name}`)
    }
  }
  t.diagnostic(`${cases.length * 2} cross-language comparisons`)
})
