---
name: animation-pipeline
description: Orchestrate the 2D animation pipeline for Muse Studio — from character description to final video via ComfyUI on RunPod. Use this skill whenever the user mentions "animation pipeline", "run pipeline", "animate shot", "بايب لاين", "أنيميشن", "/animation-pipeline", or wants to generate a 2D animated video from character + scene descriptions. Also trigger when user asks to run stages, generate character sketches for animation, or create first/last frames.
---

# 2D Animation Pipeline

Orchestrate a 7-stage pipeline that turns a character description + scene prompt into a 2D animated video, using ComfyUI workflows running on **RunPod GPU cloud**.

## Architecture

```
Claude Code (this skill)
    ↓ builds workflow JSON
    ↓ sends to backend API
Muse Backend (localhost:4501)
    ↓ forwards to ComfyUI
ComfyUI on RunPod (https://POD_ID-8188.proxy.runpod.net)
    ↓ runs inference on GPU
    ↓ returns output
Muse Backend
    ↓ downloads output to local outputs/
Claude Code
    ↓ shows result, passes to next stage
```

## Before Starting — RunPod Setup

The pipeline requires ComfyUI running on RunPod with models loaded. Before running any stage:

### 1. Check if pod is running
```bash
source /Users/ahmed/runpod/.env
curl -s https://api.runpod.io/graphql \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ myself { pods { id name desiredStatus machine { gpuDisplayName } runtime { uptimeInSeconds } } } }"}' | python3 -m json.tool
```

If no pod running, tell user to start one with the `/runpod` skill first.

### 2. Get ComfyUI URL
Once pod is running, the ComfyUI proxy URL is:
```
https://{POD_ID}-8188.proxy.runpod.net
```

### 3. Set backend to use RunPod ComfyUI
The backend reads `COMFYUI_BASE_URL` env var. Restart the backend with the RunPod URL:
```bash
# Kill existing backend
pkill -f "uvicorn.*app.main:app" 2>/dev/null
sleep 2

# Start with RunPod ComfyUI URL
cd /Users/ahmed/runpod/Muse-Studio/muse_backend
COMFYUI_BASE_URL=https://{POD_ID}-8188.proxy.runpod.net .venv/bin/python -u run.py &
```

**CRITICAL — Learned from testing:**
- The backend does NOT use `dotenv` — it does NOT read `.env` files. You MUST pass `COMFYUI_BASE_URL` as an inline shell env var.
- `pkill` often fails to kill the old process. ALWAYS verify with `lsof -i :4501` after killing. If still occupied, use `kill -9 PID` directly.
- If you start a new backend while the old one is still running, the OLD process keeps serving on port 4501 with the OLD env var. Your new process silently fails to bind.

**Correct restart procedure:**
```bash
# 1. Kill ALL uvicorn processes
kill -9 $(lsof -ti :4501) 2>/dev/null
sleep 2

# 2. Verify port is free
lsof -i :4501 || echo "Port free"

# 3. Start with correct URL
cd /Users/ahmed/runpod/Muse-Studio/muse_backend
COMFYUI_BASE_URL=https://{POD_ID}-8188.proxy.runpod.net .venv/bin/python -u run.py &

# 4. Wait and verify
sleep 5
curl -s http://localhost:4501/health | python3 -m json.tool
```

### 4. Verify connection
```bash
curl -s https://{POD_ID}-8188.proxy.runpod.net/system_stats | python3 -c "import sys,json; d=json.load(sys.stdin); print('ComfyUI', d['system']['comfyui_version'], '| GPU:', d['devices'][0]['name'])"
```

### Local ComfyUI Alternative
If user has ComfyUI running locally (e.g., port 8000):
```bash
COMFYUI_BASE_URL=http://127.0.0.1:8000 .venv/bin/python -u run.py &
```

## Core Principle

Every stage produces an output that feeds into the next. You are the pipeline controller — you propose prompts, get user approval, execute via API, and chain the results.

## Flow Per Stage

For EACH stage, follow this exact sequence:

1. **Announce** — Show stage name, what inputs will be used, and where they come from
2. **Propose prompt** — Generate a prompt using the templates below + character/scene data
3. **Wait for approval** — User may modify the prompt. Do NOT proceed without confirmation
4. **Execute** — Read workflow JSON, patch inputs, send to backend API
5. **Poll** — Check job status every 3 seconds until completed or failed
6. **Show result** — Display the output path and let user review
7. **Confirm** — Wait for user to approve before moving to next stage. If rejected, re-run with adjusted prompt

## The 7 Stages

### Stage 1A: Character Sketch
- **Purpose:** Generate rough sketch reference of the character
- **Workflow:** `flux2-sketch-to-image-api.json`
- **Inputs:** Prompt only (no reference images needed)
- **Output:** `character_sketch.png` → used in Stages 1B, 2, 3

### Stage 1B: Character 2D
- **Purpose:** Convert sketch to polished 2D character sheet
- **Workflow:** `flux2-ref-to-image-api.json`
- **Inputs:** character_sketch.png (Sketch) + prompt
- **Output:** `character_2d.png` → used in Stages 4A, 4B

