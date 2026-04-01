# Animation Pipeline — Implementation Plan

## Overview

Automated 2D animation pipeline inside Muse Studio. Takes a character description + scene prompt and produces a video through 5 stages, all powered by ComfyUI workflows on RunPod.

---

## Current System State

### What EXISTS and works

| Component | Status | File |
|---|---|---|
| ComfyUI Runner | Working — HTTP submit + poll + download | `muse_backend/app/comfyui_runner.py` |
| ComfyUI Workflow Parser | Working — detects (Input)/(Output) nodes | `muse_backend/app/comfyui_workflow.py` + `muse-studio/lib/comfy-parser.ts` |
| Backend endpoint | Working — `POST /generate/comfyui` accepts raw workflow JSON | `muse_backend/app/api/routes/generate.py:186` |
| Job tracking + polling | Working — 2.5s fast / 60s background | `muse-studio/lib/jobs/jobPolling.ts` |
| Workflow upload UI | Working — Settings > ComfyUI | `muse-studio/app/settings/comfyui/page.tsx` |
| ComfyUI Generate Dialog | Working — dynamic form from (Input) nodes | `muse-studio/components/kanban/ComfyGenerateDialog.tsx` |
| Kanban Board | Working — SCRIPT > KEYFRAME > DRAFT_QUEUE > PENDING_APPROVAL > FINAL | `muse-studio/components/kanban/KanbanBoard.tsx` |
| Playground | Working — test workflows + promote results | `muse-studio/components/playground/PlaygroundPageClient.tsx` |
| Character generation | Working — pre-fills prompt from character data | `muse-studio/components/characters/CharacterComfyGenerateDialog.tsx` |
| Supervisor Graph | Working — LangGraph routing | `muse_backend/app/agents/supervisor_graph.py` |
| Muse Control Level | Working — Observer/Assistant/Collaborator UI | Project creation page |

### What EXISTS but is STUB (empty)

| Component | File | Current behavior |
|---|---|---|
| Visual Muse Agent | `muse_backend/app/agents/visual_muse.py` | Returns "use ComfyUI directly" |
| Motion Muse Agent | `muse_backend/app/agents/motion_muse.py` | Returns "use ComfyUI directly" |
| Story Muse Agent | `muse_backend/app/agents/story_muse.py` | Returns placeholder |
| Omni Batch | `muse_backend/app/agents/omni_batch.py` | Queue without execution |

### What DOES NOT EXIST (must build)

| Component | Purpose |
|---|---|
| `comfyui_workflow_builder.py` | Build Flux2 + WAN workflow JSON dynamically in Python |
| `animation_pipeline.py` | LangGraph agent — orchestrate 5 stages, chain outputs |
| `AnimationPipelineState` | TypedDict for pipeline state (character, frames, stage outputs) |
| Error classifier | Classify ComfyUI errors → retry / fallback / ask user |
| `POST /generate/animation-pipeline` | API endpoint for pipeline |
| Animation Pipeline UI | Frontend page with stepper, stage previews, Run All button |

---

## Pipeline Stages

```
User Input: character description + scene prompt
    |
Stage 1A -> ComfyUI (flux2-sketch-to-image)    -> character_sketch.png
    |
Stage 1B -> ComfyUI (flux2-ref-to-image)       -> character_2d.png
    |
Stage 2  -> ComfyUI (flux2-ref-to-image)       -> first_frame_sketch.png
    |
Stage 3  -> ComfyUI (flux2-ref-to-image)       -> last_frame_sketch.png
    |
Stage 4A -> ComfyUI (flux2-multiref-scene)     -> first_frame_final.png
    |
Stage 4B -> ComfyUI (flux2-multiref-scene)     -> last_frame_final.png
    |
Stage 5  -> ComfyUI (wan22-flf2v)              -> video.mp4
```

### Stage Details

#### Stage 1A — Character Sketch
- **Workflow:** `flux2-sketch-to-image-api.json` (17 nodes)
- **Input:** Prompt only (no reference images)
- **Key nodes:** 1 LoadImage (sketch placeholder) + 1 ReferenceLatent
- **Output:** `character_sketch.png`

#### Stage 1B — Character 2D
- **Workflow:** `flux2-ref-to-image-api.json` (21 nodes)
- **Input:** character_sketch.png as Sketch (Input) + Prompt
- **Key nodes:** 2 LoadImage + 2 ReferenceLatent (chained)
- **Output:** `character_2d.png`

