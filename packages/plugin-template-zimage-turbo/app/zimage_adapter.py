"""
Z-Image Turbo demo adapter (reference template).

This adapter mirrors the idea behind:
  muse_backend/app/providers/image/zimage_provider.py
but runs as an external plugin extension service.

Current implementation is intentionally lightweight:
- Reads Muse image.generate payload
- Produces a demo PNG with prompt text + metadata

Replace `generate_demo_image()` with your actual Z-Image Turbo pipeline call.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from datetime import datetime
from uuid import uuid4
from PIL import Image, ImageDraw, ImageFont

from .schemas import MuseImageGenerateInput


@dataclass
class GeneratedImage:
    rel_path: str
    width: int
    height: int


class ZImageTurboDemoAdapter:
    provider_id = "zimage_turbo_demo"
    display_name = "Z-Image Turbo (Demo Plugin)"

    def __init__(self, outputs_root: Path) -> None:
        self.outputs_root = outputs_root

    def generate_demo_image(self, payload: MuseImageGenerateInput) -> GeneratedImage:
        """
        Demo output generator.
        TODO: Replace with real model inference flow.
        """
        today = datetime.utcnow().strftime("%Y%m%d")
        out_dir = self.outputs_root / "demo-zimage" / today
        out_dir.mkdir(parents=True, exist_ok=True)

        width = 1280
        height = 720
        img = Image.new("RGB", (width, height), color=(18, 20, 28))
        draw = ImageDraw.Draw(img)

        title = "Z-Image Turbo Demo Plugin"
        prompt = payload.prompt.strip()[:180]
        denoise = payload.generationParams.denoiseStrength if payload.generationParams else None
        subtitle = f"Prompt: {prompt}"
        details = f"denoiseStrength={denoise if denoise is not None else 'n/a'}"
        footer = f"sceneId={payload.sceneId or 'n/a'} projectId={payload.projectId or 'n/a'}"

        font = ImageFont.load_default()
        draw.text((36, 40), title, fill=(198, 162, 255), font=font)
        draw.text((36, 92), subtitle, fill=(235, 235, 235), font=font)
        draw.text((36, 124), details, fill=(180, 190, 220), font=font)
        draw.text((36, height - 40), footer, fill=(120, 132, 168), font=font)

        filename = f"zimg_demo_{uuid4().hex[:10]}.png"
        abs_path = out_dir / filename
        img.save(abs_path)

        rel = abs_path.relative_to(self.outputs_root).as_posix()
        return GeneratedImage(rel_path=rel, width=width, height=height)

