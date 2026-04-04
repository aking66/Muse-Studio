#!/bin/bash
# Post-processing for Anime Style Test
# Run LOCALLY after downloading outputs from pod
#
# Usage: bash post_process.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/outputs"
PROCESSED_DIR="$SCRIPT_DIR/processed"
RIFE_DIR="/Users/ahmed/runpod/Practical-RIFE"

mkdir -p "$PROCESSED_DIR"

echo "============================================"
echo "  POST-PROCESSING: Anime Style Test"
echo "============================================"

# -------------------------------------------------------------------
# Scene 1: Dialogue — Limited Anime on 3s
# -------------------------------------------------------------------
echo ""
echo "--- Scene 1: Dialogue (on-3s) ---"
INPUT="$OUTPUT_DIR/scene_01_dialogue_S5_video.mp4"
if [ -f "$INPUT" ]; then
    # On-3s: keep every 3rd frame, duplicate 3x => choppy anime feel
    ffmpeg -y -i "$INPUT" \
        -vf "fps=5.33,setpts=N/16/TB" \
        -r 16 -c:v libx264 -crf 18 -pix_fmt yuv420p \
        "$PROCESSED_DIR/scene_01_dialogue_on3s.mp4" 2>/dev/null
    echo "  Created: scene_01_dialogue_on3s.mp4"

    # Also create on-2s version for comparison
    ffmpeg -y -i "$INPUT" \
        -vf "fps=8,setpts=N/16/TB" \
        -r 16 -c:v libx264 -crf 18 -pix_fmt yuv420p \
        "$PROCESSED_DIR/scene_01_dialogue_on2s.mp4" 2>/dev/null
    echo "  Created: scene_01_dialogue_on2s.mp4 (comparison)"

    # Keep original too
    cp "$INPUT" "$PROCESSED_DIR/scene_01_dialogue_original.mp4"
    echo "  Copied:  scene_01_dialogue_original.mp4"
else
    echo "  SKIP: $INPUT not found"
fi

# -------------------------------------------------------------------
# Scene 2: Walk — Limited Anime on 2s
# -------------------------------------------------------------------
echo ""
echo "--- Scene 2: Walk (on-2s) ---"
INPUT="$OUTPUT_DIR/scene_02_walk_S5_video.mp4"
if [ -f "$INPUT" ]; then
    # On-2s: keep every 2nd frame, duplicate 2x
    ffmpeg -y -i "$INPUT" \
        -vf "fps=8,setpts=N/16/TB" \
        -r 16 -c:v libx264 -crf 18 -pix_fmt yuv420p \
        "$PROCESSED_DIR/scene_02_walk_on2s.mp4" 2>/dev/null
    echo "  Created: scene_02_walk_on2s.mp4"

    # On-3s for comparison
    ffmpeg -y -i "$INPUT" \
        -vf "fps=5.33,setpts=N/16/TB" \
        -r 16 -c:v libx264 -crf 18 -pix_fmt yuv420p \
        "$PROCESSED_DIR/scene_02_walk_on3s.mp4" 2>/dev/null
    echo "  Created: scene_02_walk_on3s.mp4 (comparison)"

    cp "$INPUT" "$PROCESSED_DIR/scene_02_walk_original.mp4"
    echo "  Copied:  scene_02_walk_original.mp4"
else
    echo "  SKIP: $INPUT not found"
fi

# -------------------------------------------------------------------
# Scene 3: Sakuga Punch — RIFE 2x to smooth 24fps
# -------------------------------------------------------------------
echo ""
echo "--- Scene 3: Sakuga (RIFE 2x) ---"
INPUT="$OUTPUT_DIR/scene_03_sakuga_S5_video.mp4"
if [ -f "$INPUT" ]; then
    # RIFE 2x interpolation (16fps -> 32fps)
    if [ -d "$RIFE_DIR" ]; then
        cd "$RIFE_DIR"
        python3 inference_video.py \
            --multi=2 \
            --video="$INPUT" \
            --output="$PROCESSED_DIR/scene_03_sakuga_rife2x.mp4" 2>/dev/null
        echo "  Created: scene_03_sakuga_rife2x.mp4"

        # Also try 4x for ultra-smooth
        python3 inference_video.py \
            --multi=4 \
            --video="$INPUT" \
            --output="$PROCESSED_DIR/scene_03_sakuga_rife4x.mp4" 2>/dev/null
        echo "  Created: scene_03_sakuga_rife4x.mp4"
        cd "$SCRIPT_DIR"
    else
        echo "  SKIP: Practical-RIFE not found at $RIFE_DIR"
    fi

    # Encode original at 24fps for comparison
    ffmpeg -y -i "$INPUT" \
        -r 24 -c:v libx264 -crf 18 -pix_fmt yuv420p \
        "$PROCESSED_DIR/scene_03_sakuga_24fps.mp4" 2>/dev/null
    echo "  Created: scene_03_sakuga_24fps.mp4 (no RIFE)"

    cp "$INPUT" "$PROCESSED_DIR/scene_03_sakuga_original.mp4"
    echo "  Copied:  scene_03_sakuga_original.mp4"
else
    echo "  SKIP: $INPUT not found"
fi

# -------------------------------------------------------------------
# Summary
# -------------------------------------------------------------------
echo ""
echo "============================================"
echo "  POST-PROCESSING COMPLETE"
echo "============================================"
echo ""
echo "  Outputs in: $PROCESSED_DIR"
echo ""
echo "  Comparison grid:"
echo "  Scene 1 (Dialogue): original vs on-2s vs on-3s"
echo "  Scene 2 (Walk):     original vs on-2s vs on-3s"
echo "  Scene 3 (Sakuga):   original vs RIFE-2x vs RIFE-4x"
echo ""
ls -lh "$PROCESSED_DIR"/*.mp4 2>/dev/null || echo "  No processed files yet"
