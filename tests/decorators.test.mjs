import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { VibeGen } from "@vibe-engineers/vibegen"
import OpenAI from "openai"
import ts from "typescript"

test("compiled standard decorators generate instance and static method results", async () => {
  const source = await readFile(new URL("./decorated-service.types.mts", import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  })
  const { serviceClass } = await import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
  )
  const requests = []
  const sdk = new OpenAI({ apiKey: "offline" })
  sdk.responses.create = async ({ input }) => {
    requests.push(input)
    return { output_text: requests.length === 1 ? "  cold  " : "9007199254740993" }
  }
  const Service = serviceClass(VibeGen(sdk, "selected-model"))
  assert.equal(await new Service().greet("hot"), "cold")
  assert.equal(await Service.total(9007199254740992n, 1n), 9007199254740993n)
  assert.match(requests[0], /Function Signature: greet\(\.\.\.args\)/)
  assert.match(requests[0], /Arguments: \('hot',\), \{\}/)
  assert.doesNotMatch(requests[0], /private receiver state/)
  assert.match(requests[1], /Docstring: Return the sum\./)
  assert.match(requests[1], /Arguments: \(9007199254740992n, 1n\)/)
})
