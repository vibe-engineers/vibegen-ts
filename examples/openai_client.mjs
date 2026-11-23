import { VibeGen } from "@vibe-engineers/vibegen"
import OpenAI from "openai"

const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) throw new Error("Set OPENAI_API_KEY to run this example.")
const client = new OpenAI({ apiKey })
const vg = VibeGen(client, "gpt-5.6-luna")

const addNumbers = vg({
  signature: "addNumbers(a: bigint, b: bigint): bigint",
  docstring: "Add the two integers and return their sum in decimal.",
  return_type: BigInt,
})(function addNumbers(_a, _b) {})

const multiplyNumbers = vg({
  signature: "multiplyNumbers(a: bigint, b: bigint): bigint",
  docstring: "Multiply the two integers and return their product in decimal.",
  return_type: BigInt,
})(function multiplyNumbers(_a, _b) {})

console.log(await addNumbers(3n, 7n))
console.log(await addNumbers(3n, 7231n))
console.log(await multiplyNumbers(3n, 7n))
