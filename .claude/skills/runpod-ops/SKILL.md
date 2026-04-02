---
name: runpod-ops
description: RunPod cost and performance monitoring for Claude Code. RULE NUMBER ONE — GPU time costs money. Always monitor, always stop pods when done, always track generation times. Use this skill proactively during ANY RunPod GPU work — image generation, video generation, model downloads, or pipeline runs. Triggers on "ops", "monitor", "cost", "gpu status", "performance", "تكلفة", "راقب".
---

# RunPod Operations — Cost & Performance Awareness

## RULE #1: TIME IS MONEY

Every second a RunPod pod is running costs money. This is not a free resource.

| GPU | Cost/hr | Cost/min | Cost/10min |
|-----|---------|----------|------------|
| L40S Secure | $0.86 | $0.014 | $0.14 |
| A40 | $0.76 | $0.013 | $0.13 |
| RTX A6000 | $0.79 | $0.013 | $0.13 |
| RTX 4090 | $0.69 | $0.012 | $0.12 |

**Implications:**
- Every debugging cycle that takes 5 extra minutes = $0.07 wasted
- A 30-minute debugging session from a wrong workflow = $0.43 wasted
- Forgetting to stop a pod overnight (8hrs) = $6.88 wasted

## Before ANY Generation

1. **Validate the workflow LOCALLY first** — check node types, model names, required fields. Do NOT send a broken workflow to RunPod and wait 3 minutes to find out it fails
2. **Check ComfyUI has the models** — `curl COMFYUI_URL/object_info/UNETLoader` before submitting
3. **Test with a quick generation first** — use fewer steps or smaller resolution for a sanity check

## During Generation — Monitor

Track every generation with timing:
```bash
START=$(date +%s)
# ... submit and poll ...
END=$(date +%s)
DURATION=$((END - START))
echo "Generation took ${DURATION}s (~$$(echo "scale=3; $DURATION * 0.86 / 3600" | bc) cost)"
```

### GPU Monitoring Commands
```bash
# One-shot status
ssh -tt ... "nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits"

# Continuous monitoring (every 10s)
ssh -tt ... "nvidia-smi -l 10 --query-gpu=timestamp,utilization.gpu,memory.used,power.draw --format=csv,noheader"
```

### What to watch:
| Metric | Normal | Warning |
|--------|--------|---------|
| GPU Utilization | 80-100% during gen | 0% = model not loaded or stuck |
| VRAM Used | Increases during model load | >95% = OOM risk |
| Temperature | 40-80°C | >85°C = throttling |
| Power | 200-350W during gen | <100W = idle, wasting money |

## After Generation — Record & Decide

Log every generation result:
```
Stage 1A: 212s (first run, model loading) — $0.050
Stage 1B: 60s (model cached) — $0.014
Stage 2: 35s — $0.008
...
Total pipeline: Xs — $X.XX
```

## After ALL Work — STOP THE POD

**ALWAYS remind the user to stop the pod.** This is non-negotiable.

```bash
source /Users/ahmed/runpod/.env
# Get pod ID
POD_ID=$(curl -s https://api.runpod.io/graphql \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ myself { pods { id desiredStatus } } }"}' | python3 -c "
import sys,json
pods=json.load(sys.stdin)['data']['myself']['pods']
running=[p['id'] for p in pods if p['desiredStatus']=='RUNNING']
print(running[0] if running else '')
")

# Stop it
curl -s https://api.runpod.io/graphql \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { podStop(input: { podId: \\\"$POD_ID\\\" }) { id desiredStatus } }\"}"
```

## Cost Optimization Tips

1. **Batch generations** — run all stages back-to-back while model is loaded in VRAM. Don't start pod, run 1 image, stop, start again
2. **Use fp8 models** — half the VRAM of bf16, negligible quality loss, faster loading
3. **First generation is slowest** — model loads to VRAM (~3 min for Flux2). Subsequent runs ~60s. Plan accordingly
4. **Don't download models during expensive GPU time** — download to volume, then start GPU pod
5. **Validate before sending** — every 400 Bad Request wastes the round-trip time + keeps the pod running

## Performance Baselines (L40S 44GB)

| Task | First Run | Cached | VRAM Peak |
|------|-----------|--------|-----------|
| Flux2 image (832×480) | ~210s | ~60s | ~30GB |
| WAN 2.2 video (832×480, 81 frames) | ~300s | ~180s | ~34GB |
| Model download (17GB) | ~5min | N/A | 0 |

## Session Cost Tracking

At the end of every session, summarize:
```
Session: [date]
Pod: [id] | GPU: [type] | Uptime: [minutes]
Generations: [count]
Total GPU cost: $X.XX
Cost per output: $X.XX
```
