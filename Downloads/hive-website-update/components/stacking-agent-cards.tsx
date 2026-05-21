"use client"

import { useEffect, useRef, useState } from "react"
import { HexBadgeRow } from "./hive-logo"

const AGENTS = [
  {
    label: "HIVE PURE",
    title: "Sin Cafeína",
    desc: "Nuestro gel insignia. Miel orgánica patagónica con sal marina y electrolitos naturales. Sabor suave, absorción rápida. Energía pura sin estimulantes.",
    stats: [{ v: "30g", l: "por porción" }, { v: "22g", l: "carbohidratos" }, { v: "0mg", l: "cafeína" }],
    img: "/images/product-clasico.jpg",
    bgColor: "#FFF8EE",
    accentColor: "#F5A623",
  },
  {
    label: "HIVE BOOST",
    title: "50mg Cafeína",
    desc: "Energía natural con un boost extra. Cafeína de té verde para mantener el focus durante entrenamientos intensos. Sin nerviosismo ni crash.",
    stats: [{ v: "30g", l: "por porción" }, { v: "22g", l: "carbohidratos" }, { v: "50mg", l: "cafeína" }],
    img: "/images/product-energia.jpg",
    bgColor: "#F5A623",
    accentColor: "#1A1208",
    isDark: true,
  },
  {
    label: "HIVE DRIVE",
    title: "100mg Cafeína",
    desc: "Máxima potencia para competencias y esfuerzos extremos. Doble cafeína para cuando necesitas el rendimiento máximo. Tu ventaja competitiva.",
    stats: [{ v: "30g", l: "por porción" }, { v: "22g", l: "carbohidratos" }, { v: "100mg", l: "cafeína" }],
    img: "/images/product-ultra.jpg",
    bgColor: "#1A1208",
    accentColor: "#F5A623",
    isDark: true,
  },
]

const STICKY_TOP   = 80   // matches top: 80px on first card
const STICKY_STEP  = 16   // each card stacks 16px lower
const SCALE_STEP   = 0.04 // scale reduction per card stacked on top
const OFFSET_STEP  = 8    // px pushed down per card stacked on top

function Tag({ children, isDark }: { children: React.ReactNode; isDark?: boolean }) {
  return (
    <span 
      className="inline-flex items-center px-3 py-1 rounded-full text-[11px] tracking-widest font-sans"
      style={{ 
        color: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.4)",
        backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.04)"
      }}
    >
      {children}
    </span>
  )
}

export function StackingAgentCards() {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  // depth[i] = 0..N how many cards are currently stacked on top of card i
  const [depth, setDepth] = useState<number[]>(AGENTS.map(() => 0))

  useEffect(() => {
    function onScroll() {
      const nextDepth = AGENTS.map((_, i) => {
        // Count how many cards j > i are currently in sticky position (i.e. have scrolled past card i)
        let count = 0
        for (let j = i + 1; j < AGENTS.length; j++) {
          const el = cardRefs.current[j]
          if (!el) continue
          const rect = el.getBoundingClientRect()
          const stickyTopJ = STICKY_TOP + j * STICKY_STEP
          // Card j is "on top of" card i when it has reached its sticky position
          if (rect.top <= stickyTopJ + 2) count++
        }
        return count
      })
      setDepth(nextDepth)
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <div className="flex flex-col" style={{ perspective: "1400px", perspectiveOrigin: "50% 0%" }}>
      {AGENTS.map((agent, i) => {
        const d         = depth[i]
        const scale     = 1 - d * SCALE_STEP
        const translateY = d * OFFSET_STEP

        return (
          <div
            key={agent.label}
            ref={el => { cardRefs.current[i] = el }}
            className="sticky mb-4"
            style={{ top: `${STICKY_TOP + i * STICKY_STEP}px`, zIndex: 10 + i }}
          >
            <div
              style={{
                transform:      `scale(${scale}) translateY(${translateY}px)`,
                transformOrigin: "top center",
                transition:     "transform 0.3s cubic-bezier(0.16,1,0.3,1)",
                willChange:     "transform",
              }}
            >
              <div 
                className="group relative rounded-2xl border overflow-hidden cursor-pointer transition-colors"
                style={{ 
                  backgroundColor: agent.bgColor,
                  borderColor: agent.isDark ? "rgba(245,166,35,0.3)" : "rgba(245,166,35,0.15)",
                }}
              >

                {/* ── MOBILE: image top, fades out at bottom ── */}
                {agent.img && (
                  <div className="relative w-full h-52 pointer-events-none md:hidden">
                    <img
                      src={agent.img}
                      alt={agent.label}
                      className="absolute inset-0 w-full h-full object-cover object-center"
                      style={{
                        maskImage: "linear-gradient(to bottom, black 0%, black 35%, transparent 85%)",
                        WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 35%, transparent 85%)",
                      }}
                    />
                  </div>
                )}

                {/* ── DESKTOP: image right, fades out at left (absolute) ── */}
                {agent.img && (
                  <div className="hidden md:block absolute inset-y-0 right-0 w-1/2 pointer-events-none">
                    <img
                      src={agent.img}
                      alt={agent.label}
                      className="w-full h-full object-cover object-center"
                    />
                    <div
                      className="absolute inset-0"
                      style={{
                        background: `linear-gradient(to right, ${agent.bgColor} 0%, transparent 55%)`,
                      }}
                    />
                  </div>
                )}

                {/* Text content */}
                <div
                  className="relative z-10 p-8"
                  style={{ maxWidth: agent.img ? undefined : "100%" }}
                >
                  <div className="md:max-w-[60%]">
                    <div className="flex items-start justify-between mb-6">
                      <Tag isDark={agent.isDark}>{agent.label}</Tag>
                    </div>
                    <h3 
                      className="text-xl font-light mb-3"
                      style={{ color: agent.isDark ? "#FFFFFF" : "#1A1208" }}
                    >
                      {agent.title}
                    </h3>
                    <p 
                      className="text-sm leading-relaxed mb-8"
                      style={{ color: agent.isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.45)" }}
                    >
                      {agent.desc}
                    </p>
                  </div>
                  <div 
                    className="flex items-center justify-between pt-6 border-t"
                    style={{ borderColor: agent.isDark ? "rgba(245,166,35,0.2)" : "rgba(245,166,35,0.1)" }}
                  >
                    <div className="flex gap-6">
                      {agent.stats.map(s => (
                        <div key={s.l}>
                          <div 
                            className="text-xl font-light"
                            style={{ color: agent.isDark ? "#FFFFFF" : "#1A1208" }}
                          >
                            {s.v}
                          </div>
                          <div 
                            className="text-[10px] tracking-widest mt-0.5"
                            style={{ color: agent.isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.35)" }}
                          >
                            {s.l}
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* COMPRAR button */}
                    <button 
                      className="px-6 py-2.5 rounded-xl text-[11px] font-medium tracking-widest transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                      style={{ 
                        backgroundColor: agent.isDark ? "#F5A623" : "#1A1208",
                        color: agent.isDark ? "#1A1208" : "#FFFFFF",
                      }}
                    >
                      COMPRAR
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
