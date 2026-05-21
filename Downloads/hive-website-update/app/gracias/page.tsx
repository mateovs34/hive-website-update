"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { HiveLogo } from "@/components/hive-logo"

interface OrderItem {
  product: string
  quantity: number
  unit_price: number
}

interface Order {
  order_id: string
  customer: {
    name: string
    email: string
    phone: string
    address: string
    city: string
    zip: string
  }
  items: OrderItem[]
  total: number
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

function getVariantName(product: string): string {
  if (product.includes("PURE")) return "Pure - Sin cafeína"
  if (product.includes("BOOST")) return "Boost - 50mg cafeína"
  if (product.includes("DRIVE")) return "Drive - 100mg cafeína"
  return ""
}

function GraciasContent() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get("order_id")
  const [order, setOrder] = useState<Order | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    // Send confirmation email and get order data when page loads
    if (orderId && !emailSent && !sending) {
      setSending(true)
      fetch("/api/send-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.order) {
            setOrder(data.order)
          }
          setEmailSent(true)
        })
        .catch((error) => console.error("Failed to send confirmation email:", error))
        .finally(() => setSending(false))
    }
  }, [orderId, emailSent, sending])

  const whatsappMessage = encodeURIComponent("Hola HIVE! Acabo de hacer un pedido y quiero coordinar el envío")
  const whatsappLink = `https://wa.me/5491134826426?text=${whatsappMessage}`

  return (
    <div className="min-h-screen bg-[#FFF8EE] flex flex-col">
      {/* Header */}
      <header className="bg-[#FFF8EE]/90 backdrop-blur-md border-b border-[#F5A623]/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <HiveLogo variant="horizontal" color="dark" size={36} />
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-6 py-12">
        <div className="max-w-lg mx-auto">
          {/* Success icon */}
          <div className="text-center mb-8">
            <div 
              className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "#F5A623" }}
            >
              <svg 
                width="40" 
                height="40" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="#1A1208" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>

            {/* Title */}
            <h1 
              className="text-3xl md:text-4xl font-light tracking-tight mb-4 text-[#1A1208]"
              style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
            >
              {order ? `¡Gracias, ${order.customer.name.split(" ")[0]}!` : "¡Gracias por tu compra!"}
            </h1>

            {/* Subtitle */}
            <p className="text-[#1A1208]/60 mb-2 leading-relaxed">
              Tu pedido ha sido confirmado exitosamente.
            </p>
            <p className="text-[#1A1208]/60 leading-relaxed">
              Te enviamos un email de confirmación con los detalles.
            </p>
          </div>

          {/* Order Summary Card */}
          {order && (
            <div className="bg-white rounded-2xl border border-[#F5A623] p-6 mb-6">
              <h3 className="text-[11px] text-[#1A1208]/50 tracking-widest mb-4 font-medium">
                RESUMEN DEL PEDIDO
              </h3>
              
              {/* Order ID */}
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-[#F5A623]/20">
                <span className="text-sm text-[#1A1208]/60">Número de orden</span>
                <span className="font-mono text-[#1A1208]">{order.order_id.slice(0, 8).toUpperCase()}</span>
              </div>

              {/* Items */}
              <div className="space-y-3 mb-4">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium text-[#1A1208]">{item.product}</p>
                      <p className="text-xs text-[#1A1208]/50">{getVariantName(item.product)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-[#1A1208]">x{item.quantity}</p>
                      <p className="text-sm text-[#1A1208]/70">{formatPrice(item.unit_price * item.quantity)}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Divider */}
              <div className="border-t-2 border-[#F5A623] my-4" />

              {/* Total */}
              <div className="flex justify-between items-baseline">
                <span className="text-lg font-semibold text-[#1A1208]">Total pagado</span>
                <span className="text-xl font-bold" style={{ color: "#F5A623" }}>
                  {formatPrice(order.total)}
                </span>
              </div>
            </div>
          )}

          {/* Shipping info card */}
          {order && (
            <div className="bg-white rounded-2xl border border-[#F5A623] p-6 mb-6">
              <h3 className="text-[11px] text-[#1A1208]/50 tracking-widest mb-4 font-medium">
                TU PEDIDO LLEGA A
              </h3>
              <p className="text-[#1A1208] leading-relaxed">
                <strong>{order.customer.name}</strong><br />
                {order.customer.address}, {order.customer.city}<br />
                CP {order.customer.zip}<br />
                {order.customer.phone}
              </p>
            </div>
          )}

          {/* WhatsApp CTA */}
          <a 
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 w-full py-4 rounded-xl text-sm font-medium tracking-wide transition-all duration-200 hover:brightness-105 mb-4"
            style={{
              backgroundColor: "#25D366",
              color: "#FFFFFF",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Coordinar envío por WhatsApp
          </a>

          {/* Back to store */}
          <Link 
            href="/"
            className="block w-full text-center py-4 rounded-xl text-sm font-medium tracking-widest transition-all duration-200 hover:brightness-105"
            style={{
              backgroundColor: "#F5A623",
              color: "#1A1208",
            }}
          >
            VOLVER A LA TIENDA
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#1A1208] py-8 px-6 text-center">
        <p className="text-white/60 text-sm mb-2">
          HIVE - Organic Energy Gel con Miel
        </p>
        <p className="text-[#F5A623] text-xs">
          Clean Energy. Nada más.
        </p>
      </footer>
    </div>
  )
}

export default function GraciasPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FFF8EE] flex items-center justify-center">
        <div className="text-[#1A1208]/50">Cargando...</div>
      </div>
    }>
      <GraciasContent />
    </Suspense>
  )
}
