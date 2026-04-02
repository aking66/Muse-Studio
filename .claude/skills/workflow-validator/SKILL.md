---
name: workflow-validator
description: Validate ComfyUI workflow JSON files against local ComfyUI Desktop before deploying to RunPod. Catches structure errors (wrong nodes, broken connections, missing fields) without needing GPU models. Use this skill after creating or modifying any workflow JSON, before sending to RunPod. Triggers on "validate workflow", "check workflow", "test workflow", "فحص الورك فلو", "/validate", "workflow valid".
---

# ComfyUI Workflow Validator

Validate workflow JSON files against local ComfyUI Desktop (port 8000) to catch structure errors before wasting RunPod GPU time.

## Why This Matters

Every broken workflow sent to RunPod = wasted money ($0.86/hr). Validate locally FIRST — it's free and instant.

## What It Catches vs What It Can't

| Catches (Structure) | Can't Catch (Runtime) |
|---|---|
| Unknown node types | Model quality/output |
| Missing required inputs | VRAM overflow (OOM) |
| Wrong connection types | Generation speed |
| Invalid field values | PuLID face matching quality |
| Missing resolution_steps | Video interpolation quality |

## Prerequisites

- ComfyUI Desktop running on `http://127.0.0.1:8000`
- `blank.png` in ComfyUI input folder

Create blank.png if missing:
```bash
python3 -c "from PIL import Image; Image.new('RGB',(832,480),(255,255,255)).save('/Users/ahmed/Documents/ComfyUI/input/blank.png')"
```

## How to Validate

### Single Workflow
```bash
cd /Users/ahmed/runpod/Muse-Studio/muse-studio

python3 -c "
import json, urllib.request, sys

wf = json.load(open('workflows/WORKFLOW_NAME.json'))

# Prep for local validation
for nid, node in wf.items():
    # Replace image refs with blank.png (local doesn't have pipeline outputs)
    if node.get('class_type') == 'LoadImage':
        node['inputs']['image'] = 'blank.png'
    # Add resolution_steps fix
    if node.get('class_type') == 'ImageScaleToTotalPixels':
        node['inputs'].setdefault('resolution_steps', 1)

# Remove PuLID nodes (not installed on local Desktop)
pulid_nodes = [nid for nid, n in wf.items() if 'PuLID' in n.get('class_type', '')]
for nid in pulid_nodes:
    del wf[nid]

# Fix BasicGuider model connection (was pointing to PuLID node 103)
for nid, node in wf.items():
    if node.get('class_type') == 'BasicGuider' and node['inputs'].get('model') == ['103', 0]:
        node['inputs']['model'] = ['1', 0]

# Send to local ComfyUI
req = urllib.request.Request(
    'http://127.0.0.1:8000/prompt',
    data=json.dumps({'prompt': wf, 'client_id': 'validate'}).encode(),
    headers={'Content-Type': 'application/json'}
)
try:
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    print('✅ VALID — prompt_id:', data.get('prompt_id'))
except urllib.error.HTTPError as e:
    body = json.loads(e.read())
    model_errs = 0
    struct_errs = 0
    for nid, err in body.get('node_errors', {}).items():
        for e2 in err.get('errors', []):
            detail = e2.get('details', '')
            if 'not in' in detail:
                model_errs += 1
            else:
                struct_errs += 1
                print(f'❌ STRUCTURE ERROR Node {nid}: {detail}')
    if struct_errs == 0:
        print(f'✅ STRUCTURE VALID — {model_errs} model(s) not on local (expected on RunPod)')
    else:
        print(f'❌ {struct_errs} structure error(s) found')
        sys.exit(1)
"
```

