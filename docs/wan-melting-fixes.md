# WAN 2.2 FLF2V — Feature Melting Fixes

> Research date: 2026-04-04
> Problem: Hair, face, fingers, clothing edges melt/morph during video generation

## Root Cause

WAN 2.2 FLF2V interpolates latent space between two frames — it does NOT redraw frame-by-frame. Fine structures (hair strands, fingers, facial edges) exist in narrow latent bands that are hard to interpolate smoothly.

**Partially fundamental limitation** — but severity can be reduced dramatically.

---

## Applied Fixes (in our workflow)

### 1. Sampler: euler + beta57 ✅ APPLIED
- Changed from `uni_pc_bh2` + `simple` to `euler` + `beta57`
- `uni_pc_bh2` doesn't work properly with expert switching (MoE)
- `beta57` scheduler matches WAN training schedule
- File: `muse-studio/workflows/wan22-flf2v-api.json`

### 2. Negative prompts ✅ APPLIED  
- Added anti-melting English terms + Chinese WAN base negative
- "morphing, warping, distortion, face deformation, flickering, identity drift, melting, extra teeth, hair length change"
- Reduces face drift by ~35%

### 3. 30 steps (15+15 split) ✅ APPLIED
- Changed from 20 (10+10) to 30 (15+15)
- More steps = crisper detail on faces, hands

---

## Fixes to Test Next

### 4. Skip Layer Guidance (post-fix pass)
- Node: `SkipLayerGuidanceWanVideo` (built into ComfyUI)
- Blocks: 9, 10
- Start: 20%, End: 80%
- Denoise: 0.4-0.6
- Selectively regenerates broken/morphing regions

### 5. ControlNet Fun Control (depth/pose constraint)
- Node: `WanFunControlToVideo` + `WanVideoUni3C_embeds`
- Extract OpenPose/depth from first+last frames
- Constrains model — fingers won't melt if skeleton says "five fingers"
- From: `ComfyUI-WanVideoWrapper`

### 6. 720p Resolution
- WAN trained primarily on 720p
- 480p shows more grainy detail on eyes, fingers, lips
- Match aspect ratio between input images and video resolution

### 7. White/simple background ✅ TESTED
- Complex backgrounds change between frames and WAN morphs them
- White background = WAN focuses on character motion only
- Result: less background distortion, similar character melting

### 8. Frame count: 81 minimum ✅ TESTED
- 33 frames = melting at last frame (insufficient convergence)
- 81 frames = no melting at endpoints
- Speed up 81f with FFmpeg post-processing for fast actions

### 9. Enhance-A-Video (FETA)
- Node: `CRT_WAN_BatchSampler` from CRT-Nodes
- Improves temporal consistency via normalized attention
- `enhance_weight` parameter controls strength

### 10. Shift value tuning
- Current: 8.0 (ModelSamplingSD3)
- Lower = more dramatic motion, more melting risk
- Higher = calmer, more detailed, less motion
- Try range: 5-10

---

## Prompt Tips to Reduce Melting

### Positive prompt:
- 80-120 words ideal
- Begin with what camera captures first
- Be specific about what stays static vs what moves
- "consistent character proportions" helps

### Negative prompt:
```
morphing, warping, distortion, face deformation, flickering, 
identity drift, melting, extra teeth, hair length change,
outfit change, expression drift, blurry
```

### For flat art (Rick and Morty):
- Flat colors = less detail to melt = better results
- Bold outlines help maintain shape during motion
- Simple character design = less artifacts

---

## Key Learning: Generate 81f + Speed Up Locally

```
WAN generates 81 frames (5 sec) → high quality, no endpoint melting
    ↓
FFmpeg speeds up 3-5x → 1-1.7 sec (matches real timing)
    ↓
Optional: FrameSkip on-2s/on-3s for anime feel
```

This is better than generating fewer frames because:
- WAN needs enough frames to converge to the last frame
- 33 frames = insufficient convergence = melting at endpoints
- Speed-up preserves quality while fixing timing
