"use client"

import { useState, useEffect, useCallback } from "react"
import { HiveLogo } from "@/components/hive-logo"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

interface OrderItem {
  product?: string
  title?: string
  quantity: number
  unit_price: number
}

interface Order {
  id: number
  order_id: string
  created_at: string
  customer_name: string
  customer_email: string
  customer_phone: string
  items: OrderItem[]
  total: number
  status: string
}

interface Stats {
  ventas_hoy: number
  ventas_mes: number
  revenue_mes: number
  producto_mas_vendido: string
}

interface ChartPoint {
  date: string
  revenue: number
  ventas: number
}

interface DashboardData {
  stats: Stats
  orders: Order[]
  chart_data: ChartPoint[]
}

const SESSION_KEY = "hive_dashboard_pwd"

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  enviado: "Enviado",
  failure: "Fallido",
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  enviado: "bg-blue-100 text-blue-800",
  failure: "bg-red-100 text-red-800",
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDate(s: string) {
  return new Date(s).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatChartLabel(s: string) {
  const [, m, d] = s.split("-")
  return `${d}/${m}`
}

function StatCard({
  label,
  value,
  compact = false,
}: {
  label: string
  value: string
  compact?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#F5A623]/15 p-5">
      <p className="text-[#1A1208]/50 text-xs mb-2 tracking-wide uppercase">{label}</p>
      <p
        className={`text-[#1A1208] font-bold leading-tight ${compact ? "text-base" : "text-2xl"}`}
      >
        {value}
      </p>
    </div>
  )
}

export default function HiveOwnersDashboard() {
  const [isAuth, setIsAuth] = useState(false)
  const [pwd, setPwd] = useState("")
  const [loginError, setLoginError] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)
  const [data, setData] = useState<DashboardData | null>(null)
  const [dataLoading, setDataLoading] = useState(false)

  const fetchData = useCallback(async (password: string) => {
    setDataLoading(true)
    try {
      const res = await fetch("/api/dashboard", {
        headers: { "x-dashboard-password": password },
      })
      if (!res.ok) throw new Error("Unauthorized")
      setData(await res.json())
    } catch {
      sessionStorage.removeItem(SESSION_KEY)
      setIsAuth(false)
    } finally {
      setDataLoading(false)
    }
  }, [])

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored) {
      setIsAuth(true)
      fetchData(stored)
    }
  }, [fetchData])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginLoading(true)
    setLoginError("")
    const res = await fetch("/api/dashboard", {
      headers: { "x-dashboard-password": pwd },
    })
    if (res.ok) {
      sessionStorage.setItem(SESSION_KEY, pwd)
      setData(await res.json())
      setIsAuth(true)
    } else {
      setLoginError("Contraseña incorrecta")
    }
    setLoginLoading(false)
  }

  const markShipped = async (orderId: string) => {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (!stored) return
    const res = await fetch("/api/dashboard", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-dashboard-password": stored,
      },
      body: JSON.stringify({ order_id: orderId }),
    })
    if (res.ok) {
      setData((prev) =>
        prev
          ? {
              ...prev,
              orders: prev.orders.map((o) =>
                o.order_id === orderId ? { ...o, status: "enviado" } : o
              ),
            }
          : null
      )
    }
  }

  if (!isAuth) {
    return (
      <div className="min-h-screen bg-[#1A1208] flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-10">
            <HiveLogo variant="vertical" color="light" size={52} />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <h1 className="text-white text-lg font-medium text-center mb-6 tracking-wide">
              Panel de propietarios
            </h1>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-white/50 text-[10px] mb-1.5 tracking-widest uppercase">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  className="w-full bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-[#F5A623] transition-colors"
                  placeholder="••••••••"
                  autoFocus
                />
              </div>
              {loginError && (
                <p className="text-red-400 text-sm text-center">{loginError}</p>
              )}
              <button
                type="submit"
                disabled={loginLoading || !pwd}
                className="w-full py-3 rounded-xl font-medium tracking-wide transition-all disabled:opacity-40"
                style={{ backgroundColor: "#F5A623", color: "#1A1208" }}
              >
                {loginLoading ? "Verificando..." : "Entrar"}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  if (dataLoading || !data) {
    return (
      <div className="min-h-screen bg-[#FFF8EE] flex items-center justify-center">
        <p className="text-[#1A1208]/40 text-sm">Cargando dashboard...</p>
      </div>
    )
  }

  const { stats, orders, chart_data } = data

  return (
    <div className="min-h-screen bg-[#FFF8EE]">
      <header className="bg-[#1A1208] px-6 py-4 flex items-center justify-between">
        <HiveLogo variant="horizontal" color="dark" size={30} />
        <span className="text-white/40 text-xs tracking-widest uppercase">
          Panel de propietarios
        </span>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Ventas hoy" value={String(stats.ventas_hoy)} />
          <StatCard label="Ventas este mes" value={String(stats.ventas_mes)} />
          <StatCard label="Revenue este mes" value={formatCurrency(stats.revenue_mes)} />
          <StatCard
            label="Producto más vendido"
            value={stats.producto_mas_vendido}
            compact
          />
        </div>

        {/* Line chart */}
        <div className="bg-white rounded-2xl border border-[#F5A623]/10 p-6">
          <h2 className="text-[#1A1208] font-medium mb-6 text-sm">
            Revenue últimos 30 días
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={chart_data}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F5A62318" />
              <XAxis
                dataKey="date"
                tickFormatter={formatChartLabel}
                tick={{ fontSize: 10, fill: "#1A120860" }}
                interval={4}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#1A120860" }}
                tickFormatter={(v) => formatCurrency(v)}
                width={70}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                labelFormatter={formatChartLabel}
                contentStyle={{
                  backgroundColor: "#1A1208",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 12,
                }}
                itemStyle={{ color: "#F5A623" }}
                labelStyle={{ color: "#ffffff80", fontSize: 10 }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#F5A623"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#F5A623", strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Orders table */}
        <div className="bg-white rounded-2xl border border-[#F5A623]/10 overflow-hidden">
          <div className="px-6 py-4 border-b border-[#F5A623]/10">
            <h2 className="text-[#1A1208] font-medium text-sm">Últimas 20 órdenes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#FFF8EE]">
                  {[
                    "Fecha",
                    "Nombre",
                    "Email",
                    "Productos",
                    "Total",
                    "Estado",
                    "Acción",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-[#1A1208]/50 font-medium text-xs tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-16 text-center text-[#1A1208]/30 text-sm"
                    >
                      No hay órdenes todavía
                    </td>
                  </tr>
                )}
                {orders.map((order) => (
                  <tr
                    key={order.order_id}
                    className="border-t border-[#F5A623]/5 hover:bg-[#FFF8EE]/60 transition-colors"
                  >
                    <td className="px-4 py-3 text-[#1A1208]/60 whitespace-nowrap text-xs">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-4 py-3 text-[#1A1208] font-medium whitespace-nowrap">
                      {order.customer_name}
                    </td>
                    <td className="px-4 py-3 text-[#1A1208]/60">{order.customer_email}</td>
                    <td className="px-4 py-3 text-[#1A1208]/70 text-xs max-w-[200px]">
                      {Array.isArray(order.items)
                        ? order.items
                            .map(
                              (it) =>
                                `${it.product || it.title || "—"} x${it.quantity}`
                            )
                            .join(", ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-[#1A1208] font-medium whitespace-nowrap">
                      {formatCurrency(order.total)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_STYLES[order.status] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {order.status !== "enviado" && (
                        <button
                          onClick={() => markShipped(order.order_id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-opacity hover:opacity-80"
                          style={{ backgroundColor: "#F5A623", color: "#1A1208" }}
                        >
                          Marcar enviado
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
