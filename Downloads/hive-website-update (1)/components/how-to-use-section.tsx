"use client"

import React, { useState, useEffect } from "react"

const steps = [
  {
    id: "01",
    name: "Antes",
    desc: "Consumí un gel 30-45 minutos antes del esfuerzo para cargar energía.",
    timing: "30-45 min antes",
    icon: "clock",
  },
  {
    id: "02",
    name: "Durante",
    desc: "Tomá un gel cada 30-45 minutos durante el ejercicio prolongado.",
    timing: "Cada 30 min",
    icon: "lightning",
  },
  {
    id: "03",
    name: "Después",
    desc: "Un gel post-esfuerzo ayuda a iniciar la recuperación muscular.",
    timing: "Post esfuerzo",
    icon: "refresh",
  },
  {
    id: "04",
    name: "Competencia",
    desc: "En carreras, seguí tu plan de nutrición probado en entrenamientos.",
    timing: "Race day",
    icon: "trophy",
  },
]

function HexIcon({ type }: { type: string }) {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path
        d="M16 2L28 9V23L16 30L4 23V9L16 2Z"
        fill="rgba(245,166,35,0.15)"
        stroke="#F5A623"
        strokeWidth="1.5"
      />
      {type === "clock" && (
        <g stroke="#F5A623" strokeWidth="1.5">
          <circle cx="16" cy="16" r="5" fill="none" />
          <path d="M16 13V16L18 18" />
        </g>
      )}
      {type === "lightning" && (
        <path d="M17 11L14 16H18L15 21" stroke="#F5A623" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {type === "refresh" && (
        <g stroke="#F5A623" strokeWidth="1.5" fill="none">
          <path d="M20 13C19.2 12 17.7 11 16 11C13.2 11 11 13.2 11 16C11 18.8 13.2 21 16 21C18.3 21 20.2 19.5 20.8 17.5" />
          <path d="M20 10V14H16" />
        </g>
      )}
      {type === "trophy" && (
        <g stroke="#F5A623" strokeWidth="1.5" fill="none">
          <path d="M13 12H19V16C19 18 17.5 20 16 20C14.5 20 13 18 13 16V12Z" />
          <path d="M13 13H11C11 15 12 16 13 16" />
          <path d="M19 13H21C21 15 20 16 19 16" />
          <path d="M14 22H18" />
          <path d="M16 20V22" />
        </g>
      )}
    </svg>
  )
}

export function HowToUseSection() {
  const [activeStep, setActiveStep] = useState(0)
  const [progress, setProgress] = useState(0)

  // Auto-progress animation
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  // Progress bar animation
  useEffect(() => {
    setProgress(0)
    const timer = setTimeout(() => {
      setProgress((activeStep + 1) / steps.length * 100)
    }, 100)
    return () => clearTimeout(timer)
  }, [activeStep])

  return (
    <section 
      className="py-32 px-6 md:px-12 lg:px-20 relative overflow-hidden"
      style={{ backgroundColor: "#FFF8EE" }}
    >
      {/* Honeycomb pattern watermark */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0L60 15V37L30 52L0 37V15L30 0Z' fill='none' stroke='%23F5A623' stroke-width='0.5' opacity='0.04'/%3E%3C/svg%3E")`,
          backgroundSize: "60px 52px",
        }}
      />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-16 text-center">
          <span 
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] tracking-widest font-sans mb-4"
            style={{ backgroundColor: "rgba(245,166,35,0.1)", color: "#F5A623" }}
          >
            GUÍA
          </span>
          <h2 
            className="text-4xl md:text-5xl lg:text-6xl font-light tracking-tight leading-[1.05] mb-4"
            style={{ fontFamily: '"IBM Plex Sans", sans-serif', color: "#1A1208" }}
          >
            Cómo usar HIVE.<br />Paso a paso.
          </h2>
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">
          {/* Left side — Horizontal timeline (becomes vertical on mobile) */}
          <div className="lg:col-span-2">
            {/* Desktop: horizontal timeline */}
            <div className="hidden md:block">
              <div className="flex justify-between relative">
                {/* Timeline line */}
                <div 
                  className="absolute top-8 left-0 right-0 h-0.5"
                  style={{ backgroundColor: "rgba(245,166,35,0.2)" }}
                />
                {/* Progress line */}
                <div 
                  className="absolute top-8 left-0 h-0.5 transition-all duration-500"
                  style={{ 
                    backgroundColor: "#F5A623",
                    width: `${(activeStep / (steps.length - 1)) * 100}%`,
                  }}
                />

                {steps.map((step, index) => (
                  <div
                    key={step.id}
                    className="flex flex-col items-center cursor-pointer group relative z-10"
                    style={{ width: `${100 / steps.length}%` }}
                    onClick={() => setActiveStep(index)}
                  >
                    {/* Step number with hex icon */}
                    <div 
                      className="mb-4 transition-transform duration-300"
                      style={{
                        transform: activeStep === index ? "scale(1.15)" : "scale(1)",
                      }}
                    >
                      <div 
                        className="w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300"
                        style={{
                          backgroundColor: activeStep === index ? "#F5A623" : "rgba(245,166,35,0.1)",
                          boxShadow: activeStep === index ? "0 8px 30px rgba(245,166,35,0.3)" : "none",
                        }}
                      >
                        <span 
                          className="text-2xl font-light"
                          style={{ color: activeStep === index ? "#1A1208" : "#F5A623" }}
                        >
                          {step.id}
                        </span>
                      </div>
                    </div>

                    {/* Step name */}
                    <h3 
                      className="text-lg font-medium mb-2 transition-colors duration-300"
                      style={{ color: activeStep === index ? "#1A1208" : "rgba(26,18,8,0.5)" }}
                    >
                      {step.name}
                    </h3>

                    {/* Description (shown on active) */}
                    <p 
                      className="text-sm text-center max-w-[180px] transition-all duration-300"
                      style={{ 
                        color: "rgba(26,18,8,0.5)",
                        opacity: activeStep === index ? 1 : 0,
                        transform: activeStep === index ? "translateY(0)" : "translateY(-8px)",
                      }}
                    >
                      {step.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile: vertical list */}
            <div className="md:hidden space-y-4">
              {steps.map((step, index) => (
                <div
                  key={step.id}
                  className="flex gap-4 p-4 rounded-xl transition-all duration-300 cursor-pointer"
                  style={{
                    backgroundColor: activeStep === index ? "rgba(245,166,35,0.1)" : "transparent",
                    borderLeft: activeStep === index ? "3px solid #F5A623" : "3px solid transparent",
                  }}
                  onClick={() => setActiveStep(index)}
                >
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: activeStep === index ? "#F5A623" : "rgba(245,166,35,0.1)",
                    }}
                  >
                    <span 
                      className="text-lg font-light"
                      style={{ color: activeStep === index ? "#1A1208" : "#F5A623" }}
                    >
                      {step.id}
                    </span>
                  </div>
                  <div>
                    <h3 
                      className="text-lg font-medium mb-1"
                      style={{ color: "#1A1208" }}
                    >
                      {step.name}
                    </h3>
                    <p className="text-sm" style={{ color: "rgba(26,18,8,0.5)" }}>
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right side — Progress panel */}
          <div 
            className="p-6 rounded-2xl border"
            style={{ 
              backgroundColor: "rgba(255,255,255,0.8)",
              borderColor: "rgba(245,166,35,0.15)",
              backdropFilter: "blur(10px)",
            }}
          >
            {/* Current timing display */}
            <div className="mb-6">
              <div className="text-xs tracking-widest uppercase mb-2" style={{ color: "#F5A623" }}>
                TIMING ACTUAL
              </div>
              <div 
                className="text-2xl font-light transition-all duration-300"
                style={{ color: "#1A1208" }}
              >
                {steps[activeStep].timing}
              </div>
            </div>

            {/* Hex icon */}
            <div className="flex justify-center mb-6">
              <div 
                className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(245,166,35,0.1)" }}
              >
                <HexIcon type={steps[activeStep].icon} />
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex justify-between text-xs mb-2" style={{ color: "rgba(26,18,8,0.4)" }}>
                <span>Progreso</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div 
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: "rgba(245,166,35,0.15)" }}
              >
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ 
                    backgroundColor: "#F5A623",
                    width: `${progress}%`,
                  }}
                />
              </div>
            </div>

            {/* Timing steps */}
            <div className="space-y-2">
              {steps.map((step, index) => (
                <div 
                  key={step.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300"
                  style={{
                    backgroundColor: activeStep === index ? "rgba(245,166,35,0.1)" : "transparent",
                  }}
                >
                  <div 
                    className="w-2 h-2 rounded-full transition-all duration-300"
                    style={{ 
                      backgroundColor: index <= activeStep ? "#F5A623" : "rgba(245,166,35,0.3)",
                    }}
                  />
                  <span 
                    className="text-sm transition-colors duration-300"
                    style={{ 
                      color: index <= activeStep ? "#1A1208" : "rgba(26,18,8,0.4)",
                    }}
                  >
                    {step.timing}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
