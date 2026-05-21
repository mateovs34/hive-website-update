import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

function checkAuth(request: Request): boolean {
  const password = request.headers.get("x-dashboard-password")
  return password === process.env.DASHBOARD_PASSWORD
}

export async function GET(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const monthStart = new Date(now)
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)
  thirtyDaysAgo.setHours(0, 0, 0, 0)

  const [
    { count: todayCount },
    { data: monthOrders, count: monthCount },
    { data: recentOrders },
    { data: lastOrders },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString()),
    supabase
      .from("orders")
      .select("total, items", { count: "exact" })
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("orders")
      .select("created_at, total")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: true }),
    supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  const monthRevenue = (monthOrders ?? []).reduce((sum, o) => sum + (o.total || 0), 0)

  const productCounts: Record<string, number> = {}
  for (const order of monthOrders ?? []) {
    for (const item of order.items ?? []) {
      const name = item.product || item.title || ""
      if (name) productCounts[name] = (productCounts[name] || 0) + (item.quantity || 1)
    }
  }
  const topProduct =
    Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"

  const dailyMap: Record<string, number> = {}
  for (const order of recentOrders ?? []) {
    const day = order.created_at.substring(0, 10)
    dailyMap[day] = (dailyMap[day] || 0) + 1
  }

  const dailySales = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(thirtyDaysAgo)
    d.setDate(d.getDate() + i)
    const day = d.toISOString().substring(0, 10)
    return { date: day, ventas: dailyMap[day] || 0 }
  })

  return NextResponse.json({
    stats: {
      todayCount: todayCount ?? 0,
      monthCount: monthCount ?? 0,
      monthRevenue,
      topProduct,
    },
    orders: lastOrders ?? [],
    dailySales,
  })
}

export async function PATCH(request: Request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id, status } = await request.json()
  if (!id || !status) {
    return NextResponse.json({ error: "id and status are required" }, { status: 400 })
  }

  const { error } = await supabase.from("orders").update({ status }).eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
