"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { HiveLogo } from "@/components/hive-logo"

interface CustomerForm {
  nombre: string
  email: string
  telefono: string
  direccion: string
  ciudad: string
  codigoPostal: string
}

// TESTING PRICES - CAMBIAR ANTES DE PRODUCCIÓN
const PRODUCTS = [
  {
    id: "HIVE PURE",
    name: "HIVE PURE",
    description: "Sin cafeína",
    price: 1, // TESTING: $1 ARS
    image: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Apr%2029%2C%202026%2C%2010_28_35%20AM-GbAKe1mioN9nMi3JGQabal7S280nGO.png",
    bgColor: "#FFF8EE",
    borderColor: "#1A1208",
  },
  {
    id: "HIVE BOOST",
    name: "HIVE BOOST",
    description: "50mg cafeína de té verde",
    price: 2, // TESTING: $2 ARS
    image: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Apr%2029%2C%202026%2C%2010_25_43%20AM-ab99QxcrykWVVnVePdA1IVBxBjT6y6.png",
    bgColor: "#F5A623",
    borderColor: "#F5A623",
  },
  {
    id: "HIVE DRIVE",
    name: "HIVE DRIVE",
    description: "100mg cafeína",
    price: 3, // TESTING: $3 ARS
    image: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/ChatGPT%20Image%20Apr%2029%2C%202026%2C%2010_33_26%20AM-17q0mmSKw9P01TjFJoH0bReTxNMcSN.jpg",
    bgColor: "#1A1208",
    borderColor: "#1A1208",
  },
]

function CheckoutContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const preselectedProduct = searchParams.get("product")

  // Cart state: { productId: quantity }
  const [cart, setCart] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(false)
  
  // Customer form state
  const [customer, setCustomer] = useState<CustomerForm>({
    nombre: "",
    email: "",
    telefono: "",
    direccion: "",
    ciudad: "",
    codigoPostal: "",
  })

  // Check if form is complete
  const isFormComplete = useMemo(() => {
    return (
      customer.nombre.trim() !== "" &&
      customer.email.trim() !== "" &&
      customer.telefono.trim() !== "" &&
      customer.direccion.trim() !== "" &&
      customer.ciudad.trim() !== "" &&
      customer.codigoPostal.trim() !== ""
    )
  }, [customer])

  // Pre-select product from URL param
  useEffect(() => {
    if (preselectedProduct) {
      const product = PRODUCTS.find(p => p.id === preselectedProduct || p.name === preselectedProduct)
      if (product) {
        setCart(prev => ({ ...prev, [product.id]: prev[product.id] || 1 }))
      }
    }
  }, [preselectedProduct])

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => {
      const current = prev[productId] || 0
      const newQty = Math.max(0, Math.min(12, current + delta))
      if (newQty === 0) {
        const { [productId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [productId]: newQty }
    })
  }

  const toggleProduct = (productId: string) => {
    setCart(prev => {
      if (prev[productId]) {
        const { [productId]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [productId]: 1 }
    })
  }

  const { total, items } = useMemo(() => {
    let total = 0
    const items: { title: string; unit_price: number; quantity: number; subtotal: number }[] = []

    for (const product of PRODUCTS) {
      const qty = cart[product.id]
      if (qty && qty > 0) {
        const itemSubtotal = product.price * qty
        total += itemSubtotal
        items.push({
          title: product.name,
          unit_price: product.price,
          quantity: qty,
          subtotal: itemSubtotal,
        })
      }
    }

    return { total, items }
  }, [cart])

  const handleCheckout = async () => {
    if (items.length === 0 || !isFormComplete) return

    setIsLoading(true)
    try {
      const response = await fetch("/api/create-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map(item => ({
            title: item.title,
            unit_price: item.unit_price,
            quantity: item.quantity,
          })),
          customer: {
            name: customer.nombre,
            email: customer.email,
            phone: customer.telefono,
            address: customer.direccion,
            city: customer.ciudad,
            zip: customer.codigoPostal,
          },
          total,
        }),
      })

      const data = await response.json()

      if (data.init_point) {
        window.location.href = data.init_point
      } else {
        console.error("No init_point in response:", data)
        alert("Error al crear la preferencia de pago. Por favor intenta de nuevo.")
      }
    } catch (error) {
      console.error("Checkout error:", error)
      alert("Error al procesar el pago. Por favor intenta de nuevo.")
    } finally {
      setIsLoading(false)
    }
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price)
  }

  return (
    <div className="min-h-screen bg-[#FFF8EE]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#FFF8EE]/90 backdrop-blur-md border-b border-[#F5A623]/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <HiveLogo variant="horizontal" color="dark" size={36} />
          </Link>
          <Link 
            href="/"
            className="text-sm text-[#1A1208]/60 hover:text-[#1A1208] transition-colors"
          >
            Volver a la tienda
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <h1 
          className="text-3xl md:text-4xl font-light tracking-tight mb-12 text-[#1A1208]"
          style={{ fontFamily: '"IBM Plex Sans", sans-serif' }}
        >
          Tu pedido
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
          {/* Left: Product selector */}
          <div className="lg:col-span-3 space-y-4">
            {PRODUCTS.map((product) => {
              const isSelected = cart[product.id] && cart[product.id] > 0
              const quantity = cart[product.id] || 0

              return (
                <div
                  key={product.id}
                  className={`relative rounded-2xl border-2 transition-all duration-200 overflow-hidden ${
                    isSelected ? "shadow-lg" : "hover:border-[#F5A623]/50"
                  }`}
                  style={{
                    borderColor: isSelected ? product.borderColor : "rgba(26,18,8,0.1)",
                    backgroundColor: "#FFFFFF",
                  }}
                >
                  <div className="flex items-center gap-6 p-6">
                    {/* Product image */}
                    <div 
                      className="shrink-0 w-24 h-32 rounded-xl flex items-center justify-center overflow-hidden"
                      style={{ backgroundColor: product.bgColor }}
                    >
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-20 h-auto object-contain"
                      />
                    </div>

                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-medium text-[#1A1208] mb-1">
                        {product.name}
                      </h3>
                      <p className="text-sm text-[#1A1208]/50 mb-3">
                        {product.description}
                      </p>
                      <p className="text-xl font-medium text-[#1A1208]">
                        {formatPrice(product.price)}
                      </p>
                    </div>

                    {/* Quantity selector or Add button */}
                    <div className="shrink-0">
                      {isSelected ? (
                        <div className="flex items-center gap-3 bg-[#FFF8EE] rounded-xl px-2 py-1">
                          <button
                            onClick={() => updateQuantity(product.id, -1)}
                            className="w-10 h-10 flex items-center justify-center rounded-lg text-[#1A1208] hover:bg-[#F5A623]/20 transition-colors text-xl font-light"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-lg font-medium text-[#1A1208]">
                            {quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(product.id, 1)}
                            className="w-10 h-10 flex items-center justify-center rounded-lg text-[#1A1208] hover:bg-[#F5A623]/20 transition-colors text-xl font-light"
                            disabled={quantity >= 12}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => toggleProduct(product.id)}
                          className="px-6 py-3 rounded-xl text-sm font-medium tracking-wide bg-[#1A1208] text-white hover:bg-[#1A1208]/90 transition-colors"
                        >
                          Agregar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Right: Order summary (sticky) */}
          <div className="lg:col-span-2">
            <div className="sticky top-28 bg-white rounded-2xl border border-[#F5A623]/15 p-6">
              <h2 className="text-lg font-medium text-[#1A1208] mb-6">
                Resumen del pedido
              </h2>

              {items.length === 0 ? (
                <p className="text-sm text-[#1A1208]/50 py-8 text-center">
                  Seleccioná al menos un producto
                </p>
              ) : (
                <>
                  {/* Line items */}
                  <div className="space-y-3 mb-6">
                    {items.map((item) => (
                      <div key={item.title} className="flex justify-between text-sm">
                        <span className="text-[#1A1208]/70">
                          {item.title} x {item.quantity}
                        </span>
                        <span className="text-[#1A1208] font-medium">
                          {formatPrice(item.subtotal)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Divider */}
                  <div className="border-t border-[#F5A623]/10 my-4" />

                  {/* Total */}
                  <div className="flex justify-between items-baseline mb-6">
                    <span className="text-lg font-medium text-[#1A1208]">Total</span>
                    <span className="text-2xl font-bold text-[#1A1208]">
                      {formatPrice(total)}
                    </span>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-[#F5A623]/10 my-6" />

                  {/* Customer form */}
                  <div className="space-y-4 mb-6">
                    <h3 className="text-sm font-medium text-[#1A1208] mb-4">
                      Datos de envío
                    </h3>

                    <div>
                      <label className="block text-[11px] text-[#1A1208]/60 mb-1.5 tracking-wide">
                        Nombre completo *
                      </label>
                      <input
                        type="text"
                        value={customer.nombre}
                        onChange={(e) => setCustomer(prev => ({ ...prev, nombre: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-[#F5A623]/20 bg-[#FFF8EE] text-[#1A1208] text-sm focus:outline-none focus:border-[#F5A623] transition-colors"
                        placeholder="Juan Pérez"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#1A1208]/60 mb-1.5 tracking-wide">
                        Email *
                      </label>
                      <input
                        type="email"
                        value={customer.email}
                        onChange={(e) => setCustomer(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-[#F5A623]/20 bg-[#FFF8EE] text-[#1A1208] text-sm focus:outline-none focus:border-[#F5A623] transition-colors"
                        placeholder="juan@email.com"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#1A1208]/60 mb-1.5 tracking-wide">
                        Teléfono (WhatsApp) *
                      </label>
                      <input
                        type="tel"
                        value={customer.telefono}
                        onChange={(e) => setCustomer(prev => ({ ...prev, telefono: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-[#F5A623]/20 bg-[#FFF8EE] text-[#1A1208] text-sm focus:outline-none focus:border-[#F5A623] transition-colors"
                        placeholder="+54 11 1234 5678"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#1A1208]/60 mb-1.5 tracking-wide">
                        Dirección (calle y número) *
                      </label>
                      <input
                        type="text"
                        value={customer.direccion}
                        onChange={(e) => setCustomer(prev => ({ ...prev, direccion: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl border border-[#F5A623]/20 bg-[#FFF8EE] text-[#1A1208] text-sm focus:outline-none focus:border-[#F5A623] transition-colors"
                        placeholder="Av. Corrientes 1234"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#1A1208]/60 mb-1.5 tracking-wide">
                          Ciudad *
                        </label>
                        <input
                          type="text"
                          value={customer.ciudad}
                          onChange={(e) => setCustomer(prev => ({ ...prev, ciudad: e.target.value }))}
                          className="w-full px-4 py-3 rounded-xl border border-[#F5A623]/20 bg-[#FFF8EE] text-[#1A1208] text-sm focus:outline-none focus:border-[#F5A623] transition-colors"
                          placeholder="Buenos Aires"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#1A1208]/60 mb-1.5 tracking-wide">
                          Código postal *
                        </label>
                        <input
                          type="text"
                          value={customer.codigoPostal}
                          onChange={(e) => setCustomer(prev => ({ ...prev, codigoPostal: e.target.value }))}
                          className="w-full px-4 py-3 rounded-xl border border-[#F5A623]/20 bg-[#FFF8EE] text-[#1A1208] text-sm focus:outline-none focus:border-[#F5A623] transition-colors"
                          placeholder="C1000"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Checkout button */}
                  <button
                    onClick={handleCheckout}
                    disabled={isLoading || items.length === 0 || !isFormComplete}
                    className="w-full py-4 rounded-xl text-sm font-medium tracking-widest transition-all duration-200 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: isFormComplete ? "#F5A623" : "#D1D5DB",
                      color: isFormComplete ? "#1A1208" : "#6B7280",
                    }}
                  >
                    {isLoading ? "Procesando..." : "Ir a pagar con Mercado Pago"}
                  </button>

                  {/* Security note */}
                  <p className="text-[10px] text-[#1A1208]/40 text-center mt-4">
                    Pago seguro procesado por Mercado Pago
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FFF8EE] flex items-center justify-center">
        <div className="text-[#1A1208]/50">Cargando...</div>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  )
}
