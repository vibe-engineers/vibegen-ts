"""Run the original generator with real Python annotations and scripted SDK replies."""

import inspect
import json
import sys
from dataclasses import asdict, dataclass, is_dataclass
from pathlib import Path
from types import SimpleNamespace
from typing import TypedDict
from unittest.mock import Mock, patch

# Use the working copies in the combined workspace and the pinned packages in
# a standalone checkout.
repository = Path(__file__).resolve().parents[2]
python_packages = repository.parent.parent / "python"
sources = [python_packages / name / "src" for name in ("vibegen", "vibetools")]
if all(source.is_dir() for source in sources):
    sys.path[:0] = [str(source) for source in sources]

from google import genai
from openai import OpenAI
from vibegen import VibeGen
from vibegen.config.config import VibeGenConfig


class Person(TypedDict):
    name: str
    identifier: int


@dataclass
class Point:
    x: float
    y: float


def unexpected_body():
    raise AssertionError("The generator executed a function body")


def invent():
    unexpected_body()


def greet(name: str = "world") -> str:
    """Return a greeting."""
    unexpected_body()


# Pass the raw docstring to TypeScript. The Python version's inspect.getdoc
# supplies the reference cleaning behavior, even on versions that optimize away
# indentation in source-level docstrings.
greet.__doc__ = "\n\tReturn a greeting.\n\t\n\t    Include the recipient’s name.\n\t"


def literal_doc():
    unexpected_body()


literal_doc.__doc__ = "First\r\tNext\n  second"


def add_numbers(a: int, b: int) -> int:
    """Return the sum."""
    unexpected_body()


def probability(sample: str) -> float:
    """Estimate the probability."""
    unexpected_body()


def is_positive(value: float) -> bool:
    """Test the sign."""
    unexpected_body()


def items(*tags: str) -> list:
    unexpected_body()


def fields() -> dict:
    unexpected_body()


def scores() -> list[int]:
    unexpected_body()


def person() -> Person:
    unexpected_body()


def point() -> Point:
    unexpected_body()


def salutation(*, name: str, formal: bool = False) -> str:
    """Greet the recipient in the requested style."""
    unexpected_body()


def empty_doc():
    unexpected_body()


empty_doc.__doc__ = ""

TARGETS = {
    fn.__name__: fn
    for fn in (
        invent, greet, literal_doc, add_numbers, probability, is_positive, items,
        fields, scores, person, point, salutation, empty_doc,
    )
}


def wire_value(value):
    """Carry integers across the JSON test protocol without IEEE-754 rounding."""
    if isinstance(value, int) and abs(value) > 2**53 - 1:
        return {"integer": str(value)}
    if is_dataclass(value):
        value = asdict(value)
    if isinstance(value, list):
        return [wire_value(item) for item in value]
    if isinstance(value, dict):
        return {key: wire_value(item) for key, item in value.items()}
    return value


def run_case(provider, case):
    target = TARGETS[case["target"]]
    events = []
    replies = iter(case["replies"])

    def answer(model, instruction, prompt):
        events.append(["consult", model, instruction, prompt])
        reply = next(replies)
        if reply is None:
            raise RuntimeError("offline provider failure")
        return reply

    if provider == "openai":
        def create(*, model, instructions, input):
            return SimpleNamespace(output_text=answer(model, instructions, input))

        sdk = Mock(spec=OpenAI)
        sdk.responses = SimpleNamespace(create=create)
    else:
        def generate_content(*, model, contents, config):
            return SimpleNamespace(text=answer(model, config["system_instruction"], contents))

        sdk = Mock(spec=genai.Client)
        sdk.models = SimpleNamespace(generate_content=generate_content)

    config = case.get("config")
    if case.get("config_instance"):
        config = VibeGenConfig(**config)
    wrapped = VibeGen(sdk, "offline-model", config=config)(target)
    outcomes = []
    with patch("time.sleep", side_effect=lambda seconds: events.append(["wait", seconds])):
        for args in case.get("calls", [[]]):
            try:
                value = wrapped(*args, **case.get("kwargs", {}))
            except AssertionError:
                raise
            except Exception as error:
                cause = error.__cause__
                outcomes.append({"error": type(cause or error).__name__, "wrapped": cause is not None})
            else:
                # BigInt is the explicit TS counterpart of a Python int, including
                # integers inside JavaScript's safe range. Inside JSON containers
                # only out-of-range integral literals become bigint.
                result = {"integer": str(value)} if target is add_numbers else wire_value(value)
                outcomes.append({"value": result})
    return {"events": events, "outcomes": outcomes}


if __name__ == "__main__":
    cases = json.load(sys.stdin)
    # TS accepts this runtime metadata explicitly. Deriving it from the original
    # fixture keeps the signature spelling exact across Python versions.
    contracts = {
        name: {"signature": name + str(inspect.signature(fn)), "docstring": fn.__doc__}
        for name, fn in TARGETS.items()
    }
    with patch("socket.socket.connect", side_effect=AssertionError("Unexpected network transport")):
        outcomes = {
            provider: [run_case(provider, case) for case in cases]
            for provider in ("openai", "gemini")
        }
    print(json.dumps({"contracts": contracts, "results": outcomes}, allow_nan=False))
