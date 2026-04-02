'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, RotateCcw, Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface StagePreviewProps {
  stageId: string;
  outputPath: string;
  kind: 'image' | 'video';
  onApprove: () => void;
  onRetry: () => void;
}

export function StagePreview({ stageId, outputPath, kind, onApprove, onRetry }: StagePreviewProps) {
  const [isPlaying, setIsPlaying] = useState(true);

  const handlePlayPause = () => {
    const video = document.querySelector(`#preview-video-${stageId}`) as HTMLVideoElement | null;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Media container */}
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl',
          'shadow-2xl shadow-muse-purple/20',
        )}
      >
        {kind === 'image' ? (
          <motion.div
            key={`${stageId}-${outputPath}`}
            initial={{ filter: 'blur(20px)', scale: 1.05, opacity: 0 }}
            animate={{ filter: 'blur(0px)', scale: 1.0, opacity: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <img
              src={outputPath}
              alt={`Stage ${stageId} output`}
              className="w-full rounded-2xl"
            />
          </motion.div>
        ) : (
          <motion.div
            key={`${stageId}-${outputPath}`}
            initial={{ filter: 'blur(20px)', scale: 1.05, opacity: 0 }}
            animate={{ filter: 'blur(0px)', scale: 1.0, opacity: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="relative"
          >
            <video
              id={`preview-video-${stageId}`}
              src={outputPath}
              autoPlay
              loop
              muted
              playsInline
              className="w-full rounded-2xl"
            />
            {/* Play/pause overlay */}
            <button
              onClick={handlePlayPause}
              className={cn(
                'absolute inset-0 flex items-center justify-center',
                'bg-black/0 hover:bg-black/20 transition-colors',
                'group cursor-pointer',
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-center',
                  'size-14 rounded-full bg-black/50 backdrop-blur-sm',
                  'opacity-0 group-hover:opacity-100 transition-opacity',
                  'text-white',
                )}
              >
                {isPlaying ? <Pause className="size-6" /> : <Play className="size-6 ml-0.5" />}
              </div>
            </button>
          </motion.div>
        )}
      </div>

      {/* Action buttons */}
      <motion.div
        className="flex items-center gap-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5, ease: 'easeOut' }}
      >
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            onClick={onApprove}
            className="bg-muse-emerald hover:bg-muse-emerald/90 text-white gap-2"
          >
            <Check className="size-4" />
            Approve
          </Button>
        </motion.div>

        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button variant="ghost" onClick={onRetry} className="gap-2">
            <RotateCcw className="size-4" />
            Retry
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
