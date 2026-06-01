import nodemailer from "nodemailer"

interface OrderItem {
  product?: string
  name?: string
  quantity: number
  unit_price?: number
  price?: number
}

export interface ConfirmationOrderData {
  order_id: string
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
  status?: string
  mp_preference_id?: string
}

const BASE_URL = "https://hive-website-update.vercel.app"

function formatPrice(price: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

function getProductImage(name: string): string {
  const u = name.toUpperCase()
  if (u.includes("PURE"))  return `${BASE_URL}/images/product-pure.png`
  if (u.includes("BOOST")) return `${BASE_URL}/images/product-boost.png`
  if (u.includes("DRIVE")) return `${BASE_URL}/images/product-drive.png`
  return `${BASE_URL}/images/product-pure.png`
}

function getProductDescription(name: string): string {
  const u = name.toUpperCase()
  if (u.includes("PURE"))  return "Sin cafeína · Electrolitos naturales"
  if (u.includes("BOOST")) return "50mg cafeína · Foco sostenido"
  if (u.includes("DRIVE")) return "100mg cafeína · Máxima potencia"
  return ""
}

export async function sendConfirmationEmail(order: ConfirmationOrderData): Promise<unknown> {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  })

  const itemsHtml = order.items.map((item, idx) => {
    const itemName  = item.product || item.name || "Producto"
    const itemPrice = item.unit_price || item.price || 0
    const lineTotal = itemPrice * item.quantity
    const imgSrc    = getProductImage(itemName)
    const desc      = getProductDescription(itemName)
    const isLast    = idx === order.items.length - 1
    const borderBottom = isLast ? "none" : "1px solid #F5A623"

    return `
    <tr>
      <td style="padding: 16px 0; border-bottom: ${borderBottom}; vertical-align: middle; width: 76px;">
        <img src="${imgSrc}" width="60" height="60" alt="${itemName}"
          style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover; display: block;" />
      </td>
      <td style="padding: 16px 12px; border-bottom: ${borderBottom}; vertical-align: middle;">
        <div style="color: #1A1208; font-size: 14px; font-weight: 600; margin-bottom: 4px;">${itemName}</div>
        <div style="color: #1A1208; font-size: 12px; opacity: 0.55;">${desc}</div>
      </td>
      <td style="padding: 16px 8px; border-bottom: ${borderBottom}; vertical-align: middle; text-align: right; white-space: nowrap;">
        <div style="color: #1A1208; font-size: 13px; font-weight: 600;">x${item.quantity}</div>
        <div style="color: #1A1208; font-size: 12px; opacity: 0.55;">${formatPrice(itemPrice)} c/u</div>
      </td>
      <td style="padding: 16px 0; border-bottom: ${borderBottom}; vertical-align: middle; text-align: right; white-space: nowrap; min-width: 84px;">
        <div style="color: #1A1208; font-size: 14px; font-weight: 700;">${formatPrice(lineTotal)}</div>
      </td>
    </tr>`
  }).join("")

  const emailHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmación de pedido - HIIVE</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FFF8EE; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #FFF8EE;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%;">

          <!-- 1. HEADER -->
          <tr>
            <td style="background-color: #1A1208; padding: 32px; text-align: center; border-radius: 12px 12px 0 0;">
              <img src="https://hive-website-update.vercel.app/logo-hiive.png" height="60" alt="HIIVE"
                style="height: 60px; width: auto; display: block; margin: 0 auto;" />
            </td>
          </tr>

          <!-- 2. BANNER DE CONFIRMACIÓN -->
          <tr>
            <td style="background-color: #F5A623; padding: 24px 32px; text-align: center;">
              <div style="color: #1A1208; font-size: 22px; font-weight: 700; margin-bottom: 8px;">&#10003; ¡Pedido confirmado!</div>
              <div style="color: #1A1208; font-size: 15px; line-height: 1.5;">Gracias ${order.customer_name}, ya estamos preparando tu pedido.</div>
            </td>
          </tr>

          <!-- 3. SECCIÓN PRODUCTOS -->
          <tr>
            <td style="background-color: #FFF8EE; padding: 32px 32px 0 32px;">
              <div style="color: #1A1208; font-size: 13px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 20px;">TU PEDIDO</div>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- 4. RESUMEN DE PAGO -->
          <tr>
            <td style="background-color: #FFF8EE; padding: 0 32px 32px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top: 1px solid #F5A623; margin-top: 0;">
                <tr>
                  <td style="padding: 16px 0 6px; color: #1A1208; font-size: 14px;">Subtotal</td>
                  <td style="padding: 16px 0 6px; color: #1A1208; font-size: 14px; text-align: right;">${formatPrice(order.subtotal)}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #888888; font-size: 13px;">IVA 21%</td>
                  <td style="padding: 6px 0; color: #888888; font-size: 13px; text-align: right;">${formatPrice(order.iva)}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 0 0; border-top: 2px solid #F5A623;">
                    <span style="color: #1A1208; font-size: 16px; font-weight: 700;">TOTAL</span>
                  </td>
                  <td style="padding: 16px 0 0; border-top: 2px solid #F5A623; text-align: right;">
                    <span style="color: #F5A623; font-size: 20px; font-weight: 700;">${formatPrice(order.total)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 5. DATOS DE ENVÍO -->
          <tr>
            <td style="background-color: #1A1208; padding: 32px;">
              <div style="color: #F5A623; font-size: 13px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 16px;">&#128230; DATOS DE ENV&#205;O</div>
              <div style="color: #FFF8EE; font-size: 15px; line-height: 1.9;">
                <strong style="color: #FFF8EE;">${order.customer_name}</strong><br>
                ${order.customer_address}<br>
                ${order.customer_city}, CP ${order.customer_zip}<br>
                ${order.customer_phone}
              </div>
            </td>
          </tr>

          <!-- 6. FOOTER -->
          <tr>
            <td style="background-color: #1A1208; padding: 0 32px 32px 32px; text-align: center; border-radius: 0 0 12px 12px;">
              <div style="height: 2px; background-color: #F5A623; margin-bottom: 24px;"></div>
              <div style="color: #F5A623; font-size: 13px; font-weight: 700; letter-spacing: 4px; margin-bottom: 14px;">HIIVE ORGANIC ENERGY</div>
              <div style="color: #FFF8EE; font-size: 13px; margin-bottom: 10px;">&#128247; @hiive_energy &nbsp;&nbsp;&nbsp; &#9993; hiiveenergy@gmail.com</div>
              <div style="color: #FFF8EE; font-size: 12px; opacity: 0.6; margin-bottom: 14px;">Buenos Aires, Argentina &nbsp;·&nbsp; hive-website-update.vercel.app</div>
              <div style="color: #888888; font-size: 12px;">Fuel made from nature. &#127855;</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`

  return transporter.sendMail({
    from: `HIIVE Energy <${process.env.GMAIL_USER}>`,
    to: order.customer_email,
    subject: `Tu pedido HIIVE está confirmado - #${order.order_id}`,
    html: emailHtml,
  })
}
