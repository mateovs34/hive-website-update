"use client"

import React, { useRef, useEffect, useState } from "react"
import Link from "next/link"

const products = [
  {
    id: "pure",
    label: "HIVE PURE",
    headline: "Energía pura.",
    description: "Miel orgánica patagónica con electrolitos naturales. Sin cafeína. Para entrenamientos diarios y recuperación.",
    stats: [
      { value: "30g", label: "porción" },
      { value: "22g", label: "carbohidratos" },
      { value: "0mg", label: "cafeína" },
    ],
    badge: "SIN CAFEÍNA",
    image: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Apr%2029%2C%202026%2C%2010_28_35%20AM-GbAKe1mioN9nMi3JGQabal7S280nGO.png",
    bgColor: "#FFF8EE",
    textColor: "#1A1208",
    labelBg: "#1A1208",
    labelText: "#FFFFFF",
    badgeBg: "#1A1208",
    badgeText: "#FFFFFF",
    buttonBg: "#1A1208",
    buttonText: "#FFFFFF",
  },
  {
    id: "boost",
    label: "HIVE BOOST",
    headline: "Energía con foco.",
    description: "Todo lo del Pure más 50mg de cafeína natural de té verde. Focus sostenido sin nerviosismo.",
    stats: [
      { value: "30g", label: "porción" },
      { value: "22g", label: "carbohidratos" },
      { value: "50mg", label: "cafeína" },
    ],
    badge: "50MG CAFEÍNA",
    image: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Apr%2029%2C%202026%2C%2010_25_43%20AM-ab99QxcrykWVVnVePdA1IVBxBjT6y6.png",
    bgColor: "#F5A623",
    textColor: "#1A1208",
    labelBg: "#FFFFFF",
    labelText: "#1A1208",
    badgeBg: "#FFFFFF",
    badgeText: "#1A1208",
    buttonBg: "#FFFFFF",
    buttonText: "#1A1208",
  },
  {
    id: "drive",
    label: "HIVE DRIVE",
    headline: "Energía máxima.",
    description: "Máxima potencia para competencias y esfuerzos extremos. 100mg de cafeína natural.",
    stats: [
      { value: "30g", label: "porción" },
      { value: "22g", label: "carbohidratos" },
      { value: "100mg", label: "cafeína" },
    ],
    badge: "100MG CAFEÍNA",
    image: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Apr%2029%2C%202026%2C%2010_33_26%20AM-17q0mmSKw9P01TjFJoH0bReTxNMcSN.jpg",
    bgColor: "#1A1208",
    textColor: "#FFFFFF",
    labelBg: "#F5A623",
    labelText: "#1A1208",
    badgeBg: "#F5A623",
    badgeText: "#1A1208",
    buttonBg: "#F5A623",
    buttonText: "#1A1208",
  },
]

function ProductSection({ product }: { product: typeof products[0] }) {
  return (
    <div 
      className="min-h-[80vh] flex items-center justify-center px-6 md:px-12 lg:px-20 sticky top-0"
      style={{ backgroundColor: product.bgColor }}
    >
      <div className="max-w-6xl w-full mx-auto py-16 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left side - Product image */}
          <div className="flex items-center justify-center order-2 lg:order-1">
            <div 
              className="relative"
              style={{
                filter: "drop-shadow(0 30px 60px rgba(0,0,0,0.15))",
              }}
            >
              <img
                src={product.image}
                alt={`${product.label} energy gel sachet`}
                className="w-full max-w-[280px] md:max-w-[320px] h-auto"
              />
            </div>
          </div>

          {/* Right side - Product info */}
          <div className="flex flex-col order-1 lg:order-2">
            {/* Label pill */}
            <span 
              className="inline-flex items-center px-4 py-1.5 rounded-full text-[11px] tracking-widest font-medium w-fit mb-6"
              style={{ 
                backgroundColor: product.labelBg,
                color: product.labelText,
              }}
            >
              {product.label}
            </span>

            {/* Headline */}
            <h2 
              className="text-4xl md:text-5xl lg:text-6xl font-light tracking-tight leading-[1.05] mb-6"
              style={{ 
                color: product.textColor,
                fontFamily: '"IBM Plex Sans", sans-serif',
              }}
            >
              {product.headline}
            </h2>

            {/* Description */}
            <p 
              className="text-base md:text-lg leading-relaxed mb-10 max-w-md"
              style={{ color: product.textColor, opacity: 0.7 }}
            >
              {product.description}
            </p>

            {/* Stats row */}
            <div className="flex gap-8 mb-8">
              {product.stats.map((stat) => (
                <div key={stat.label}>
                  <div 
                    className="text-2xl md:text-3xl font-light"
                    style={{ color: product.textColor }}
                  >
                    {stat.value}
                  </div>
                  <div 
                    className="text-[10px] tracking-widest mt-1 uppercase"
                    style={{ color: product.textColor, opacity: 0.5 }}
                  >
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Badge and button row */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Badge */}
              <span 
                className="inline-flex items-center px-4 py-2 rounded-lg text-[11px] tracking-widest font-medium"
                style={{ 
                  backgroundColor: product.badgeBg,
                  color: product.badgeText,
                }}
              >
                {product.badge}
              </span>

              {/* COMPRAR button */}
              <Link 
                href={`/checkout?product=${encodeURIComponent(product.name)}`}
                className="px-8 py-3 rounded-xl text-[11px] font-medium tracking-widest transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                style={{ 
                  backgroundColor: product.buttonBg,
                  color: product.buttonText,
                }}
              >
                COMPRAR
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProductSections() {
  return (
    <section id="producto" className="relative">
      {/* Section header */}
      <div className="bg-[#FFF8EE] py-24 px-6 md:px-12 lg:px-20 text-center border-t border-[#F5A623]/10">
        <h2 
          className="text-4xl md:text-5xl lg:text-6xl font-light tracking-tight leading-[1.05] mb-4"
          style={{ fontFamily: '"IBM Plex Sans", sans-serif', color: "#1A1208" }}
        >
          Tres versiones. Una sola naturaleza.
        </h2>
        <p className="text-base md:text-lg text-black/50">
          Elegí tu nivel de energía.
        </p>
      </div>

      {/* Sticky scroll sections */}
      <div className="relative">
        {products.map((product, index) => (
          <ProductSection key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}
