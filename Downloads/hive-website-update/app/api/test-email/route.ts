import { sendConfirmationEmail } from '@/lib/send-confirmation-email'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const result = await sendConfirmationEmail({
      order_id: 'TEST-001',
      customer_name: 'Mateo Vazquez',
      customer_email: 'vsmateo@gmail.com',
      customer_phone: '1134567890',
      customer_address: 'Av. Corrientes 1234',
      customer_city: 'Buenos Aires',
      customer_zip: '1043',
      items: [
        { name: 'HIVE BOOST', quantity: 2, price: 3000 },
        { name: 'HIVE PURE', quantity: 1, price: 2800 }
      ],
      subtotal: 8800,
      iva: 1848,
      total: 10648,
      status: 'approved',
      mp_preference_id: 'test-pref-123'
    })
    return NextResponse.json({ ok: true, result })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
