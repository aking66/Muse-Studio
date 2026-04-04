"""
Scene Prompt Negotiator — Skills communicate and negotiate prompts.

Each skill can:
- Generate its own prompt
- Request changes from other skills
- Receive change requests and update
- All revisions are tracked in a JSON log

Usage:
    negotiator = SceneNegotiator(scene_config)
    result = negotiator.negotiate()  # All skills discuss and finalize
    result.save("scene_prompts.json")

Architecture:
    - Each skill is a "participant" that owns one prompt
    - Participants can send "requests" to other participants
    - Each request creates a new revision
    - Final output includes all prompts + full revision history
"""

from __future__ import annotations

import json
import time
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .animation_prompts import (
    STYLES,
    FRAME_RULES,
    CAMERAS,
    WAN_NEGATIVE_BASE,
    build_character_prompt,
    build_first_frame_prompt,
    build_last_frame_prompt,
    build_video_prompt,
)


@dataclass
class Revision:
    """A single change to a prompt."""
    revision: int
    prompt: str
    changed_by: str        # which skill made the change
    reason: str            # why
    requested_by: str      # who asked for the change (self or another skill)
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "revision": self.revision,
            "prompt": self.prompt,
            "changed_by": self.changed_by,
            "reason": self.reason,
            "requested_by": self.requested_by,
            "timestamp": self.timestamp,
        }


@dataclass
class PromptSlot:
    """One prompt with its full revision history."""
    skill_name: str
    current_prompt: str = ""
    revisions: list[Revision] = field(default_factory=list)

    def update(self, new_prompt: str, reason: str, requested_by: str = "self"):
        rev = Revision(
            revision=len(self.revisions) + 1,
            prompt=new_prompt,
            changed_by=self.skill_name,
            reason=reason,
            requested_by=requested_by,
        )
        self.revisions.append(rev)
        self.current_prompt = new_prompt

    def to_dict(self) -> dict:
        return {
            "skill": self.skill_name,
            "current_prompt": self.current_prompt,
            "total_revisions": len(self.revisions),
            "revisions": [r.to_dict() for r in self.revisions],
        }


