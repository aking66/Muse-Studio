"""
Animation Prompt Skills — Dynamic prompt generation for the animation pipeline.

Each skill takes structured input (dict) and returns an optimized prompt.
Designed to be called by agents or directly by the pipeline.

Usage:
    from app.prompts.animation_prompts import build_character_prompt, build_frame_prompt, build_video_prompt

    prompt = build_character_prompt({
        "name": "Rick Sanchez",
        "features": "tall thin old man, spiky light blue hair, unibrow, long pointed nose",
        "outfit": "lab coat, blue shirt, brown pants",
        "details": "drool on chin",
        "style": "rick-and-morty",
        "views": ["front", "3/4"],
    })
"""

from __future__ import annotations
from typing import Optional


# ── Style Presets ──────────────────────────────────────────────────────────────

STYLES = {
    "rick-and-morty": {
        "keywords": "Rick and Morty style, bold black outlines, flat solid colors, simple shapes, high contrast",
        "negative_image": "3D render, realistic, blurry, gradients, detailed shading, sketch, pencil lines",
        "negative_video": "morphing, warping, distortion, face deformation, flickering, identity drift, melting, extra teeth, hair length change, 3D render, realistic",
    },
    "anime": {
        "keywords": "anime art style, sharp clean lines, vibrant colors, dramatic lighting, detailed eyes",
        "negative_image": "3D render, western cartoon, blurry, distorted, low quality",
        "negative_video": "morphing, warping, distortion, face deformation, flickering, identity drift, melting, extra limbs, 3D render",
    },
    "ghibli": {
        "keywords": "Studio Ghibli style, soft watercolor textures, gentle lighting, lush detailed backgrounds, warm colors",
        "negative_image": "3D render, flat colors, bold outlines, low quality, blurry",
        "negative_video": "morphing, warping, face deformation, flickering, identity drift, melting, 3D render",
    },
    "disney-2d": {
        "keywords": "classic Disney 2D animation style, smooth line art, rich colors, expressive features, polished cel shading",
        "negative_image": "3D render, realistic, flat, minimalist, low quality",
        "negative_video": "morphing, warping, face deformation, flickering, identity drift, melting, 3D render",
    },
    "minimalist": {
        "keywords": "minimalist vector art, flat colors, geometric shapes, limited color palette, no outlines",
        "negative_image": "detailed, realistic, complex backgrounds, 3D render, blurry",
        "negative_video": "morphing, warping, distortion, flickering, identity drift, 3D render",
    },
    "tmnt-mutant-mayhem": {
        "keywords": "rough sketch style, marker pen lines, textured colors, visible brush strokes, concept art feel, hand-drawn imperfections",
        "negative_image": "3D render, clean lines, flat colors, polished, digital, blurry",
        "negative_video": "morphing, warping, face deformation, flickering, identity drift, 3D render, clean lines",
    },
}

# WAN 2.2 Chinese negative prompt (model was trained on Chinese data)
WAN_NEGATIVE_BASE = (
    "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，"
    "整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，"
    "画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，"
    "静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走"
)


# ── Frame Count Rules ─────────────────────────────────────────────────────────

FRAME_RULES = {
    "micro":   {"frames": 17, "duration": "~1s", "use": "blink, micro expression"},
    "fast":    {"frames": 33, "duration": "~2s", "use": "punch, quick reaction, gunshot"},
    "medium":  {"frames": 49, "duration": "~3s", "use": "gesture, head turn, reach"},
    "slow":    {"frames": 81, "duration": "~5s", "use": "walk cycle, slow pan, dialogue"},
    "long":    {"frames": 97, "duration": "~6s", "use": "long continuous motion"},
}


# ── Camera Angles ─────────────────────────────────────────────────────────────

CAMERAS = {
    "full_body": "full body shot",
    "medium": "medium shot waist up",
    "close_up": "close-up shot head and shoulders",
    "extreme_close": "extreme close-up face only",
    "low_angle": "low angle shot looking up",
    "high_angle": "high angle shot looking down",
}


# ── Skill 1: Character Sheet Prompt ───────────────────────────────────────────

def build_character_prompt(config: dict) -> str:
    """
    Build prompt for character sheet generation (Stage 1A/1B).

    Config:
        name: str — character name
        features: str — physical description (hair, face, body)
        outfit: str — clothing description
        details: str — extra details (scars, accessories)
        style: str — style preset id
        views: list[str] — ["front", "3/4", "side"]
        stage: str — "sketch" or "2d"
    """
    style_id = config.get("style", "anime")
    style = STYLES.get(style_id, STYLES["anime"])
    views = config.get("views", ["front", "3/4"])
    stage = config.get("stage", "sketch")

    views_str = " and ".join(f"{v} view" for v in views)

    if stage == "sketch":
        return (
            f"{config['name']} character sheet, {views_str}, "
            f"{config['features']}, {config.get('outfit', '')}, "
            f"{config.get('details', '')}, "
            f"rough line art, pencil sketch style, white background"
        ).replace("  ", " ").strip().rstrip(",")
    else:
        return (
            f"{config['name']} character sheet, {views_str}, "
            f"{config['features']}, {config.get('outfit', '')}, "
            f"{config.get('details', '')}, "
            f"{style['keywords']}, white background"
        ).replace("  ", " ").strip().rstrip(",")


