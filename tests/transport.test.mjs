import assert from "node:assert/strict"
import test from "node:test"
import { GoogleGenAI } from "@google/genai"
import { VibeGen } from "@vibe-engineers/vibegen"
import OpenAI from "openai"

for (const provider of ["OpenAI", "Gemini"]) {
  test(`${provider} SDK serializes a generation request and parses the response with an application schema`, async (t) => {
    const reply = '{"id":9007199254740993,"name":"Milo"}'
    let request
    const fetch = t.mock.method(globalThis, "fetch", async (input, init) => {
      request = new Request(input, init)
      return Response.json(
        provider === "OpenAI"
          ? {
              object: "response",
              output: [
                {
                  type: "message",
                  role: "assistant",
                  status: "completed",
                  content: [{ type: "output_text", text: reply, annotations: [] }],
                },
              ],
            }
          : {
              candidates: [
                { content: { role: "model", parts: [{ text: reply }] }, finishReason: "STOP" },
              ],
            },
      )
    })
    const sdk =
      provider === "OpenAI"
        ? new OpenAI({
            apiKey: "offline",
            baseURL: "https://openai.invalid/v1",
            maxRetries: 0,
            fetch,
          })
        : new GoogleGenAI({
            apiKey: "offline",
            httpOptions: { baseUrl: "https://gemini.invalid", retryOptions: { attempts: 1 } },
          })
    const gen = VibeGen(sdk, "selected-model", { system_instruction: "Return a record." })
    class Person {
      constructor(id, name) {
        this.id = id
        this.name = name
      }
      static parse(value) {
        assert.equal(typeof value.id, "bigint")
        assert.equal(typeof value.name, "string")
        return new Person(value.id, value.name)
      }
    }
    const find = gen(
      function find(_name) {
        assert.fail("stub ran")
      },
      {
        signature: "find(name: string): Person",
        docstring: "Return the id and name.",
        return_type: Person,
      },
    )
    assert.deepEqual(await find("Milo"), new Person(9007199254740993n, "Milo"))
    assert.equal(fetch.mock.callCount(), 1)
    assert.equal(request.method, "POST")
    const body = await request.json()
    const prompt =
      "\n            Function Signature: find(name: string): Person" +
      "\n            Docstring: Return the id and name.\n            Arguments: ('Milo',), {}\n            "
    if (provider === "OpenAI") {
      assert.equal(request.url, "https://openai.invalid/v1/responses")
      assert.equal(body.model, "selected-model")
      assert.equal(body.instructions, "Return a record.")
      assert.equal(body.input, prompt)
    } else {
      const endpoint = new URL(request.url)
      assert.equal(endpoint.hostname, "gemini.invalid")
      assert.ok(endpoint.pathname.endsWith("/models/selected-model:generateContent"))
      assert.deepEqual(body.systemInstruction.parts, [{ text: "Return a record." }])
      assert.equal(body.contents[0].parts[0].text, prompt)
    }
  })
}
