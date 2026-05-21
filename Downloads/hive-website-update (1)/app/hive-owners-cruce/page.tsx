"use client"

import { useState, useEffect, useCallback } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { HiveLogo } from "@/components/hive-logo"

const SESSION_KEY = "hive_dashboard_password"

interface OrderItem {
  product: string
  quantity: number
  unit_price: number
}

interface Order {
  id: string
  created_at: string
  customer_name: string
  customer_email: string
  customer_phone: string
  customer_address: string
  customer_city: string
  customer_zip: string
  items: OrderItem[]
  subtotal: number
  iva: number
  total: number
  status: string
  mp_preference_id: string | null
}

interface Stats {
  todayCount: number
  monthCount: number
  monthRevenue: number
  topProduct: string
}

interface DailySale {
  date: string
  ventas: number
}

interface DashboardData {
  stats: Stats
  orders: Order[]
  dailySales: DailySale[]
}

function formatARS(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatShortDate(iso: string) {
  const [, month, day] = iso.split("-")
  return `${day}/${month}`
}

function statusLabel(status: string) {
  const map: Record<string, { label: string; color: string }> = {
    pending: { label: "Pendiente", color: "#F5A623" },
    approved: { label: "Aprobado", color: "#22c55e" },
    shipped: { label: "Enviado", color: "#3b82f6" },
    failure: { label: "Fallido", color: "#ef4444" },
  }
  return map[status] ?? { label: status, color: "#9ca3af" }
}

export default function HiveOwnersDashboard() {
  const [password, setPassword] = useState("")
  const [authenticated, setAuthenticated] = useState(false)
  const [shake, setShake] = useState(false)
  const [loginError, setLoginError] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const fetchDashboard = useCallback(async (pwd: string) => {
    setLoading(true)
    try {
      const res = await fetch("/api/dashboard", {
        headers: { "x-dashboard-password": pwd },
      })
      if (!res.ok) throw new Error("unauthorized")
      const json = await res.json()
      setData(json)
    } catch {
      sessionStorage.removeItem(SESSION_KEY)
      setAuthenticated(false)
    } finally {
      setLoading(false)
    }
  }, [])

  // Check sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (saved) {
      setAuthenticated(true)
      fetchDashboard(saved)
    }
  }, [fetchDashboard])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginLoading(true)
    try {
      const res = await fetch("/api/dashboard", {
        headers: { "x-dashboard-password": password },
      })
      if (!res.ok) {
        setLoginError("Contraseña incorrecta")
        setShake(true)
        setTimeout(() => setShake(false), 600)
        return
      }
      const json = await res.json()
      sessionStorage.setItem(SESSION_KEY, password)
      setAuthenticated(true)
      setData(json)
    } catch {
      setLoginError("Error de conexión")
      setShake(true)
      setTimeout(() => setShake(false), 600)
    } finally {
      setLoginLoading(false)
    }
  }

  async function markShipped(orderId: string) {
    const pwd = sessionStorage.getItem(SESSION_KEY) ?? ""
    setUpdatingId(orderId)
    try {
      await fetch("/api/dashboard", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-dashboard-password": pwd,
        },
        body: JSON.stringify({ id: orderId, status: "shipped" }),
      })
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          orders: prev.orders.map((o) =>
            o.id === orderId ? { ...o, status: "shipped" } : o
          ),
        }
      })
    } finally {
      setUpdatingId(null)
    }
  }

  if (!authenticated) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#FFF8EE" }}
      >
        <div
          className="w-full max-w-sm px-8 py-10 rounded-2xl border"
          style={{
            backgroundColor: "#FFFFFF",
            borderColor: "rgba(245,166,35,0.2)",
            boxShadow: "0 8px 40px rgba(26,18,8,0.08)",
            animation: shake ? "shake 0.5s ease" : "none",
          }}
        >
          <style>{`
            @keyframes shake {
              0%, 100% { transform: translateX(0); }
              20% { transform: translateX(-8px); }
              40% { transform: translateX(8px); }
              60% { transform: translateX(-6px); }
              80% { transform: translateX(6px); }
            }
          `}</style>

          <div className="flex justify-center mb-8">
            <HiveLogo variant="horizontal" color="dark" size={36} />
          </div>

          <p
            className="text-center text-sm mb-6"
            style={{ color: "rgba(26,18,8,0.5)" }}
          >
            Área privada
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setLoginError("")
              }}
              placeholder="Contraseña"
              autoFocus
              className="w-full px-4 py-3 rounded-xl text-sm border focus:outline-none transition-colors"
              style={{
                backgroundColor: "#FFF8EE",
                borderColor: loginError
                  ? "#ef4444"
                  : "rgba(245,166,35,0.25)",
                color: "#1A1208",
              }}
            />

            {loginError && (
              <p className="text-xs text-red-500 text-center">{loginError}</p>
            )}

            <button
              type="submit"
              disabled={loginLoading || !password}
              className="w-full py-3 rounded-xl text-sm font-medium tracking-widest transition-all"
              style={{
                backgroundColor: "#F5A623",
                color: "#1A1208",
                opacity: loginLoading || !password ? 0.6 : 1,
              }}
            >
              {loginLoading ? "Verificando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "#FFF8EE", fontFamily: '"IBM Plex Sans", sans-serif' }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-10 border-b"
        style={{
          backgroundColor: "rgba(255,248,238,0.95)",
          borderColor: "rgba(245,166,35,0.15)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <HiveLogo variant="horizontal" color="dark" size={28} />
          <span
            className="text-xs tracking-widest uppercase"
            style={{ color: "rgba(26,18,8,0.4)" }}
          >
            Panel de control
          </span>
          <button
            onClick={() => {
              sessionStorage.removeItem(SESSION_KEY)
              setAuthenticated(false)
              setData(null)
              setPassword("")
            }}
            className="text-xs transition-colors"
            style={{ color: "rgba(26,18,8,0.4)" }}
          >
            Salir
          </button>
        </div>
      </header>

      {loading || !data ? (
        <div
          className="flex items-center justify-center min-h-[60vh] text-sm"
          style={{ color: "rgba(26,18,8,0.4)" }}
        >
          Cargando datos...
        </div>
      ) : (
        <main className="max-w-7xl mx-auto px-6 py-10 space-y-10">
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "Ventas hoy",
                value: data.stats.todayCount,
                unit: "pedidos",
              },
              {
                label: "Ventas este mes",
                value: data.stats.monthCount,
                unit: "pedidos",
              },
              {
                label: "Revenue este mes",
                value: formatARS(data.stats.monthRevenue),
                unit: "",
              },
              {
                label: "Producto más vendido",
                value: data.stats.topProduct,
                unit: "",
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl p-6 border"
                style={{
                  backgroundColor: "#FFFFFF",
                  borderColor: "rgba(245,166,35,0.15)",
                }}
              >
                <p
                  className="text-xs tracking-wide mb-3"
                  style={{ color: "rgba(26,18,8,0.45)" }}
                >
                  {card.label}
                </p>
                <p
                  className="text-2xl font-semibold leading-none"
                  style={{ color: "#1A1208" }}
                >
                  {card.value}
                </p>
                {card.unit && (
                  <p
                    className="text-xs mt-1"
                    style={{ color: "rgba(26,18,8,0.35)" }}
                  >
                    {card.unit}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Line chart */}
          <div
            className="rounded-2xl border p-6"
            style={{
              backgroundColor: "#FFFFFF",
              borderColor: "rgba(245,166,35,0.15)",
            }}
          >
            <h2
              className="text-sm font-medium mb-6"
              style={{ color: "#1A1208" }}
            >
              Ventas diarias — últimos 30 días
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart
                data={data.dailySales}
                margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(245,166,35,0.12)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  tick={{ fontSize: 10, fill: "rgba(26,18,8,0.4)" }}
                  tickLine={false}
                  axisLine={false}
                  interval={4}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "rgba(26,18,8,0.4)" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1A1208",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "#FFF8EE",
                  }}
                  labelFormatter={formatShortDate}
                  formatter={(value: number) => [value, "ventas"]}
                />
                <Line
                  type="monotone"
                  dataKey="ventas"
                  stroke="#F5A623"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: "#F5A623", stroke: "#1A1208", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Orders table */}
          <div
            className="rounded-2xl border overflow-hidden"
            style={{
              backgroundColor: "#FFFFFF",
              borderColor: "rgba(245,166,35,0.15)",
            }}
          >
            <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(245,166,35,0.1)" }}>
              <h2 className="text-sm font-medium" style={{ color: "#1A1208" }}>
                Últimos 20 pedidos
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="border-b text-xs tracking-wide"
                    style={{
                      borderColor: "rgba(245,166,35,0.08)",
                      color: "rgba(26,18,8,0.45)",
                    }}
                  >
                    {["Fecha", "Nombre", "Email", "Productos", "Total", "Estado", ""].map(
                      (h) => (
                        <th
                          key={h}
                          className="text-left px-6 py-3 font-medium"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((order, i) => {
                    const { label, color } = statusLabel(order.status)
                    return (
                      <tr
                        key={order.id}
                        className="border-b transition-colors hover:bg-[#FFF8EE]/60"
                        style={{
                          borderColor: "rgba(245,166,35,0.06)",
                          backgroundColor: i % 2 === 0 ? "transparent" : "rgba(245,166,35,0.02)",
                        }}
                      >
                        <td
                          className="px-6 py-4 whitespace-nowrap text-xs"
                          style={{ color: "rgba(26,18,8,0.55)" }}
                        >
                          {formatDate(order.created_at)}
                        </td>
                        <td
                          className="px-6 py-4 font-medium whitespace-nowrap"
                          style={{ color: "#1A1208" }}
                        >
                          {order.customer_name}
                        </td>
                        <td
                          className="px-6 py-4 text-xs whitespace-nowrap"
                          style={{ color: "rgba(26,18,8,0.55)" }}
                        >
                          {order.customer_email}
                        </td>
                        <td className="px-6 py-4 text-xs" style={{ color: "#1A1208" }}>
                          {(order.items ?? [])
                            .map((it) => `${it.product} x${it.quantity}`)
                            .join(", ")}
                        </td>
                        <td
                          className="px-6 py-4 font-medium whitespace-nowrap"
                          style={{ color: "#1A1208" }}
                        >
                          {formatARS(order.total)}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className="px-2.5 py-1 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: `${color}18`,
                              color,
                            }}
                          >
                            {label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {order.status !== "shipped" && (
                            <button
                              onClick={() => markShipped(order.id)}
                              disabled={updatingId === order.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
                              style={{
                                borderColor: "rgba(245,166,35,0.4)",
                                color: "#1A1208",
                                opacity: updatingId === order.id ? 0.5 : 1,
                              }}
                            >
                              {updatingId === order.id ? "..." : "Marcar como enviado"}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {data.orders.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-6 py-12 text-center text-sm"
                        style={{ color: "rgba(26,18,8,0.35)" }}
                      >
                        No hay pedidos aún
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}
    </div>
  )
}
