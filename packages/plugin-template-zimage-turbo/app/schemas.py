from __future__ import annotations

from typing import Any, Optional
from pydantic import AliasChoices, BaseModel, Field


class GenerationParams(BaseModel):
    denoiseStrength: Optional[float] = None
    styleStrength: Optional[float] = None
    aspectRatio: Optional[str] = None
    referenceWeight: Optional[float] = None
    # Z-Image Turbo (text-to-image) optional overrides
    width: Optional[int] = Field(default=None, ge=256, le=4096)
    height: Optional[int] = Field(default=None, ge=256, le=4096)
    seed: Optional[int] = None
    numInferenceSteps: Optional[int] = Field(default=None, ge=1, le=50)
    guidanceScale: Optional[float] = Field(default=None, ge=0.0, le=20.0)


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
    # Optional top-level overrides (same values may appear in generationParams / pluginParams)
    width: Optional[int] = Field(default=None, ge=256, le=4096)
    height: Optional[int] = Field(default=None, ge=256, le=4096)
    seed: Optional[int] = None
    numInferenceSteps: Optional[int] = Field(
        default=None,
        ge=1,
        le=50,
        validation_alias=AliasChoices("numInferenceSteps", "steps"),
    )
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

