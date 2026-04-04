# 2D Animation Styles & Techniques — Research Report

> Research date: 2026-04-04
> Context: Muse Studio animation pipeline (Flux 2 + WAN 2.2 on RunPod L40S)

---

## Part 1: Animation Styles (12 Techniques)

### 1. Smear Frames

**Visual:** Deliberately distorted/stretched drawings between two key poses. Character's arm might stretch across the entire screen. Appears for 1-2 frames — viewer never sees it consciously but feels the speed.

**Timing:** 1 frame (1/24s). Sequence: key pose A (2-4 frames) → smear (1 frame) → key pose B (2-4 frames)

**AI Workflow:**
- Flux 2: Generate key poses A and B, then a third "smear" frame prompted with "motion blur, stretched figure, speed distortion, elongated limbs"
- WAN 2.2: Use high-noise model for more dramatic motion. Prompt: "extremely fast motion, speed blur, streaked movement"
- Post: Insert AI-generated smear frames at impact points in the sequence

---

### 2. Choppy / Limited Animation (Anime-style)

**Visual:** Fewer unique drawings per second. Characters "snap" between poses. Backgrounds static while only mouths/eyes move. Feels punchy and rhythmic. (Scooby-Doo, most anime)

**Timing:**
- On 2s: 12 unique drawings/sec (each held 2 frames at 24fps)
- On 3s: 8 drawings/sec (anime dialogue/slow scenes)
- On 4s: 6 drawings/sec (held poses, ultra-budget)
- Most anime blends: action on 2s, dialogue on 3s-4s, sakuga on 1s

**AI Workflow:**
- WAN 2.2: Generate at 16fps with low-noise model
- Post: Extract every Nth frame, duplicate each N times, re-encode at 24fps
- FFmpeg: `ffmpeg -i input.mp4 -vf "fps=8,setpts=N/24/TB" -r 24 output.mp4` (for on-3s)
- Do NOT apply RIFE (defeats the purpose)

---

### 3. Full Animation (Disney smooth, on 1s)

**Visual:** Every frame is unique. Buttery smooth movement with weight, follow-through on hair/clothing. The "Disney standard" — Snow White, The Lion King.

**Timing:** 24 unique drawings/sec. No held frames during motion.

**AI Workflow:**
- Flux 2: High-quality key poses with "Disney animation style, smooth cel shading, fluid pose"
- WAN 2.2: Maximum frames (81 at 16fps), 30 steps, uni_pc_bh2 sampler, CFG 1.0
- Post: RIFE interpolation 16fps → 24fps (Practical-RIFE already in repo)

---

### 4. Cut-Out Animation (South Park)

**Visual:** Paper dolls — flat geometric shapes pivoting at joints. Stiff, puppet-like movement. Construction paper texture. Parts slide/rotate rather than deform.

**Timing:** On 4s-6s (4-6 positions/sec). Embraces stiffness.

**AI Workflow:**
- Flux 2: "paper cutout animation, flat geometric shapes, construction paper texture, solid colors, no gradients, puppet-like joints"
- WAN 2.2: Low-noise model, short frames (33 instead of 81)
- Post: FrameSkip to on-4s. Add paper texture overlay. Add shadow between layers.

---

### 5. Squash and Stretch

**Visual:** Objects deform during motion — flattening on impact (squash), elongating during movement (stretch) — while maintaining volume. Bouncing ball, character reactions. Principle #1 of Disney's 12 principles.

**Timing:** Squash/stretch frames: 1-2 frames at extremes. Key poses held longer.

**AI Workflow:**
- Flux 2: Generate separate key frames for squash/stretch states. Prompt: "cartoon character squashed flat on impact, exaggerated deformation"
- WAN 2.2: High-noise model for dramatic deformation. Prompt: "exaggerated cartoon physics, elastic deformation, bouncy movement"
- Post: Insert extreme poses manually at impact/launch points if WAN's deformation is insufficient

---

### 6. Anticipation and Follow-Through

**Visual:**
- Anticipation: Wind-up before action (crouch before jump, pull back before punch)
- Follow-through: Loose elements keep moving after stop (hair swings past, cape wraps)
- Different parts stop at different times (overlapping action)

**Timing:** Ratio ~3:1:4 (anticipation 4-12 frames : action 1-4 frames : follow-through 6-16 frames)

**AI Workflow:**
- Flux 2: Generate 3-4 key poses (wind-up, extreme action, overshoot, settled)
- WAN 2.2: Prompt: "character crouches preparing to jump, then launches upward, hair trailing behind"
- Split into two generations if single generation lacks follow-through

