"use client"

import React from "react"
import Link from "next/link"

export function ProductShowcase() {
  return (
    <section className="py-24 px-6 md:px-12 lg:px-20 bg-[#FFF8EE]">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left column — flat-lay product photo */}
          <div className="relative flex items-center justify-center">
            <div 
              className="relative rounded-2xl overflow-hidden"
              style={{
                filter: "drop-shadow(0 20px 60px rgba(245,166,35,0.2))",
              }}
            >
              <img
                src="/images/hive-flatlay.jpg"
                alt="HIVE Energy Gel on warm wood with honeycomb and honey drips"
                className="w-full max-w-[480px] h-auto rounded-2xl"
              />
            </div>
          </div>

          {/* Right column — product info */}
          <div className="flex flex-col">
            {/* Label pill */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] tracking-widest font-sans text-[#F5A623] bg-[#F5A623]/10 w-fit mb-6">
              EL PRODUCTO
            </span>

            {/* Headline */}
            <h2 
              className="text-4xl md:text-5xl font-light tracking-tight leading-[1.1] mb-10 text-[#1A1208]"
              style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
            >
              Tres versiones.<br />Una sola naturaleza.
            </h2>

            {/* Product variants */}
            <div className="space-y-6 mb-10">
              {/* HIVE PURE */}
              <div className="flex gap-4 items-start">
                <div className="w-1 bg-[#FFF8EE] border border-[#1A1208]/20 rounded-full shrink-0 h-full min-h-[48px]" />
                <div>
                  <h3 className="text-lg font-medium text-[#1A1208] mb-1">HIVE PURE</h3>
                  <p className="text-sm text-[#1A1208]/50 leading-relaxed">
                    Miel orgánica + electrolitos. Sin cafeína.
                  </p>
                </div>
              </div>

              {/* HIVE BOOST */}
              <div className="flex gap-4 items-start">
                <div className="w-1 bg-[#F5A623] rounded-full shrink-0 h-full min-h-[48px]" />
                <div>
                  <h3 className="text-lg font-medium text-[#1A1208] mb-1">HIVE BOOST</h3>
                  <p className="text-sm text-[#1A1208]/50 leading-relaxed">
                    Todo lo anterior + 50mg de cafeína natural de té verde.
                  </p>
                </div>
              </div>

              {/* HIVE DRIVE */}
              <div className="flex gap-4 items-start">
                <div className="w-1 bg-[#1A1208] rounded-full shrink-0 h-full min-h-[48px]" />
                <div>
                  <h3 className="text-lg font-medium text-[#1A1208] mb-1">HIVE DRIVE</h3>
                  <p className="text-sm text-[#1A1208]/50 leading-relaxed">
                    Máxima potencia. 100mg de cafeína natural. Para competencias.
                  </p>
                </div>
              </div>
            </div>

            {/* CTA Button */}
            <Link 
              href="/checkout"
              className="px-8 py-4 bg-[#F5A623] text-[#1A1208] text-sm font-medium rounded-xl hover:bg-[#E8890C] transition-colors tracking-widest w-fit"
              style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
            >
              COMPRAR AHORA
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
