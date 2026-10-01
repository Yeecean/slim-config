import json5
import os
import re


REASONING_LEVELS = {
    "none": "无推理",
    "low": "低推理",
    "default": "默认推理",
    "high": "高推理",
    "max": "最大推理",
}

_REASONING_PATTERNS = [
    (re.compile(r"-none$"), "none"),
    (re.compile(r"-max$"), "max"),
    (re.compile(r"-highspeed$"), "high"),
    (re.compile(r"-high$"), "high"),
    (re.compile(r"-mini$"), "low"),
    (re.compile(r"-lite$"), "low"),
    (re.compile(r"-pro$"), "high"),
    (re.compile(r"-preview$"), "high"),
    (re.compile(r"-thinking$"), "max"),
    (re.compile(r"-reasoner"), "max"),
    (re.compile(r"-R1"), "max"),
    (re.compile(r"-Z1"), "max"),
    (re.compile(r"^deepseek-reasoner"), "max"),
    (re.compile(r"^o\d"), "max"),
    (re.compile(r"^o\d-mini"), "high"),
]

_VISION_PATTERNS = [
    re.compile(r"claude-sonnet-5"),
    re.compile(r"claude-opus-4"),
    re.compile(r"gpt-5"),
    re.compile(r"gemini-3"),
    re.compile(r"gemini-2"),
    re.compile(r"kimi-k2"),
    re.compile(r"doubao-seed.*code"),
    re.compile(r"doubao-seed-2\.0-pro"),
    re.compile(r"-image$"),
    re.compile(r"-vision$"),
    re.compile(r"-vl-\d"),
    re.compile(r"minimax-m3"),
    re.compile(r"qwen3\.5"),
    re.compile(r"-omni"),
    re.compile(r"ark-code"),
]

_VARIANT_SUFFIXES = ["-none", "-max", "-high", "-highspeed", "-mini", "-pro", "-lite", "-preview", "-thinking"]


def _raw_model_id(full_id):
    if "/" in full_id:
        return full_id.split("/", 1)[-1]
    return full_id


def _strip_variant_suffix(model_id):
    base = model_id
    for sfx in sorted(_VARIANT_SUFFIXES, key=len, reverse=True):
        if base.endswith(sfx):
            base = base[: -len(sfx)]
            break
    return base


def detect_reasoning(model_id):
    raw = _raw_model_id(model_id)
    for pattern, level in _REASONING_PATTERNS:
        if pattern.search(raw) or pattern.search(model_id):
            return level
    return "default"


def detect_vision(model_id):
    raw = _raw_model_id(model_id)
    for pattern in _VISION_PATTERNS:
        if pattern.search(raw) or pattern.search(model_id):
            return True
    return False


def _load_opencode(config_dir):
    path = os.path.join(config_dir, "opencode.jsonc")
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json5.load(f)


def get_variants(model_id, config_dir):
    raw = _raw_model_id(model_id)
    base = _strip_variant_suffix(raw)
    data = _load_opencode(config_dir)

    variants = []
    for provider in data.get("provider", {}).values():
        models = provider.get("models", {})
        for mid in models:
            if mid == base or _strip_variant_suffix(mid) == base:
                vsfx = ""
                for sfx in sorted(_VARIANT_SUFFIXES, key=len, reverse=True):
                    if mid.endswith(sfx):
                        vsfx = sfx
                        break
                level = detect_reasoning(mid)
                variants.append({
                    "model_id": mid,
                    "suffix": vsfx,
                    "reasoning": level,
                    "reasoning_label": REASONING_LEVELS.get(level, level),
                })

    variants.sort(key=lambda v: list(REASONING_LEVELS.keys()).index(v["reasoning"])
                  if v["reasoning"] in REASONING_LEVELS else 99)
    return variants


def get_model_metadata(model_id, config_dir):
    raw = _raw_model_id(model_id)
    reasoning = detect_reasoning(raw)
    vision = detect_vision(raw)
    variants = get_variants(raw, config_dir)

    data = _load_opencode(config_dir)
    context = None
    for provider in data.get("provider", {}).values():
        models = provider.get("models", {})
        if raw in models:
            info = models[raw]
            if isinstance(info, dict) and "limit" in info:
                context = info["limit"].get("context")

    return {
        "model_id": model_id,
        "reasoning_level": reasoning,
        "reasoning_label": REASONING_LEVELS.get(reasoning, reasoning),
        "vision_support": vision,
        "context_window": context,
        "available_variants": variants,
    }
