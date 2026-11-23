<p align="center">
  <img width="300" src="assets/vibegen.png" alt="VibeGen logo" />
</p>
<h1 align="center">VibeGen</h1>

<p align="center">
  <a href="https://github.com/vibe-engineers/vibegen-ts/actions/workflows/ci.yml"><img src="https://github.com/vibe-engineers/vibegen-ts/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@vibe-engineers/vibegen"><img src="https://img.shields.io/npm/v/@vibe-engineers/vibegen" alt="npm version" /></a>
  <a href="https://github.com/vibe-engineers/vibegen-ts/blob/main/package.json"><img src="https://img.shields.io/badge/node-%3E%3D22.13.0-43853d" alt="Node.js 22.13 or later" /></a>
  <a href="https://github.com/vibe-engineers/vibegen-ts/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
  <a href="https://www.npmjs.com/package/@vibe-engineers/vibegen"><img src="https://img.shields.io/npm/dm/@vibe-engineers/vibegen" alt="Monthly npm downloads" /></a>
</p>

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Technologies](#technologies)
- [Team](#team)
- [Contributing](#contributing)
- [Others](#others)

### Introduction

**VibeGen** is a lightweight TypeScript package that lets you describe a function in natural language and ask an LLM for its return value. Wrap a function, describe what it should do, and call it with the usual arguments. VibeGen sends its signature, docstring, and arguments to OpenAI or Google Gemini. The function body is skipped.

This example asks Gemini for the antonym of a word. Set `GEMINI_API_KEY` to run it.

```ts
import { GoogleGenAI } from "@google/genai"
import { VibeGen } from "@vibe-engineers/vibegen"

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) throw new Error("Set GEMINI_API_KEY to run this example.")
const client = new GoogleGenAI({ apiKey })
const vg = VibeGen(client, "gemini-3.1-flash-lite")

const getAntonym = vg({
  signature: "getAntonym(word: string): string",
  docstring: "Return the antonym of the given word. For example, the antonym of 'hot' is 'cold'.",
})(function getAntonym(_word: string) {})

const word = process.argv[2] ?? "hot"
const antonym = await getAntonym(word)
console.log(`The antonym of ${word} is ${antonym}.`)
```

Text is the default return type. For other results, pass a runtime `return_type` such as `Boolean`, `BigInt`, or a schema with a synchronous `parse` method. TypeScript erases type annotations during compilation, so VibeGen accepts the function's signature and docstring as options.

Once the first npm release is available, install VibeGen and the SDK for your provider.

```sh
# Google Gemini
npm install @vibe-engineers/vibegen "@google/genai@^3.6.1"

# OpenAI
npm install @vibe-engineers/vibegen "openai@^7.62.0"
```

For setup from source, live examples, and class method decorators, see the [Developer Guide](docs/DeveloperGuide.md).

### Features

- **Function mocking.** Call a function stub and await a generated result.
- **Natural language implementation.** Describe the intended behavior with a docstring. Include a full signature to give the model parameter names and types.
- **Multi-provider support.** Use the same wrapper with OpenAI or Google Gemini.
- **Type enforcement.** Use built-in return types for simple values or supply a synchronous parser for structured output. [Return types](docs/DeveloperGuide.md#return-types)

### Technologies

##### Done with

<p align="center">
  <img height="150" width="150" src="https://www.typescriptlang.org/branding/ts-logo-128.svg" alt="TypeScript logo" />
</p>
<p align="center">TypeScript on Node.js 22.13 or later</p>

##### Project Repository

[vibe-engineers/vibegen-ts](https://github.com/vibe-engineers/vibegen-ts) · [Python implementation](https://github.com/vibe-engineers/vibegen)

### Team

- [Kong Le-Yi](https://github.com/konglyyy)
- [Tan Jin](https://github.com/tjtanjin)

### Contributing

To contribute to VibeGen, fork the repository and open a pull request describing the change and how you tested it. The repository includes issue and pull request templates. [Developer Guide](docs/DeveloperGuide.md) · [Contributing](CONTRIBUTING.md)

For bugs or suggestions, open an issue or discuss it with the team on Discord. [GitHub issues](https://github.com/vibe-engineers/vibegen-ts/issues) · [Community Discord](https://discord.gg/dBW35GBCPZ)

### Others

For implementation questions, reach the team on Discord. To report a vulnerability privately, follow the security policy. [Community Discord](https://discord.gg/dBW35GBCPZ) · [Security policy](SECURITY.md)
