import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

function checkAuth(request: Request) {
  const header = request.headers.get("x-dashboard-password")
  return header === process.env.DASHBOARD_PASSWORD
}

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: last20, error: err1 }, { data: recent, error: err2 }] = await Promise.all([
    supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("orders").select("*").gte("created_at", thirtyDaysAgo),
  ])

  if (err1 || err2) {
    return NextResponse.json({ error: (err1 || err2)?.message }, { status: 500 })
  }

  const pool = recent || []

  const ventasHoy = pool.filter((o) => o.created_at >= todayStart).length
  const ventasMes = pool.filter((o) => o.created_at >= monthStart).length
  const revenueMes = pool
    .filter((o) => o.created_at >= monthStart)
    .reduce((sum, o) => sum + (o.total || 0), 0)

  const productCounts: Record<string, number> = {}
  pool.forEach((o) => {
    if (Array.isArray(o.items)) {
      o.items.forEach((item: { product?: string; title?: string; quantity?: number }) => {
        const name = item.product || item.title || "Desconocido"
        productCounts[name] = (productCounts[name] || 0) + (item.quantity || 1)
      })
    }
  })
  const productoMasVendido =
    Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"

  const chartData = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000)
    const dateStr = date.toISOString().split("T")[0]
    const dayOrders = pool.filter((o) => o.created_at?.startsWith(dateStr))
    return {
      date: dateStr,
      revenue: dayOrders.reduce((sum, o) => sum + (o.total || 0), 0),
      ventas: dayOrders.length,
    }
  })

  return NextResponse.json({
    stats: {
      ventas_hoy: ventasHoy,
      ventas_mes: ventasMes,
      revenue_mes: revenueMes,
      producto_mas_vendido: productoMasVendido,
    },
    orders: last20 || [],
    chart_data: chartData,
  })
}

export async function PATCH(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { order_id } = await request.json()
  if (!order_id) {
    return NextResponse.json({ error: "order_id required" }, { status: 400 })
  }

  const { error } = await supabase
    .from("orders")
    .update({ status: "enviado" })
    .eq("order_id", order_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
