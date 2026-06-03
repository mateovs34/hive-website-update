import { NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase"
import { sendConfirmationEmail } from "@/lib/send-confirmation-email"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log('[webhook] recibido:', JSON.stringify(body))

    // MP sends payment_id inside body.data.id (IPN v2) or body.payment_id (legacy)
    const paymentId = body.data?.id || body.payment_id

    if (!paymentId) {
      return NextResponse.json({ received: true })
    }

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (!accessToken) {
      console.error("[webhook] MERCADOPAGO_ACCESS_TOKEN not configured")
      return NextResponse.json({ received: true })
    }

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!mpRes.ok) {
      console.error("[webhook] Failed to fetch payment:", paymentId, mpRes.status)
      return NextResponse.json({ received: true })
    }

    const payment = await mpRes.json()
    console.log('[webhook] payment status:', payment.status)
    console.log("[webhook] Payment status:", payment.status, "| payment_id:", paymentId)

    if (payment.status !== "approved") {
      return NextResponse.json({ received: true })
    }

    // external_reference was set to order_id when creating the MP preference
    console.log('[webhook] buscando orden con external_reference:', payment.external_reference)
    const orderId = payment.external_reference
    if (!orderId) {
      console.error("[webhook] No external_reference in payment:", paymentId)
      return NextResponse.json({ received: true })
    }

    const { data: order, error: fetchError } = await getSupabase()
      .from("orders")
      .select("*")
      .eq("order_id", orderId)
      .single()

    console.log('[webhook] orden encontrada:', JSON.stringify(order))
    if (fetchError || !order) {
      console.error("[webhook] Order not found:", orderId, fetchError)
      return NextResponse.json({ received: true })
    }

    const { error: updateError } = await getSupabase()
      .from("orders")
      .update({ status: "approved" })
      .eq("order_id", orderId)

    if (updateError) {
      console.error("[webhook] Failed to update order status:", updateError)
    }

    console.log('[webhook] enviando mail a:', order?.customer_email)
    sendConfirmationEmail({
      order_id: order.order_id,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_phone: order.customer_phone,
      customer_address: order.customer_address,
      customer_city: order.customer_city,
      customer_zip: order.customer_zip,
      items: order.items,
      subtotal: order.subtotal,
      iva: order.iva,
      total: order.total,
    }).catch((err) =>
      console.error("[webhook] Confirmation email failed:", err)
    )

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("[webhook] Error:", error)
    // Always return 200 so MP doesn't retry
    return NextResponse.json({ received: true })
  }
}
