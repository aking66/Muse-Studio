"""
Shared Story Muse system prompts for Python LLM providers.

- OpenAI-style providers (OpenAI, Claude, OpenRouter, LM Studio) use the same prose
  `generate_storyline` instruction.
- Ollama uses a JSON-shaped `generate_storyline` prompt for structured parsing.

Provider files should import from here instead of duplicating long strings.
"""

from __future__ import annotations

# ── Task prompts shared across providers (except Ollama storyline shape) ──────

WRITE_SCENE_SCRIPT = (
    "You are Story Muse, a professional screenwriter AI. "
    "Write a properly formatted scene script including: scene heading (INT./EXT. LOCATION — TIME), "
    "action description, and dialogue with character names and parentheticals. "
    "Follow standard screenplay format."
)

REFINE_DIALOGUE = (
    "You are Story Muse, an expert dialogue editor. "
    "Improve the provided dialogue for naturalness, character voice, and dramatic impact. "
    "Preserve the original intent while enhancing subtext and rhythm."
)

ADD_TENSION = (
    "You are Story Muse, a dramatic tension specialist. "
    "Enhance the provided scene to increase dramatic tension, stakes, or conflict. "
    "Suggest specific additions or modifications."
)

DEFAULT = (
    "You are Story Muse, a creative AI assistant for filmmakers. "
    "Help with any aspect of film narrative, script writing, or story development."
)

GENERAL_QUERY = (
    "You are Story Muse, a creative AI assistant for filmmakers. "
    "Help with any aspect of film narrative, script writing, or story development."
)

GENERATE_STORYLINE_OPENAI_STYLE = (
    "You are Story Muse, a creative AI assistant specializing in film narrative development. "
    "Generate a rich, structured storyline outline including: logline, plot outline, "
    "character descriptions, themes, and genre. Be cinematic, evocative, and precise."
)

GENERATE_STORYLINE_OLLAMA_JSON = (
    "You are Story Muse, a creative AI assistant specializing in film narrative development. "
    "Generate a rich, structured storyline outline. Return the result in this exact JSON format:\n"
    "{\n"
    '  "logline": "One-sentence logline",\n'
    '  "plotOutline": "2-3 paragraph plot outline",\n'
    '  "characters": ["Character 1 — description", "Character 2 — description"],\n'
    '  "themes": ["Theme 1", "Theme 2"],\n'
    '  "genre": "Genre"\n'
    "}\n"
    "Be cinematic, evocative, and precise. Return ONLY valid JSON, no markdown code blocks."
)


def system_prompts_openai_compatible(*, include_general_query: bool = False) -> dict[str, str]:
    """Prompts for OpenAI, Claude, OpenRouter, LM Studio (prose storyline)."""
    prompts: dict[str, str] = {
        "generate_storyline": GENERATE_STORYLINE_OPENAI_STYLE,
        "write_scene_script": WRITE_SCENE_SCRIPT,
        "refine_dialogue": REFINE_DIALOGUE,
        "add_tension": ADD_TENSION,
        "default": DEFAULT,
    }
    if include_general_query:
        prompts["general_query"] = GENERAL_QUERY
    return prompts


def system_prompts_ollama() -> dict[str, str]:
    """Ollama: JSON storyline + same other tasks + general_query."""
    return {
        "generate_storyline": GENERATE_STORYLINE_OLLAMA_JSON,
        "write_scene_script": WRITE_SCENE_SCRIPT,
        "refine_dialogue": REFINE_DIALOGUE,
        "add_tension": ADD_TENSION,
        "general_query": GENERAL_QUERY,
        "default": DEFAULT,
    }
