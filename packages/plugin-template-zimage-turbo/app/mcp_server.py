"""
MCP server for local Z-Image Turbo text-to-image inference.

Uses `ZImageTurboAdapter` with `config.json` / `ZIMAGE_MODEL_DIR` (see `config_loader`).

Transports (env `ZIMAGE_MCP_TRANSPORT`):
  - `stdio` (default) — Claude Desktop / most local MCP clients
  - `streamable-http` — HTTP POST at `http://<host>:<port>/mcp`
  - `sse` — legacy SSE transport

Other env:
  - `ZIMAGE_MCP_HOST` (default `127.0.0.1`), `ZIMAGE_MCP_PORT` (default `18182`)
  - `PLUGIN_OUTPUTS_DIR`, `PLUGIN_PUBLIC_BASE_URL`, `ZIMAGE_MODEL_DIR`
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import Annotated, Any, Literal

from mcp.server.fastmcp import FastMCP

from .config_loader import env_model_root_override, load_plugin_config, load_plugin_dotenv
from .schemas import ImageAsset, MuseImageGenerateInput, MuseImageGenerateOutput
from .zimage_adapter import ZImageTurboAdapter

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
load_plugin_dotenv(PLUGIN_ROOT)

OUTPUTS_DIR = Path(os.getenv("PLUGIN_OUTPUTS_DIR", "./outputs")).resolve()

MCP_HOST = os.getenv("ZIMAGE_MCP_HOST", "127.0.0.1").strip() or "127.0.0.1"
MCP_PORT = int(os.getenv("ZIMAGE_MCP_PORT", "18182"))


def _load_runtime() -> tuple[Any, ZImageTurboAdapter]:
    try:
        cfg = load_plugin_config(plugin_root=PLUGIN_ROOT, env_model_root=env_model_root_override())
    except Exception as e:
        print(f"[zimage-mcp] FATAL: {e}", file=sys.stderr)
        raise
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    adapter = ZImageTurboAdapter(outputs_root=OUTPUTS_DIR, model_root=cfg.model_root)
    return cfg, adapter


_cfg, _adapter = _load_runtime()

_instructions = (
    "Z-Image Turbo local inference (Tongyi-MAI/Z-Image-Turbo diffusers layout). "
    "Use zimage_health to verify the model path and CUDA. "
    "Use zimage_generate with a text prompt to render a PNG under the plugin outputs folder."
)

mcp = FastMCP(
    name="zimage-turbo",
    instructions=_instructions,
    host=MCP_HOST,
    port=MCP_PORT,
    stateless_http=True,
)


def _public_url_for(rel_path: str) -> str:
    """
    If `PLUGIN_PUBLIC_BASE_URL` is set, build `…/assets/<rel_path>` for HTTP-hosted assets.
    Otherwise use a `file://` URI to the saved PNG (MCP-only; no separate HTTP server).
    """
    base = os.getenv("PLUGIN_PUBLIC_BASE_URL", "").strip().rstrip("/")
    if base:
        return f"{base}/assets/{rel_path.replace(chr(92), '/')}"
    abs_file = (OUTPUTS_DIR / rel_path).resolve()
    return abs_file.as_uri()


@mcp.tool()
async def zimage_health() -> dict[str, Any]:
    """Report provider id, resolved model_root, outputs dir, and whether CUDA is available (does not load the full pipeline)."""
    try:
        import torch

        cuda = bool(torch.cuda.is_available())
    except Exception:
        cuda = False
    return {
        "ok": True,
        "provider": _adapter.provider_id,
        "model_root": str(_cfg.model_root),
        "outputs_dir": str(OUTPUTS_DIR),
        "cuda_available": cuda,
    }


@mcp.tool()
async def zimage_generate(
    prompt: Annotated[str, "Text prompt for image generation."],
    width: Annotated[int | None, "Image width (256–4096, snapped to multiples of 8)."] = None,
    height: Annotated[int | None, "Image height (256–4096, snapped to multiples of 8)."] = None,
    seed: Annotated[int | None, "Random seed for reproducibility."] = None,
    num_inference_steps: Annotated[
        int | None,
        "Inference steps (Turbo default is 9).",
    ] = None,
    guidance_scale: Annotated[
        float | None,
        "Guidance scale; Turbo models typically use 0.0.",
    ] = None,
) -> dict[str, Any]:
    """
    Run Z-Image Turbo text-to-image and save a PNG under PLUGIN_OUTPUTS_DIR.
    Returns paths, optional public URL, dimensions, and inference metadata.
    """
    if not prompt or not str(prompt).strip():
        raise ValueError("prompt is required")

    pp: dict[str, Any] = {}
    if guidance_scale is not None:
        pp["guidanceScale"] = float(guidance_scale)

    payload = MuseImageGenerateInput(
        prompt=prompt.strip(),
        width=width,
        height=height,
        seed=seed,
        numInferenceSteps=num_inference_steps,
        pluginParams=pp,
    )

    def _sync_generate() -> tuple[MuseImageGenerateOutput, str, str]:
        try:
            result = _adapter.generate_image(payload)
        except Exception as e:
            raise RuntimeError(f"Inference failed: {e!s}") from e
        rel = result.rel_path
        url = _public_url_for(rel)
        meta = _adapter.inference_metadata(payload)
        meta.update({"provider": _adapter.provider_id, "template": False})
        output = MuseImageGenerateOutput(
            finalImage=ImageAsset(
                url=url,
                width=result.width,
                height=result.height,
                alt="Z-Image Turbo output",
            ),
            metadata=meta,
        )
        abs_path = str((OUTPUTS_DIR / rel).resolve())
        return output, abs_path, rel

    muse_out, abs_path, rel_path = await asyncio.to_thread(_sync_generate)

    return {
        "finalImage": muse_out.finalImage.model_dump(),
        "metadata": muse_out.metadata,
        "image_path": abs_path,
        "rel_path": rel_path,
    }


def main() -> None:
    raw = os.getenv("ZIMAGE_MCP_TRANSPORT", "stdio").strip().lower()
    transport: Literal["stdio", "sse", "streamable-http"]
    if raw in ("http", "streamable-http", "streamable_http"):
        transport = "streamable-http"
    elif raw == "sse":
        transport = "sse"
    elif raw in ("stdio", ""):
        transport = "stdio"
    else:
        print(f"[zimage-mcp] Unknown ZIMAGE_MCP_TRANSPORT={raw!r}, using stdio", file=sys.stderr)
        transport = "stdio"

    print(
        f"[zimage-mcp] transport={transport} model_root={_cfg.model_root} outputs={OUTPUTS_DIR}",
        file=sys.stderr,
    )
    if transport != "stdio":
        print(
            f"[zimage-mcp] MCP HTTP: http://{MCP_HOST}:{MCP_PORT}/mcp (streamable-http uses POST /mcp)",
            file=sys.stderr,
        )

    mcp.run(transport=transport)


if __name__ == "__main__":
    main()
