"""
Scene Builder — Minimal JSON in, full prompts out.

Input: simple scene metadata
Output: all prompts + settings ready for pipeline

The builder is the brain — it knows:
- Character features from name (known characters DB) or reference image
- Style rules (what works, what doesn't per style)
- Motion rules (frame count, timing, speed)
- Camera rules (what angle fits what scene type)
- Prompt rules (what to include, what to avoid per model)
"""

from __future__ import annotations

import json
import time
from copy import deepcopy
from pathlib import Path
from typing import Optional


# ── Known Characters DB ───────────────────────────────────────────────────────
# If character is known, auto-fill features. Otherwise use reference image.

KNOWN_CHARACTERS = {
    "rick sanchez": {
        "features": "tall thin old man, spiky light blue hair, unibrow, long pointed nose",
        "outfit": "lab coat, blue shirt, brown pants",
        "details": "drool on chin",
        "default_style": "rick-and-morty",
    },
    "morty smith": {
        "features": "short teenage boy, brown curly hair, round eyes, small nose",
        "outfit": "yellow t-shirt, blue pants",
        "details": "nervous expression",
        "default_style": "rick-and-morty",
    },
}

# ── Style DB ──────────────────────────────────────────────────────────────────

STYLES = {
    "rick-and-morty": {
        "image": "Rick and Morty style, bold black outlines, flat solid colors, simple shapes",
        "video": "cartoon style, bold outlines, flat colors",
        "neg_image": "3D render, realistic, blurry, gradients, detailed shading",
        "neg_video": "morphing, warping, face deformation, flickering, identity drift, melting, extra teeth, hair length change",
        "default_camera": "full_body",
        "default_bg": "white",
    },
    "anime": {
        "image": "anime art style, sharp clean lines, vibrant colors, dramatic lighting",
        "video": "anime style, sharp lines, flat colors",
        "neg_image": "3D render, western cartoon, blurry, distorted",
        "neg_video": "morphing, warping, face deformation, flickering, identity drift, melting, extra limbs",
        "default_camera": "medium",
        "default_bg": "white",
    },
    "ghibli": {
        "image": "Studio Ghibli style, soft watercolor, gentle lighting, warm colors",
        "video": "Ghibli style, soft colors, gentle motion",
        "neg_image": "3D render, flat colors, bold outlines",
        "neg_video": "morphing, warping, face deformation, flickering, identity drift, melting",
        "default_camera": "medium",
        "default_bg": "white",
    },
}

# WAN negative base (Chinese — model trained on it)
WAN_NEG = "色调艳丽，过曝，静态，细节模糊不清，字幕，静止，整体发灰，最差质量，低质量，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，手指融合，静止不动的画面，三条腿"

# ── Motion Rules ──────────────────────────────────────────────────────────────

MOTION = {
    "instant":  {"frames": 17, "sec": 1.0, "hint": "instant snap"},
    "fast":     {"frames": 33, "sec": 2.0, "hint": "quick action"},
    "medium":   {"frames": 49, "sec": 3.0, "hint": "natural movement"},
    "slow":     {"frames": 81, "sec": 5.0, "hint": "slow smooth motion"},
    "very_slow": {"frames": 97, "sec": 6.0, "hint": "very slow dramatic"},
}

# ── Camera ────────────────────────────────────────────────────────────────────

CAMERAS = {
    "full_body": "full body shot",
    "medium": "medium shot waist up",
    "close_up": "close-up head and shoulders",
    "extreme_close": "extreme close-up face only",
}

# ── Scene Builder ─────────────────────────────────────────────────────────────

