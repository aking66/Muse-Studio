from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel, Field


class GenerationParams(BaseModel):
    denoiseStrength: Optional[float] = None
    styleStrength: Optional[float] = None
    aspectRatio: Optional[str] = None
    referenceWeight: Optional[float] = None


class ReferenceImage(BaseModel):
    url: str
    width: Optional[int] = None
    height: Optional[int] = None
    alt: Optional[str] = None


class MuseImageGenerateInput(BaseModel):
    projectId: Optional[str] = None
    sceneId: Optional[str] = None
    keyframeId: Optional[str] = None
    sequenceOrder: Optional[int] = None
    prompt: str = Field(min_length=1)
    generationParams: Optional[GenerationParams] = None
    referenceImages: list[ReferenceImage] = Field(default_factory=list)
    pluginParams: dict[str, Any] = Field(default_factory=dict)


class ImageAsset(BaseModel):
    url: str
    width: Optional[int] = None
    height: Optional[int] = None
    alt: Optional[str] = None


class MuseImageGenerateOutput(BaseModel):
    finalImage: ImageAsset
    draftImage: Optional[ImageAsset] = None
    metadata: dict[str, Any] = Field(default_factory=dict)

