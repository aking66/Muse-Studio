# Workflow Node Map

Quick reference for which node IDs to patch in each workflow.

## flux2-sketch-to-image-api.json (Stage 1A)

| Node ID | Title | Class Type | Input Field | What to Patch |
|---------|-------|-----------|-------------|---------------|
| **4** | Sketch (Input) | LoadImage | `inputs.image` | Image file path |
| **6** | Prompt (Input) | CLIPTextEncode | `inputs.text` | Prompt string |
| 17 | Generated Image (Output) | SaveImage | — | Output node |

**Stage 1A note:** For the very first stage, node 4 (Sketch) needs a placeholder image or can be left as-is since the model generates from prompt + noise.

## flux2-ref-to-image-api.json (Stage 1B, 2, 3)

| Node ID | Title | Class Type | Input Field | What to Patch |
|---------|-------|-----------|-------------|---------------|
| **4** | Sketch (Input) | LoadImage | `inputs.image` | Sketch image path |
| **5** | Style Reference Image (Input) | LoadImage | `inputs.image` | Style ref image path |
| **8** | Prompt (Input) | CLIPTextEncode | `inputs.text` | Prompt string |
| 21 | Generated Image (Output) | SaveImage | — | Output node |

### What goes where per stage:

| Stage | Node 4 (Sketch) | Node 5 (Style Ref) | Node 8 (Prompt) |
|-------|-----------------|--------------------|-----------------|
| **1B** | character_sketch.png | _(empty/placeholder)_ | Character 2D prompt |
| **2** | character_sketch.png | _(empty/placeholder)_ | First frame scene prompt |
| **3** | character_sketch.png | first_frame_sketch.png | Last frame scene prompt |

## flux2-multiref-scene-api.json (Stage 4A, 4B)

| Node ID | Title | Class Type | Input Field | What to Patch |
|---------|-------|-----------|-------------|---------------|
| **10** | Scene Sketch (Input) | LoadImage | `inputs.image` | Scene sketch path |
| **11** | Character Reference (Input) | LoadImage | `inputs.image` | Character 2D path |
| **12** | Location Reference (Input) | LoadImage | `inputs.image` | Location photo path |
| **30** | Scene Prompt (Input) | CLIPTextEncode | `inputs.text` | Final frame prompt |
| 67 | Final Frame (Output) | SaveImage | — | Output node |

### What goes where per stage:

| Stage | Node 10 (Scene) | Node 11 (Character) | Node 12 (Location) | Node 30 (Prompt) |
|-------|-----------------|---------------------|--------------------|--------------------|
| **4A** | first_frame_sketch.png | character_2d.png | location_ref.png (optional) | Final first frame prompt |
| **4B** | last_frame_sketch.png | character_2d.png | location_ref.png (optional) | Final last frame prompt |

## wan22-flf2v-api.json (Stage 5)

| Node ID | Title | Class Type | Input Field | What to Patch |
|---------|-------|-----------|-------------|---------------|
| **10** | First Frame (Input) | LoadImage | `inputs.image` | First frame final path |
| **11** | Last Frame (Input) | LoadImage | `inputs.image` | Last frame final path |
| **12** | Positive Prompt (Input) | CLIPTextEncode | `inputs.text` | Motion prompt |
| **13** | Negative Prompt (Input) | CLIPTextEncode | `inputs.text` | Negative prompt |
| 31 | Save Video (Output) | SaveVideo | — | Output node |

### Fixed settings (do NOT change):

| Setting | Node | Field | Value | Why |
|---------|------|-------|-------|-----|
| Resolution | 14 | width/height | 832×480 | Must match all frames |
| Frames | 14 | length | 81 | ~5 sec @ 16fps (4n+1 rule) |
| CFG | 20, 21 | cfg | 1.0 | Higher = blur/artifacts |
| Steps | 20, 21 | steps | 20 | Split: 10 high + 10 low noise |
| FPS | 32 | fps | 16 | Standard animation rate |
| VBVR LoRA | 5 | strength_model | 0.4 | On high noise expert only |

## Output Chain Summary

```
Stage 1A output → character_sketch.png
                    ├─→ Stage 1B (Sketch input)
                    ├─→ Stage 2  (Sketch input)
                    └─→ Stage 3  (Sketch input)

Stage 1B output → character_2d.png
                    ├─→ Stage 4A (Character Ref input)
                    └─→ Stage 4B (Character Ref input)

Stage 2 output  → first_frame_sketch.png
                    ├─→ Stage 3  (Style Ref input)
                    └─→ Stage 4A (Scene Sketch input)

Stage 3 output  → last_frame_sketch.png
                    └─→ Stage 4B (Scene Sketch input)

Stage 4A output → first_frame_final.png
                    └─→ Stage 5  (First Frame input)

Stage 4B output → last_frame_final.png
                    └─→ Stage 5  (Last Frame input)

Stage 5 output  → video.mp4 ✅
```
