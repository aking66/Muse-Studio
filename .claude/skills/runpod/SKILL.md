---
name: runpod
description: Manage RunPod GPU pods - start, stop, check status, monitor costs, deploy new pods, manage volumes, and execute commands remotely. Use when user wants to control their RunPod pods, check GPU usage, or manage cloud GPU resources.
triggers:
  - runpod
  - start pod
  - stop pod
  - شغل البود
  - وقف البود
  - gpu status
  - حالة البود
  - pod status
  - نزل موديل
  - download model
---

# RunPod Management Skill

## API Configuration
- **Endpoint:** `https://api.runpod.io/graphql`
- **Auth:** `Authorization: Bearer $RUNPOD_API_KEY`
- **Key:** `/Users/ahmed/runpod/.env`
- **Load:** `source /Users/ahmed/runpod/.env`

## CRITICAL: Before Any Pod Operation
**ALWAYS check running pods FIRST before creating new ones:**
```graphql
query { myself { pods { id name desiredStatus machine { gpuDisplayName } runtime { uptimeInSeconds } } } }
```
NEVER create a new pod without checking. The user pays per hour.

## Current Setup
- **Pod ID changes** - always query API to find current pod
- **Volume:** `dcdcqra0a7` - 100GB, EU-NL-1
- **Image:** `runpod/comfyui:latest`
- **Cost:** L40S Secure = $0.86/hr, Volume = $7/month

## Pod Startup Procedure (CRITICAL)
After starting the pod, MUST run startup script to setup symlinks and restart ComfyUI:

1. Start pod via API
2. Wait ~45s for boot
3. Get SSH IP/port from API
4. Upload startup script (first time only):
```bash
scp -P PORT /Users/ahmed/runpod/scripts/pod_startup.sh root@IP:/workspace/
```
Note: SCP may not work via RunPod proxy. Alternative: the script should already be on /workspace/ from previous session.

5. Run startup:
```bash
ssh -tt -o StrictHostKeyChecking=no -i ~/.ssh/id_ed25519 root@IP -p PORT 'bash /workspace/pod_startup.sh'
```

This kills the auto-started ComfyUI, creates symlinks, and starts a new ComfyUI that sees all models.

## SSH Access
- **MUST use `-tt` flag** - RunPod rejects without it
- Key: `~/.ssh/id_ed25519`
- Pod needs `PUBLIC_KEY` env var
- **SCP/SFTP NOT SUPPORTED** - always 0 bytes
- `kill -9` via SSH kills the connection - use separate SSH calls for kill and start
- Use `python3` not `python`

## GraphQL Operations

### List Pods
```graphql
query { myself { pods { id name desiredStatus volumeInGb machine { gpuDisplayName } runtime { uptimeInSeconds } } } }
```

### Pod Details + SSH
```graphql
query { pod(input: { podId: "POD_ID" }) { id desiredStatus runtime { uptimeInSeconds ports { ip publicPort privatePort type } } } }
```

### Stop / Start / Terminate
```graphql
mutation { podStop(input: { podId: "POD_ID" }) { id desiredStatus } }
mutation { podResume(input: { podId: "POD_ID", gpuCount: 1 }) { id desiredStatus } }
mutation { podTerminate(input: { podId: "POD_ID" }) }
```

### Create Pod with Volume
```graphql
mutation { podFindAndDeployOnDemand(input: {
  name: "comfyui-a40", cloudType: SECURE, gpuTypeId: "NVIDIA L40S", gpuCount: 1,
  imageName: "runpod/comfyui:latest", containerDiskInGb: 20,
  networkVolumeId: "dcdcqra0a7", volumeMountPath: "/workspace",
  dataCenterId: "EU-NL-1", ports: "8188/http,8080/http,8888/http,22/tcp",
  env: [{key: "PUBLIC_KEY", value: "SSH_PUB_KEY"}]
}) { id name machine { gpuDisplayName } } }
```

## ComfyUI Architecture on RunPod
- ComfyUI installed at: `/opt/comfyui-baked/`
- Models stored on volume: `/workspace/ComfyUI/models/`
- Symlinks bridge the two (created by startup script)
- Container disk resets on restart - symlinks and output files are LOST
- `/workspace/` persists (network volume)

## Downloading Models
- MUST use `curl -L` (HuggingFace redirects to xet-bridge CDN)
- NEVER use `wget` - truncates files
- ALWAYS verify size after download
- Download via SSH: `ssh -tt ... 'curl -L -o /workspace/ComfyUI/models/DIR/FILE "URL"'`

## File Transfer
- Upload TO pod: Use ComfyUI API or generate on pod (SCP doesn't work)
- Download FROM pod: `curl -o local "https://POD-8188.proxy.runpod.net/view?filename=FILE&type=output"` - WORKS
- Within pod: `cp /opt/comfyui-baked/output/file /opt/comfyui-baked/input/`

## Cost Management
- ALWAYS stop pod after work
- For model downloads only, consider cheaper GPU
- Show uptime when checking status
- Warn if 0% GPU utilization
