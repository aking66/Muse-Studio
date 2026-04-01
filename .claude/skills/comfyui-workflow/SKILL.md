---
name: comfyui-workflow
description: Build, edit, and understand ComfyUI workflow JSON files. Use when user wants to create workflows, modify node connections, add models, or understand workflow structure.
triggers:
  - comfyui workflow
  - workflow
  - ورك فلو
  - build workflow
  - create workflow
  - ابني ورك فلو
  - nodes
  - نودز
  - generate image
  - generate video
  - ولد صورة
  - حرك صورة
---

# ComfyUI Workflow Builder Skill

## Reference Repository (cloned locally)
- **Path:** `/Users/ahmed/runpod/workflow_templates/` (433 workflows)
- **Templates:** `templates/*.json`
- **Index:** `templates/index.json`

## Saved Workflows
- `workflows/flux2_text_to_image.json` - Flux 2 text-to-image
- `workflows/flux2_image_edit.json` - Flux 2 image editing
- `workflows/wan2.2_i2v.json` - Wan 2.2 image-to-video
- `workflows/LTX23-*.json` - LTX 2.3 workflows (user custom)

## Two Workflow Formats
1. **Frontend format** - .json files with nodes[], links[], definitions.subgraphs[]
2. **API format** - flat dict sent to `/prompt` endpoint: `{"prompt": {"node_id": {"class_type": "...", "inputs": {...}}}}`

When queuing via API, MUST use API format.

## Installed Models on Volume

### Flux 2 Dev (Image Generation)
| Model | Dir | Size |
|-------|-----|------|
| `flux2_dev_fp8mixed.safetensors` | diffusion_models | 34GB |
| `mistral_3_small_flux2_bf16.safetensors` | text_encoders | 34GB |
| `flux2-vae.safetensors` | vae | 321MB |
| `Flux_2-Turbo-LoRA_comfyui.safetensors` | loras | 2.6GB |

### Wan 2.2 I2V (Video Generation)
| Model | Dir | Size |
|-------|-----|------|
| `wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors` | diffusion_models | 14GB |
| `wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors` | diffusion_models | 14GB |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | text_encoders | 6.3GB |
| `clip_vision_h.safetensors` | clip_vision | 1.2GB |
| `wan_2.1_vae.safetensors` | vae | 243MB |
| `wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors` | loras | 1.2GB |
| `wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors` | loras | 1.2GB |

## Flux 2 Text-to-Image API Prompt
```json
{
  "12": {"class_type": "UNETLoader", "inputs": {"unet_name": "flux2_dev_fp8mixed.safetensors", "weight_dtype": "default"}},
  "38": {"class_type": "CLIPLoader", "inputs": {"clip_name": "mistral_3_small_flux2_bf16.safetensors", "type": "flux2", "device": "default"}},
  "10": {"class_type": "VAELoader", "inputs": {"vae_name": "flux2-vae.safetensors"}},
  "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "PROMPT_HERE", "clip": ["38", 0]}},
  "26": {"class_type": "FluxGuidance", "inputs": {"guidance": 4, "conditioning": ["6", 0]}},
  "47": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
  "48": {"class_type": "Flux2Scheduler", "inputs": {"steps": 20, "width": 1024, "height": 1024}},
  "25": {"class_type": "RandomNoise", "inputs": {"noise_seed": 42}},
  "16": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
  "22": {"class_type": "BasicGuider", "inputs": {"model": ["12", 0], "conditioning": ["26", 0]}},
  "13": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["25", 0], "guider": ["22", 0], "sampler": ["16", 0], "sigmas": ["48", 0], "latent_image": ["47", 0]}},
  "8": {"class_type": "VAEDecode", "inputs": {"samples": ["13", 0], "vae": ["10", 0]}},
  "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "output", "images": ["8", 0]}}
}
```