---

### 7. Motion Lines / Speed Lines

**Visual:** Abstract lines behind/around moving objects. In anime: radial lines converging on focal point for drama. Horizontal streaks for running.

**Timing:** 2-6 frames during fast motion. Radial lines can hold 6-12 frames. Often combined with camera shake (1-2px offset).

**AI Workflow:**
- Flux 2: "anime speed lines, radial focus lines, manga style" — handles this well
- WAN 2.2: Prompt with "fast action with speed lines, anime-style motion streaks"
- Best approach: Generate action with WAN, then overlay speed lines generated separately with Flux 2

---

### 8. Rotoscoping

**Visual:** Realistic human movement with drawn/painted overlay. Exact weight and timing of real humans. "Uncanny but beautiful." (A Scanner Darkly, Take On Me video)

**Timing:** Matches source footage (24-30fps). Usually on 1s for maximum realism.

**AI Workflow:**
- Extract frames from live-action video
- ControlNet (AnimeLineArt + DepthAnything) to extract structure
- Flux 2 img2img with style prompts per frame
- Temporal consistency techniques to prevent flicker
- Post: EbSynth temporal propagation + RIFE smoothing

---

### 9. Parallax Animation

**Visual:** Illusion of 3D depth in 2D. Background moves slowly, midground medium, foreground fast. Disney's multiplane camera (Snow White 1937). Rich, cinematic depth.

**Timing:** Standard 24fps. Layer speeds: background 0.1-0.3x, midground 0.5-0.7x, foreground 1.0-1.5x.

**AI Workflow:**
- Flux 2: Generate wide scene image
- DepthAnything V2: Create depth map
- ComfyUI-Depthflow-Nodes: Generate parallax motion (Zoom, Dolly, Ken Burns)
- Or: Separate into 3-5 depth layers, animate each at different speeds

---

### 10. Boiling / Line Boil

**Visual:** Outlines wobble frame-to-frame even when character is still. Organic, hand-drawn, "alive" feeling. Image appears to vibrate/breathe. (Ed, Edd n Eddy, indie animations)

**Timing:** Cycles through 3-6 variant drawings. Each held 1-2 frames. Full cycle: 3-12 frames (loop).

**AI Workflow:**
- Flux 2: Generate same composition 3-6 times with different seeds. Add "hand-drawn, sketchy lines, rough ink outlines"
- Loop variants in sequence using ComfyUI frame assembly
- Post: Apply per-frame random displacement (1-3 pixels)
- FFmpeg: `ffmpeg -i input.mp4 -vf "noise=c0s=3:c0f=t" output.mp4`

---

### 11. Anime-Specific Techniques

#### 11a. Sakuga
High-quality animation bursts within otherwise limited shows. Star animator moments — fights, transformations. Switches from on-3s to on-1s suddenly.

**AI approach:** Generate sakuga moments at full 24fps with WAN (max steps). Surrounding scenes at 8-12fps with FrameSkipping. The contrast creates the sakuga effect.

#### 11b. Still Frames + Camera Pan/Zoom
Static illustration with slow camera movement. Used for drama, establishing shots, budget conservation. Higher image quality since drawn once.

**AI approach:** Generate single high-quality wide image with Flux 2. Apply Ken Burns via Depthflow nodes or FFmpeg:
```
ffmpeg -i input.png -vf "zoompan=z='min(zoom+0.001,1.3)':d=120:s=832x480" output.mp4
```

#### 11c. Impact Frames
Single frames flashing during hits — monochromatic (white/red/inverted), heavy radial speed lines, abstract shapes. 1-3 frames. Visceral power.

**AI approach:** Flux 2: "anime impact frame, monochrome red, radial speed lines, abstract explosive energy, high contrast." Insert at impact points in WAN sequence.

---

### 12. Stop Motion Style

**Visual:** Deliberate choppiness of physical puppets/clay. Subtle position wobble, inconsistent lighting, visible textures. Tactile, physical quality. (Coraline, Wallace & Gromit)

**Timing:** On 2s (12 positions/sec at 24fps). Signature choppy feel.

**AI Workflow:**
- Flux 2: "stop motion animation, claymation, physical puppet, visible texture, handcrafted, miniature set, shallow depth of field"
- WAN 2.2: 16fps, low-noise model, "claymation style, deliberate choppy movement"
- Post: Drop to 12fps. Add 1-2px random jitter. Tilt-shift blur. Film grain. Brightness flicker ±2%.

---

## Part 2: Traditional Pipeline vs AI Pipeline

### Traditional 2D Animation Pipeline

