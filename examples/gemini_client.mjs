import { GoogleGenAI } from "@google/genai"
import { VibeGen } from "@vibe-engineers/vibegen"

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) throw new Error("Set GEMINI_API_KEY to run this example.")
const client = new GoogleGenAI({ apiKey })
const vg = VibeGen(client, "gemini-3.1-flash-lite")

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
