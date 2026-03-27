from __future__ import annotations

import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from .schemas import MuseImageGenerateInput, MuseImageGenerateOutput, ImageAsset
from .zimage_adapter import ZImageTurboDemoAdapter


PORT = int(os.getenv("PORT", "18181"))
HOST = os.getenv("HOST", "127.0.0.1")
OUTPUTS_DIR = Path(os.getenv("PLUGIN_OUTPUTS_DIR", "./outputs")).resolve()
PUBLIC_BASE_URL = os.getenv("PLUGIN_PUBLIC_BASE_URL", f"http://{HOST}:{PORT}")

OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Z-Image Turbo Demo Plugin", version="0.1.0")
app.mount("/assets", StaticFiles(directory=str(OUTPUTS_DIR)), name="assets")

adapter = ZImageTurboDemoAdapter(outputs_root=OUTPUTS_DIR)


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true", "provider": adapter.provider_id}


@app.post("/hooks/image.generate", response_model=MuseImageGenerateOutput)
def image_generate(payload: MuseImageGenerateInput) -> MuseImageGenerateOutput:
    if not payload.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt is required")

    result = adapter.generate_demo_image(payload)
    public_url = f"{PUBLIC_BASE_URL}/assets/{result.rel_path}"

    return MuseImageGenerateOutput(
        finalImage=ImageAsset(
            url=public_url,
            width=result.width,
            height=result.height,
            alt="Z-Image Turbo demo output",
        ),
        metadata={
            "provider": adapter.provider_id,
            "template": True,
            "note": "Replace adapter.generate_demo_image with real Z-Image Turbo inference.",
        },
    )

