import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { VibeGen } from "@vibe-engineers/vibegen"
import { VibeGenConfig } from "@vibe-engineers/vibegen/config/config"
import { VibeGen as fromSubpath } from "@vibe-engineers/vibegen/vibegen"
import { VibeResponseParseException, VibeTimeoutException } from "@vibe-engineers/vibetools"

function engine(create) {
  return { getGPUVendor: async () => "offline", chat: { completions: { create } } }
}

function reply(content, finish_reason = "stop") {
  return { choices: [{ message: { content }, finish_reason }] }
}

test("the stock local generation prompt demonstrates text, numeric and JSON results", async () => {
  const requests = []
  const sdk = engine(async ({ messages, response_format }) => {
    assert.equal(response_format, undefined)
    requests.push(messages)
    return reply("done")
  })
  const gen = VibeGen(sdk, "local")
  assert.equal(await gen(function describe(_word) {})("brief"), "done")
  const messages = requests[0]
  assert.deepEqual(
    messages.map(({ role }) => role),
    ["system", "user", "assistant", "user", "assistant", "user", "assistant", "user"],
  )
  const examples = [
    ["upper(word: string) -> string", "Return the input in capital letters.", "sky", "SKY"],
    ["triple(n: number) -> number", "Return the input times three.", "4", "12"],
    [
      "wrap(value: string) -> JSON",
      'Return a JSON object with a field named "value" containing the input.',
      "lime",
      '{"value":"lime"}',
    ],
  ]
  for (const [index, [signature, docstring, argument, result]] of examples.entries()) {
    const prompt = messages[1 + index * 2].content
    assert.ok(prompt.includes(`Function Signature: ${signature}`))
    assert.ok(prompt.includes(`Docstring: ${docstring}`))
    assert.ok(prompt.split("Arguments: ")[1].includes(argument))
    assert.equal(messages[2 + index * 2].content, result)
  }
  assert.match(messages.at(-1).content, /Function Signature: describe[\s\S]*brief/)
  assert.equal(await gen.llm.vibe_eval("raw input"), "done")
  assert.deepEqual(requests[1], [
    { role: "system", content: new VibeGenConfig().system_instruction },
    { role: "user", content: "raw input" },
  ])
})

test("a local generator sends its function contract and parses the result with its schema", async () => {
  const requests = []
  const sdk = engine(async (request) => {
    requests.push(request)
    return reply('{"count":9007199254740993}')
  })
  const config = new VibeGenConfig({ system_instruction: "Return JSON." })
  const gen = VibeGen(sdk, "loaded-model", config)
  const count = gen({
    signature: "count(seed: bigint): bigint",
    docstring: "Return a JSON object with the count.",
    return_type: {
      parse(value) {
        assert.equal(typeof value.count, "bigint")
        return value.count
      },
    },
  })(function count(_seed) {
    assert.fail("stub ran")
  })

  assert.equal(await count(43n), 9007199254740993n)
  assert.equal(gen.llm.config, config)
  assert.equal(gen.llm.client, sdk)
  assert.deepEqual(requests, [
    {
      model: "loaded-model",
      messages: [
        { role: "system", content: "Return JSON." },
        {
          role: "user",
          content:
            "\n            Function Signature: count(seed: bigint): bigint" +
            "\n            Docstring: Return a JSON object with the count." +
            "\n            Arguments: (43n,), {}\n            ",
        },
      ],
      stream: false,
      response_format: { type: "json_object", schema: "{}" },
    },
  ])
})

test("local return types request their WebLLM format and preserve exact integers", async () => {
  const big = 9007199254740993n
  const cases = [
    [
      Object,
      '{"count":9007199254740993}',
      { count: big },
      { type: "json_object", schema: '{"type":"object","additionalProperties":true}' },
    ],
    [
      Array,
      "[9007199254740993]",
      [big],
      { type: "json_object", schema: '{"type":"array","items":{}}' },
    ],
    [Boolean, "True", true, { type: "grammar", grammar: 'root ::= "True" | "False"' }],
    [Number, "3.5", 3.5, undefined],
    [BigInt, "9007199254740993", big, undefined],
    [String, "word", "word", undefined],
  ]
  for (const [return_type, content, expected, format] of cases) {
    const gen = VibeGen(
      engine(async (request) => {
        assert.deepEqual(request.response_format, format)
        assert.equal("temperature" in request, false)
        // Engine-side changes to one request must not affect the next generation.
        if (request.response_format) request.response_format.schema = "changed"
        return reply(content)
      }),
      "loaded-model",
    )
    const generate = gen(() => {}, { return_type })
    assert.deepEqual(await generate(), expected)
    assert.deepEqual(await generate(), expected)
  }
})

test("a class validator accepts any JSON root and checks the decoded value once per attempt", async () => {
  let attempts = 0
  let validations = 0
  class ExactCount {
    constructor(value) {
      this.value = value
    }
    static parse(value) {
      validations++
      if (typeof value !== "bigint") throw new TypeError("Expected an exact integer.")
      return new ExactCount(value)
    }
  }
  const gen = VibeGen(
    engine(async ({ response_format }) => {
      assert.deepEqual(response_format, { type: "json_object", schema: "{}" })
      assert.equal(validations, attempts)
      return reply(++attempts === 1 ? "9007199254740993" : '"wrong"')
    }),
    "loaded-model",
  )
  const generate = gen({ return_type: ExactCount })(() => {})
  assert.deepEqual(await generate(), new ExactCount(9007199254740993n))
  await assert.rejects(generate(), (error) => {
    assert.ok(error.cause instanceof VibeResponseParseException)
    assert.equal(error.cause.cause.message, "Expected an exact integer.")
    return true
  })
  assert.equal(validations, 2)
})