| Stage | Description | Traditional Time |
|---|---|---|
| 1. Story/Script | Narrative, dialogue, timing | 1-2 weeks |
| 2. Concept Art | Visual dev, character design, color keys | 2-4 weeks |
| 3. Storyboard | Scene-by-scene visual planning | 2-3 weeks |
| 4. Animatic | Timed storyboard with scratch audio | 1 week |
| 5. Layout | Backgrounds, camera angles, blocking | 2-3 weeks |
| 6. Key Animation | Senior animators draw key poses | 3-6 weeks |
| 7. Inbetweening | Junior animators fill between keys | 2-4 weeks |
| 8. Clean-Up | Finalize line art, consistent style | 2-3 weeks |
| 9. Color/Paint | Fill colors, shading, highlights | 1-2 weeks |
| 10. Compositing | Combine layers + backgrounds + effects | 1-2 weeks |
| 11. Post-Production | Sound, music, color correction | 1-2 weeks |

### AI-Mapped Pipeline (Muse Studio)

| Traditional Stage | AI Equivalent | Tool |
|---|---|---|
| Story/Script | Story Muse Agent | `story_muse.py` + LLM |
| Concept Art | Character generation | Flux 2 (Stage 1A) |
| Storyboard | Key frame generation | Flux 2 batch |
| Animatic | Ken Burns pan/zoom | Depthflow / FFmpeg |
| Layout | Background + depth maps | Flux 2 + DepthAnything |
| Key Animation | First/last frame generation | Flux 2 (Stages 2-4) |
| Inbetweening | Frame interpolation | WAN 2.2 (Stage 5) |
| Clean-Up | Style consistency | PuLID / IPAdapter |
| Color/Paint | Handled in generation | Flux 2 prompts |
| Compositing | Node graph | ComfyUI masking/blending |
| Post-Production | RIFE + FFmpeg | Practical-RIFE |

### Current 5-Stage Pipeline Mapping

| Your Stage | Traditional Equivalent |
|---|---|
| 1A (character sketch) | Concept Art |
| 1B (character 2D) | Character Model Sheet |
| 2 (first frame) | Layout + Key Animation (pose 1) |
| 3 (last frame) | Key Animation (pose 2) |
| 4A/4B (final frames) | Clean-Up + Color |
| 5 (WAN video) | Inbetweening + Compositing |

---

## Part 3: Style Presets for Workflow

| Style | WAN Model | FPS | Frames | Post-Process | Flux Prompt Additions |
|---|---|---|---|---|---|
| Full Animation | high_noise | 24 | 81 | RIFE to 24fps | "smooth Disney animation, cel shading" |
| Limited/Anime | low_noise | 16 | 49 | FrameSkip to on-3s | "anime style, flat colors, sharp lines" |
| Choppy/on-4s | low_noise | 16 | 33 | FrameSkip to on-4s | "limited animation, held poses" |
| Cut-Out | low_noise | 16 | 33 | FrameSkip + paper texture | "paper cutout, flat geometric, puppet joints" |
| Stop Motion | low_noise | 16 | 49 | 12fps + jitter + grain | "claymation, stop motion, tactile texture" |
| Rotoscope | high_noise | 24 | 81 | Temporal smoothing | "rotoscope, ink lines, traced live action" |
| Line Boil | low_noise | 16 | 49 | Per-frame displacement | "hand-drawn, sketchy, rough ink lines" |
| Sakuga | high_noise | 24 | 81 | None (keep smooth) | "dynamic action, detailed animation, fluid" |

---

## Part 4: Required ComfyUI Custom Nodes

| Node Pack | Purpose |
|---|---|
| `ComfyUI-Frame-Interpolation` | RIFE, FILM, AMT frame interpolation |
| `ComfyUI-FrameSkipping` | Remove frames for choppy styles |
| `ComfyUI-Depthflow-Nodes` | Parallax/Ken Burns from images + depth |
| `ComfyUI-VideoHelperSuite` | Frame assembly, splitting, manipulation |
| `comfyui_controlnet_aux` | Lineart, depth, pose extraction |

## Frame Math Reference

| Style | Effective FPS | Unique Drawings/sec | Frame Hold | Unique frames for 5 sec |
|---|---|---|---|---|
| On 1s (full) | 24 | 24 | 1 frame | 120 |
| On 2s (standard) | 24 | 12 | 2 frames | 60 |
| On 3s (anime) | 24 | 8 | 3 frames | 40 |
| On 4s (limited) | 24 | 6 | 4 frames | 30 |
| Stop motion | 24 | 12 | 2 frames | 60 |
