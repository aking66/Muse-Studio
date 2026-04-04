"""
Anime Style Test — Full Pipeline Automation
Runs all 3 test scenes through the complete pipeline on RunPod ComfyUI.

Usage:
    COMFYUI_BASE_URL=https://<pod-id>-8188.proxy.runpod.net python3 run_experiment.py
"""

import json
import os
import sys
import time
import copy
import random
import urllib.request
import urllib.parse
from pathlib import Path

# -------------------------------------------------------------------
# Config
# -------------------------------------------------------------------
COMFYUI_URL = os.environ.get("COMFYUI_BASE_URL", "http://127.0.0.1:8188")
EXPERIMENT_DIR = Path(__file__).parent
WORKFLOW_DIR = EXPERIMENT_DIR.parent.parent / "muse-studio" / "workflows"
OUTPUT_DIR = EXPERIMENT_DIR / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

EXPERIMENT = json.loads((EXPERIMENT_DIR / "experiment.json").read_text())
SCENES = EXPERIMENT["scenes"]
CHARACTER = EXPERIMENT["character"]

# Workflow templates
WF_SKETCH = json.loads((WORKFLOW_DIR / "flux2-sketch-to-image-api.json").read_text())
WF_REF = json.loads((WORKFLOW_DIR / "flux2-ref-to-image-api.json").read_text())
WF_MULTIREF = json.loads((WORKFLOW_DIR / "flux2-multiref-scene-api.json").read_text())
WF_WAN = json.loads((WORKFLOW_DIR / "wan22-flf2v-api.json").read_text())


# -------------------------------------------------------------------
# ComfyUI HTTP helpers
# -------------------------------------------------------------------
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ComfyUI-Client/1.0",
    "Accept": "*/*",
}


