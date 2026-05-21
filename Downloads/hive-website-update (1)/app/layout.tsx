import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono, IBM_Plex_Sans } from 'next/font/google'
import { Courier_Prime } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });
const _courierPrime = Courier_Prime({ weight: ["400", "700"], subsets: ["latin"] });
const _ibmPlexSans = IBM_Plex_Sans({ weight: ["300", "400", "500", "600"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'HIVE — Geles de Energía Natural de Miel Argentina',
  description: 'Geles de miel pura para atletas. Energía natural de absorción rápida sin sintéticos. Hecho en Argentina con ingredientes 100% naturales.',
  keywords: ['energy gels', 'honey gels', 'natural energy', 'athlete nutrition', 'Argentina honey', 'sports nutrition'],
  authors: [{ name: 'HIVE' }],
  openGraph: {
    title: 'HIVE — Geles de Energía Natural de Miel Argentina',
    description: 'Geles de miel pura para atletas. Energía natural sin sintéticos.',
    type: 'website',
    url: 'https://hive.ar',
    siteName: 'HIVE',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HIVE — Geles de Energía Natural de Miel Argentina',
    description: 'Geles de miel pura para atletas. Energía natural sin sintéticos.',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-white">
      <body className={`font-sans antialiased bg-white`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