## Wan 2.2 I2V API Prompt
```json
{
  "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors", "weight_dtype": "default"}},
  "2": {"class_type": "UNETLoader", "inputs": {"unet_name": "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors", "weight_dtype": "default"}},
  "3": {"class_type": "CLIPLoader", "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default"}},
  "4": {"class_type": "VAELoader", "inputs": {"vae_name": "wan_2.1_vae.safetensors"}},
  "5": {"class_type": "CLIPVisionLoader", "inputs": {"clip_name": "clip_vision_h.safetensors"}},
  "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "POSITIVE_PROMPT", "clip": ["3", 0]}},
  "17": {"class_type": "CLIPTextEncode", "inputs": {"text": "blurry, low quality, distorted", "clip": ["3", 0]}},
  "7": {"class_type": "LoadImage", "inputs": {"image": "INPUT_IMAGE.png"}},
  "8": {"class_type": "CLIPVisionEncode", "inputs": {"clip_vision": ["5", 0], "image": ["7", 0], "crop": "center"}},
  "9": {"class_type": "WanImageToVideo", "inputs": {"width": 640, "height": 640, "length": 33, "batch_size": 1, "positive": ["6", 0], "negative": ["17", 0], "vae": ["4", 0], "clip_vision_output": ["8", 0], "start_image": ["7", 0]}},
  "10": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["1", 0], "shift": 8.0}},
  "11": {"class_type": "KSamplerAdvanced", "inputs": {"model": ["10", 0], "positive": ["9", 0], "negative": ["9", 1], "latent_image": ["9", 2], "noise_seed": 42, "steps": 20, "cfg": 3.0, "sampler_name": "uni_pc_bh2", "scheduler": "simple", "start_at_step": 0, "end_at_step": 4, "add_noise": "enable", "return_with_leftover_noise": "enable"}},
  "12": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["2", 0], "shift": 8.0}},
  "13": {"class_type": "KSamplerAdvanced", "inputs": {"model": ["12", 0], "positive": ["9", 0], "negative": ["9", 1], "latent_image": ["11", 0], "noise_seed": 42, "steps": 20, "cfg": 3.0, "sampler_name": "uni_pc_bh2", "scheduler": "simple", "start_at_step": 4, "end_at_step": 20, "add_noise": "disable", "return_with_leftover_noise": "disable"}},
  "14": {"class_type": "VAEDecode", "inputs": {"samples": ["13", 0], "vae": ["4", 0]}},
  "15": {"class_type": "CreateVideo", "inputs": {"images": ["14", 0], "fps": 16.0}},
  "16": {"class_type": "SaveVideo", "inputs": {"video": ["15", 0], "filename_prefix": "animated", "format": "mp4", "codec": "h264"}}
}
```

## Video Prompt Guidelines (Wan 2.2)
When writing prompts for video generation (node CLIPTextEncode):
- **Always specify animation style:** "2D flat animation style, high quality cartoon, fluid motion"
- **Describe motion explicitly:** Wan 2.2 understands descriptive motion. Say exactly what should move: "character swings sword", "character jumps high", "hair blowing in wind"
- **For cartoon/animation:** Include style keywords: "smooth cartoon animation, Rick and Morty style, flat colors, bold outlines"
- **Negative prompt:** Always include quality negatives: "blurry, low quality, distorted, jittery motion, static"
- **Example good prompt:** "A 2D cartoon robot waves its claw arm enthusiastically, screen face shows happy expression, bowler hat wobbles. 2D flat animation style, fluid smooth motion, high quality cartoon"
- **Example bad prompt:** "robot moving" (too vague - Wan needs specific motion description)

## Important Notes
- WanImageToVideo REQUIRES `negative` conditioning input
- Wan 2.2 uses TWO models: high_noise (steps 0-4) + low_noise (steps 4-20)
- Image must exist in `/opt/comfyui-baked/input/` - copy from output if needed
- SaveVideo requires: video (VIDEO type), filename_prefix, format ("mp4"), codec ("h264")
- CreateVideo takes images + fps, outputs VIDEO type
- First run loads models into VRAM (~2-3 min), subsequent runs faster

## Finding New Models
1. Search local repo: `grep -r "model_name" /Users/ahmed/runpod/workflow_templates/templates/`
2. Check HuggingFace repos: Comfy-Org/*, Lightricks/*
3. Download with: `curl -L -o /workspace/ComfyUI/models/DIR/FILE "URL"`
4. ALWAYS verify file size after download
