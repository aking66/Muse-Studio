'use client';

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { usePipeline } from './PipelineContext';
import type { StylePreset } from '@/types/pipeline';

// ---------------------------------------------------------------------------
// Style presets with unique gradient backgrounds
// ---------------------------------------------------------------------------
const STYLE_PRESETS: (StylePreset & { gradient: string })[] = [
  {
    id: 'rick-and-morty',
    name: 'Rick & Morty',
    keywords: '2D flat vector animation style, Rick and Morty art style, bold black outlines, simple cel-shading, vibrant solid colors, clean minimalist backgrounds, high contrast, adult animation aesthetic',
    negative: '3D render, realistic, blurry, distorted, deformed, low quality, sketch, pencil lines',
    gradient: 'from-green-500/30 to-yellow-400/30',
  },
  {
    id: 'ghibli',
    name: 'Ghibli',
    keywords: 'Studio Ghibli art style, soft watercolor painting, gentle warm lighting, lush natural scenery, hand-painted backgrounds, whimsical character design, pastel color palette, delicate linework',
    negative: '3D render, harsh lighting, dark, gritty, photorealistic, low quality',
    gradient: 'from-blue-400/30 to-pink-400/30',
  },
  {
    id: 'disney-2d',
    name: 'Disney 2D',
    keywords: 'classic Disney 2D animation style, expressive character animation, clean cel-shading, rich saturated colors, dynamic poses, painterly backgrounds, golden age Disney aesthetic',
    negative: '3D, CGI, photorealistic, anime, sketch, low quality',
    gradient: 'from-blue-600/30 to-yellow-500/30',
  },
  {
    id: 'anime',
    name: 'Anime',
    keywords: 'modern anime art style, crisp linework, vibrant color palette, dramatic lighting, detailed eye design, smooth shading, anime cel-shading, expressive poses',
    negative: '3D, photorealistic, western cartoon, sketch, blurry, low quality',
    gradient: 'from-purple-500/30 to-pink-500/30',
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    keywords: 'minimalist flat illustration, simple geometric shapes, limited color palette, clean lines, negative space, modern design aesthetic, subtle gradients, elegant simplicity',
    negative: '3D, photorealistic, detailed, cluttered, noisy, complex, sketch, low quality',
    gradient: 'from-gray-400/30 to-white/20',
  },
];

// ---------------------------------------------------------------------------
// StyleSelector — horizontal scrollable style preset picker
// ---------------------------------------------------------------------------
export default function StyleSelector() {
  const { state, dispatch } = usePipeline();
  const selectedId = state.stylePresetId;

  return (
    <div className="relative">
      {/* Horizontal scroll container with hidden scrollbar */}
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style>{`div::-webkit-scrollbar { display: none; }`}</style>

        {STYLE_PRESETS.map((preset) => {
          const isSelected = preset.id === selectedId;

          return (
            <button
              key={preset.id}
              onClick={() =>
                dispatch({
                  type: 'SET_STYLE',
                  presetId: preset.id,
                  keywords: preset.keywords,
                  negative: preset.negative,
                })
              }
              className={cn(
                'relative flex-shrink-0 w-[80px] h-[50px] rounded-md overflow-hidden',
                'flex items-end justify-center pb-1.5 transition-all duration-200',
                'bg-gradient-to-br',
                preset.gradient,
                isSelected
                  ? 'ring-2 ring-muse-purple pipeline-glow-purple'
                  : 'ring-1 ring-white/10 hover:ring-white/20',
              )}
            >
              {/* Selection indicator with shared layout animation */}
              {isSelected && (
                <motion.div
                  layoutId="style-selector"
                  className="absolute inset-0 rounded-md ring-2 ring-muse-purple"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}

              <span
                className={cn(
                  'relative z-10 text-[10px] font-medium leading-tight text-center',
                  isSelected ? 'text-white' : 'text-white/60',
                )}
              >
                {preset.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
