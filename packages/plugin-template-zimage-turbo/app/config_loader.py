"""
Load plugin config.json and validate a Hugging Face–style local model root.

Expected layout (same as https://huggingface.co/Tongyi-MAI/Z-Image-Turbo/tree/main):
  model_root/
    model_index.json
    scheduler/
    text_encoder/
    tokenizer/
    transformer/
    vae/
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


def load_plugin_dotenv(plugin_root: Path) -> None:
    """
    Load ``plugin_root/.env`` into the process environment before reading ``os.environ``.

    Optional dependency: ``python-dotenv``. If missing, this is a no-op (install the package
    to use a ``.env`` file next to ``config.json``).
    """
    env_path = plugin_root / ".env"
    if not env_path.is_file():
        return
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(env_path)


REQUIRED_RELATIVE = (
    "model_index.json",
    "scheduler",
    "text_encoder",
    "tokenizer",
    "transformer",
    "vae",
)


@dataclass(frozen=True)
class PluginConfig:
    """Runtime config for the Z-Image Turbo plugin."""

    model_root: Path


def plugin_root_from_main_file(main_file: str) -> Path:
    """Package root: parent of `app/` containing main.py."""
    return Path(main_file).resolve().parent.parent


def load_plugin_config(*, plugin_root: Path, env_model_root: str | None) -> PluginConfig:
    """
    Resolve model root from:
    1. Env ZIMAGE_MODEL_DIR (if set)
    2. config.json in plugin root: { "model_root": "..." }
    """
    if env_model_root and env_model_root.strip():
        root = Path(env_model_root).expanduser().resolve()
        validate_model_root(root)
        return PluginConfig(model_root=root)

    cfg_path = plugin_root / "config.json"
    if not cfg_path.is_file():
        raise FileNotFoundError(
            f"Missing {cfg_path}. Copy config.example.json to config.json "
            "or set ZIMAGE_MODEL_DIR to your Hugging Face–style model folder."
        )

    with cfg_path.open(encoding="utf-8") as f:
        data: dict[str, Any] = json.load(f)

    raw = data.get("model_root")
    if not raw or not isinstance(raw, str):
        raise ValueError(
            f'{cfg_path} must contain a string "model_root" pointing to the local '
            "Z-Image-Turbo folder (same layout as Tongyi-MAI/Z-Image-Turbo)."
        )

    root = Path(raw).expanduser().resolve()
    validate_model_root(root)
    return PluginConfig(model_root=root)


def validate_model_root(root: Path) -> None:
    """Ensure required files/dirs exist under the model root."""
    if not root.is_dir():
        raise FileNotFoundError(f"model_root is not a directory: {root}")

    missing: list[str] = []
    for rel in REQUIRED_RELATIVE:
        p = root / rel
        if rel.endswith(".json"):
            if not p.is_file():
                missing.append(rel)
        else:
            if not p.is_dir():
                missing.append(f"{rel}/")

    if missing:
        raise FileNotFoundError(
            f"Invalid Z-Image model folder (expected Hugging Face layout): {root}\n"
            "Missing:\n  - " + "\n  - ".join(missing) + "\n"
            "Download with: pip install -U huggingface_hub && "
            "hf download Tongyi-MAI/Z-Image-Turbo --local-dir <path>"
        )


def env_model_root_override() -> str | None:
    return os.getenv("ZIMAGE_MODEL_DIR", "").strip() or None