class SceneNegotiator:
    """
    Orchestrates prompt generation across skills with negotiation.

    Config example:
    {
        "character": {
            "name": "Rick Sanchez",
            "features": "tall thin old man, spiky light blue hair, unibrow",
            "outfit": "lab coat, blue shirt, brown pants",
            "details": "drool on chin",
        },
        "style": "rick-and-morty",
        "camera": "full_body",
        "background": "white",
        "first_frame": {
            "pose": "standing, right arm down holding portal gun at side",
            "expression": "calm serious face, closed mouth",
            "props": "portal gun",
        },
        "last_frame": {
            "pose": "right arm raised pointing portal gun forward",
            "expression": "determined face",
            "props": "portal gun firing green energy",
        },
        "video": {
            "action": "raises portal gun and fires green blast",
            "motion_speed": "medium",
        },
    }
    """

    def __init__(self, config: dict):
        self.config = deepcopy(config)
        self.style_id = config.get("style", "anime")
        self.style = STYLES.get(self.style_id, STYLES["anime"])

        # Create prompt slots
        self.slots = {
            "character": PromptSlot("character_skill"),
            "first_frame": PromptSlot("first_frame_skill"),
            "last_frame": PromptSlot("last_frame_skill"),
            "video": PromptSlot("video_skill"),
            "video_negative": PromptSlot("video_negative_skill"),
        }

        self.requests_log: list[dict] = []

    def negotiate(self) -> "SceneNegotiator":
        """Run the full negotiation process."""

        # Phase 1: Each skill generates initial prompt
        self._phase_initial()

        # Phase 2: Cross-validation — skills check each other
        self._phase_cross_validate()

        # Phase 3: Video skill checks consistency with frames
        self._phase_video_consistency()

        return self

    def _phase_initial(self):
        """Each skill generates its first prompt."""
        cfg = self.config
        char_cfg = cfg.get("character", {})

        # Character prompt
        char_prompt = build_character_prompt({
            **char_cfg,
            "style": self.style_id,
            "views": ["front", "3/4"],
            "stage": "2d",
        })
        self.slots["character"].update(char_prompt, "Initial generation", "self")

        # First frame
        first_prompt = build_first_frame_prompt({
            "character": self._short_character(),
            "style": self.style_id,
            "camera": cfg.get("camera", "full_body"),
            "background": cfg.get("background", "white"),
            **cfg.get("first_frame", {}),
        })
        self.slots["first_frame"].update(first_prompt, "Initial generation", "self")

        # Last frame
        last_prompt = build_last_frame_prompt({
            "character": self._short_character(),
            "style": self.style_id,
            "camera": cfg.get("camera", "full_body"),
            "background": cfg.get("background", "white"),
            **cfg.get("last_frame", {}),
        })
        self.slots["last_frame"].update(last_prompt, "Initial generation", "self")

        # Video
        video_result = build_video_prompt({
            "character": self._short_character(),
            "style": self.style_id,
            "background": cfg.get("background", "white"),
            **cfg.get("video", {}),
        })
        self.slots["video"].update(video_result["positive"], "Initial generation", "self")
        self.slots["video_negative"].update(video_result["negative"], "Initial generation", "self")
        self.config["_video_meta"] = {
            "frames": video_result["frames"],
            "duration": video_result["duration"],
            "motion_speed": video_result["motion_speed"],
        }

    def _phase_cross_validate(self):
        """Skills check each other for consistency."""
        first = self.slots["first_frame"].current_prompt
        last = self.slots["last_frame"].current_prompt

        # Check: first and last must have same camera angle
        camera = CAMERAS.get(self.config.get("camera", "full_body"), "full body shot")
        if camera not in first:
            self._request("last_frame_skill", "first_frame_skill",
                         f"Add camera angle: {camera}",
                         first + f", {camera}")
        if camera not in last:
            self._request("first_frame_skill", "last_frame_skill",
                         f"Match camera angle: {camera}",
                         last + f", {camera}")

        # Check: first and last must have same background
        bg = self.config.get("background", "white")
        bg_str = "white background" if bg == "white" else bg
        if bg_str not in first:
            self._request("last_frame_skill", "first_frame_skill",
                         f"Add background: {bg_str}",
                         first + f", {bg_str}")

        # Check: visual difference between first and last
        # If prompts are too similar, log a warning
        first_words = set(first.lower().split(", "))
        last_words = set(last.lower().split(", "))
        overlap = len(first_words & last_words) / max(len(first_words | last_words), 1)
        if overlap > 0.85:
            self._log_request(
                "video_skill", "first_frame_skill",
                "WARNING: First and last frames are too similar (>85% overlap). "
                "Video may have minimal motion. Consider more dramatic pose difference."
            )

    def _phase_video_consistency(self):
        """Video skill checks it matches the frame prompts."""
        video = self.slots["video"].current_prompt
        first = self.slots["first_frame"].current_prompt
        last = self.slots["last_frame"].current_prompt

        # Ensure character name is in video prompt
        char_name = self.config.get("character", {}).get("name", "")
        if char_name and char_name.lower() not in video.lower():
            updated = f"{char_name} {video}"
            self._request("first_frame_skill", "video_skill",
                         f"Add character name: {char_name}", updated)

        # Check motion speed matches frame count
        meta = self.config.get("_video_meta", {})
        motion = meta.get("motion_speed", "medium")
        frames = meta.get("frames", 81)

        # Add timing hint to video prompt if fast motion
        if motion == "fast" and "fast" not in video.lower():
            updated = self.slots["video"].current_prompt + ", fast sudden movement"
            self._request("self", "video_skill",
                         f"Motion speed is '{motion}' — add speed hint", updated)

    def _request(self, from_skill: str, to_skill: str, reason: str, new_prompt: str):
        """One skill requests another to update its prompt."""
        self.slots[to_skill.replace("_skill", "")].update(
            new_prompt, reason, requested_by=from_skill
        )
        self._log_request(from_skill, to_skill, reason)

    def _log_request(self, from_skill: str, to_skill: str, message: str):
        self.requests_log.append({
            "from": from_skill,
            "to": to_skill,
            "message": message,
            "timestamp": time.time(),
        })

    def _short_character(self) -> str:
        """Short character description for frame/video prompts."""
        char = self.config.get("character", {})
        name = char.get("name", "character")
        features = char.get("features", "")
        outfit = char.get("outfit", "")
        parts = [name, features, outfit]
        return ", ".join(p for p in parts if p)

    def get_result(self) -> dict:
        """Get final prompts + metadata."""
        meta = self.config.get("_video_meta", {})
        return {
            "character_prompt": self.slots["character"].current_prompt,
            "first_frame_prompt": self.slots["first_frame"].current_prompt,
            "last_frame_prompt": self.slots["last_frame"].current_prompt,
            "video_positive": self.slots["video"].current_prompt,
            "video_negative": self.slots["video_negative"].current_prompt,
            "frames": meta.get("frames", 81),
            "duration": meta.get("duration", "~5s"),
            "motion_speed": meta.get("motion_speed", "medium"),
            "style": self.style_id,
        }

    def save(self, path: str):
        """Save full result with revision history."""
        output = {
            "scene_config": {k: v for k, v in self.config.items() if not k.startswith("_")},
            "final_prompts": self.get_result(),
            "revision_history": {
                name: slot.to_dict() for name, slot in self.slots.items()
            },
            "requests_log": self.requests_log,
            "saved_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        Path(path).write_text(json.dumps(output, indent=2, ensure_ascii=False))

    def __repr__(self):
        r = self.get_result()
        return (
            f"=== Scene Prompts ===\n"
            f"Character: {r['character_prompt'][:80]}...\n"
            f"First Frame: {r['first_frame_prompt'][:80]}...\n"
            f"Last Frame: {r['last_frame_prompt'][:80]}...\n"
            f"Video: {r['video_positive'][:80]}...\n"
            f"Frames: {r['frames']} ({r['duration']})\n"
        )
