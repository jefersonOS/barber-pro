import { NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
	org_id: z.string().uuid(),
	appointment_id: z.string().uuid(),
});

function getStripe() {
	const key = process.env.STRIPE_SECRET_KEY;
	if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
	return new Stripe(key);
}

export async function POST(request: Request) {
	const internalSecret = process.env.INTERNAL_API_SECRET;
	if (internalSecret) {
		const got = request.headers.get("x-internal-secret");
		if (!got || got !== internalSecret) {
			return NextResponse.json({ error: "forbidden" }, { status: 403 });
		}
	}

	let json: unknown;
	try {
		json = await request.json();
	} catch {
		return NextResponse.json({ error: "invalid_json" }, { status: 400 });
	}

	const parsed = schema.safeParse(json);
	if (!parsed.success) {
		return NextResponse.json({ error: "invalid_input" }, { status: 400 });
	}

	const supabase = createSupabaseAdminClient();

	const { data: appt, error: apptError } = await supabase
		.from("appointments")
		.select(
			"id, org_id, service_id, status, hold_expires_at, deposit_amount_cents, customer_phone",
		)
		.eq("id", parsed.data.appointment_id)
		.eq("org_id", parsed.data.org_id)
		.maybeSingle();

	if (apptError || !appt) {
		return NextResponse.json({ error: "appointment_not_found" }, { status: 404 });
	}

	if (appt.status !== "hold" && appt.status !== "pending_payment") {
		return NextResponse.json({ error: "invalid_status" }, { status: 400 });
	}

	if (!appt.hold_expires_at || new Date(appt.hold_expires_at).getTime() <= Date.now()) {
		return NextResponse.json({ error: "hold_expired" }, { status: 400 });
	}

	const amount = appt.deposit_amount_cents ?? null;
	if (!amount || amount <= 0) {
		return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
	}

	const { data: svc } = await supabase
		.from("services")
		.select("name")
		.eq("org_id", appt.org_id)
		.eq("id", appt.service_id)
		.maybeSingle();
	const serviceName = svc?.name ?? "Agendamento";

	const { data: existing } = await supabase
		.from("appointment_payments")
		.select("id, stripe_checkout_session_id, status")
		.eq("appointment_id", appt.id)
		.eq("org_id", appt.org_id)
		.eq("status", "pending")
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	const stripe = getStripe();
	const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

	if (existing?.stripe_checkout_session_id) {
		try {
			const session = await stripe.checkout.sessions.retrieve(
				existing.stripe_checkout_session_id,
			);
			if (session.url) {
				return NextResponse.json({ url: session.url }, { status: 200 });
			}
		} catch {
			// fallback to create a new session
		}
	}

	const session = await stripe.checkout.sessions.create({
		mode: "payment",
		success_url: `${appUrl}/dashboard/appointments?paid=1`,
		cancel_url: `${appUrl}/dashboard/appointments?canceled=1`,
		currency: "brl",
		line_items: [
			{
				quantity: 1,
				price_data: {
					currency: "brl",
					unit_amount: amount,
					product_data: {
						name: `Sinal - ${serviceName}`,
					},
				},
			},
		],
		metadata: {
			appointment_id: appt.id,
			org_id: appt.org_id,
			phone: appt.customer_phone,
		},
	});

	await supabase.from("appointment_payments").insert({
		org_id: appt.org_id,
		appointment_id: appt.id,
		provider: "stripe",
		status: "pending",
		stripe_checkout_session_id: session.id,
		amount_cents: amount,
		currency: "brl",
	});

	await supabase
		.from("appointments")
		.update({ status: "pending_payment" })
		.eq("id", appt.id)
		.eq("org_id", appt.org_id);

	return NextResponse.json({ url: session.url }, { status: 200 });
}