def comfy_post(endpoint: str, data: dict) -> dict:
    """POST JSON to ComfyUI."""
    body = json.dumps(data).encode()
    headers = {**HEADERS, "Content-Type": "application/json"}
    req = urllib.request.Request(
        f"{COMFYUI_URL}/{endpoint}",
        data=body,
        headers=headers,
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        return json.loads(resp.read())


def comfy_get(endpoint: str) -> dict:
    """GET from ComfyUI."""
    req = urllib.request.Request(f"{COMFYUI_URL}/{endpoint}", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


def upload_image(filepath: str, filename: str) -> str:
    """Upload an image to ComfyUI input folder."""
    boundary = f"----Boundary{random.randint(100000,999999)}"
    file_data = Path(filepath).read_bytes()

    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'
        f"Content-Type: image/png\r\n\r\n"
    ).encode() + file_data + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        f"{COMFYUI_URL}/upload/image",
        data=body,
        headers={**HEADERS, "Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read()).get("name", filename)


def queue_prompt(workflow: dict) -> str:
    """Submit a workflow and return prompt_id."""
    resp = comfy_post("prompt", {"prompt": workflow})
    prompt_id = resp.get("prompt_id")
    if not prompt_id:
        print(f"  ERROR: {resp}")
        sys.exit(1)
    return prompt_id


def wait_for_result(prompt_id: str, timeout: int = 600) -> dict:
    """Poll /history until the prompt completes."""
    start = time.time()
    while time.time() - start < timeout:
        history = comfy_get(f"history/{prompt_id}")
        if prompt_id in history:
            entry = history[prompt_id]
            status = entry.get("status", {})
            if status.get("completed", False) or status.get("status_str") == "success":
                return entry
            if status.get("status_str") == "error":
                print(f"  GENERATION ERROR: {json.dumps(status, indent=2)}")
                sys.exit(1)
        time.sleep(2)
    print(f"  TIMEOUT after {timeout}s")
    sys.exit(1)


def download_output(history_entry: dict, save_path: str) -> str:
    """Download the first output file from a completed prompt."""
    outputs = history_entry.get("outputs") or {}
    if not outputs:
        # Try alternate structure
        outputs = {k: v for k, v in history_entry.items() if isinstance(v, dict) and ("images" in v or "videos" in v)}
    for node_id, node_out in outputs.items():
        for key in ("images", "videos", "gifs"):
            if key in node_out:
                for item in node_out[key]:
                    fname = item["filename"]
                    subfolder = item.get("subfolder", "")
                    ftype = item.get("type", "output")
                    url = f"{COMFYUI_URL}/view?filename={urllib.parse.quote(fname)}&subfolder={urllib.parse.quote(subfolder)}&type={ftype}"
                    req = urllib.request.Request(url, headers=HEADERS)
                    with urllib.request.urlopen(req, timeout=120) as resp:
                        Path(save_path).write_bytes(resp.read())
                    return save_path
    print("  WARNING: No output found in history")
    return ""


# -------------------------------------------------------------------
# Workflow builders — fill templates with scene-specific data
# -------------------------------------------------------------------
def fix_resolution_steps(wf: dict) -> dict:
    """Add resolution_steps to ImageScaleToTotalPixels nodes."""
    for nid, node in wf.items():
        if node.get("class_type") == "ImageScaleToTotalPixels":
            node["inputs"]["resolution_steps"] = 1
    return wf


def strip_pulid(wf: dict) -> dict:
    """Remove PuLID nodes and reconnect model directly to BasicGuider."""
    for nid in ["100", "101", "102", "103"]:
        wf.pop(nid, None)
    # Reconnect any node that referenced "103" (PuLID output) to "1" (UNET)
    for nid, node in wf.items():
        if not isinstance(node, dict) or "inputs" not in node:
            continue
        for key, val in node["inputs"].items():
            if isinstance(val, list) and len(val) == 2 and val[0] == "103":
                node["inputs"][key] = ["1", 0]
    return wf


def build_stage_1a(prompt: str) -> dict:
    """Stage 1A: Character Sketch (no reference images)."""
    wf = copy.deepcopy(WF_SKETCH)
    wf["4"]["inputs"]["image"] = "blank.png"
    wf["6"]["inputs"]["text"] = prompt
    wf["17"]["inputs"]["filename_prefix"] = "EXP_1A_sketch"
    return strip_pulid(fix_resolution_steps(wf))


def build_stage_1b(prompt: str, sketch_filename: str) -> dict:
    """Stage 1B: Character 2D (sketch as composition guide)."""
    wf = copy.deepcopy(WF_REF)
    wf["4"]["inputs"]["image"] = "blank.png"
    wf["5"]["inputs"]["image"] = sketch_filename
    wf["8"]["inputs"]["text"] = prompt
    wf["21"]["inputs"]["filename_prefix"] = "EXP_1B_char2d"
    return strip_pulid(fix_resolution_steps(wf))


def build_stage_2(prompt: str, char2d_filename: str) -> dict:
    """Stage 2: First Frame (character ref)."""
    wf = copy.deepcopy(WF_REF)
    wf["4"]["inputs"]["image"] = char2d_filename
    wf["5"]["inputs"]["image"] = "blank.png"
    wf["8"]["inputs"]["text"] = prompt
    wf["21"]["inputs"]["filename_prefix"] = "EXP_S2_first"
    return strip_pulid(fix_resolution_steps(wf))


def build_stage_3(prompt: str, char2d_filename: str, first_frame_filename: str) -> dict:
    """Stage 3: Last Frame (character ref + first frame as style ref)."""
    wf = copy.deepcopy(WF_REF)
    wf["4"]["inputs"]["image"] = char2d_filename
    wf["5"]["inputs"]["image"] = first_frame_filename
    wf["8"]["inputs"]["text"] = prompt
    wf["21"]["inputs"]["filename_prefix"] = "EXP_S3_last"
    return strip_pulid(fix_resolution_steps(wf))


def build_stage_4(prompt: str, sketch_filename: str, char2d_filename: str, location: str = "blank.png") -> dict:
    """Stage 4A/4B: Final frame (3 references, no PuLID)."""
    wf = copy.deepcopy(WF_MULTIREF)
    wf["10"]["inputs"]["image"] = sketch_filename
    wf["11"]["inputs"]["image"] = char2d_filename
    wf["12"]["inputs"]["image"] = location
    wf["30"]["inputs"]["text"] = prompt
    wf["67"]["inputs"]["filename_prefix"] = "EXP_S4_final"
    return strip_pulid(fix_resolution_steps(wf))


def build_stage_5(first_frame: str, last_frame: str, positive: str, negative: str, frames: int = 81) -> dict:
    """Stage 5: WAN 2.2 Video generation."""
    wf = copy.deepcopy(WF_WAN)
    wf["10"]["inputs"]["image"] = first_frame
    wf["11"]["inputs"]["image"] = last_frame
    wf["12"]["inputs"]["text"] = positive
    wf["13"]["inputs"]["text"] = negative
    wf["14"]["inputs"]["length"] = frames
    wf["31"]["inputs"]["filename_prefix"] = "EXP_S5_video"
    return wf


# -------------------------------------------------------------------
# Run a single generation
# -------------------------------------------------------------------
def run_generation(stage_name: str, workflow: dict, output_filename: str) -> str:
    """Queue workflow, wait, download result. Returns local file path."""
    # Resume support: skip if output already exists
    save_path = str(OUTPUT_DIR / output_filename)
    if Path(save_path).exists() and Path(save_path).stat().st_size > 1000:
        print(f"\n  SKIP {stage_name} — {output_filename} already exists ({Path(save_path).stat().st_size // 1024} KB)")
        # Make sure it's uploaded to ComfyUI for dependent stages
        if output_filename.endswith(".png"):
            try:
                upload_image(save_path, output_filename)
            except Exception:
                pass
        return output_filename

    print(f"\n{'='*60}")
    print(f"  Stage: {stage_name}")
    print(f"  Output: {output_filename}")
    print(f"{'='*60}")

    t0 = time.time()
    prompt_id = queue_prompt(workflow)
    print(f"  Queued: {prompt_id}")

    result = wait_for_result(prompt_id, timeout=600)
    elapsed = time.time() - t0
    print(f"  Completed in {elapsed:.0f}s")

    save_path = str(OUTPUT_DIR / output_filename)
    downloaded = download_output(result, save_path)
    if downloaded:
        size_kb = Path(downloaded).stat().st_size / 1024
        print(f"  Saved: {downloaded} ({size_kb:.0f} KB)")

    # Upload result to ComfyUI input for next stages
    if downloaded and output_filename.endswith(".png"):
        upload_image(downloaded, output_filename)
        print(f"  Uploaded to ComfyUI input: {output_filename}")

    return output_filename


# -------------------------------------------------------------------
# Main pipeline
# -------------------------------------------------------------------
def main():
    print("=" * 60)
    print("  ANIME STYLE TEST EXPERIMENT")
    print(f"  ComfyUI: {COMFYUI_URL}")
    print(f"  Scenes: {len(SCENES)}")
    print("=" * 60)

    # Check ComfyUI is alive
    try:
        comfy_get("system_stats")
        print("  ComfyUI: CONNECTED")
    except Exception as e:
        print(f"  ERROR: Cannot connect to ComfyUI at {COMFYUI_URL}")
        print(f"  {e}")
        sys.exit(1)

    # Ensure blank.png exists
    try:
        upload_blank = False
        try:
            comfy_get("view?filename=blank.png&type=input")
        except Exception:
            upload_blank = True

        if upload_blank:
            print("  Creating blank.png on ComfyUI...")
            # Create a white 832x480 PNG locally, upload it
            import struct, zlib
            w, h = 832, 480
            raw = b""
            for _ in range(h):
                raw += b"\x00" + b"\xff\xff\xff" * w
            compressed = zlib.compress(raw)

            def png_chunk(ctype, data):
                c = ctype + data
                return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

            png = b"\x89PNG\r\n\x1a\n"
            png += png_chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            png += png_chunk(b"IDAT", compressed)
            png += png_chunk(b"IEND", b"")

            blank_path = str(OUTPUT_DIR / "blank.png")
            Path(blank_path).write_bytes(png)
            upload_image(blank_path, "blank.png")
            print("  blank.png uploaded")
    except Exception as e:
        print(f"  WARNING: blank.png check failed: {e}")

    results = {}
    total_start = time.time()

    # ---------------------------------------------------------------
    # SHARED: Stage 1A — Character Sketch
    # ---------------------------------------------------------------
    scene0 = SCENES[0]  # use first scene's 1A prompt (shared character)
    wf = build_stage_1a(scene0["stages"]["1A"]["prompt"])
    sketch = run_generation("1A — Character Sketch", wf, "1A_character_sketch.png")
    results["1A"] = sketch

    # ---------------------------------------------------------------
    # SHARED: Stage 1B — Character 2D
    # ---------------------------------------------------------------
    wf = build_stage_1b(scene0["stages"]["1B"]["prompt"], sketch)
    char2d = run_generation("1B — Character 2D", wf, "1B_character_2d.png")
    results["1B"] = char2d

    # ---------------------------------------------------------------
    # PER-SCENE: Stages 2 → 5
    # ---------------------------------------------------------------
    for scene in SCENES:
        sid = scene["id"]
        sname = scene["name"]
        stages = scene["stages"]
        frames = scene["wan_frames"]

        print(f"\n{'#'*60}")
        print(f"  SCENE: {sname} ({sid})")
        print(f"  Style: {scene['animation_style']}")
        print(f"  Frames: {frames}")
        print(f"{'#'*60}")

        # Stage 2 — First Frame
        wf = build_stage_2(stages["2"]["prompt"], char2d)
        first_sketch = run_generation(
            f"2 — First Frame ({sid})", wf, f"{sid}_S2_first_frame.png"
        )

        # Stage 3 — Last Frame
        wf = build_stage_3(stages["3"]["prompt"], char2d, first_sketch)
        last_sketch = run_generation(
            f"3 — Last Frame ({sid})", wf, f"{sid}_S3_last_frame.png"
        )

        # Stage 4A — Final First Frame
        wf = build_stage_4(stages["4A"]["prompt"], first_sketch, char2d)
        first_final = run_generation(
            f"4A — Final First ({sid})", wf, f"{sid}_S4A_first_final.png"
        )

        # Stage 4B — Final Last Frame
        wf = build_stage_4(stages["4B"]["prompt"], last_sketch, char2d)
        last_final = run_generation(
            f"4B — Final Last ({sid})", wf, f"{sid}_S4B_last_final.png"
        )

        # Stage 5 — WAN Video
        # Upload final frames for WAN (they're images, already uploaded)
        wf = build_stage_5(
            first_final, last_final,
            stages["5"]["positive"],
            stages["5"]["negative"],
            frames,
        )
        video = run_generation(
            f"5 — Video ({sid})", wf, f"{sid}_S5_video.mp4"
        )

        results[sid] = {
            "first_sketch": first_sketch,
            "last_sketch": last_sketch,
            "first_final": first_final,
            "last_final": last_final,
            "video": video,
        }

    # ---------------------------------------------------------------
    # Summary
    # ---------------------------------------------------------------
    total_elapsed = time.time() - total_start
    print(f"\n{'='*60}")
    print(f"  EXPERIMENT COMPLETE")
    print(f"  Total time: {total_elapsed:.0f}s ({total_elapsed/60:.1f} min)")
    print(f"  Cost estimate: ${total_elapsed * 0.86 / 3600:.2f}")
    print(f"  Outputs: {OUTPUT_DIR}")
    print(f"{'='*60}")

    # Save results manifest
    manifest = {
        "experiment_id": EXPERIMENT["experiment"]["id"],
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total_time_sec": round(total_elapsed),
        "cost_usd": round(total_elapsed * 0.86 / 3600, 3),
        "results": results,
    }
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"  Manifest saved: {OUTPUT_DIR / 'manifest.json'}")


if __name__ == "__main__":
    main()
