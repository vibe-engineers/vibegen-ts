<p align="center">
  <img width="220" src="../assets/vibegen.png" alt="VibeGen logo" />
</p>
<h1 align="center">VibeGen Developer Guide</h1>

## Table of Contents

- [Introduction](#introduction)
- [Navigating this Developer Guide](#navigating-this-developer-guide)
- [Setup](#setup)
- [Project Structure](#project-structure)
- [Key Concepts & Design](#key-concepts--design)
- [Code Documentation](#code-documentation)
- [Testing](#testing)
- [Pull Requests](#pull-requests)
- [Final Notes](#final-notes)

## Introduction

VibeGen uses a function's description and arguments to generate its return value. The TypeScript package follows the Python decorator and uses the same default system instruction. Its only required runtime dependency, `@vibe-engineers/vibetools`, supplies the provider clients, response parsing, retries, deadlines, and logging. Install the SDK for the provider you use. [VibeGen README](../README.md) · [VibeTools](https://github.com/vibe-engineers/vibetools-ts)

## Navigating this Developer Guide

Run the commands from the root of the standalone VibeGen TypeScript repository. All paths in this guide are relative to that directory. [vibe-engineers/vibegen-ts](https://github.com/vibe-engineers/vibegen-ts)

## Setup

Use Node.js 22.13 or later. Once the locked VibeTools version is available on npm, install the dependencies and run the tests.

```sh
npm ci
npm test
```

Before VibeTools' first release, clone `vibe-engineers/vibetools-ts` alongside VibeGen and install its local tarball. These commands also install VibeGen's development tools. [VibeTools repository](https://github.com/vibe-engineers/vibetools-ts)

```sh
npm ci --prefix ../vibetools-ts
(cd ../vibetools-ts && npm pack)
npm install --no-save ../vibetools-ts/vibe-engineers-vibetools-0.1.0.tgz
npm test
```

For the first release, publish VibeTools before VibeGen. The VibeGen lockfile records the checksum of the candidate VibeTools archive. If the published archive differs, refresh its lockfile entry. Verify `npm ci`, `npm test`, and `npm run test:parity` against the published dependency before releasing VibeGen.

### Live examples

After building, copy `.env.template` to `.env`, set the key for one provider, and run its example. Each script makes three calls to generate sums and a product, following the Python examples. These calls use the provider account's normal billing and quota. [Environment template](../.env.template)

| Provider      | Environment variable | Command                                                     |
| ------------- | -------------------- | ----------------------------------------------------------- |
| Google Gemini | `GEMINI_API_KEY`     | `node --env-file-if-exists=.env examples/gemini_client.mjs` |
| OpenAI        | `OPENAI_API_KEY`     | `node --env-file-if-exists=.env examples/openai_client.mjs` |

### Installing the local packages

With both repositories set up as above, install their archives and your provider SDK together in the consuming application. Replace `/path/to/your-app` with its directory. The command below selects OpenAI. For Gemini, replace `"openai@^7.62.0"` with `"@google/genai@^3.6.1"`. Create the client with the same installed copy of the SDK that VibeTools resolves.

```sh
(cd ../vibetools-ts && npm pack)
npm pack
npm install --prefix /path/to/your-app \
  "$PWD/../vibetools-ts/vibe-engineers-vibetools-0.1.0.tgz" \
  "$PWD/vibe-engineers-vibegen-0.1.0.tgz" \
  "openai@^7.62.0"
```

## Project Structure

- _src/index.ts_ exports the public `VibeGen` factory.
- _src/vibegen.ts_ wraps functions and delegates generation to `VibeLlmClient`.
- _src/config/config.ts_ defines `VibeGenConfig` and its system instruction.
- _src/utils/logger.ts_ exposes VibeGen's `console_logger`.
- _src/utils/prompt.ts_ formats generation metadata and arguments for the provider.
- _tests/_ covers the public wrapper, TypeScript declarations, and compatibility with Python.
- _examples/_ demonstrates generating sums and a product with either SDK. [Gemini](../examples/gemini_client.mjs) · [OpenAI](../examples/openai_client.mjs)

## Key Concepts & Design

### VibeGen decorator

`VibeGen(client, model, config?)` returns a callable. Apply it to an ordinary function with `vg(fn)` or `vg()(fn)`, or supply metadata with `vg(options)(fn)` or `vg(fn, options)`. Calling the wrapper returns a promise for a generated value and skips the original function body, including default argument expressions. The underlying `VibeLlmClient` is available through `vg.llm`.

Library authors can export an initialized generator or a configured decorator and let TypeScript emit its declaration. For explicit annotations, import the types `VibeGenerator` and `GeneratorWrapper<T>` from `@vibe-engineers/vibegen`.

The wrapper preserves the parameters of single-signature stubs, including optional and rest parameters. For an overloaded function, TypeScript infers the last overload's parameter list. To retain multiple call shapes, declare a single signature with a union of argument tuples, such as `...args: [word: string] | [a: number, b: number]`. Decorated class methods keep their declared overloads. TypeScript checks the decorator against the implementation signature. Make sure every public overload allows the result that the runtime `return_type` produces.

For class methods, use standard TypeScript decorators with `experimentalDecorators` disabled or omitted. Methods can declare an explicit `this` parameter. Declare the method's promise return type to match the generated value. For a function stored in a class field, use the wrapper form when initializing the field. Bare `@vg` defaults to text. The following example assumes an initialized `vg`.

```ts
class Glossary {
  @vg({
    signature: "areAntonyms(left: string, right: string): boolean",
    docstring: "Return true if these words have opposite meanings.",
    return_type: Boolean,
  })
  async areAntonyms(_left: string, _right: string): Promise<boolean> {
    throw new Error("VibeGen supplies this method's result.")
  }
}

const opposites = await new Glossary().areAntonyms("hot", "cold")
```

### Configuration defaults

Pass configuration as the third argument to `VibeGen`. Omitting it or passing `null` selects `VibeGenConfig` defaults. A plain options object overrides those defaults. You can also pass an existing `VibeGenConfig` or shared `VibeConfig` instance with its own system instruction.

| Option               | Default                                  | Behavior                                                                                                                                                                            |
| -------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `system_instruction` | Python VibeGen's generation instructions | Asks the model to simulate the described function and return only a value of the requested type. Set `null` to clear it.                                                            |
| `timeout`            | `10_000`                                 | Total milliseconds the caller waits for one generation, including VibeTools' retries. An in-flight request may still settle after the deadline.                                     |
| `vibe_mode`          | `"chill"`                                | Case-insensitive. `CHILL` allows one evaluation attempt, `EAGER` two, and `AGGRESSIVE` three. VibeTools waits one second between attempts. The SDK's own retry policy also applies. |

For example, use an existing `client` and `model` to allow two attempts within a five-second deadline.

```ts
import { VibeGen } from "@vibe-engineers/vibegen"
import { VibeGenConfig } from "@vibe-engineers/vibegen/config/config"

const config = new VibeGenConfig({ vibe_mode: "EAGER", timeout: 5_000 })
const vg = VibeGen(client, model, config)
```

### Prompt fidelity & type enforcement

Python reads signatures, annotations, and docstrings from the function. In TypeScript, give `signature` the full signature you want the model to see, including the name. A supplied signature is sent verbatim. If omitted, VibeGen displays the function name with `(...args)` and includes a return-type hint when one is supplied. `docstring` provides the behavioral contract. Omitting it leaves Python's `None` marker in the prompt. Write annotations and comments into these options when the model needs them.

VibeGen formats arguments in positional order using Node's inspection syntax. A single argument gets a trailing comma, as in Python. Objects passed to a function occupy one positional argument and the Python keyword-argument field is `{}`. A method's `this` is separate from its arguments. Pass relevant instance data explicitly if the model needs it.

### Return types

The `return_type` option selects both the runtime parser and the inferred type of the awaited result. The text in `signature` is for the model. For example, a signature that says `bigint` still needs `return_type: BigInt` to produce a `bigint`. To annotate reusable options, import the type `GenerationOptions` from `@vibe-engineers/vibegen/vibegen`. Use `GenerationOptions<typeof BigInt>` for integer results.

| `return_type`                                                     | Awaited TypeScript type   | Use                                             |
| ----------------------------------------------------------------- | ------------------------- | ----------------------------------------------- |
| Omitted or `String`                                               | `string`                  | Text                                            |
| `Boolean`                                                         | `boolean`                 | True/false replies                              |
| `Number`                                                          | `number`                  | Floating-point numbers                          |
| `BigInt`                                                          | `bigint`                  | Exact integers, corresponding to Python's `int` |
| `Array`                                                           | `unknown[]`               | A JSON array                                    |
| `Object`                                                          | `Record<string, unknown>` | A JSON object                                   |
| A synchronous `{ parse(value) }` or a class with a static `parse` | Parser's return type      | Validate nested data and return a domain value  |

`Array` and `Object` check the outer container. In arrays, objects, and schema inputs, an unquoted integer outside JavaScript's safe range arrives as an exact `bigint`. When serializing these values with `JSON.stringify`, supply a replacer or convert them to the format your consumer expects.

For a structured return value, describe its JSON shape for the model and validate the decoded value with a synchronous parser. A compatible Zod schema also works if your application already uses Zod. VibeGen itself requires no schema library. This example uses the previously initialized `vg`.

```ts
const wordResult = {
  parse(value: unknown): { word: string } {
    if (
      typeof value !== "object" ||
      value === null ||
      !("word" in value) ||
      typeof value.word !== "string"
    ) {
      throw new TypeError("Expected a JSON object with a string word.")
    }
    return { word: value.word }
  },
}

const getAntonym = vg({
  signature: "getAntonym(word: string): { word: string }",
  docstring: "Return a JSON object with the antonym under the key 'word'.",
  return_type: wordResult,
})(function getAntonym(_word: string) {})

const { word } = await getAntonym("hot")
```

When the provider call or parsing fails after the configured attempts, the promise rejects with an `Error`. Its `cause` contains the shared `VibeLlmApiException` or `VibeResponseParseException`. A deadline expiry raises `VibeTimeoutException` directly. Import these exception classes from `@vibe-engineers/vibetools`.

### Logging

Set `VIBE_LOG_LEVEL` before starting Node. The default is `ERROR`. `INFO` includes provider selection and evaluation failures. `DEBUG` includes the prompt, supplied arguments, and raw model response. Import `console_logger` from `@vibe-engineers/vibegen/utils/logger` to access the package logger.

### Testing boundaries

The automated suites use in-memory replies for OpenAI and Gemini and run without credentials. The standalone examples make authenticated provider requests. [Live examples](#live-examples)

## Code Documentation

Document public types with TypeScript signatures and use JSDoc for behavior the type system cannot convey. Keep generation metadata explicit when documenting a function that applications will wrap.

## Testing

Run `npm run lint` and `npm test`. The test command builds VibeGen, checks its public declarations with `strictNullChecks` both enabled and disabled, and runs the Node tests. Run `npm pack --dry-run` to inspect the files that npm will ship.

To compare against Python, activate a Python environment and run the commands below. When using `VIBE_PYTHON` instead of activating the environment, install the requirements with that interpreter. The combined checkout uses the sibling Python sources when present.

```sh
python -m pip install -r tests/parity/requirements.txt
npm run test:parity
```

## Pull Requests

Start a branch in your fork and keep each change focused. Describe the affected API, behavior before and after the change, and checks you ran. Update examples or documentation alongside user-visible changes. [Contribution guide](../CONTRIBUTING.md)

## Final Notes

Discuss larger changes with the maintainers before implementation. Documentation corrections can go directly into a pull request. [Community Discord](https://discord.gg/dBW35GBCPZ)