### Stage 2: First Frame Sketch
- **Purpose:** Sketch the opening scene composition
- **Workflow:** `flux2-ref-to-image-api.json`
- **Inputs:** character_sketch.png (Sketch) + scene prompt
- **Output:** `first_frame_sketch.png` → used in Stages 3, 4A

### Stage 3: Last Frame Sketch
- **Purpose:** Sketch the ending scene (controlled motion difference from first frame)
- **Workflow:** `flux2-ref-to-image-api.json`
- **Inputs:** character_sketch.png (Sketch) + first_frame_sketch.png (Style Reference) + prompt
- **Output:** `last_frame_sketch.png` → used in Stage 4B

### Stage 4A: Final First Frame
- **Purpose:** Render polished 2D first frame from all references
- **Workflow:** `flux2-multiref-scene-api.json`
- **Inputs:** first_frame_sketch.png (Scene Sketch) + character_2d.png (Character Ref) + location_ref (optional) + prompt
- **Output:** `first_frame_final.png` → used in Stage 5

### Stage 4B: Final Last Frame
- **Purpose:** Render polished 2D last frame matching first frame style
- **Workflow:** `flux2-multiref-scene-api.json`
- **Inputs:** last_frame_sketch.png (Scene Sketch) + character_2d.png (Character Ref) + location_ref (optional) + prompt
- **Output:** `last_frame_final.png` → used in Stage 5

### Stage 5: Video Generation
- **Purpose:** Interpolate between first and last frames to create animation
- **Workflow:** `wan22-flf2v-api.json`
- **Inputs:** first_frame_final.png (First Frame) + last_frame_final.png (Last Frame) + positive prompt + negative prompt
- **Output:** `video.mp4`

## Getting Started

When the user triggers this skill:

1. **Check RunPod pod status** — is ComfyUI running? If not, tell user to start it
2. **Verify backend connection** — is backend running with correct COMFYUI_BASE_URL?
3. **Read project data** from SQLite:
```bash
cd /Users/ahmed/runpod/Muse-Studio/muse-studio && node -e "
const Database = require('better-sqlite3');
const db = new Database('db/muse.db');
const projects = db.prepare('SELECT id, title FROM projects').all();
console.log('Projects:', JSON.stringify(projects));
db.close();
"
```
4. Once project is selected, read characters and scenes:
```bash
cd /Users/ahmed/runpod/Muse-Studio/muse-studio && node -e "
const Database = require('better-sqlite3');
const db = new Database('db/muse.db');
const chars = db.prepare('SELECT * FROM characters WHERE project_id = ?').all('PROJECT_ID');
const scenes = db.prepare('SELECT * FROM scenes WHERE project_id = ? ORDER BY scene_number').all('PROJECT_ID');
console.log(JSON.stringify({chars, scenes}, null, 2));
db.close();
"
```
5. Show summary: character name, description, how many shots, planned stages
6. Ask which shot to start with (or run all sequentially)
7. Begin Stage 1A

## Prompt Templates

### Stage 1A — Character Sketch
```
character sketch, rough line art, [CHARACTER_DESCRIPTION],
front view, 3/4 view, side view,
pencil sketch style, white background
```

### Stage 1B — Character 2D
```
character sheet, 2D animated [CHARACTER_DESCRIPTION],
front view, 3/4 view, side view,
flat colors, clean line art, thick black outlines,
cel shading, white background
```

### Stage 2 & 3 — Scene Sketches
```
scene sketch, rough line art,
[CHARACTER_NAME] [ACTION/POSE] in [LOCATION],
[CAMERA_ANGLE], pencil sketch style,
composition reference, clear proportions
```
For Stage 3, describe the ENDING pose (should differ slightly from Stage 2).

### Stage 4A & 4B — Final 2D Frames
```
2D animated scene, [CHARACTER_NAME] [ACTION/POSE],
[BACKGROUND_DESCRIPTION],
flat colors, clean line art, smooth cel shading,
consistent thick black outlines, vibrant colors,
[LIGHTING_DESCRIPTION]
```

### Stage 5 — Video Motion
```
Positive: 2D animated [CHARACTER_NAME] [SPECIFIC_MOTION],
smooth motion, flat colors, clean line art, cel shading,
consistent character proportions, fluid animation

Negative: 3D render, realistic, blurry, distorted, morphing,
low quality, jerky motion, flickering, frame skip,
inconsistent style, deformed
```

## API Execution

### Sending a workflow

1. Read the workflow JSON file:
```bash
cat /Users/ahmed/runpod/Muse-Studio/muse-studio/workflows/[WORKFLOW_FILE].json
```

2. Patch the input values into the correct node IDs (see references/workflow-map.md for node IDs)

3. Send to backend:
```bash
curl -s -X POST http://localhost:4501/generate/comfyui \
  -H 'Content-Type: application/json' \
  -d '{
    "scene_id": "[SCENE_ID]",
    "kind": "image",
    "workflow": {PATCHED_WORKFLOW_JSON},
    "workflow_name": "[STAGE_NAME]"
  }'
```
Response: `{"job_id": "comfy_xxx", "status": "queued"}`

