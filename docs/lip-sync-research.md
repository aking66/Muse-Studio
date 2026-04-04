# Lip Sync & Audio for 2D Animation — Research

> Research date: 2026-04-04
> Context: Rick and Morty style animation, WAN 2.2 FLF2V pipeline

---

## Core Problem

Most AI lip sync tools use face detection trained on real human faces. 2D cartoon faces (flat colors, no real nose, simplified eyes) cause face detection to fail.

---

## Methods Evaluated

### Tier 1: Best for 2D Cartoon

| Method | 2D Support | Type | VRAM | Rating |
|---|---|---|---|---|
| **MultiTalk** | YES (confirmed) | Audio → Video | 8GB+ | 8/10 |
| **HunyuanVideo-Avatar** | YES (explicit) | Audio → Video | 10GB | 8/10 |
| **Sonic** (Tencent) | YES (documented) | Audio → Video | 20-32GB | 7/10 |
| **Rhubarb Lip Sync** | YES (designed for it) | Traditional (timing data) | 0 (CPU) | Depends |
| **WAN FLF2V mouth clips** | YES | Manual clip chaining | Existing | 6/10 |

### Tier 2: Realistic Only (won't work for cartoon)

| Method | 2D Support | Note |
|---|---|---|
| LatentSync | NO (confirmed) | Explicitly rejects cartoon |
| Hallo2/3 | NO | Photorealistic only |
| EchoMimic | NO evidence | Human face trained |
| Wav2Lip | Unreliable | Face detection fails on 2D |

### Tier 3: Limited/Uncertain

| Method | 2D Support | Note |
|---|---|---|
| InfiniteTalk V2V | Uncertain | Best V2V but face detection may fail on flat art |
| LivePortrait | Limited | Some stylized support, unreliable on flat art |
| SadTalker | Poor (3/10) | Outdated, 256px, over-animates |
| WAN 2.2 S2V | Partial | Generates from scratch, needs cartoon LoRA |

---

## Recommended Approaches

### For Dialogue Scenes (characters talking):

**Option A: MultiTalk** (recommended)
- 2 characters talking in same scene
- Audio-driven lip sync
- Supports cartoon characters
- Built-in TTS (text → speech)
- 8GB VRAM minimum
- GitHub: MeiGen-AI/MultiTalk
- ComfyUI: via ComfyUI-WanVideoWrapper

**Option B: WAN FLF2V clip chaining** (no new tools)
```
Clip 1: mouth closed → mouth open (17 frames)
Clip 2: mouth open → mouth closed (17 frames)
Clip 3: repeat...
    ↓ concat with overlap
= talking animation
    ↓ + audio overlay with FFmpeg
= dialogue scene
```
- Works but manual and labor-intensive
- FLF2V does ONE direction only (A→B), no cycling
- Must chain clips for open-close-open pattern

**Option C: HunyuanVideo-Avatar**
- Explicit cartoon/anime support
- 10GB VRAM
- Open source (Tencent)
- ComfyUI node: ComfyUI_HunyuanAvatar_Sm

### For Action + Sound Effects:

```
FLF2V → video (no mouth)
    ↓
FFmpeg → overlay sound effects
    ↓
ffmpeg -i video.mp4 -i sound.wav -c:v copy -c:a aac output.mp4
```

### For Music/Background Audio:

Same FFmpeg approach — no lip sync needed.

---

## MultiTalk Details (Priority)

- Multi-person dialogue video generation
- Built on Wan2.1-I2V-14B
- Up to 15 seconds (~375 frames at 25fps)
- Supports cartoon/animated characters
- TTS via Kokoro-82M (text input, no recording needed)
- Audio CFG 3-5 for best lip-sync
- Low VRAM: 8GB with `--num_persistent_param_in_dit 0`
- GitHub: MeiGen-AI/MultiTalk

### Models Needed:
- Wan2.1-I2V-14B (or existing WAN 2.2 — check compatibility)
- MultiTalk LoRA weights
- Audio encoder
- Total: ~15-20GB additional

---

## WAN FLF2V Mouth Control (tested)

- First frame closed mouth + last frame open mouth = mouth opens ONCE
- WAN does NOT cycle — one direction only (A→B)
- Cannot control WHEN mouth opens during the video
- Prompt "talking, speaking" has unreliable effect
- GitHub Issue #77: WAN spontaneously animates mouths even unwanted
- Best approach: chain short clips (17f each) for open-close-open pattern

---

## Simple Audio Overlay (FFmpeg)

For non-dialogue scenes or rough sync:
```bash
# Add audio to video
ffmpeg -i video.mp4 -i audio.wav -c:v copy -c:a aac output.mp4

# Trim audio to match video length
ffmpeg -i audio.wav -t 5.0 trimmed.wav

# Merge multiple clips with audio
ffmpeg -f concat -i filelist.txt -c:v libx264 -c:a aac final.mp4
```
