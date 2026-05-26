import { NextResponse } from "next/server"
import { v4 as uuidv4 } from "uuid"
import { promises as fs } from "fs"
import path from "path"
import { getSupabase } from "@/lib/supabase"

interface OrderItem {
  title: string
  unit_price: number
  quantity: number
}

interface Customer {
  name: string
  email: string
  phone: string
  address: string
  city: string
  zip: string
}

interface Order {
  order_id: string
  timestamp: string
  customer: Customer
  items: { product: string; quantity: number; unit_price: number }[]
  total: number
  status: "pending" | "approved" | "failure"
}

async function saveOrder(order: Order) {
  const dataDir = path.join(process.cwd(), "data")
  const ordersFile = path.join(dataDir, "orders.json")

  try {
    // Ensure data directory exists
    await fs.mkdir(dataDir, { recursive: true })

    // Read existing orders or create empty array
    let orders: Order[] = []
    try {
      const data = await fs.readFile(ordersFile, "utf-8")
      orders = JSON.parse(data)
    } catch {
      // File doesn't exist, start with empty array
    }

    // Append new order
    orders.push(order)

    // Write back to file
    await fs.writeFile(ordersFile, JSON.stringify(orders, null, 2))

    return true
  } catch (error) {
    console.error("Failed to save order:", error)
    return false
  }
}

export async function POST(request: Request) {
  try {
    const { items, customer, total } = await request.json()

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Items are required" },
        { status: 400 }
      )
    }

    if (!customer || !customer.name || !customer.email) {
      return NextResponse.json(
        { error: "Customer information is required" },
        { status: 400 }
      )
    }

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN

    if (!accessToken) {
      console.error("MERCADOPAGO_ACCESS_TOKEN not configured")
      return NextResponse.json(
        { error: "Payment configuration error" },
        { status: 500 }
      )
    }

    // Generate order ID
    const orderId = uuidv4()

    // Save order to database before creating MP preference
    const order: Order = {
      order_id: orderId,
      timestamp: new Date().toISOString(),
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        zip: customer.zip,
      },
      items: items.map((item: OrderItem) => ({
        product: item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
      })),
      total: total || 0,
      status: "pending",
    }

    await saveOrder(order)

    // Save to Supabase before calling MP
    const subtotal = items.reduce(
      (sum: number, item: OrderItem) => sum + item.unit_price * item.quantity,
      0
    )
    const iva = Math.max(0, (total || 0) - subtotal)

    const supabasePayload = {
      order_id: orderId,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone || "",
      customer_address: customer.address || "",
      customer_city: customer.city || "",
      customer_zip: customer.zip || "",
      items: items.map((item: OrderItem) => ({
        product: item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
      })),
      subtotal,
      iva,
      total: total || 0,
      status: "pending",
    }

    console.log("[create-preference] Supabase insert payload:", JSON.stringify(supabasePayload))
    const { error: supabaseError } = await getSupabase()
      .from("orders")
      .insert(supabasePayload)

    if (supabaseError) {
      console.error("[create-preference] Supabase insert error:", JSON.stringify(supabaseError))
    }

    // Format items for Mercado Pago
    const mpItems = items.map((item: OrderItem) => ({
      title: item.title,
      unit_price: item.unit_price,
      quantity: item.quantity,
      currency_id: "ARS",
    }))

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"

    // Create preference via Mercado Pago API
    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        items: mpItems,
        payer: {
          name: customer.name.split(" ")[0],
          surname: customer.name.split(" ").slice(1).join(" ") || "",
          email: customer.email,
          phone: {
            number: customer.phone,
          },
        },
        shipments: {
          receiver_address: {
            street_name: customer.address,
            street_number: "",
            city_name: customer.city,
            zip_code: customer.zip,
          },
        },
        back_urls: {
          success: `${baseUrl}/gracias?order_id=${orderId}`,
          failure: `${baseUrl}/checkout`,
          pending: `${baseUrl}/gracias?order_id=${orderId}`,
        },
        auto_return: "approved",
        statement_descriptor: "HIVE Energy",
        external_reference: orderId,
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      console.error("Mercado Pago API error:", errorData)
      return NextResponse.json(
        { error: "Failed to create payment preference" },
        { status: 500 }
      )
    }

    const data = await response.json()

    return NextResponse.json({
      id: data.id,
      init_point: data.init_point,
      sandbox_init_point: data.sandbox_init_point,
      order_id: orderId,
    })
  } catch (error) {
    console.error("Create preference error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