For Stage 5, use `"kind": "video"` instead of `"image"`.

### Polling job status

```bash
curl -s http://localhost:4501/jobs/[JOB_ID]
```
Poll every 3 seconds. Response fields:
- `status`: queued | running | completed | failed
- `output_path`: relative path to output file (e.g., "drafts/filename.png")
- `error`: error message if failed

Output files are saved in `/Users/ahmed/runpod/Muse-Studio/muse_backend/outputs/` directory.

### Patching workflow inputs

For **text inputs** (CLIPTextEncode nodes): set `inputs.text` to the prompt string.

For **image inputs** (LoadImage nodes): set `inputs.image` to the file path of the previous stage output. The ComfyUI runner handles uploading the file to ComfyUI automatically.

**RunPod note:** Image uploads work the same way — the backend uploads local files to the remote ComfyUI via HTTP POST `/upload/image`. The proxy URL handles this transparently.

### Downloading outputs from RunPod

The backend automatically downloads outputs from ComfyUI (whether local or RunPod) to the local `outputs/` directory. You don't need to manually download from RunPod — the backend handles it.

If you need to manually download from RunPod ComfyUI:
```bash
curl -o local_file.png "https://{POD_ID}-8188.proxy.runpod.net/view?filename=FILENAME&type=output"
```

## RunPod-Specific Considerations

### Latency
RunPod adds network latency compared to local ComfyUI:
- Upload images: ~2-5 seconds per image (depends on size)
- Model loading (first run): ~30-60 seconds
- Generation: same as local (GPU-bound)
- Download result: ~2-5 seconds

The 300-second HTTP timeout in the ComfyUI runner is sufficient for all stages including video generation.

### Models on RunPod Volume
All models must be on the RunPod network volume (`/workspace/ComfyUI/models/`). The startup script creates symlinks to ComfyUI's model directories. Required models:

**Flux 2 (Stages 1-4):**
- `checkpoints/flux2_dev_fp8mixed.safetensors`
- `text_encoders/mistral_3_small_flux2_bf16.safetensors`
- `clip/clip_l.safetensors`
- `vae/flux2-vae.safetensors`

**WAN 2.2 (Stage 5):**
- `checkpoints/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors`
- `checkpoints/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors`
- `text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors`
- `vae/wan_2.1_vae.safetensors`
- `loras/Wan22_I2V_VBVR_HIGH_rank_64_fp16.safetensors`

If a model is missing, ComfyUI returns a 400 error. Use the `/runpod` skill to SSH into the pod and download missing models.

### Cost Awareness
- GPU time costs ~$0.86/hr (L40S Secure)
- Stage 1-4 (Flux2): ~20-40 seconds each
- Stage 5 (WAN 2.2 video): ~2-5 minutes
- Full pipeline (7 stages): ~10-15 minutes GPU time
- **Always remind user to stop pod after pipeline completes**

## Critical Rules

### Resolution must match across ALL stages
All stages use **832×480** (16:9). Mismatched resolution causes broken video. Already set in workflow JSONs — do not change.

### WAN 2.2 CFG must stay at 1.0
Higher CFG = blur and artifacts. The workflow has `"cfg": 1.0` — never increase it.

### Frame count must be 4n+1
WAN 2.2 requires: 17, 33, 49, 65, **81** (default), 97. Default 81 = ~5 seconds at 16fps.

### Keep motion small between first/last frames
Stage 2 and Stage 3 should show small-to-medium pose change. Too much difference = broken interpolation.

### Same style keywords across all stages
Copy identical style keywords (flat colors, clean line art, cel shading, thick black outlines) everywhere. Inconsistency = visual discontinuity.

## Multi-Shot Production

For projects with multiple shots:
- Stage 1 (character design) runs **once** — reuse character_sketch.png and character_2d.png
- Stages 2-5 run **per shot**
- **Continuity rule:** Last Frame of Shot N ≈ First Frame of Shot N+1
- Use same location reference across all shots in same scene

## Error Handling

| Error | Cause | Action |
|---|---|---|
| "All connection attempts failed" | Backend can't reach ComfyUI | Check pod is running, verify COMFYUI_BASE_URL |
| "400 Bad Request" on /prompt | Workflow JSON malformed or model missing | Check node IDs, verify models on volume |
| Job stuck at "running" > 5 min | GPU overloaded or ComfyUI hung | Check pod status via RunPod API, restart if needed |
| "CUDA out of memory" | GPU OOM | Reduce batch size or use smaller resolution |
| Output wrong style | Prompt issue | Adjust prompt keywords, re-run stage |
| User rejects output | Quality not good enough | Ask what to change, modify prompt, re-run |
| Pod stopped mid-generation | RunPod idle timeout or manual stop | Restart pod, re-run failed stage |

## End of Pipeline

After Stage 5 completes successfully:
1. Show the video path to the user
2. Ask if they want to run another shot
3. **Remind user to stop the RunPod pod** to save costs
4. Update the scene status in the database if needed
