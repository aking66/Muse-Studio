---
name: vbvr-sim
description: Create VBVR-style physics video simulations. Python scripts that generate PNG frame sequences + MP4 videos for visual reasoning tasks. Covers 2D, isometric 3D, and Blender-based generators.
triggers:
  - vbvr
  - video simulation
  - physics simulation
  - sim video
  - generate sim
  - اعمل سيم
  - فيديو فيزيائي
  - محاكاة
  - create generator
  - new simulation
  - سيمولايشن
---

# VBVR Video Simulation Skill

## What is VBVR?
VBVR (Very Big Video Reasoning) is a synthetic data generation framework for video reasoning.
Each generator produces parameterized video simulations with deterministic output from a seed.

**GitHub Org:** https://github.com/VBVR-DataFactory (154 repos, 50+ contributors)

## Output Format (REQUIRED for every generator)
```
output_dir/
├── frames/
│   ├── frame_0000.png    # All frames as PNG sequence
│   ├── frame_0001.png
│   └── ...
├── first_frame.png       # Initial state
├── final_frame.png       # End state
├── metadata.json         # Seed, params, prompt, video info
└── ground_truth.mp4      # Video @ 16fps
```

## Generator Script Pattern
Every generator follows this structure:

```python
"""
Title - Description (1024x1024 VBVR format)
"""
import math, json, subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# ═══════════════════════════════════════
#  CONFIG
# ═══════════════════════════════════════
IMG_SIZE = 1024
FPS = 16

# ═══════════════════════════════════════
#  DRAWING PRIMITIVES
# ═══════════════════════════════════════
# Reusable rendering functions here

# ═══════════════════════════════════════
#  EASING
# ═══════════════════════════════════════
def ease_out(t): return 1-(1-t)**3
def ease_io(t): return 4*t*t*t if t<0.5 else 1-(-2*t+2)**3/2
def ease_back(t): c=1.70158; return 1+(c+1)*(t-1)**3+c*(t-1)**2

# ═══════════════════════════════════════
#  GENERATOR
# ═══════════════════════════════════════
def generate(seed=42, output_dir='output_name'):
    w = h = IMG_SIZE
    np.random.seed(seed)

    # Timeline phases
    total_dur = 10.0
    total_frames = int(total_dur * FPS)

    out = Path(output_dir)
    frames_dir = out / 'frames'
    frames_dir.mkdir(parents=True, exist_ok=True)

    images = []
    for fi in range(total_frames):
        sec = fi / FPS
        img = Image.new('RGB', (w, h), BG_COLOR)
        draw = ImageDraw.Draw(img)

        # Phase-based animation logic
        # if sec < T1: ...
        # elif sec < T2: ...

        images.append(img)
        img.save(frames_dir / f'frame_{fi:04d}.png')

    # Save outputs
    images[0].save(out / 'first_frame.png')
    images[-1].save(out / 'final_frame.png')

    meta = {
        'seed': seed,
        'prompt': 'Description of what happens in the video...',
        'video': {'fps': FPS, 'frames': total_frames,
                  'duration': total_dur, 'resolution': f'{w}x{h}'},
    }
    with open(out / 'metadata.json', 'w') as f:
        json.dump(meta, f, indent=2)

    return images, meta

if __name__ == '__main__':
    frames, meta = generate()
    # ffmpeg MP4 export
    out = Path('output_name')
    mp4 = out / 'video.mp4'
    cmd = ['ffmpeg', '-y', '-framerate', str(FPS),
           '-i', str(out / 'frames' / 'frame_%04d.png'),
           '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
           '-crf', '18', '-preset', 'slow', str(mp4)]
    subprocess.run(cmd, capture_output=True)
```

## VBVR-DataFactory BaseGenerator Interface
For contributing to the VBVR org, use the template:
```
pip install git+https://github.com/VBVR-DataFactory/template-data-generator.git
```

**Key classes:**
- `BaseGenerator(config)` - abstract, implement `generate_task_pair(task_id) -> TaskPair`
- `GenerationConfig` - Pydantic: num_samples, domain, seed, output_dir, image_size
- `TaskPair` - task_id, domain, prompt, first_image, final_image, ground_truth_video, metadata

**3 files to customize:** `src/generator.py`, `src/prompts.py`, `src/config.py`

## Rendering Approaches