# ── Skill 2: First Frame Prompt ──────────────────────────────────────────────

def build_first_frame_prompt(config: dict) -> str:
    """
    Build prompt for first keyframe (Stage 2/4A).

    Config:
        character: str — short character description
        pose: str — body pose description
        expression: str — facial expression
        camera: str — camera angle key from CAMERAS
        background: str — "white" or description
        style: str — style preset id
        props: str — objects in scene (portal gun, sword, etc.)
    """
    style_id = config.get("style", "anime")
    style = STYLES.get(style_id, STYLES["anime"])
    camera = CAMERAS.get(config.get("camera", "full_body"), config.get("camera", "full body shot"))
    bg = config.get("background", "white")
    bg_str = "white background" if bg == "white" else bg

    parts = [
        config["character"],
        config.get("pose", "standing straight"),
        config.get("expression", "neutral expression"),
        config.get("props", ""),
        camera,
        style["keywords"],
        bg_str,
        "no extra limbs, two arms only",
    ]
    return ", ".join(p for p in parts if p).strip()


# ── Skill 3: Last Frame Prompt ───────────────────────────────────────────────

def build_last_frame_prompt(config: dict) -> str:
    """
    Build prompt for last keyframe (Stage 3/4B).

    Same as first frame but with different pose/expression.
    IMPORTANT: pose must be VISUALLY different from first frame — not just different words.

    Config: same as build_first_frame_prompt
    """
    # Same builder — the difference is in the config values
    return build_first_frame_prompt(config)


# ── Skill 4: Video Prompt ────────────────────────────────────────────────────

def build_video_prompt(config: dict) -> dict:
    """
    Build positive + negative prompt for WAN 2.2 FLF2V video generation.

    Config:
        action: str — what happens in the video (motion description)
        motion_speed: str — "fast", "medium", "slow"
        style: str — style preset id
        character: str — short character name/description
        frames: int — override frame count (optional)
        background: str — "white" or description

    Returns:
        {"positive": str, "negative": str, "frames": int}
    """
    style_id = config.get("style", "anime")
    style = STYLES.get(style_id, STYLES["anime"])
    motion_speed = config.get("motion_speed", "medium")
    frame_rule = FRAME_RULES.get(motion_speed, FRAME_RULES["medium"])
    frames = config.get("frames", frame_rule["frames"])
    bg = config.get("background", "white")
    bg_str = "white background" if bg == "white" else bg

    # Positive prompt — action focused, short
    positive_parts = [
        config.get("character", ""),
        config["action"],
        style["keywords"].split(",")[0].strip(),  # just the first style keyword
        "bold outlines, flat colors" if "rick" in style_id or "minimalist" in style_id else "sharp lines, clean animation",
        bg_str,
    ]
    positive = ", ".join(p for p in positive_parts if p)

    # Negative prompt — combine style negative + WAN base
    negative = f"{style['negative_video']}, {WAN_NEGATIVE_BASE}"

    return {
        "positive": positive,
        "negative": negative,
        "frames": frames,
        "duration": frame_rule["duration"],
        "motion_speed": motion_speed,
    }


# ── Convenience: Full Scene Prompt Set ───────────────────────────────────────

def build_scene_prompts(config: dict) -> dict:
    """
    Build all prompts for a complete scene (first frame + last frame + video).

    Config:
        character: str — short character description
        style: str — style preset id
        camera: str — camera angle
        background: str — "white" or description
        first_frame: {pose, expression, props}
        last_frame: {pose, expression, props}
        video: {action, motion_speed}

    Returns:
        {
            "first_frame": str,
            "last_frame": str,
            "video_positive": str,
            "video_negative": str,
            "frames": int,
        }
    """
    base = {
        "character": config["character"],
        "style": config.get("style", "anime"),
        "camera": config.get("camera", "full_body"),
        "background": config.get("background", "white"),
    }

    first = build_first_frame_prompt({**base, **config["first_frame"]})
    last = build_last_frame_prompt({**base, **config["last_frame"]})
    video = build_video_prompt({
        **base,
        **config["video"],
    })

    return {
        "first_frame": first,
        "last_frame": last,
        "video_positive": video["positive"],
        "video_negative": video["negative"],
        "frames": video["frames"],
        "duration": video["duration"],
    }
