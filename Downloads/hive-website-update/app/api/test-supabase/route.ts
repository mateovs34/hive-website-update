import { NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase"

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing env vars",
        NEXT_PUBLIC_SUPABASE_URL: url ? "set" : "MISSING",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key ? "set" : "MISSING",
      },
      { status: 500 }
    )
  }

  const { data, error, status, statusText } = await getSupabase()
    .from("orders")
    .select("order_id, created_at, status")
    .limit(3)

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        status,
        statusText,
        NEXT_PUBLIC_SUPABASE_URL: url,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    rows_returned: data.length,
    sample: data,
    NEXT_PUBLIC_SUPABASE_URL: url,
  })
}