#### Stage 2 — First Frame Sketch
- **Workflow:** `flux2-ref-to-image-api.json` (same as 1B)
- **Input:** character_sketch.png as Sketch + scene prompt
- **Output:** `first_frame_sketch.png`

#### Stage 3 — Last Frame Sketch
- **Workflow:** `flux2-ref-to-image-api.json` (same as 1B)
- **Input:** character_sketch.png as Sketch + first_frame_sketch.png as Style Reference + prompt
- **Output:** `last_frame_sketch.png`

#### Stage 4A — Final First Frame
- **Workflow:** `flux2-multiref-scene-api.json` (19 nodes)
- **Input:** first_frame_sketch.png + character_2d.png + location_ref (optional) + prompt
- **Key nodes:** 3 LoadImage + 3 ReferenceLatent (chained)
- **Output:** `first_frame_final.png`

#### Stage 4B — Final Last Frame
- **Workflow:** `flux2-multiref-scene-api.json` (same as 4A)
- **Input:** last_frame_sketch.png + character_2d.png + location_ref (optional) + prompt
- **Output:** `last_frame_final.png`

#### Stage 5 — Video Generation
- **Workflow:** `wan22-flf2v-api.json` (12 nodes, different model)
- **Input:** first_frame_final.png + last_frame_final.png + positive/negative prompts
- **Models:** WAN 2.2 high/low noise experts + VBVR LoRA
- **Settings:** 832x480, 81 frames, CFG 1.0, 20 steps (10+10 split)
- **Output:** `video.mp4`

---

## Workflow Architecture

### 3 Flux2 Workflows share same base

All three Flux2 workflows are identical except for reference count:

| Part | sketch-to-image | ref-to-image | multiref-scene |
|---|---|---|---|
| UNET + CLIP + VAE | Same (nodes 1-3) | Same (nodes 1-3) | Same (nodes 1-3) |
| Sampler pipeline | Same | Same | Same |
| LoadImage inputs | **1** | **2** | **3** |
| ReferenceLatent chain | **1** | **2 chained** | **3 chained** |

### Dynamic builder option

Instead of 3 static JSON files, a single Python function could build the workflow:

```python
def build_flux2_workflow(
    prompt: str,
    references: list[dict],  # [{"image": "path", "role": "sketch"}, ...]
    width: int = 832,
    height: int = 480,
    steps: int = 28,
    guidance: float = 5.5,
) -> dict:
    # Base nodes (UNET, CLIP, VAE) - always same
    # Dynamically add LoadImage -> Scale -> Encode -> ReferenceLatent per reference
    # Add sampler pipeline connected to last ReferenceLatent
```

### WAN 2.2 stays separate
Completely different model pipeline (WAN vs Flux2), different node types.

---

## ComfyUI Connection

### Current config
- **Env var:** `COMFYUI_BASE_URL` (default `http://127.0.0.1:8188`)
- **Used in:** `muse_backend/app/api/routes/generate.py:252`
- **Protocol:** HTTP only (no WebSocket — intentionally avoided)

### RunPod setup needed
- Set `COMFYUI_BASE_URL=https://{POD_ID}-8188.proxy.runpod.net`
- Same HTTP protocol works for RunPod proxy
- Timeouts: 300s HTTP client (sufficient for long workflows)

### API calls to ComfyUI
```
POST /prompt                    — submit workflow
GET  /history/{prompt_id}       — poll status (every 1.5-2s)
GET  /view?filename=...         — download output
POST /upload/image              — upload input media
POST /upload/audio              — upload input audio
```

---

## Frontend UI Flow (Current — Manual)

### User must do each stage manually:

1. Settings > ComfyUI > Upload workflow JSONs
2. Project > Kanban > Scene > "Create Image frame"
3. Select workflow > Fill inputs > Generate > Wait
4. Take output > Go back > Select next workflow > Paste output as input > Generate
5. Repeat 7 times

### Proposed Pipeline UI:

```
/projects/[id]/animation-pipeline

+-------------------------------------------+
| Animation Pipeline                        |
| Character: [description input]            |
| Scene: [prompt input]                     |
| [Run All] [Run Step by Step]              |
+-------------------------------------------+
|                                           |
| Stage 1A: Character Sketch    [Run] [OK]  |
| [preview image]                           |
|                                           |
| Stage 1B: Character 2D        [Run] [OK]  |
| [preview image]                           |
|                                           |
| Stage 2: First Frame Sketch   [Run] [OK]  |
| [preview image]                           |
|                                           |
| Stage 3: Last Frame Sketch    [Run] [OK]  |
| [preview image]                           |
|                                           |
| Stage 4: Final Frames          [Run] [OK]  |
| [first] [last]                            |
|                                           |
| Stage 5: Video                 [Run] [OK]  |
| [video player]                            |
+-------------------------------------------+
```

