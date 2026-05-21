"use client"

import React, { useRef, useEffect, useState } from "react"
import Link from "next/link"
import { HiveLogo } from "./hive-logo"

interface HeroSectionProps {
  videoReady: boolean
  heroReady: boolean
}

export function HeroSection({ videoReady, heroReady }: HeroSectionProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const [scrollProgress, setScrollProgress] = useState(0)

  // Scroll-controlled video playback
  useEffect(() => {
    const video = videoRef.current
    const section = sectionRef.current
    if (!video || !section) return

    video.pause()

    const handleScroll = () => {
      const rect = section.getBoundingClientRect()
      const sectionHeight = section.offsetHeight
      const scrolled = -rect.top
      const progress = Math.max(0, Math.min(1, scrolled / (sectionHeight * 0.8)))
      
      setScrollProgress(progress)
      
      if (video.duration) {
        video.currentTime = progress * video.duration
      }
    }

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = 0
    })

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  return (
    <section ref={sectionRef} className="relative h-[150vh] overflow-visible">
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* Video background */}
        <video
          ref={videoRef}
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover z-0"
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Cinematic_slow_motion_product-rpQzGf2Ed1DhfwlJyXgB1Gl10To1bb.mp4"
          style={{
            transform: videoReady ? "scale(1.05)" : "scale(0.85)",
            transition: "transform 2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />

        {/* Dark cinematic gradient overlay */}
        <div 
          className="absolute inset-0 z-5 pointer-events-none" 
          style={{ 
            background: "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.2) 75%, rgba(255,255,255,0.3) 90%, rgba(255,255,255,1) 100%)" 
          }} 
        />

        {/* Main content container - flex column with proper spacing */}
        <div className="absolute inset-0 z-30 flex flex-col px-6 md:px-12 lg:px-20 pt-24 pb-8">
          
          {/* Top content area - takes remaining space, vertically centered */}
          <div className="flex-1 flex flex-col justify-center max-w-2xl">
            {/* Brand label */}
            <div
              className="flex items-center gap-3 mb-6"
              style={{
                opacity: heroReady ? 1 : 0,
                transform: heroReady ? "translateY(0px)" : "translateY(20px)",
                transition: "opacity 0.8s cubic-bezier(0.16,1,0.3,1) 0ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) 0ms",
              }}
            >
              <HiveLogo variant="symbol" color="light" size={28} />
              <span 
                className="text-xs tracking-[0.3em] font-medium"
                style={{ color: "#F5A623" }}
              >
                HIVE ORGANIC ENERGY
              </span>
            </div>

            {/* Main headline */}
            <h1
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-light leading-[1.0] tracking-tight mb-5"
              style={{
                fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                fontWeight: 300,
                color: "white",
                opacity: heroReady ? 1 : 0,
                filter: heroReady ? "blur(0px)" : "blur(24px)",
                transform: heroReady ? "translateY(0px)" : "translateY(32px)",
                transition: "opacity 1s cubic-bezier(0.16,1,0.3,1) 80ms, filter 1s cubic-bezier(0.16,1,0.3,1) 80ms, transform 1s cubic-bezier(0.16,1,0.3,1) 80ms",
              }}
            >
              Energía forjada<br />
              por la naturaleza.
            </h1>

            {/* Subheadline */}
            <p
              className="text-sm md:text-base leading-relaxed mb-6 max-w-md"
              style={{
                fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                color: "rgba(255,255,255,0.85)",
                opacity: heroReady ? 1 : 0,
                filter: heroReady ? "blur(0px)" : "blur(16px)",
                transform: heroReady ? "translateY(0px)" : "translateY(20px)",
                transition: "opacity 0.8s cubic-bezier(0.16,1,0.3,1) 160ms, filter 0.8s cubic-bezier(0.16,1,0.3,1) 160ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) 160ms",
              }}
            >
              Gel de miel pura para atletas. Sin sintéticos. Sin pico. Solo potencia.
            </p>

            {/* CTA Buttons */}
            <div
              className="flex flex-wrap gap-4 mb-12"
              style={{
                opacity: heroReady ? 1 : 0,
                transform: heroReady ? "translateY(0px)" : "translateY(20px)",
                transition: "opacity 0.8s cubic-bezier(0.16,1,0.3,1) 240ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) 240ms",
              }}
            >
              <Link 
                href="/checkout"
                className="px-7 py-3 rounded-xl text-sm font-medium tracking-wide transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                style={{ 
                  backgroundColor: "#F5A623", 
                  color: "#1A1208",
                  boxShadow: "0 4px 20px rgba(245,166,35,0.4)"
                }}
              >
                COMPRAR AHORA
              </Link>
              <button 
                className="px-7 py-3 rounded-xl text-sm font-medium tracking-wide transition-all duration-200 hover:bg-white/10"
                style={{ 
                  backgroundColor: "transparent",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.4)"
                }}
              >
                Ver producto
              </button>
            </div>
          </div>

          {/* Stats row - fixed at bottom with proper spacing */}
          <div 
            className="shrink-0 pt-6"
            style={{
              opacity: heroReady ? 1 : 0,
              transform: heroReady ? "translateY(0px)" : "translateY(20px)",
              transition: "opacity 0.8s cubic-bezier(0.16,1,0.3,1) 320ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) 320ms",
            }}
          >
            <div className="flex flex-wrap gap-6 md:gap-12">
              {[
                { value: "100%", label: "NATURAL" },
                { value: "0", label: "SINTÉTICOS" },
                { value: "Atletas", label: "PROBADO EN CAMPO" },
              ].map((stat, i) => (
                <div key={i} className="flex flex-col">
                  <div 
                    className="text-2xl md:text-3xl font-light tracking-tight pb-1.5 border-b-2"
                    style={{ 
                      fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
                      color: "#F5A623",
                      borderColor: "#F5A623"
                    }}
                  >
                    {stat.value}
                  </div>
                  <div 
                    className="text-[9px] md:text-[10px] tracking-[0.12em] mt-1.5 font-medium"
                    style={{ color: "#1A1208" }}
                  >
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div 
          className="absolute bottom-6 right-6 md:right-12 z-30 flex flex-col items-center gap-2"
          style={{
            opacity: heroReady && scrollProgress < 0.1 ? 0.5 : 0,
            transition: "opacity 0.5s ease",
          }}
        >
          <span className="text-[10px] text-[#1A1208]/50 tracking-widest uppercase">Scroll</span>
          <div className="w-px h-6 bg-gradient-to-b from-[#F5A623] to-transparent" />
        </div>
      </div>

      {/* Hexagon watermark divider */}
      <div 
        className="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none z-20"
        style={{ transform: "translateY(50%)" }}
      >
        <svg 
          width="120" 
          height="104" 
          viewBox="0 0 120 104" 
          style={{ opacity: 0.05 }}
        >
          <polygon
            points="60,0 120,26 120,78 60,104 0,78 0,26"
            fill="#F5A623"
          />
        </svg>
      </div>
    </section>
  )
}
