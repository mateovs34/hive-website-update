"use client"

import React from "react"

interface HiveLogoProps {
  variant?: "horizontal" | "vertical" | "symbol"
  color?: "dark" | "light" | "amber"
  size?: number
  className?: string
}

// Hexagon SVG path for the honeycomb cells
const Hexagon = ({ 
  x, 
  y, 
  size, 
  fill, 
  letter, 
  letterColor 
}: { 
  x: number
  y: number
  size: number
  fill: string
  letter?: string
  letterColor?: string
}) => {
  // Hexagon with flat top
  const h = size
  const w = size * 0.866 // width = size * sqrt(3)/2
  
  return (
    <g transform={`translate(${x}, ${y})`}>
      <polygon
        points={`${w/2},0 ${w},${h*0.25} ${w},${h*0.75} ${w/2},${h} 0,${h*0.75} 0,${h*0.25}`}
        fill={fill}
      />
      {letter && (
        <text
          x={w / 2}
          y={h / 2 + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={letterColor}
          fontSize={size * 0.3}
          fontWeight="600"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {letter}
        </text>
      )}
    </g>
  )
}

export function HiveLogo({ 
  variant = "horizontal", 
  color = "dark", 
  size = 40,
  className = ""
}: HiveLogoProps) {
  const hexSize = size * 0.6
  const hexWidth = hexSize * 0.866
  const gap = hexSize * 0.04
  
  // Color scheme based on mode
  const fillColor = color === "amber" ? "#F5A623" : (color === "dark" ? "#F5F0E8" : "#FFFFFF")
  const letterColor = color === "amber" ? "#FFFFFF" : "#F5A623"
  const textColor = color === "dark" ? "#1A1208" : "#FFFFFF"
  
  // Symbol only (3 hexagons in honeycomb arrangement)
  const Symbol = () => (
    <svg 
      width={hexWidth * 2 + gap} 
      height={hexSize * 1.5 + gap} 
      viewBox={`0 0 ${hexWidth * 2 + gap} ${hexSize * 1.5 + gap}`}
      className="shrink-0"
    >
      {/* Top center hexagon - Na */}
      <Hexagon 
        x={(hexWidth + gap) / 2} 
        y={0} 
        size={hexSize} 
        fill={fillColor} 
        letter="Na" 
        letterColor={letterColor} 
      />
      {/* Bottom left hexagon - K */}
      <Hexagon 
        x={0} 
        y={hexSize * 0.5 + gap} 
        size={hexSize} 
        fill={fillColor} 
        letter="K" 
        letterColor={letterColor} 
      />
      {/* Bottom right hexagon - Mg */}
      <Hexagon 
        x={hexWidth + gap} 
        y={hexSize * 0.5 + gap} 
        size={hexSize} 
        fill={fillColor} 
        letter="Mg" 
        letterColor={letterColor} 
      />
    </svg>
  )

  if (variant === "symbol") {
    return <div className={className}><Symbol /></div>
  }

  if (variant === "vertical") {
    return (
      <div className={`flex flex-col items-center gap-3 ${className}`}>
        <Symbol />
        <div className="flex flex-col items-center">
          <span 
            className="font-bold tracking-[0.2em] text-lg"
            style={{ color: textColor }}
          >
            HIVE
          </span>
          <span 
            className="text-[8px] tracking-[0.3em] mt-1"
            style={{ color: textColor, opacity: 0.6 }}
          >
            ORGANIC ENERGY
          </span>
        </div>
      </div>
    )
  }

  // Horizontal (default) - Dark premium pill badge style
  return (
    <div 
      className={`flex items-center gap-3 px-4 py-2 rounded-full ${className}`}
      style={{ 
        backgroundColor: "#1A1208",
        boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
      }}
    >
      {/* Amber symbol - 20% larger */}
      <svg 
        width={hexWidth * 2 + gap} 
        height={hexSize * 1.5 + gap} 
        viewBox={`0 0 ${hexWidth * 2 + gap} ${hexSize * 1.5 + gap}`}
        className="shrink-0"
        style={{ transform: "scale(0.84)", transformOrigin: "center" }}
      >
        {/* Top center hexagon - Na */}
        <Hexagon 
          x={(hexWidth + gap) / 2} 
          y={0} 
          size={hexSize} 
          fill="#F5A623" 
          letter="Na" 
          letterColor="#1A1208" 
        />
        {/* Bottom left hexagon - K */}
        <Hexagon 
          x={0} 
          y={hexSize * 0.5 + gap} 
          size={hexSize} 
          fill="#F5A623" 
          letter="K" 
          letterColor="#1A1208" 
        />
        {/* Bottom right hexagon - Mg */}
        <Hexagon 
          x={hexWidth + gap} 
          y={hexSize * 0.5 + gap} 
          size={hexSize} 
          fill="#F5A623" 
          letter="Mg" 
          letterColor="#1A1208" 
        />
      </svg>
      <div className="flex flex-col">
        <span 
          className="tracking-[0.15em] text-[15px] leading-none"
          style={{ color: "#FFFFFF", fontWeight: 800 }}
        >
          HIVE
        </span>
        <span 
          className="text-[5px] mt-0.5 uppercase"
          style={{ color: "#E8890C", letterSpacing: "0.15em" }}
        >
          ORGANIC ENERGY
        </span>
      </div>
    </div>
  )
}

// Small hex badge for individual elements (Na, K, Mg)
export function HexBadge({ 
  letter, 
  size = 32,
  className = ""
}: { 
  letter: string
  size?: number
  className?: string
}) {
  const hexSize = size
  const hexWidth = hexSize * 0.866
  
  return (
    <svg 
      width={hexWidth} 
      height={hexSize} 
      viewBox={`0 0 ${hexWidth} ${hexSize}`}
      className={className}
    >
      <Hexagon 
        x={0} 
        y={0} 
        size={hexSize} 
        fill="#F5F0E8" 
        letter={letter} 
        letterColor="#F5A623" 
      />
    </svg>
  )
}

// Row of hex badges for product cards
export function HexBadgeRow({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <HexBadge letter="Na" size={size} />
      <HexBadge letter="K" size={size} />
      <HexBadge letter="Mg" size={size} />
    </div>
  )
}

// Large symbol for section headers (centered, amber)
export function HiveSymbolLarge({ size = 80, className = "" }: { size?: number; className?: string }) {
  const hexSize = size * 0.6
  const hexWidth = hexSize * 0.866
  const gap = hexSize * 0.04
  const totalWidth = hexWidth * 2 + gap
  const totalHeight = hexSize * 1.5 + gap
  
  return (
    <svg 
      width={totalWidth} 
      height={totalHeight} 
      viewBox={`0 0 ${totalWidth} ${totalHeight}`}
      className={className}
    >
      {/* Top center hexagon - Na */}
      <Hexagon 
        x={(hexWidth + gap) / 2} 
        y={0} 
        size={hexSize} 
        fill="#F5A623" 
        letter="Na" 
        letterColor="#FFFFFF" 
      />
      {/* Bottom left hexagon - K */}
      <Hexagon 
        x={0} 
        y={hexSize * 0.5 + gap} 
        size={hexSize} 
        fill="#F5A623" 
        letter="K" 
        letterColor="#FFFFFF" 
      />
      {/* Bottom right hexagon - Mg */}
      <Hexagon 
        x={hexWidth + gap} 
        y={hexSize * 0.5 + gap} 
        size={hexSize} 
        fill="#F5A623" 
        letter="Mg" 
        letterColor="#FFFFFF" 
      />
    </svg>
  )
}
