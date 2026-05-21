"use client"

import React, { useRef, useEffect, useState, useCallback } from "react"
import { IntroAnimation, INTRO_DURATION_MS, HERO_REVEAL_MS } from "@/components/intro-animation"
import { AgentInterface } from "@/components/agent-interface"
import { PixelIcon } from "@/components/pixel-icon"
import { LiveAgentFeed, LiveAgentCounter } from "@/components/live-agent-feed"
import { RevealText } from "@/components/reveal-text"
import { ProductSections } from "@/components/product-sections"
import { MobileNav } from "@/components/mobile-nav"

import { HeroSection } from "@/components/hero-section"
import { HoneyDrips } from "@/components/honey-drips"
import { ProductShowcase } from "@/components/product-showcase"
import { HiveLogo, HiveSymbolLarge, HexBadgeRow } from "@/components/hive-logo"
import { AthletesSection } from "@/components/athletes-section"
import { HowToUseSection } from "@/components/how-to-use-section"

// ─── Intersection Observer hook ──────────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true) }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, inView }
}

// ─── Animated counter ────────────────────────────────────────────────────────
function Counter({ end, suffix = "" }: { end: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const { ref, inView } = useInView()
  useEffect(() => {
    if (!inView) return
    let start = 0
    const duration = 1800
    const step = 16
    const increment = end / (duration / step)
    const timer = setInterval(() => {
      start += increment
      if (start >= end) { setCount(end); clearInterval(timer) }
      else setCount(Math.floor(start))
    }, step)
    return () => clearInterval(timer)
  }, [inView, end])
  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>
}

// ─── Bento card ──────────────────────────────────────────────────────────────
function BentoCard({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, inView } = useInView(0.1)
  return (
    <div
      ref={ref}
      className={`group relative rounded-2xl border border-[#F5A623]/10 bg-white overflow-hidden transition-all duration-700 hover:border-[#F5A623]/25 hover:bg-[#FFFCF7] ${className}`}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms, border-color 0.3s ease, background-color 0.3s ease`,
      }}
    >
      {/* Hover glow spot */}
      <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: "radial-gradient(400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(245,166,35,0.06), transparent 60%)" }}
      />
      {children}
    </div>
  )
}

// ─── Pill tag ─────────────────────────────────────────────────────────────────
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] tracking-widest font-sans text-black/40 bg-black/[0.04]">
      {children}
    </span>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AgenticPage() {
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [heroReady, setHeroReady] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const handleIntroDone = useCallback(() => {
    setHeroReady(true)
  }, [])

  // Start video zoom slightly before hero content reveals, for seamless overlap
  useEffect(() => {
    const t = setTimeout(() => setVideoReady(true), HERO_REVEAL_MS)
    return () => clearTimeout(t)
  }, [])

  const handleMouse = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    el.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`)
    el.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`)
  }

  return (
    <div className="bg-white text-[#1A1208] min-h-screen font-sans antialiased">

      {/* ── HONEY DRIP EFFECTS ────────────────────────────────────────────── */}
      <HoneyDrips />

      {/* ── INTRO ANIMATION ───────────────────────────────────────────────── */}
      <IntroAnimation onDone={handleIntroDone} />

      {/* ── STICKY NAV ────────────────────────────────────────────────────── */}
      <MobileNav />

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <HeroSection videoReady={videoReady} heroReady={heroReady} />

      {/* ── PRODUCT SHOWCASE ──────────────────────────────────────────────── */}
      <ProductShowcase />

      {/* ── PLATFORM OVERVIEW (bento) ──────────────────────────────────────── */}
      <section id="ingredientes" className="py-32 px-6 md:px-12 lg:px-20 bg-white">
        <div className="max-w-6xl mx-auto">
          {/* Centered symbol header */}
          <div className="flex justify-center mb-8">
            <HiveSymbolLarge size={80} />
          </div>
          <div className="mb-16 text-center max-w-2xl mx-auto">
            <div className="mb-4 flex justify-center"><Tag>INGREDIENTES</Tag></div>
            <RevealText className="mt-5 text-4xl md:text-5xl lg:text-6xl font-light tracking-tight leading-[1.05]">
              {"Todo lo que tu cuerpo\nnecesita, nada que no."}
            </RevealText>
          </div>

          <div className="grid grid-cols-12 grid-rows-auto gap-3" onMouseMove={handleMouse}>
            {/* Big left card — full width with honey macro background */}
            <BentoCard className="col-span-12 p-8 min-h-[280px] flex flex-col justify-end relative overflow-hidden" delay={0}>
              {/* Honey macro background - honey dipper dripping into jar */}
              <div 
                className="absolute inset-0"
                style={{
                  backgroundImage: "url('https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Gemini_Generated_Image_irxeywirxeywirxe.png-iJMPqspkETOQu0bE1AiqI4vONcBv0q.jpeg')",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
              {/* Fallback amber gradient (shows through if image fails) */}
              <div 
                className="absolute inset-0 -z-10"
                style={{
                  background: "linear-gradient(135deg, #F5A623 0%, #E8890C 40%, #8B4513 100%)",
                }}
              />
              {/* Animated shimmer overlay */}
              <div 
                className="absolute inset-0 opacity-20"
                style={{
                  background: "linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.3) 50%, transparent 75%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 3s ease-in-out infinite",
                }}
              />
              {/* Dark overlay for text readability */}
              <div 
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.2) 70%, transparent 100%)",
                }}
              />
              {/* Content */}
              <div className="relative z-10">
                <div className="w-10 h-10 rounded-xl border border-white/20 bg-white/10 flex items-center justify-center mb-6" style={{ backdropFilter: "blur(8px)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="1.5"><path d="M12 2L9.5 9.5H2l6.25 4.5L6 21.5l6-4.5 6 4.5-2.25-7.5L22 9.5h-7.5L12 2z"/></svg>
                </div>
                <h3 className="text-2xl font-light mb-3 text-white">Miel Orgánica Pura</h3>
                <p className="text-sm text-white/80 leading-relaxed max-w-md">
                  Carbohidratos naturales de absorción rápida. Energía sostenida sin caída. Directo de los apiarios patagónicos.
                </p>
              </div>
            </BentoCard>

            {/* Bottom row */}
            <BentoCard className="col-span-12 md:col-span-4 p-8 min-h-[200px]" delay={120}>
              <div className="w-10 h-10 rounded-xl border border-black/10 flex items-center justify-center mb-5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E8890C" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              </div>
              <h3 className="text-lg font-light mb-2">Sal de Mar</h3>
              <p className="text-sm text-black/45 leading-relaxed">Reposición de electrolitos esenciales. Mantiene el balance mineral durante el esfuerzo.</p>
            </BentoCard>

            <BentoCard className="col-span-12 md:col-span-4 p-8 min-h-[200px]" delay={160}>
              <div className="w-10 h-10 rounded-xl border border-black/10 flex items-center justify-center mb-5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E8890C" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              </div>
              <h3 className="text-lg font-light mb-2">Magnesio + Potasio</h3>
              <p className="text-sm text-black/45 leading-relaxed">Previene calambres y fatiga muscular. Recuperación más rápida entre esfuerzos.</p>
            </BentoCard>

            <BentoCard className="col-span-12 md:col-span-4 p-8 min-h-[200px]" delay={200}>
              <div className="w-10 h-10 rounded-xl border border-black/10 flex items-center justify-center mb-5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E8890C" strokeWidth="1.5"><path d="M17 8l4 4-4 4M7 8L3 12l4 4M14 4l-4 16"/></svg>
              </div>
              <h3 className="text-lg font-light mb-2">Cafeína de Té Verde</h3>
              <p className="text-sm text-black/45 leading-relaxed">Energía limpia y enfocada. Sin nerviosismo ni crash posterior.</p>
            </BentoCard>
          </div>
        </div>
      </section>

      {/* ── PRODUCT SECTIONS (sticky scroll) ─────────────────────────────── */}
      <ProductSections />

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section id="nosotros" className="py-32 px-6 md:px-12 lg:px-20 bg-white border-t border-[#F5A623]/10 overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <div className="mb-16">
            <PixelIcon type="workflow" size={40} />
            <div className="mt-4"><Tag>NOSOTROS</Tag></div>
            <RevealText className="mt-5 text-4xl md:text-5xl font-light tracking-tight leading-[1.05]">
              {"De la colmena\na tu bolsillo."}
            </RevealText>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3" onMouseMove={handleMouse}>
            {[
              { n: "01", title: "Origen",  desc: "Miel orgánica de apiarios patagónicos, cosechada de forma sustentable.", delay: 0,   img: "/images/process-origen.jpg" },
              { n: "02", title: "Proceso", desc: "Formulación artesanal que preserva los nutrientes naturales de la miel.", delay: 80,  img: "/images/process-proceso.jpg" },
              { n: "03", title: "Testeo",    desc: "Probado por atletas profesionales en condiciones reales de competencia.", delay: 140, img: "/images/process-testeo.jpg" },
              { n: "04", title: "Entrega",  desc: "Envíos a todo el país. Llegamos a tu puerta listos para el próximo entrenamiento.", delay: 200, img: "/images/process-entrega.jpg" },
            ].map((step) => (
              <BentoCard key={step.n} className="relative overflow-hidden flex flex-col min-h-[320px]" delay={step.delay}>
                {/* Image at top — mask fades it out strongly before the bottom edge */}
                <div className="absolute inset-x-0 top-0 h-56 pointer-events-none">
                  <img
                    src={step.img}
                    alt={step.title}
                    className="w-full h-full object-cover object-top"
                    style={{
                      maskImage: "linear-gradient(to bottom, black 0%, black 30%, transparent 80%)",
                      WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 30%, transparent 80%)",
                    }}
                  />
                </div>
                {/* Number top-left */}
                <div className="relative z-10 p-7">
                  <span className="font-pixel text-[11px] text-black/20 tracking-widest block">{step.n}</span>
                </div>
                {/* Text pushed further down */}
                <div className="relative z-10 px-7 pb-7 mt-auto pt-16">
                  <h3 className="text-2xl font-light mb-3">{step.title}</h3>
                  <p className="text-sm text-black/45 leading-relaxed">{step.desc}</p>
                </div>
              </BentoCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── INTEGRATIONS ──────────────────────────────────────────────────── */}
      <section id="video" className="py-32 px-6 md:px-12 lg:px-20 bg-[#FFF8EE] border-t border-[#F5A623]/10">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8 mb-16">
            <div>
              <PixelIcon type="integrations" size={40} />
              <div className="mt-4"><Tag>DESCUBRÍ</Tag></div>
              <RevealText className="mt-5 text-4xl md:text-5xl font-light tracking-tight leading-[1.05]">
                {"Mirá cómo la miel\nse convierte en\ntu ventaja."}
              </RevealText>
            </div>
            <p className="text-sm text-black/45 leading-relaxed max-w-xs">
              De la naturaleza a tu rendimiento. Energía pura que te acompaña en cada kilómetro.
            </p>
          </div>

          {/* Full-width image block with glass cards */}
          {/* Mobile: flex-col, image + cards stacked. Desktop: image fills block, cards absolute */}
          <div className="rounded-2xl overflow-hidden border border-black/[0.07] flex flex-col md:block md:relative" onMouseMove={handleMouse}>
            {/* Image */}
            <div className="relative w-full h-[280px] md:h-[480px] shrink-0">
              <img
                src="/images/nutrition-honeycomb.jpg"
                alt="Raw honeycomb with golden honey"
                className="absolute inset-0 w-full h-full object-cover object-center"
              />
            </div>

            {/* Cards — flex row on mobile (equal spacing), absolute on desktop */}
            <div className="flex flex-col gap-3 p-4 md:absolute md:bottom-4 md:right-4 md:p-0 md:w-72">
              <div
                className="rounded-xl border border-white/50 p-6"
                style={{
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  background: "rgba(255,255,255,0.60)",
                }}
              >
                <Tag>NUTRICIÓN</Tag>
                <h3 className="mt-3 text-lg font-light mb-2">Información nutricional</h3>
                <p className="text-xs text-black/45 leading-relaxed mb-4">Por porción de 30g</p>
                <div className="bg-black/[0.05] rounded-lg border border-black/[0.07] p-3 text-[11px] text-black/50 leading-relaxed">
                  <span className="text-black/60">Carbohidratos:</span> <span className="text-amber-700/70">22g</span><br />
                  <span className="text-black/60">Azúcares naturales:</span> <span className="text-amber-700/70">18g</span><br />
                  <span className="text-black/60">Sodio:</span> <span className="text-amber-700/70">80mg</span><br />
                  <span className="text-black/60">Potasio:</span> <span className="text-amber-700/70">45mg</span><br />
                  <span className="text-black/60">Cafeína:</span> <span className="text-amber-700/70">25mg</span>
                </div>
              </div>

              <div
                className="rounded-xl border border-white/50 p-6"
                style={{
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  background: "rgba(255,255,255,0.60)",
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500/80 animate-pulse" />
                  <span className="text-xs text-black/40 tracking-widest">CERTIFICADO</span>
                </div>
                <p className="text-sm text-black/45">100% orgánico. Certificado SENASA. Sin gluten, sin lácteos, vegano.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── COMPARISON SECTION ──────────────────────────────────────────── */}
      <section className="py-32 px-6 md:px-12 lg:px-20 bg-[#FFF8EE] border-t border-[#F5A623]/10">
        <div className="max-w-5xl mx-auto">
          <div className="mb-16 text-center">
            <div className="mb-4 flex justify-center"><Tag>COMPARACIÓN</Tag></div>
            <RevealText className="mt-5 text-4xl md:text-5xl font-light tracking-tight leading-[1.05]">
              {"HIVE vs. Geles Tradicionales"}
            </RevealText>
            <p className="mt-6 text-sm text-black/45 max-w-md mx-auto">
              No todos los geles son iguales.
            </p>
          </div>

          {/* Comparison Table */}
          <div className="rounded-2xl border border-[#F5A623]/15 overflow-hidden bg-white">
            {/* Table Header */}
            <div className="grid grid-cols-3 border-b border-[#F5A623]/10">
              <div className="p-4 md:p-6 bg-white" />
              <div className="p-4 md:p-6 text-center font-medium tracking-widest text-[11px] md:text-xs" style={{ backgroundColor: "#F5A623", color: "#1A1208" }}>
                HIVE
              </div>
              <div className="p-4 md:p-6 text-center font-medium tracking-widest text-[11px] md:text-xs bg-black/5 text-black/50">
                GELES SINTÉTICOS
              </div>
            </div>

            {/* Table Rows */}
            {[
              { 
                label: "Ingredientes", 
                hive: "Miel orgánica pura", 
                sintetico: "Maltodextrina y jarabe de glucosa" 
              },
              { 
                label: "Cafeína", 
                hive: "Natural de té verde", 
                sintetico: "Cafeína sintética" 
              },
              { 
                label: "Digestión", 
                hive: "Suave y rápida", 
                sintetico: "Pesada, puede causar malestar" 
              },
              { 
                label: "Pico de energía", 
                hive: "Sostenido, sin caída", 
                sintetico: "Pico y caída brusca" 
              },
              { 
                label: "Aditivos", 
                hive: "0 sintéticos", 
                sintetico: "Colorantes, conservantes, espesantes" 
              },
              { 
                label: "Origen", 
                hive: "Argentina, ingredientes naturales", 
                sintetico: "Laboratorio industrial" 
              },
            ].map((row, i) => (
              <div 
                key={row.label} 
                className="grid grid-cols-3 border-b border-[#F5A623]/10 last:border-b-0"
              >
                <div className="p-4 md:p-6 text-sm font-medium text-black/70">
                  {row.label}
                </div>
                <div className="p-4 md:p-6 text-center bg-[#F5A623]/5 border-x border-[#F5A623]/10">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-[#F5A623] font-bold text-lg">✓</span>
                    <span className="text-sm text-black/70">{row.hive}</span>
                  </div>
                </div>
                <div className="p-4 md:p-6 text-center bg-black/[0.02]">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-black/30 font-bold text-lg">✗</span>
                    <span className="text-sm text-black/40">{row.sintetico}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ATHLETES SECTION ─────────────────────────────────────────────── */}
      <AthletesSection />

      {/* ── HOW TO USE SECTION ──────────────────────────────────────────── */}
      <HowToUseSection />

      {/* ── MARQUEE CAPABILITIES ──────────────────────────────────────────── */}
      <section className="py-0 bg-[#FFF8EE] border-t border-[#F5A623]/10 overflow-hidden select-none">
        <div className="flex border-b border-[#F5A623]/10" style={{ animation: "marqueeLeft 28s linear infinite" }}>
          {[...Array(3)].map((_, rep) => (
            <div key={rep} className="flex shrink-0">
              {["Maratones", "Trail Running", "Ciclismo", "Triatlón", "Fútbol", "Natación", "CrossFit", "Running", "Trekking", "MTB"].map((cap) => (
                <div key={cap} className="flex items-center gap-6 px-10 py-5 border-r border-[#F5A623]/10 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F5A623]/40 shrink-0" />
                  <span className="text-sm text-black/45 whitespace-nowrap tracking-wide">{cap}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex" style={{ animation: "marqueeRight 22s linear infinite" }}>
          {[...Array(3)].map((_, rep) => (
            <div key={rep} className="flex shrink-0">
              {["Energía Natural", "Sin Sintéticos", "Miel Pura", "Hecho en Argentina", "100% Orgánico", "Sin Gluten", "Vegano", "Absorción Rápida", "Sin Crash", "Potencia Real"].map((cap) => (
                <div key={cap} className="flex items-center gap-6 px-10 py-5 border-r border-[#F5A623]/10 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E8890C]/30 shrink-0" />
                  <span className="text-sm text-black/30 whitespace-nowrap tracking-wide">{cap}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── COMUNIDAD ────────────────────────────────────────────��─────── */}
      <section id="comunidad" className="py-32 px-6 md:px-12 lg:px-20 bg-white border-t border-[#F5A623]/10">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div>
              <PixelIcon type="agents" size={40} />
              <div className="mt-4"><Tag>COMUNIDAD HIVE</Tag></div>
              <RevealText className="mt-5 text-4xl md:text-5xl lg:text-6xl font-light tracking-tight leading-[1.05]">
                {"Únete a miles\nde atletas."}
              </RevealText>
              <p className="mt-6 text-base text-black/40 leading-relaxed max-w-sm">
                Atletas de todo el país eligen HIVE para sus entrenamientos y competencias. Sé parte de la comunidad.
              </p>
              <div className="mt-10 flex items-end gap-2">
                <LiveAgentCounter />
                <span className="text-black/30 text-sm mb-1 tracking-wide">atletas activos</span>
              </div>
            </div>
            <div className="relative">
              <LiveAgentFeed />
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────���────������─────────────── */}
      <section id="precios" className="py-32 px-6 md:px-12 lg:px-20 bg-[#FFF8EE] border-t border-[#F5A623]/10">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16 flex flex-col items-center">
            <PixelIcon type="pricing" size={40} />
            <div className="mt-4"><Tag>PRECIOS</Tag></div>
            <RevealText className="mt-5 text-4xl md:text-5xl font-light tracking-tight leading-[1.05]">
              {"Energía para cada\nnivel de entrenamiento."}
            </RevealText>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3" onMouseMove={handleMouse}>
            {[
              {
                name: "Iniciaci��n",
                price: "$2.500",
                sub: "Pack de 6 geles",
                features: ["6 geles de 30g", "Envío gratis CABA", "Ideal para probar", "Mix de sabores"],
                delay: 0,
              },
              {
                name: "Entrenamiento",
                price: "$8.900",
                sub: "Pack de 24 geles",
                features: ["24 geles de 30g", "Envío gratis Argentina", "Ahorro del 15%", "Elegí tus sabores", "Shaker de regalo", "Guía nutricional"],
                highlight: true,
                delay: 80,
              },
              {
                name: "Clubes",
                price: "Consultar",
                sub: "Para equipos y clubes",
                features: ["Pedido mínimo 100 geles", "Precios mayoristas", "Personalización", "Asesoría nutricional", "Entrega programada", "Facturación B2B"],
                delay: 140,
              },
            ].map((plan) => (
              <BentoCard
                key={plan.name}
                className={`p-8 flex flex-col ${plan.highlight ? "border-amber-500/30 bg-[#FDF8F0]" : ""}`}
                delay={plan.delay}
              >
                <div className="mb-8">
                  <div className="font-pixel text-[11px] tracking-widest text-black/40 mb-4">{plan.name}</div>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-4xl font-light">{plan.price}</span>
                  </div>
                  <p className="text-xs text-black/35 tracking-wide">{plan.sub}</p>
                </div>
                <ul className="space-y-3 flex-1 mb-8">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-3 text-sm text-black/55">
                      <div className="w-1 h-1 rounded-full bg-amber-500/50 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button className={`w-full py-3 rounded-xl text-sm tracking-widest transition-all duration-200 ${
                  plan.highlight
                    ? "bg-amber-600 text-white hover:bg-amber-700"
                    : "border border-black/10 text-black/60 hover:border-black/25 hover:text-black hover:bg-black/[0.04]"
                }`}>
                  {plan.name === "Clubes" ? "CONTACTAR" : "COMPRAR"}
                </button>
              </BentoCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="relative py-32 px-6 md:px-12 lg:px-20 bg-white border-t border-[#F5A623]/10 overflow-hidden">
        {/* Glass panels image — anchored to bottom center */}
        <img
          src="/images/footer.png"
          alt=""
          aria-hidden="true"
          className="absolute bottom-0 left-0 w-full object-cover object-bottom pointer-events-none select-none"
          style={{ opacity: 0.85 }}
        />
        {/* Progressive blur from bottom — blends into site bg */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            maskImage: "linear-gradient(to top, transparent 0%, black 55%)",
            WebkitMaskImage: "linear-gradient(to top, transparent 0%, black 55%)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
          }}
        />
        {/* Colour fade from bottom to site bg white */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(to top, rgb(255,255,255) 0%, rgba(255,255,255,0.92) 18%, rgba(255,255,255,0.55) 35%, transparent 55%)",
          }}
        />
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-light tracking-tight leading-[1.05] mb-6">
            Potenciá tu próximo<br />entrenamiento.
          </h2>
          <p className="text-sm text-black/45 leading-relaxed mb-10">
            Suscribite para recibir ofertas exclusivas, tips de nutrición y novedades de la comunidad HIVE.
          </p>
          {!submitted ? (
            <form
              onSubmit={e => { e.preventDefault(); if (email) setSubmitted(true) }}
              className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto"
            >
              <input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="flex-1 bg-white border border-black/10 rounded-xl px-4 py-3 text-sm text-[#111] placeholder:text-black/25 focus:outline-none focus:border-amber-500/50 transition-colors"
              />
              <button
                type="submit"
                className="px-8 py-3 bg-amber-600 text-white text-sm rounded-xl hover:bg-amber-700 transition-colors tracking-widest font-medium"
              >
                SUSCRIBIR
              </button>
            </form>
          ) : (
            <div className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-amber-600/20 bg-amber-50 text-amber-700 text-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {"¡Listo! Te mantendremos informado."}
            </div>
          )}
        </div>
      </section>


      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="py-16 px-6 md:px-12 lg:px-20 bg-[#FAFAF8] border-t border-[#F5A623]/10">
        <div className="max-w-6xl mx-auto">
          {/* Centered vertical logo */}
          <div className="flex justify-center mb-12">
            <HiveLogo variant="vertical" color="dark" size={48} />
          </div>

          {/* Nav sections - centered */}
          <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3 mb-8">
            {[
              { label: "Producto",     href: "#producto" },
              { label: "Ingredientes", href: "#ingredientes" },
              { label: "Atletas",      href: "#atletas" },
              { label: "Nosotros",     href: "#nosotros" },
              { label: "Precios",      href: "#precios" },
            ].map(l => (
              <a key={l.label} href={l.href} className="text-xs text-black/35 hover:text-black/70 transition-colors tracking-widest">{l.label}</a>
            ))}
          </div>

          {/* Social links - centered */}
          <div className="flex justify-center items-center gap-6 mb-8">
            {[
              { label: "Instagram", href: "#" },
              { label: "Contacto",  href: "#" },
            ].map(l => (
              <a key={l.label} href={l.href} className="text-xs text-black/25 hover:text-black/55 transition-colors tracking-widest">{l.label}</a>
            ))}
          </div>

          {/* Copyright - centered */}
          <div className="pt-6 border-t border-[#F5A623]/10 text-center">
            <span className="text-xs text-black/20">© 2026 HIVE. Todos los derechos reservados.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