### All Pipeline Workflows at Once
```bash
cd /Users/ahmed/runpod/Muse-Studio/muse-studio

for WF in workflows/flux2-*.json workflows/wan22-*.json; do
  echo "=== $(basename $WF) ==="
  python3 -c "
import json, urllib.request
wf = json.load(open('$WF'))
for nid, node in wf.items():
    if node.get('class_type') == 'LoadImage': node['inputs']['image'] = 'blank.png'
    if node.get('class_type') == 'ImageScaleToTotalPixels': node['inputs'].setdefault('resolution_steps', 1)
pulid_nodes = [nid for nid, n in wf.items() if 'PuLID' in n.get('class_type', '')]
for nid in pulid_nodes: del wf[nid]
for nid, node in wf.items():
    if node.get('class_type') == 'BasicGuider' and node['inputs'].get('model') == ['103', 0]:
        node['inputs']['model'] = ['1', 0]
req = urllib.request.Request('http://127.0.0.1:8000/prompt',
    data=json.dumps({'prompt': wf, 'client_id': 'validate'}).encode(),
    headers={'Content-Type': 'application/json'})
try:
    resp = urllib.request.urlopen(req)
    print('  ✅ VALID')
except urllib.error.HTTPError as e:
    body = json.loads(e.read())
    model_errs = 0; struct_errs = 0
    for nid, err in body.get('node_errors',{}).items():
        for e2 in err.get('errors',[]):
            if 'not in' in e2.get('details',''): model_errs += 1
            else: struct_errs += 1; print(f'  ❌ Node {nid}: {e2.get(\"details\",\"\")}')
    if struct_errs == 0: print(f'  ✅ STRUCTURE VALID — {model_errs} model(s) not local')
    else: print(f'  ❌ {struct_errs} structure errors')
  "
  echo ""
done
```

## Understanding Results

### ✅ STRUCTURE VALID — X model(s) not on local
This is **good**. The workflow structure is correct. The model errors are expected because Flux2/WAN models are only on RunPod, not on your Mac.

### ❌ STRUCTURE ERROR
This is **bad**. Something is wrong with the workflow:
- `Unknown node type` → class_type doesn't exist, check spelling
- `Required input missing` → a node connection is broken
- `Value not in list` (for non-model fields) → wrong enum value
- `Custom validation failed` → node-specific error

### Expected "model not in" errors per workflow

| Workflow | Expected Missing Models |
|---|---|
| flux2-sketch-to-image | 2 (UNET + CLIP) |
| flux2-ref-to-image | 2 (UNET + CLIP) |
| flux2-multiref-scene | 2 (UNET + CLIP) |
| wan22-flf2v | 5 (2 UNET + CLIP + VAE + LoRA) |

If you see MORE errors than expected, something is wrong.

## What to Validate After

Run this validation after:
1. Creating a new workflow JSON
2. Adding/removing nodes (like PuLID)
3. Changing node connections
4. Updating model file names
5. Before deploying to RunPod

## Local vs RunPod Differences

| Feature | Local Desktop (8000) | RunPod (8188) |
|---|---|---|
| PuLID nodes | ❌ Not installed | ✅ Installed |
| Flux2 models | ❌ Not downloaded | ✅ On volume |
| WAN 2.2 models | ❌ Not downloaded | ✅ On volume |
| SDXL Turbo | ✅ Available | ❌ Not needed |
| blank.png | Must create locally | Created by startup script |
| SaveVideo codec | Must have format+codec | Must have format+codec |
| resolution_steps | Required | Required |

## Validation for RunPod (when pod is running)

If the RunPod pod is running, validate directly against it — this catches model issues too:
```bash
COMFYUI_URL="https://POD_ID-8188.proxy.runpod.net"

python3 -c "
import json, urllib.request
wf = json.load(open('workflows/WORKFLOW_NAME.json'))
# Only fix LoadImage — don't remove PuLID
for nid, node in wf.items():
    if node.get('class_type') == 'LoadImage': node['inputs']['image'] = 'blank.png'
    if node.get('class_type') == 'ImageScaleToTotalPixels': node['inputs'].setdefault('resolution_steps', 1)
req = urllib.request.Request('$COMFYUI_URL/prompt',
    data=json.dumps({'prompt': wf, 'client_id': 'validate'}).encode(),
    headers={'Content-Type': 'application/json'})
try:
    resp = urllib.request.urlopen(req)
    print('✅ FULLY VALID — ready for generation')
except urllib.error.HTTPError as e:
    body = json.loads(e.read())
    for nid, err in body.get('node_errors',{}).items():
        for e2 in err.get('errors',[]):
            print(f'❌ Node {nid}: {e2.get(\"details\",\"\")}')
"
```
