"use client"

import React, { useState } from "react"

const sports = [
  {
    id: "01",
    name: "Maratones",
    desc: "Energía sostenida para carreras de larga distancia",
  },
  {
    id: "02",
    name: "Ciclismo",
    desc: "Absorción rápida durante el esfuerzo continuo",
  },
  {
    id: "03",
    name: "Triatlón",
    desc: "Versatilidad para todas las disciplinas",
  },
]

const testimonials = [
  { name: "Martín R.", sport: "Maratonista", quote: "La mejor energía natural" },
  { name: "Luciana G.", sport: "Ciclista", quote: "Sin pico de azúcar" },
  { name: "Diego F.", sport: "Futbolista", quote: "Potencia real" },
  { name: "Camila S.", sport: "Triatleta", quote: "Mi secreto competitivo" },
  { name: "Joaquín M.", sport: "Trail Runner", quote: "Energía que dura" },
]

const competitions = [
  "42K Buenos Aires",
  "Ironman Argentina",
  "Vuelta a San Juan",
  "Trail Patagonia",
  "Maratón de Mendoza",
  "K42 Villa La Angostura",
  "Challenge Bariloche",
  "Ultra Trail Córdoba",
]

export function AthletesSection() {
  const [hoveredSport, setHoveredSport] = useState<string | null>(null)

  return (
    <section 
      id="atletas" 
      className="py-32 px-6 md:px-12 lg:px-20"
      style={{ backgroundColor: "#1A1208" }}
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-16">
          <span 
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] tracking-widest font-sans mb-4"
            style={{ backgroundColor: "#F5A623", color: "#1A1208" }}
          >
            ATLETAS
          </span>
          <h2 
            className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-white"
            style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
          >
            Elegido por los<br />mejores de Argentina.
          </h2>
          <p className="mt-6 text-base text-white/50 max-w-lg">
            Atletas profesionales de todo el país confían en HIVE para sus entrenamientos y competencias más exigentes.
          </p>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
          {/* Left side — Sport cards */}
          <div className="space-y-4">
            {sports.map((sport) => (
              <div
                key={sport.id}
                className="relative p-6 rounded-xl border transition-all duration-300 cursor-pointer group"
                style={{
                  backgroundColor: hoveredSport === sport.id ? "rgba(245,166,35,0.08)" : "rgba(255,255,255,0.03)",
                  borderColor: hoveredSport === sport.id ? "rgba(245,166,35,0.4)" : "rgba(255,255,255,0.08)",
                  boxShadow: hoveredSport === sport.id ? "0 0 30px rgba(245,166,35,0.15)" : "none",
                }}
                onMouseEnter={() => setHoveredSport(sport.id)}
                onMouseLeave={() => setHoveredSport(null)}
              >
                {/* Amber left border */}
                <div 
                  className="absolute left-0 top-4 bottom-4 w-1 rounded-full transition-all duration-300"
                  style={{ 
                    backgroundColor: "#F5A623",
                    opacity: hoveredSport === sport.id ? 1 : 0.4,
                  }}
                />
                <div className="pl-4">
                  <div className="flex items-center gap-4 mb-2">
                    <span 
                      className="text-3xl font-light"
                      style={{ color: "#F5A623" }}
                    >
                      {sport.id}
                    </span>
                    <h3 className="text-xl font-medium text-white">{sport.name}</h3>
                  </div>
                  <p className="text-sm text-white/40">{sport.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Right side — Testimonials panel */}
          <div 
            className="p-6 rounded-xl border"
            style={{ 
              backgroundColor: "rgba(255,255,255,0.03)",
              borderColor: "rgba(245,166,35,0.15)",
            }}
          >
            <div 
              className="text-xs tracking-widest uppercase mb-6"
              style={{ color: "#F5A623" }}
            >
              Testimonios
            </div>
            <div className="space-y-3">
              {testimonials.map((testimonial, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 px-4 py-3 rounded-lg transition-colors group cursor-pointer"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.02)",
                    borderLeft: "2px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(245,166,35,0.08)"
                    e.currentTarget.style.borderLeftColor = "#F5A623"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.02)"
                    e.currentTarget.style.borderLeftColor = "transparent"
                  }}
                >
                  {/* Pulsing amber dot */}
                  <div className="relative w-2 h-2 shrink-0">
                    <div 
                      className="absolute inset-0 rounded-full animate-ping"
                      style={{ backgroundColor: "#F5A623", opacity: 0.4 }}
                    />
                    <div 
                      className="absolute inset-0 rounded-full"
                      style={{ backgroundColor: "#F5A623" }}
                    />
                  </div>
                  
                  {/* Sport tag */}
                  <span 
                    className="px-2 py-0.5 rounded text-[10px] tracking-wide font-medium shrink-0"
                    style={{ backgroundColor: "rgba(245,166,35,0.15)", color: "#F5A623" }}
                  >
                    {testimonial.sport}
                  </span>
                  
                  {/* Name and quote */}
                  <span className="text-sm text-white/60 flex-1">
                    <span className="text-white/80">{testimonial.name}</span>
                    <span className="mx-2 text-white/30">—</span>
                    <span className="italic text-white/50">{`"${testimonial.quote}"`}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom ticker/marquee */}
        <div 
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: "rgba(245,166,35,0.1)" }}
        >
          <div 
            className="flex"
            style={{ 
              animation: "athletesMarquee 30s linear infinite",
            }}
          >
            {[...Array(3)].map((_, rep) => (
              <div key={rep} className="flex shrink-0">
                {competitions.map((comp) => (
                  <div 
                    key={`${rep}-${comp}`} 
                    className="flex items-center gap-4 px-8 py-4 shrink-0"
                  >
                    <span 
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: "#F5A623" }}
                    />
                    <span 
                      className="text-sm whitespace-nowrap tracking-wide font-medium"
                      style={{ color: "#F5A623" }}
                    >
                      {comp}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes athletesMarquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
      `}</style>
    </section>
  )
}
