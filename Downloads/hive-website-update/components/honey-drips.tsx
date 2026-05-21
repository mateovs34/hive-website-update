"use client"

import React, { useEffect, useState } from "react"

export function HoneyDrips() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      // Show drips after scrolling past 80% of viewport height
      const threshold = window.innerHeight * 0.8
      setVisible(window.scrollY > threshold)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 top-0 z-40 pointer-events-none overflow-hidden" style={{ height: '200px' }}>
      {/* Left corner drip */}
      <div 
        className="absolute left-4 top-0"
        style={{
          width: '8px',
          height: '120px',
          background: 'linear-gradient(to bottom, #F5A623 0%, #E8890C 40%, transparent 100%)',
          borderRadius: '0 0 4px 4px',
          animation: 'honeyDrip 3s ease-in-out infinite',
          animationDelay: '0s',
        }}
      />
      <div 
        className="absolute left-8 top-0"
        style={{
          width: '5px',
          height: '80px',
          background: 'linear-gradient(to bottom, #F5A623 0%, #E8890C 40%, transparent 100%)',
          borderRadius: '0 0 3px 3px',
          animation: 'honeyDrip 4s ease-in-out infinite',
          animationDelay: '0.5s',
        }}
      />
      
      {/* Right corner drip */}
      <div 
        className="absolute right-4 top-0"
        style={{
          width: '8px',
          height: '100px',
          background: 'linear-gradient(to bottom, #F5A623 0%, #E8890C 40%, transparent 100%)',
          borderRadius: '0 0 4px 4px',
          animation: 'honeyDrip 3.5s ease-in-out infinite',
          animationDelay: '0.3s',
        }}
      />
      <div 
        className="absolute right-10 top-0"
        style={{
          width: '6px',
          height: '60px',
          background: 'linear-gradient(to bottom, #F5A623 0%, #E8890C 40%, transparent 100%)',
          borderRadius: '0 0 3px 3px',
          animation: 'honeyDrip 4.5s ease-in-out infinite',
          animationDelay: '1s',
        }}
      />

      {/* Additional subtle drips */}
      <div 
        className="absolute left-16 top-0 opacity-60"
        style={{
          width: '4px',
          height: '40px',
          background: 'linear-gradient(to bottom, #F5A623 0%, transparent 100%)',
          borderRadius: '0 0 2px 2px',
          animation: 'honeyDrip 5s ease-in-out infinite',
          animationDelay: '1.5s',
        }}
      />
      <div 
        className="absolute right-20 top-0 opacity-60"
        style={{
          width: '4px',
          height: '50px',
          background: 'linear-gradient(to bottom, #F5A623 0%, transparent 100%)',
          borderRadius: '0 0 2px 2px',
          animation: 'honeyDrip 4s ease-in-out infinite',
          animationDelay: '2s',
        }}
      />

      <style jsx>{`
        @keyframes honeyDrip {
          0%, 100% {
            transform: translateY(-10px) scaleY(0.8);
            opacity: 0;
          }
          20% {
            opacity: 0.8;
          }
          50% {
            transform: translateY(0) scaleY(1);
            opacity: 1;
          }
          80% {
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  )
}
