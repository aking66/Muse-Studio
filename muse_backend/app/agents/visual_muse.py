"""
Visual Muse Agent — keyframe / image generation (legacy stub).

Invoked by the Supervisor when next_task is "keyframe".
Image generation now runs via MCP Extensions / ComfyUI.
"""

from __future__ import annotations

from typing import Any


def run_visual_muse(
    task: str,
    project: dict[str, Any],
    scene_id: str | None = None,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Visual Muse: generate or refine keyframe images for a scene.
    Stub: returns placeholder. Migrate callers to MCP Extensions.
    """
    return {
        "muse": "visual",
        "status": "stub",
        "message": "Visual Muse agent stub. Use MCP Extensions or /generate/comfyui for keyframes.",
        "task": task,
        "scene_id": scene_id,
    }