test("an existing wrapper uses the replacement local evaluator for typed generation", async () => {
  const gen = fromSubpath(
    engine(async () => reply("False")),
    "first",
  )
  const decide = gen(function decide(_statement) {}, { return_type: Boolean })
  assert.equal(await decide("once"), false)
  gen.llm = VibeGen(
    engine(async ({ model, messages, response_format }) => {
      assert.equal(model, "second")
      assert.deepEqual(
        messages.map(({ role }) => role),
        ["user"],
      )
      assert.match(messages[0].content, /Arguments: \(["']again["'],\), \{\}/)
      assert.equal(response_format.type, "grammar")
      return reply("True")
    }),
    "second",
    { system_instruction: null },
  ).llm
  assert.equal(await decide("again"), true)
})

test("typed local generation rejects truncated replies and obeys the configured deadline", async () => {
  const gen = VibeGen(
    engine(async () => reply("12", "length")),
    "model",
  )
  await assert.rejects(gen(() => {}, { return_type: Number })(), (error) => {
    assert.ok(error.cause instanceof VibeResponseParseException)
    return true
  })
  const slow = VibeGen(
    engine(() => new Promise(() => {})),
    "model",
    { timeout: 20 },
  )
  await assert.rejects(slow(() => {})(), VibeTimeoutException)
})

test("generated text requires a complete reply while untyped raw calls can read partial text", async () => {
  for (const reason of ["length", "abort"]) {
    const gen = VibeGen(
      engine(async () => reply("mid-word", reason)),
      "model",
    )
    for (const generate of [gen(() => {}), gen({ return_type: String })(() => {})]) {
      await assert.rejects(generate(), (error) => error.cause instanceof VibeResponseParseException)
    }
    assert.equal(await gen.llm.vibe_eval("raw"), "mid-word")
  }
})

test("generated empty text requires an actual text choice", async () => {
  for (const completion of [{ choices: [] }, reply(null)]) {
    const gen = VibeGen(engine(async () => completion), "local")
    await assert.rejects(gen(() => {})(), (e) => e.cause instanceof VibeResponseParseException)
    assert.equal(await gen.llm.vibe_eval("raw"), "")
  }
  const gen = VibeGen(engine(async () => reply("")), "local")
  assert.equal(await gen(() => {})(), "")
})

test("both browser entries generate values without Node globals, built-ins, or provider SDK imports", () => {
  const loader = `
    import { isBuiltin } from "node:module"
    const sdks = ["openai", "@google/genai", "@mlc-ai/web-llm", "@typesafe-ai/sdk"]
    export function resolve(specifier, context, next) {
      if (isBuiltin(specifier) || sdks.some(pkg => specifier === pkg || specifier.startsWith(pkg + "/"))) {
        throw Error("Browser imported " + specifier)
      }
      return next(specifier, context)
    }
  `
  const program = `
    import assert from "node:assert/strict"
    import { register } from "node:module"
    // Node's lazy implementation of browser globals needs Buffer during its own startup.
    const headers = new Headers({ "x-region": "north" })
    const form = new FormData()
    form.append("tag", "brief")
    register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(loader)}`)}, import.meta.url)
    globalThis.process = undefined
    globalThis.Buffer = undefined
    const { VibeGen } = await import("@vibe-engineers/vibegen")
    const { VibeGen: subpath } = await import("@vibe-engineers/vibegen/vibegen")
    const { VibeGenConfig } = await import("@vibe-engineers/vibegen/config/config")
    const { console_logger } = await import("@vibe-engineers/vibegen/utils/logger")
    let getterReads = 0
    const arg = { id: 43n, headers, form, get hidden() { getterReads++; return "private" } }
    arg.self = arg
    for (const factory of [VibeGen, subpath]) {
      const sdk = { getGPUVendor: async () => "offline", chat: { completions: {
        create: async ({ messages }) => {
          assert.equal(messages[0].content, new VibeGenConfig().system_instruction)
          assert.match(messages.at(-1).content, /Function Signature: describe/)
          assert.match(messages.at(-1).content, /43n/)
          assert.match(messages.at(-1).content, /"x-region": "north"/)
          assert.match(messages.at(-1).content, /"tag": "brief"/)
          assert.ok(messages.at(-1).content.includes("[Getter]"))
          assert.ok(messages.at(-1).content.includes("[Circular]"))
          return { choices: [{ message: { content: "  described  " } }] }
        },
      } } }
      const gen = factory(sdk, "local")
      assert.equal(gen.llm.logger, console_logger)
      assert.equal(await gen(function describe(_value) { assert.fail("stub ran") })(arg), "described")
      assert.equal(getterReads, 0)
      assert.throws(() => factory({ chat: sdk.chat }, "local"), { name: "VibeLlmClientException" })
    }
  `
  const child = spawnSync(
    process.execPath,
    ["--conditions=browser", "--input-type=module", "-e", program],
    {
      cwd: new URL(".", import.meta.url),
      encoding: "utf8",
    },
  )
  assert.equal(child.status, 0, child.stderr)
})
