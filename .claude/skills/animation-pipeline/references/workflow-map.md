# Workflow Node Map

Quick reference for which node IDs to patch in each workflow.

## CRITICAL: Flux 2 uses CLIPLoader NOT DualCLIPLoader

All Flux 2 workflows use `CLIPLoader` (single) with `type: "flux2"`.
- **WRONG:** `DualCLIPLoader` with `clip_name1` + `clip_name2` + `type: "flux"` — that's Flux 1
- **RIGHT:** `CLIPLoader` with `clip_name: "mistral_3_small_flux2_fp8.safetensors"` + `type: "flux2"`
- `clip_l.safetensors` is NOT used by Flux 2

## Required Fixes for RunPod ComfyUI

Before sending ANY workflow, apply these fixes:
1. **ImageScaleToTotalPixels** — add `"resolution_steps": 1` to inputs (newer ComfyUI requires it)
2. **LoadImage nodes** — must reference real files in ComfyUI's input folder. Upload via `/upload/image` or use `blank.png` placeholder
3. **SaveVideo** — add `"format": "mp4"` and `"codec": "h264"` to inputs

Create blank placeholder on RunPod:
```bash
ssh ... "python3 -c \"from PIL import Image; Image.new('RGB',(832,480),(255,255,255)).save('/opt/comfyui-baked/input/blank.png')\""
```

## flux2-sketch-to-image-api.json (Stage 1A)

| Node ID | Title | Class Type | Input Field | What to Patch |
|---------|-------|-----------|-------------|---------------|
| **4** | Sketch (Input) | LoadImage | `inputs.image` | `blank.png` (Stage 1A has no input image) |
| **5** | Scale Sketch | ImageScaleToTotalPixels | `inputs.resolution_steps` | Add `1` (fix for newer ComfyUI) |
| **6** | Prompt (Input) | CLIPTextEncode | `inputs.text` | Prompt string |
| 17 | Generated Image (Output) | SaveImage | — | Output node |

## flux2-ref-to-image-api.json (Stage 1B, 2, 3)

| Node ID | Title | Class Type | Input Field | What to Patch |
|---------|-------|-----------|-------------|---------------|
| **4** | Sketch (Input) | LoadImage | `inputs.image` | Sketch image path |
| **5** | Style Reference Image (Input) | LoadImage | `inputs.image` | Style ref image path |
| **6** | Scale Sketch | ImageScaleToTotalPixels | `inputs.resolution_steps` | Add `1` |
| **7** | Scale Reference | ImageScaleToTotalPixels | `inputs.resolution_steps` | Add `1` |
| **8** | Prompt (Input) | CLIPTextEncode | `inputs.text` | Prompt string |
| 21 | Generated Image (Output) | SaveImage | — | Output node |

### What goes where per stage:

| Stage | Node 4 (Sketch) | Node 5 (Style Ref) | Node 8 (Prompt) |
|-------|-----------------|--------------------|-----------------|
| **1B** | `blank.png` | `blank.png` | Character 2D prompt + [STYLE_KEYWORDS] |
| **2** | `blank.png` | `blank.png` | First frame scene prompt (sketch style) |
| **3** | `blank.png` | `blank.png` | Last frame scene prompt (sketch style) |

**IMPORTANT — Stage 1B lesson:** Do NOT use character_sketch.png as reference for Stage 1B. The ReferenceLatent forces the output to copy the sketch style instead of generating clean styled art. Use `blank.png` for both nodes 4 and 5 — let the prompt control the style entirely.

**IMPORTANT — Stages 2 & 3:** Same principle. Using sketch references copies sketch style. For clean 2D frames with backgrounds, use blank.png and describe everything in the prompt.

## flux2-multiref-scene-api.json (Stage 4A, 4B)