### 1. 2D Top-down (PIL)
Direct PIL drawing. Best for: flat simulations, diagrams, puzzles.
```python
draw.rectangle([x, y, x+w, y+h], fill=color)
draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=color)
```

### 2. Isometric 3D (PIL)
Isometric projection with z-axis. Best for: layered views, 3D-ish objects.
```python
ISO_A = math.radians(30)
COS_A, SIN_A = math.cos(ISO_A), math.sin(ISO_A)

def iso(x, y, z):
    return (x - y) * COS_A, (x + y) * SIN_A - z

def iso_pt(cx, cy, x, y, z):
    px, py = iso(x, y, z)
    return cx + px, cy + py
```

### 3. Physics-based (numpy + scipy)
Concentration fields, diffusion, advection. Best for: fluid, particle, heat simulations.
```python
# Laplacian diffusion
padded = np.pad(field, 1, mode='edge')
laplacian = padded[2:,1:-1] + padded[:-2,1:-1] + padded[1:-1,2:] + padded[1:-1,:-2] - 4*field
field += diff_coef * dt * laplacian
```

### 4. Blender 3D
For complex 3D scenes. Use `3d-template-data-generator` from VBVR-DataFactory.

## Animation Timeline Design
Use phase-based timeline with easing:
```python
if sec < 2.0:
    # Phase 1: Object appears
    p = ease_back(min(1, sec / 1.0))
elif sec < 5.0:
    # Phase 2: Main action
    p = (sec - 2.0) / 3.0
    ep = ease_io(min(1, p))
elif sec < 8.0:
    # Phase 3: Resolution
    p = (sec - 5.0) / 3.0
else:
    # Phase 4: Hold/finale
    pass
```

## Common Effects

### Laser Cut
```python
def build_cut_path(points):
    """Build segments from polygon points."""
    segs, total = [], 0
    for i in range(len(points) - 1):
        slen = math.sqrt((points[i+1][0]-points[i][0])**2 + (points[i+1][1]-points[i][1])**2)
        segs.append({'s': points[i], 'e': points[i+1], 'l': slen, 'c': total})
        total += slen
    return segs, total
```

### Fade / Alpha Blending
```python
bg = (238, 240, 243)
def blend(color, alpha):
    return tuple(int(color[i]*alpha + bg[i]*(1-alpha)) for i in range(3))
```

### Particle Sparks
```python
rng = np.random.RandomState(seed + frame)
for _ in range(10):
    angle = rng.uniform(0, math.pi * 2)
    speed = rng.uniform(5, 20)
    life = rng.uniform(0.2, 1.0)
    sx = hx + math.cos(angle) * speed * life
    sy = hy + math.sin(angle) * speed * life
```

## Cognitive Categories (VBVR standard)
When creating generators, classify into one of:
- **Perception** - Object identification, sorting, counting
- **Abstraction** - Pattern completion, symmetry, analogies
- **Transformation** - Rotation, morphing, sliding puzzles
- **Knowledge** - Physics, bouncing, mirrors, gravity
- **Spatiality** - Paths, mazes, geometric relationships

## Active Project: sim-to-esim
**Path:** `/Users/ahmed/runpod/sim-to-esim/`
**Playground:** `playground.html` (gallery of all versions)

| Script | Description |
|--------|-------------|
| `generator.py` | Ink diffusion physics (O-87 style) |
| `sim_evolution.py` | 2D laser cutting transitions |
| `sim_peel.py` | 2D flat peel animation |
| `sim_layered.py` | Isometric v1 - simultaneous explode |
| `sim_layered_v2.py` | Isometric v2 - sequential peel |
| `sim_layered_v3.py` | Isometric v3 - all visible peel |
| `sim_layered_v4.py` | Isometric v4 - peel + collapse |
| `sim_layered_v5.py` | Isometric v5 - laser cut + peel + collapse |

## Critical Rules
1. **NEVER rewrite from scratch** - copy target script as new version, modify only what's requested
2. **Keep rendering functions identical** when iterating versions
3. **Square format** - always 1024x1024 (or configurable IMG_SIZE)
4. **16fps** standard framerate
5. **ffmpeg export** at end with libx264, yuv420p, crf 18
6. **State-based animation** - use phase timeline, not keyframes
7. **Deterministic** - same seed = same output (use np.random.seed)
8. **Sub-5s generation** target for simple sims on local machine
9. **Auto-update playground** when adding new videos
