import { NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase"

// Returns order data for the /gracias page display.
// Email is now sent server-side from /api/create-preference.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const order_id = searchParams.get("order_id")

  if (!order_id) {
    return NextResponse.json({ error: "Order ID is required" }, { status: 400 })
  }

  const supabase = getSupabase()
  const { data: row, error } = await supabase
    .from("orders")
    .select("*")
    .eq("order_id", order_id)
    .single()

  if (error || !row) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 })
  }

  // Map flat Supabase columns to the nested shape expected by gracias/page.tsx
  return NextResponse.json({
    order: {
      order_id: row.order_id,
      customer: {
        name: row.customer_name,
        email: row.customer_email,
        phone: row.customer_phone,
        address: row.customer_address,
        city: row.customer_city,
        zip: row.customer_zip,
      },
      items: row.items,
      total: row.total,
    },
  })
}