| Node ID | Title | Class Type | Input Field | What to Patch |
|---------|-------|-----------|-------------|---------------|
| **10** | Scene Sketch (Input) | LoadImage | `inputs.image` | Scene sketch path |
| **11** | Character Reference (Input) | LoadImage | `inputs.image` | Character 2D path |
| **12** | Location Reference (Input) | LoadImage | `inputs.image` | Location photo path |
| **20** | Scale Sketch | ImageScaleToTotalPixels | `inputs.resolution_steps` | Add `1` |
| **21** | Scale Character | ImageScaleToTotalPixels | `inputs.resolution_steps` | Add `1` |
| **22** | Scale Location | ImageScaleToTotalPixels | `inputs.resolution_steps` | Add `1` |
| **30** | Scene Prompt (Input) | CLIPTextEncode | `inputs.text` | Final frame prompt + [STYLE_KEYWORDS] |
| 67 | Final Frame (Output) | SaveImage | — | Output node |

### What goes where per stage:

| Stage | Node 10 (Scene) | Node 11 (Character) | Node 12 (Location) | Node 30 (Prompt) |
|-------|-----------------|---------------------|--------------------|--------------------|
| **4A** | first_frame_sketch.png | character_2d.png | location_ref.png (or blank.png) | Final first frame prompt |
| **4B** | last_frame_sketch.png | character_2d.png | location_ref.png (or blank.png) | Final last frame prompt |

## wan22-flf2v-api.json (Stage 5)

| Node ID | Title | Class Type | Input Field | What to Patch |
|---------|-------|-----------|-------------|---------------|
| **10** | First Frame (Input) | LoadImage | `inputs.image` | First frame final path |
| **11** | Last Frame (Input) | LoadImage | `inputs.image` | Last frame final path |
| **12** | Positive Prompt (Input) | CLIPTextEncode | `inputs.text` | Motion prompt |
| **13** | Negative Prompt (Input) | CLIPTextEncode | `inputs.text` | Negative prompt |
| **31** | Save Video (Output) | SaveVideo | `inputs.format`, `inputs.codec` | Must have `"format":"mp4"`, `"codec":"h264"` |

### Negative prompt for video (always use this):
```
3D render, realistic, blurry, distorted, morphing, low quality, jerky motion, flickering, frame skip, inconsistent style, deformed, static image
```

### Fixed settings (do NOT change):

| Setting | Node | Field | Value | Why |
|---------|------|-------|-------|-----|
| Resolution | 14 | width/height | 832×480 | Must match all frames |
| Frames | 14 | length | 81 | ~5 sec @ 16fps (4n+1 rule) |
| CFG | 20, 21 | cfg | 1.0 | Higher = blur/artifacts |
| Steps | 20, 21 | steps | 20 | Split: 10 high + 10 low noise |
| FPS | 32 | fps | 16 | Standard animation rate |
| VBVR LoRA | 5 | strength_model | 0.4 | On high noise expert only |

## Image Upload Before Patching

Before sending a workflow, ALL images referenced in LoadImage nodes must exist in ComfyUI's input folder. Upload via:
```bash
curl -s -X POST "COMFYUI_URL/upload/image" \
  -F "image=@/local/path/to/file.png;filename=remote_name.png" \
  -F "type=input" -F "overwrite=true"
```

## Output Chain Summary

```
Stage 1A output → character_sketch.png (sketch reference only — NOT used as style ref)
                    └─→ Used for composition planning only

Stage 1B output → character_2d.png (styled with [STYLE_KEYWORDS])
                    ├─→ Stage 4A (Character Ref input)
                    └─→ Stage 4B (Character Ref input)

Stage 2 output  → first_frame_sketch.png OR first_frame_final.png
                    └─→ Stage 4A (Scene Sketch input) + Stage 5 (First Frame)

Stage 3 output  → last_frame_sketch.png OR last_frame_final.png
                    └─→ Stage 4B (Scene Sketch input) + Stage 5 (Last Frame)

Stage 4A output → first_frame_final.png
                    └─→ Stage 5  (First Frame input)

Stage 4B output → last_frame_final.png
                    └─→ Stage 5  (Last Frame input)

Stage 5 output  → video.mp4 ✅
```

## Generation Timing (L40S 44GB)

| Stage | First Run | Subsequent |
|-------|-----------|------------|
| Flux2 image (any stage) | ~3.5 min (model loading) | ~60 sec |
| WAN 2.2 video | ~5 min (model loading) | ~2-3 min |
