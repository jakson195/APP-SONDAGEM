"use client";

import { useState } from "react";
import {
  SITE_HERO_VIDEO_LOCAL,
  SITE_HERO_VIDEO_REMOTE,
} from "@/lib/site-hero-media";

function initialVideoSrc(): string {
  if (process.env.NEXT_PUBLIC_HERO_VIDEO_URL) {
    return process.env.NEXT_PUBLIC_HERO_VIDEO_URL;
  }
  return SITE_HERO_VIDEO_REMOTE;
}

export function HeroVideoBackground() {
  const [src, setSrc] = useState(initialVideoSrc);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <video
        key={src}
        className="hero-video h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        onError={() => {
          if (src !== SITE_HERO_VIDEO_REMOTE) setSrc(SITE_HERO_VIDEO_REMOTE);
        }}
      >
        <source src={src} type="video/mp4" />
      </video>
      <div className="hero-video-overlay absolute inset-0" />
      <div className="hero-rtk-pulse absolute right-[12%] top-[28%] hidden h-48 w-48 rounded-full border border-[var(--dg-cyan)]/30 lg:block" />
      <div className="hero-rtk-pulse-delay absolute right-[10%] top-[26%] hidden h-64 w-64 rounded-full border border-[var(--dg-blue)]/20 lg:block" />
    </div>
  );
}
