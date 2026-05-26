import { NextResponse } from "next/server"
import { Resend } from "resend"
import { getSupabase } from "@/lib/supabase"

function formatPrice(price: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

function getVariantName(product: string): string {
  if (product.includes("PURE")) return "Pure"
  if (product.includes("BOOST")) return "Boost"
  if (product.includes("DRIVE")) return "Drive"
  return ""
}

export async function POST(request: Request) {
  try {
    const { order_id } = await request.json()

    if (!order_id) {
      return NextResponse.json(
        { error: "Order ID is required" },
        { status: 400 }
      )
    }

    const resendApiKey = process.env.RESEND_API_KEY

    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured")
      return NextResponse.json(
        { error: "Email configuration error" },
        { status: 500 }
      )
    }

    const supabase = getSupabase()
    const { data: order, error: dbError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_id', order_id)
      .single()

    if (dbError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const resend = new Resend(resendApiKey)

    // Build items HTML
    const itemsHtml = order.items
      .map(
        (item) => `
        <tr>
          <td style="padding: 16px 0; border-bottom: 1px solid rgba(245,166,35,0.3); color: #1A1208; font-size: 14px;">
            <strong style="font-weight: 600;">${item.product}</strong>
            <span style="color: #1A1208; opacity: 0.6;"> (${getVariantName(item.product)})</span>
          </td>
          <td style="padding: 16px 0; border-bottom: 1px solid rgba(245,166,35,0.3); text-align: center; color: #1A1208; font-size: 14px;">
            x${item.quantity}
          </td>
          <td style="padding: 16px 0; border-bottom: 1px solid rgba(245,166,35,0.3); text-align: right; color: #1A1208; font-size: 14px;">
            ${formatPrice(item.unit_price * item.quantity)} ARS
          </td>
        </tr>
      `
      )
      .join("")

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmación de pedido - HIVE</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #FFF8EE;">
  <div style="max-width: 600px; margin: 0 auto;">
    
    <!-- HEADER -->
    <div style="background-color: #1A1208; padding: 32px; text-align: center;">
      <!-- SVG Logo with hexagons -->
      <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
        <tr>
          <td style="text-align: center;">
            <!-- Hexagon symbols -->
            <div style="margin-bottom: 8px;">
              <svg width="60" height="52" viewBox="0 0 60 52" xmlns="http://www.w3.org/2000/svg">
                <!-- Top hexagon - Na -->
                <polygon points="30,0 45,8.7 45,26 30,34.7 15,26 15,8.7" fill="#F5A623"/>
                <text x="30" y="20" text-anchor="middle" fill="#1A1208" font-size="8" font-weight="600" font-family="sans-serif">Na</text>
                <!-- Bottom left hexagon - K -->
                <polygon points="10,26 25,34.7 25,52 10,60.7 -5,52 -5,34.7" fill="#F5A623" transform="translate(5,-8)"/>
                <text x="15" y="44" text-anchor="middle" fill="#1A1208" font-size="8" font-weight="600" font-family="sans-serif">K</text>
                <!-- Bottom right hexagon - Mg -->
                <polygon points="50,26 65,34.7 65,52 50,60.7 35,52 35,34.7" fill="#F5A623" transform="translate(-5,-8)"/>
                <text x="45" y="44" text-anchor="middle" fill="#1A1208" font-size="8" font-weight="600" font-family="sans-serif">Mg</text>
              </svg>
            </div>
            <!-- HIVE text -->
            <div style="color: #FFFFFF; font-weight: 700; font-size: 28px; letter-spacing: 4px; margin-bottom: 4px;">HIVE</div>
            <!-- ORGANIC ENERGY text -->
            <div style="color: #F5A623; font-size: 11px; letter-spacing: 3px;">ORGANIC ENERGY</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- BODY -->
    <div style="background-color: #FFF8EE; padding: 32px;">
      
      <!-- Headline -->
      <h1 style="margin: 0 0 12px 0; color: #1A1208; font-size: 24px; font-weight: 500;">
        ¡Tu pedido está confirmado, ${order.customer.name.split(" ")[0]}!
      </h1>
      
      <!-- Subtext -->
      <p style="margin: 0 0 32px 0; color: #1A1208; opacity: 0.7; font-size: 15px; line-height: 1.6;">
        Gracias por elegir lo natural. Pronto nos contactamos para coordinar el envío.
      </p>

      <!-- Order summary card -->
      <div style="background-color: #FFFFFF; border: 1px solid #F5A623; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <h3 style="margin: 0 0 16px 0; color: #1A1208; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
          Resumen del pedido
        </h3>
        
        <!-- Order items -->
        <table style="width: 100%; border-collapse: collapse;">
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <!-- Subtotal row -->
        <table style="width: 100%; margin-top: 16px;">
          <tr>
            <td style="color: #1A1208; opacity: 0.7; font-size: 14px; padding: 8px 0;">Subtotal</td>
            <td style="color: #1A1208; font-size: 14px; text-align: right; padding: 8px 0;">${formatPrice(order.total)} ARS</td>
          </tr>
        </table>

        <!-- Total row -->
        <div style="border-top: 2px solid #F5A623; margin-top: 12px; padding-top: 16px;">
          <table style="width: 100%;">
            <tr>
              <td style="color: #1A1208; font-size: 18px; font-weight: 700;">Total</td>
              <td style="color: #F5A623; font-size: 20px; font-weight: 700; text-align: right;">${formatPrice(order.total)} ARS</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Shipping card -->
      <div style="background-color: #FFFFFF; border: 1px solid #F5A623; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <h3 style="margin: 0 0 16px 0; color: #1A1208; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
          Tu pedido llega a:
        </h3>
        <p style="margin: 0; color: #1A1208; font-size: 15px; line-height: 1.8;">
          <strong>${order.customer.name}</strong><br>
          ${order.customer.address}, ${order.customer.city}, CP ${order.customer.zip}<br>
          ${order.customer.phone}
        </p>
      </div>

      <!-- Contact section -->
      <div style="text-align: center; padding: 24px 0;">
        <p style="margin: 0 0 12px 0; color: #1A1208; font-size: 15px; font-weight: 500;">
          ¿Preguntas? Estamos acá:
        </p>
        <p style="margin: 0; font-size: 14px;">
          <a href="mailto:hiveenergy@gmail.com" style="color: #F5A623; text-decoration: underline;">hiveenergy@gmail.com</a>
        </p>
        <p style="margin: 8px 0 0 0; font-size: 14px;">
          Instagram: <a href="https://instagram.com/hiive_energy" style="color: #F5A623; text-decoration: none;">@hiive_energy</a>
        </p>
      </div>
    </div>

    <!-- FOOTER -->
    <div style="background-color: #1A1208; padding: 32px; text-align: center;">
      <!-- Small logo -->
      <div style="margin-bottom: 16px;">
        <svg width="40" height="35" viewBox="0 0 60 52" xmlns="http://www.w3.org/2000/svg">
          <polygon points="30,0 45,8.7 45,26 30,34.7 15,26 15,8.7" fill="#F5A623"/>
          <polygon points="10,26 25,34.7 25,52 10,60.7 -5,52 -5,34.7" fill="#F5A623" transform="translate(5,-8)"/>
          <polygon points="50,26 65,34.7 65,52 50,60.7 35,52 35,34.7" fill="#F5A623" transform="translate(-5,-8)"/>
        </svg>
      </div>
      
      <!-- Tagline -->
      <p style="margin: 0 0 8px 0; color: #FFFFFF; font-size: 16px; font-style: italic;">
        Energía forjada por la naturaleza.
      </p>
      
      <!-- Thanks message -->
      <p style="margin: 0 0 20px 0; color: #FFF8EE; font-size: 13px; opacity: 0.8;">
        Gracias por elegir lo natural. Hasta el próximo entrenamiento.
      </p>
      
      <!-- Social links -->
      <p style="margin: 0 0 8px 0; font-size: 13px;">
        Instagram: <a href="https://instagram.com/hiive_energy" style="color: #F5A623; text-decoration: none;">@hiive_energy</a>
      </p>
      <p style="margin: 0 0 20px 0; font-size: 13px;">
        Email: <a href="mailto:hiveenergy@gmail.com" style="color: #F5A623; text-decoration: none;">hiveenergy@gmail.com</a>
      </p>
      
      <!-- Divider -->
      <div style="height: 1px; background-color: #F5A623; opacity: 0.3; margin: 20px 0;"></div>
      
      <!-- Copyright -->
      <p style="margin: 0; color: #FFFFFF; opacity: 0.4; font-size: 11px;">
        © 2026 HIVE Organic Energy. Argentina.
      </p>
    </div>
  </div>
</body>
</html>
`

    await resend.emails.send({
      from: "HIVE <noreply@resend.dev>",
      to: order.customer.email,
      subject: `Confirmación de pedido #${order.order_id.slice(0, 8).toUpperCase()} - HIVE`,
      html: emailHtml,
    })

    return NextResponse.json({ success: true, order })
  } catch (error) {
    console.error("Send confirmation error:", error)
    return NextResponse.json(
      { error: "Failed to send confirmation email" },
      { status: 500 }
    )
  }
}
