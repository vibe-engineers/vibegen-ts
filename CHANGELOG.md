# Changelog

## 0.1.1

- Added local function and method generation with WebLLM main-thread and Web Worker engines through both public VibeGen imports.
- Added examples to the default local generation prompt for text, numeric, and structured results. Generated functions retry or reject incomplete WebLLM replies according to their configuration.
- WebLLM now constrains structured replies using native JSON Schemas. Object and array results use their declared container type. Synchronous parsers receive any decoded JSON value and enforce application-specific requirements.

## 0.1.0

- Ported Python VibeGen's function generation, default system instruction, and configurable evaluation through VibeTools.
- Added public callable types so consuming libraries can export configured instances in their TypeScript declarations.
- Added promise-returning function wrappers and standard decorators for promise-returning class methods, including methods with an explicit `this` parameter. Runtime metadata supplies the signature, docstring, and return validator.
- Added OpenAI and Google Gemini examples and offline tests comparing generation with Python.
