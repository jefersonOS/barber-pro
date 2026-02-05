import { NextResponse } from "next/server";
import Stripe from "stripe";

import { EvolutionClient } from "@/lib/evolution/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getStripe() {
	const key = process.env.STRIPE_SECRET_KEY;
	if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
	return new Stripe(key);
}

function formatDateTimePtBR(iso: string) {
	const dt = new Date(iso);
	if (Number.isNaN(dt.getTime())) return iso;
	return dt.toLocaleString("pt-BR", {
		timeZone: "America/Sao_Paulo",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export async function POST(request: Request) {
	const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
	if (!webhookSecret) {
		return NextResponse.json({ error: "missing_webhook_secret" }, { status: 500 });
	}

	const signature = request.headers.get("stripe-signature");
	if (!signature) {
		return NextResponse.json({ error: "missing_signature" }, { status: 400 });
	}

	const stripe = getStripe();
	let event: Stripe.Event;

	try {
		const rawBody = Buffer.from(await request.arrayBuffer());
		event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
	} catch {
		return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
	}

	if (event.type !== "checkout.session.completed") {
		return NextResponse.json({ ok: true }, { status: 200 });
	}

	const session = event.data.object as Stripe.Checkout.Session;
	const appointmentId = session.metadata?.appointment_id;
	const orgId = session.metadata?.org_id;
	if (!appointmentId || !orgId) {
		return NextResponse.json({ ok: true }, { status: 200 });
	}

	const supabase = createSupabaseAdminClient();

	// Idempotência: se já associamos esse event.id em algum pagamento, não repetir efeitos.
	const { data: existingEvent } = await supabase
		.from("appointment_payments")
		.select("id")
		.eq("stripe_event_id", event.id)
		.maybeSingle();
	if (existingEvent) {
		return NextResponse.json({ ok: true }, { status: 200 });
	}

	// Atualiza (ou cria) o pagamento
	const amountCents = session.amount_total ?? 0;
	const paymentIntentId =
		typeof session.payment_intent === "string" ? session.payment_intent : null;

	const { data: existingPayment } = await supabase
		.from("appointment_payments")
		.select("id")
		.eq("org_id", orgId)
		.eq("appointment_id", appointmentId)
		.eq("stripe_checkout_session_id", session.id)
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (existingPayment?.id) {
		await supabase
			.from("appointment_payments")
			.update({
				status: "paid",
				stripe_payment_intent_id: paymentIntentId,
				stripe_event_id: event.id,
			})
			.eq("id", existingPayment.id);
	} else {
		await supabase.from("appointment_payments").insert({
			org_id: orgId,
			appointment_id: appointmentId,
			provider: "stripe",
			status: "paid",
			stripe_checkout_session_id: session.id,
			stripe_payment_intent_id: paymentIntentId,
			stripe_event_id: event.id,
			amount_cents: amountCents,
			currency: (session.currency ?? "brl").toLowerCase(),
		});
	}

	// Confirma o agendamento (se ainda estiver válido)
	await supabase
		.from("appointments")
		.update({ status: "confirmed", hold_expires_at: null })
		.eq("org_id", orgId)
		.eq("id", appointmentId)
		.in("status", ["hold", "pending_payment"]);

	// Best-effort WhatsApp confirmation
	try {
		const { data: org } = await supabase
			.from("organizations")
			.select("whatsapp_instance_id")
			.eq("id", orgId)
			.maybeSingle();

		if (org?.whatsapp_instance_id) {
			const { data: appt } = await supabase
				.from("appointments")
				.select("customer_phone, starts_at")
				.eq("org_id", orgId)
				.eq("id", appointmentId)
				.maybeSingle();

			if (appt?.customer_phone && appt.starts_at) {
				const evo = new EvolutionClient();
				await evo.sendText({
					instanceName: org.whatsapp_instance_id,
					to: appt.customer_phone,
					text: `Pagamento confirmado. Seu horário está confirmado para ${formatDateTimePtBR(appt.starts_at)}.`,
				});
			}
		}
	} catch {
		// ignore
	}

	return NextResponse.json({ ok: true }, { status: 200 });
}
