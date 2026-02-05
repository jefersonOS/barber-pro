import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
	const secret = process.env.CRON_SECRET;
	if (!secret) {
		return NextResponse.json({ error: "missing_cron_secret" }, { status: 500 });
	}

	const got = request.headers.get("x-cron-secret");
	if (!got || got !== secret) {
		return NextResponse.json({ error: "forbidden" }, { status: 403 });
	}

	const supabase = createSupabaseAdminClient();
	const nowIso = new Date().toISOString();

	const { data, error } = await supabase
		.from("appointments")
		.update({ status: "expired" })
		.in("status", ["hold", "pending_payment"])
		.not("hold_expires_at", "is", null)
		.lte("hold_expires_at", nowIso)
		.select("id");

	if (error) {
		return NextResponse.json({ error: "update_failed" }, { status: 500 });
	}

	return NextResponse.json(
		{ ok: true, expired_count: data?.length ?? 0 },
		{ status: 200 },
	);
}
