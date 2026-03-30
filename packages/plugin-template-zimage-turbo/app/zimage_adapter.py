"""
Z-Image Turbo inference via Hugging Face diffusers (local folder layout).

Aligned with: https://huggingface.co/Tongyi-MAI/Z-Image-Turbo
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from PIL import Image

from .schemas import MuseImageGenerateInput

logger = logging.getLogger(__name__)

# Turbo defaults from model card (guidance_scale must be 0 for Turbo)
DEFAULT_NUM_INFERENCE_STEPS = 9
DEFAULT_GUIDANCE_SCALE = 0.0
DEFAULT_WIDTH = 1024
DEFAULT_HEIGHT = 1024


@dataclass
class GeneratedImage:
    rel_path: str
    width: int
    height: int


class ZImageTurboAdapter:
    provider_id = "zimage_turbo_plugin"
    display_name = "Z-Image Turbo (Plugin)"

    def __init__(self, outputs_root: Path, model_root: Path) -> None:
        self.outputs_root = outputs_root
        self.model_root = model_root
        self._pipe: Any = None
        self._lock = threading.Lock()

    def _ensure_pipeline(self) -> Any:
        """Lazy-load ZImagePipeline once (heavy VRAM / disk)."""
        with self._lock:
            if self._pipe is not None:
                return self._pipe

            import torch

            try:
                from diffusers import ZImagePipeline
            except ImportError as e:
                raise ImportError(
                    "ZImagePipeline requires a recent diffusers with Z-Image support. "
                    "Upgrade: pip install -U diffusers transformers"
                ) from e

            if not torch.cuda.is_available():
                logger.warning(
                    "CUDA not available; Z-Image Turbo on CPU is usually impractical "
                    "(slow / high RAM). Prefer a GPU or use a smaller workflow."
                )

            dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
            low_cpu = True

            self._pipe = ZImagePipeline.from_pretrained(
                str(self.model_root),
                torch_dtype=dtype,
                low_cpu_mem_usage=low_cpu,
            )

            if torch.cuda.is_available():
                self._pipe.to("cuda")
            else:
                self._pipe.to("cpu")

            return self._pipe

    def _resolve_generation_settings(self, payload: MuseImageGenerateInput) -> dict[str, Any]:
        gp = payload.generationParams
        pp = payload.pluginParams or {}

        def pp_int(key: str, gp_val: Optional[int], top_val: Optional[int], default: int) -> int:
            v = pp.get(key)
            if isinstance(v, int) and v > 0:
                return v
            if top_val is not None:
                return int(top_val)
            if gp_val is not None:
                return int(gp_val)
            return default

        def pp_float(key: str, gp_val: Optional[float], default: float) -> float:
            v = pp.get(key)
            if isinstance(v, (int, float)):
                return float(v)
            if gp_val is not None:
                return float(gp_val)
            return default

        width = pp_int("width", gp.width if gp else None, payload.width, DEFAULT_WIDTH)
        height = pp_int("height", gp.height if gp else None, payload.height, DEFAULT_HEIGHT)
        # Snap to multiples of 8 for diffusion
        width = max(256, (width // 8) * 8)
        height = max(256, (height // 8) * 8)

        seed_raw = pp.get("seed")
        if seed_raw is None and payload.seed is not None:
            seed_raw = payload.seed
        if seed_raw is None and gp is not None and gp.seed is not None:
            seed_raw = gp.seed
        if not isinstance(seed_raw, int):
            import random

            seed_raw = random.randint(0, 2**31 - 1)

        steps_v = pp.get("numInferenceSteps")
        if steps_v is None and payload.numInferenceSteps is not None:
            steps_v = payload.numInferenceSteps
        if steps_v is None and gp is not None and gp.numInferenceSteps is not None:
            steps_v = gp.numInferenceSteps
        num_inference_steps = (
            int(steps_v) if isinstance(steps_v, int) and steps_v > 0 else DEFAULT_NUM_INFERENCE_STEPS
        )

        guidance = pp_float("guidanceScale", gp.guidanceScale if gp else None, DEFAULT_GUIDANCE_SCALE)

        return {
            "width": width,
            "height": height,
            "seed": int(seed_raw),
            "num_inference_steps": num_inference_steps,
            "guidance_scale": guidance,
        }

    def generate_image(self, payload: MuseImageGenerateInput) -> GeneratedImage:
        import torch

        pipe = self._ensure_pipeline()
        settings = self._resolve_generation_settings(payload)
        prompt = payload.prompt.strip()

        device = "cuda" if torch.cuda.is_available() else "cpu"
        gen = torch.Generator(device=device).manual_seed(int(settings["seed"]))

        out = pipe(
            prompt=prompt,
            height=settings["height"],
            width=settings["width"],
            num_inference_steps=settings["num_inference_steps"],
            guidance_scale=settings["guidance_scale"],
            generator=gen,
        )
        image: Image.Image = out.images[0]

        today = datetime.utcnow().strftime("%Y%m%d")
        out_dir = self.outputs_root / "zimage-turbo" / today
        out_dir.mkdir(parents=True, exist_ok=True)

        filename = f"zimg_{uuid4().hex[:12]}.png"
        abs_path = out_dir / filename
        image.save(abs_path)

        w, h = image.size
        rel = abs_path.relative_to(self.outputs_root).as_posix()
        return GeneratedImage(rel_path=rel, width=w, height=h)

    def inference_metadata(self, payload: MuseImageGenerateInput) -> dict[str, Any]:
        s = self._resolve_generation_settings(payload)
        try:
            import torch as _torch
            cuda_available: bool = _torch.cuda.is_available()
        except ImportError:
            cuda_available = False
        return {
            "model_root": str(self.model_root),
            "seed": s["seed"],
            "width": s["width"],
            "height": s["height"],
            "num_inference_steps": s["num_inference_steps"],
            "guidance_scale": s["guidance_scale"],
            "cuda": cuda_available,
        }
