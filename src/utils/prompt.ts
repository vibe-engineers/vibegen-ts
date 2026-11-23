import { formatPositionalArgs } from "@vibe-engineers/vibetools/_internal/prompt"
import type { ReturnTypeSpec } from "@vibe-engineers/vibetools/llms/return_type"

function expandTabs(line: string): string {
  if (!line.includes("\t")) return line
  let result = ""
  let column = 0
  for (const character of line) {
    if (character === "\t") {
      const spaces = 8 - (column % 8)
      result += " ".repeat(spaces)
      column += spaces
    } else {
      result += character
      column = character === "\r" ? 0 : column + 1
    }
  }
  return result
}

/** Apply inspect.getdoc's indentation rules to an explicit multiline description. */
export function cleanDocstring(text: string): string {
  const [first = "", ...rest] = text.split("\n").map(expandTabs)
  let margin = Infinity
  for (const line of rest) {
    const indent = line.search(/[^ ]/)
    if (indent >= 0) margin = Math.min(margin, indent)
  }
  const body = Number.isFinite(margin) ? rest.map((line) => line.slice(margin)) : rest
  const lines = [first.replace(/^ +/, ""), ...body]
  const start = lines.findIndex((line) => line.length > 0)
  if (start === -1) return ""
  let end = lines.length
  while (lines[end - 1] === "") end--
  return lines.slice(start, end).join("\n")
}

/** The fallback signature can describe runtime types, but a parser's JSON shape is opaque. */
export function returnTypeLabel(type: ReturnTypeSpec): string | undefined {
  if (type == null) return undefined
  if (type === String) return "string"
  if (type === Number) return "number"
  if (type === Boolean) return "boolean"
  if (type === BigInt) return "bigint"
  if (type === Array) return "Array"
  if (type === Object) return "Object"
  if (
    (typeof type === "object" || typeof type === "function") &&
    "parse" in type &&
    typeof type.parse === "function"
  )
    return "JSON"
  throw new TypeError("return_type must be a supported constructor or a schema with parse(value).")
}

export function generationPrompt(
  signature: string,
  docstring: string,
  args: readonly unknown[],
): string {
  return (
    `\n            Function Signature: ${signature}` +
    `\n            Docstring: ${docstring}` +
    `\n            Arguments: ${formatPositionalArgs(args)}, {}\n            `
  )
}