class SceneBuilder:
    """
    Minimal input → full prompt set.

    Minimal input:
    {
        "character": "Rick Sanchez",       # name or description
        "style": "rick-and-morty",         # optional, auto-detected from character
        "scene": {
            "start": "holding portal gun down",
            "end": "fires portal gun with green blast",
            "speed": "medium",             # instant/fast/medium/slow/very_slow
        },
        "camera": "full_body",             # optional
        "background": "white",             # optional
    }
    """

    def __init__(self, config: dict):
        self.input = deepcopy(config)
        self.character_name = config["character"].strip().lower()
        self.known = KNOWN_CHARACTERS.get(self.character_name)

        # Auto-detect style
        if "style" in config:
            self.style_id = config["style"]
        elif self.known:
            self.style_id = self.known.get("default_style", "anime")
        else:
            self.style_id = "anime"

        self.style = STYLES.get(self.style_id, STYLES["anime"])

        # Scene
        self.scene = config.get("scene", {})
        self.speed = self.scene.get("speed", "medium")
        self.motion = MOTION.get(self.speed, MOTION["medium"])

        # Camera & background (auto from style if not specified)
        self.camera = config.get("camera", self.style.get("default_camera", "full_body"))
        self.background = config.get("background", self.style.get("default_bg", "white"))

        # Build results
        self.prompts = {}
        self.log = []

    def build(self) -> dict:
        """Generate all prompts."""
        self._build_character()
        self._build_first_frame()
        self._build_last_frame()
        self._build_video()
        self._validate()
        return self.get_output()

    def _char_desc(self) -> str:
        """Short character description."""
        if self.known:
            return f"{self.input['character']}, {self.known['features']}, {self.known['outfit']}"
        return self.input["character"]

    def _char_short(self) -> str:
        """Very short — just name + key visual."""
        if self.known:
            return f"{self.input['character']}, {self.known['features'].split(',')[0].strip()}"
        return self.input["character"]

    def _bg_str(self) -> str:
        return "white background" if self.background == "white" else self.background

    def _cam_str(self) -> str:
        return CAMERAS.get(self.camera, self.camera)

    def _build_character(self):
        """Character sheet prompt."""
        if self.known:
            p = (
                f"{self.input['character']} character sheet, front view and 3/4 view, "
                f"{self.known['features']}, {self.known['outfit']}, "
                f"{self.known.get('details', '')}, "
                f"{self.style['image']}, white background"
            )
        else:
            p = (
                f"{self.input['character']} character sheet, front view and 3/4 view, "
                f"{self.style['image']}, white background"
            )
        self.prompts["character"] = p.replace("  ", " ").rstrip(", ")
        self._log("character", "built from DB" if self.known else "built from name only")

    def _build_first_frame(self):
        """First keyframe prompt."""
        start = self.scene.get("start", "standing neutral pose")
        p = (
            f"{self._char_desc()}, {start}, "
            f"{self._cam_str()}, {self.style['image']}, {self._bg_str()}, "
            f"no extra limbs, two arms only"
        )
        self.prompts["first_frame"] = p
        self._log("first_frame", f"pose: {start}")

    def _build_last_frame(self):
        """Last keyframe prompt."""
        end = self.scene.get("end", "different pose")
        p = (
            f"{self._char_desc()}, {end}, "
            f"{self._cam_str()}, {self.style['image']}, {self._bg_str()}, "
            f"no extra limbs, two arms only"
        )
        self.prompts["last_frame"] = p
        self._log("last_frame", f"pose: {end}")

    def _build_video(self):
        """Video positive + negative prompts."""
        action = self.scene.get("end", "moves")
        speed_hint = self.motion["hint"]

        self.prompts["video_positive"] = (
            f"{self._char_short()} {action}, {speed_hint}, "
            f"{self.style['video']}, {self._bg_str()}"
        )

        self.prompts["video_negative"] = f"{self.style['neg_video']}, {WAN_NEG}"

        self.prompts["frames"] = self.motion["frames"]
        self.prompts["duration"] = f"{self.motion['sec']}s"
        self.prompts["speed"] = self.speed

        self._log("video", f"{self.motion['frames']} frames, {speed_hint}")

    def _validate(self):
        """Cross-check prompts."""
        first = self.prompts["first_frame"]
        last = self.prompts["last_frame"]

        # Check visual overlap
        f_words = set(first.lower().replace(",", "").split())
        l_words = set(last.lower().replace(",", "").split())
        common = len(f_words & l_words)
        total = len(f_words | l_words)
        overlap = common / max(total, 1)

        if overlap > 0.90:
            self._log("WARNING", f"Frames too similar ({overlap:.0%} overlap) — may produce minimal motion")
        elif overlap < 0.50:
            self._log("WARNING", f"Frames very different ({overlap:.0%} overlap) — may cause morphing artifacts")
        else:
            self._log("OK", f"Frame difference: {1-overlap:.0%} — good range")

    def _log(self, skill: str, message: str):
        self.log.append({"skill": skill, "message": message, "time": time.time()})

    def get_output(self) -> dict:
        """Full output ready for pipeline."""
        return {
            "input": {k: v for k, v in self.input.items()},
            "prompts": {
                "character": self.prompts.get("character", ""),
                "first_frame": self.prompts.get("first_frame", ""),
                "last_frame": self.prompts.get("last_frame", ""),
                "video_positive": self.prompts.get("video_positive", ""),
                "video_negative": self.prompts.get("video_negative", ""),
            },
            "settings": {
                "frames": self.prompts.get("frames", 81),
                "duration": self.prompts.get("duration", "5s"),
                "speed": self.prompts.get("speed", "medium"),
                "style": self.style_id,
                "camera": self.camera,
                "background": self.background,
            },
            "log": self.log,
        }

    def save(self, path: str):
        Path(path).write_text(json.dumps(self.get_output(), indent=2, ensure_ascii=False))

    def print_summary(self):
        o = self.get_output()
        print(f"Character:   {o['prompts']['character'][:70]}...")
        print(f"First Frame: {o['prompts']['first_frame'][:70]}...")
        print(f"Last Frame:  {o['prompts']['last_frame'][:70]}...")
        print(f"Video:       {o['prompts']['video_positive'][:70]}...")
        print(f"Frames:      {o['settings']['frames']} ({o['settings']['duration']})")
        print(f"Style:       {o['settings']['style']}")
        print()
        for l in self.log:
            print(f"  [{l['skill']}] {l['message']}")
