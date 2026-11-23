# Changelog

## Unreleased (0.1.0)

- Ported Python VibeGen's function generation, default system instruction, and configurable evaluation through VibeTools.
- Added public callable types so consuming libraries can export configured instances in their TypeScript declarations.
- Added promise-returning function wrappers and standard decorators for promise-returning class methods, including methods with an explicit `this` parameter. Runtime metadata supplies the signature, docstring, and return validator.
- Added OpenAI and Google Gemini examples and offline tests comparing generation with Python.