### Muse Control Level behavior:
- **Observer:** Shows pipeline stages, no auto-run
- **Assistant:** Runs each stage, waits for user approval before next
- **Collaborator:** Runs all 5 stages automatically, shows final result

---

## Error Classification (To Build)

| Error Type | Detection | Action |
|---|---|---|
| `RateLimitError` | HTTP 429 from ComfyUI | Wait + retry (exponential backoff) |
| `TimeoutError` | No history after 120s | Retry with longer timeout |
| `NodeError` | ComfyUI execution_error in history | Log + retry stage, or ask user |
| `GPU OOM` | CUDA out of memory in error | Reduce resolution, retry |
| `ConnectionError` | Cannot reach ComfyUI URL | Check RunPod pod status, notify user |
| `OutputMissing` | History exists but no output files | Retry download (up to 5 times — already implemented) |
| `QualityBad` | User rejects output | Re-run stage with same/adjusted params (HITL) |

---

## Models Required on RunPod

### Flux 2 (Stages 1-4)
| Model | Size | Status |
|---|---|---|
| flux2_dev_fp8mixed.safetensors | ~12GB | On volume |
| mistral_3_small_flux2_bf16.safetensors | ~8GB | Need download |
| clip_l.safetensors | ~250MB | On volume |
| flux2-vae.safetensors | ~350MB | On volume |

### WAN 2.2 (Stage 5)
| Model | Status |
|---|---|
| wan2.2_i2v_high_noise_14B_fp8_scaled | On volume |
| wan2.2_i2v_low_noise_14B_fp8_scaled | On volume |
| umt5_xxl_fp8_e4m3fn_scaled | On volume |
| wan_2.1_vae | On volume |
| Wan22_I2V_VBVR_HIGH_rank_64_fp16 (LoRA) | On volume |

---

## Multi-Shot Production

```
Shot 1: Stages 2-5 -> Video A
Shot 2: Stages 2-5 -> Video B  (First Frame B ~ Last Frame A)
Shot 3: Stages 2-5 -> Video C  (First Frame C ~ Last Frame B)
```

- Character design (Stage 1) runs once per character
- Each shot reuses character_sketch.png and character_2d.png
- Last Frame of Shot N ~ First Frame of Shot N+1

---

## Implementation Order

1. **`comfyui_workflow_builder.py`** — Build Flux2 + WAN JSON dynamically
2. **`animation_pipeline.py`** — LangGraph agent with 5 stage nodes
3. **`POST /generate/animation-pipeline`** — API endpoint
4. **Error classifier** — Classify + retry/fallback
5. **Frontend UI** — Pipeline stepper page
6. **Supervisor integration** — `next_task = "animate"` routes to pipeline
7. **Multi-shot support** — Chain shots with frame continuity

---

## Key File References

### Backend
- `muse_backend/app/comfyui_runner.py` — HTTP client for ComfyUI
- `muse_backend/app/comfyui_workflow.py` — Workflow parser
- `muse_backend/app/api/routes/generate.py:186-290` — ComfyUI endpoint
- `muse_backend/app/agents/base.py` — Agent state types
- `muse_backend/app/agents/supervisor_graph.py` — Supervisor routing

### Frontend
- `muse-studio/components/kanban/KanbanBoard.tsx` — Main project board
- `muse-studio/components/kanban/ComfyGenerateDialog.tsx` — Dynamic input form
- `muse-studio/components/kanban/ComfyWorkflowSelectDialog.tsx` — Workflow picker
- `muse-studio/components/playground/PlaygroundPageClient.tsx` — Playground
- `muse-studio/lib/comfy-parser.ts` — Client-side workflow parser
- `muse-studio/lib/actions/comfyui.ts` — Server actions for workflow CRUD
- `muse-studio/lib/jobs/jobPolling.ts` — Job polling logic

### Workflows
- `muse-studio/workflows/flux2-sketch-to-image-api.json` — Stage 1A
- `muse-studio/workflows/flux2-ref-to-image-api.json` — Stage 1B, 2, 3
- `muse-studio/workflows/flux2-multiref-scene-api.json` — Stage 4
- `muse-studio/workflows/wan22-flf2v-api.json` — Stage 5

### Config
- `muse-studio/.env.local` — COMFYUI_BASE_URL, MUSE_BACKEND_URL
- `muse_backend/muse_config.json` — Server host/port
- `muse_backend/.env.example` — API keys template
