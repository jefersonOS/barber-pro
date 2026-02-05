import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeWhatsAppPhone } from "@/lib/utils/phone";

const uuid = z.string().uuid();

export const toolSchemas = {
	list_services: z.object({ org_id: uuid }),
	list_units: z.object({ org_id: uuid }),
	list_professionals: z.object({
		org_id: uuid,
		service_id: uuid.optional(),
		unit_id: uuid.optional(),
	}),
	get_available_slots: z.object({
		org_id: uuid,
		professional_id: uuid,
		service_id: uuid,
		date_range: z.object({
			from: z.string().datetime(),
			to: z.string().datetime(),
		}),
	}),
	create_hold_appointment: z.object({
		org_id: uuid,
		phone: z.string().min(5),
		service_id: uuid,
		professional_id: uuid,
		unit_id: uuid.optional(),
		starts_at: z.string().datetime(),
		customer_name: z.string().optional(),
	}),
	create_payment_link: z.object({
		org_id: uuid,
		appointment_id: uuid,
	}),
	cancel_appointment: z.object({
		org_id: uuid,
		appointment_id: uuid,
	}),
};

export type ToolName = keyof typeof toolSchemas;

export async function listServices(orgId: string) {
	const supabase = createSupabaseAdminClient();
	const { data, error } = await supabase
		.from("services")
		.select("id, name, price_cents, duration_min, deposit_percent")
		.eq("org_id", orgId)
		.order("name", { ascending: true });
	if (error) throw new Error("services_list_failed");
	return data ?? [];
}

export async function listUnits(orgId: string) {
	const supabase = createSupabaseAdminClient();
	const { data, error } = await supabase
		.from("units")
		.select("id, name, address")
		.eq("org_id", orgId)
		.order("name", { ascending: true });
	if (error) throw new Error("units_list_failed");
	return data ?? [];
}

export async function listProfessionals(orgId: string) {
	const supabase = createSupabaseAdminClient();
	const { data, error } = await supabase
		.from("professionals")
		.select("id, name, phone")
		.eq("org_id", orgId)
		.order("name", { ascending: true });
	if (error) throw new Error("professionals_list_failed");
	return data ?? [];
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
	return aStart < bEnd && aEnd > bStart;
}

export async function getAvailableSlots(input: {
	orgId: string;
	professionalId: string;
	serviceId: string;
	from: string;
	to: string;
}) {
	const supabase = createSupabaseAdminClient();

	const { data: svc, error: svcError } = await supabase
		.from("services")
		.select("duration_min")
		.eq("org_id", input.orgId)
		.eq("id", input.serviceId)
		.maybeSingle();
	if (svcError || !svc) throw new Error("service_not_found");

	const durationMin = svc.duration_min as number;

	const { data: busy, error: busyError } = await supabase
		.from("appointments")
		.select("starts_at, ends_at, status, hold_expires_at")
		.eq("org_id", input.orgId)
		.eq("professional_id", input.professionalId)
		.gte("starts_at", input.from)
		.lte("starts_at", input.to)
		.in("status", ["hold", "confirmed", "pending_payment"]);
	if (busyError) throw new Error("busy_query_failed");

	const now = Date.now();
	const busyRanges = (busy ?? [])
		.filter((a) => {
			if (a.status === "hold" || a.status === "pending_payment") {
				return a.hold_expires_at && new Date(a.hold_expires_at).getTime() > now;
			}
			return true;
		})
		.map((a) => ({
			start: new Date(a.starts_at).getTime(),
			end: new Date(a.ends_at).getTime(),
		}));

	const fromTs = new Date(input.from).getTime();
	const toTs = new Date(input.to).getTime();
	const stepMin = 30;

	const suggestions: Array<{ starts_at: string; ends_at: string }> = [];

	for (let t = fromTs; t + durationMin * 60_000 <= toTs; t += stepMin * 60_000) {
		const candidateStart = t;
		const candidateEnd = t + durationMin * 60_000;

		// Business hours MVP: 09:00–19:00 local time
		const dt = new Date(candidateStart);
		const hour = dt.getHours();
		if (hour < 9 || hour >= 19) continue;

		const collides = busyRanges.some((b) =>
			overlaps(candidateStart, candidateEnd, b.start, b.end),
		);
		if (collides) continue;

		suggestions.push({
			starts_at: new Date(candidateStart).toISOString(),
			ends_at: new Date(candidateEnd).toISOString(),
		});
		if (suggestions.length >= 3) break;
	}

	return suggestions;
}

export async function createHoldAppointment(input: {
	orgId: string;
	phone: string;
	serviceId: string;
	professionalId: string;
	unitId?: string;
	startsAt: string;
	customerName?: string;
}) {
	const supabase = createSupabaseAdminClient();

	const normalizedPhone = normalizeWhatsAppPhone(input.phone);
	if (!normalizedPhone) throw new Error("invalid_phone");

	const { data, error } = await supabase.rpc("create_hold_appointment", {
		_org_id: input.orgId,
		_phone: normalizedPhone,
		_service_id: input.serviceId,
		_professional_id: input.professionalId,
		_unit_id: input.unitId ?? null,
		_starts_at: input.startsAt,
		_customer_name: input.customerName ?? null,
	});

	if (error) {
		const msg = (error.message ?? "").toLowerCase();
		if (msg.includes("slot_unavailable")) throw new Error("slot_unavailable");
		throw new Error("create_hold_failed");
	}

	return data;
}

export async function createPaymentLink(input: {
	orgId: string;
	appointmentId: string;
}) {
	const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
	const internalSecret = process.env.INTERNAL_API_SECRET;

	const response = await fetch(`${appUrl}/api/payments/stripe/create-checkout`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(internalSecret ? { "x-internal-secret": internalSecret } : {}),
		},
		body: JSON.stringify({
			org_id: input.orgId,
			appointment_id: input.appointmentId,
		}),
		cache: "no-store",
	});

	if (!response.ok) {
		throw new Error("create_payment_link_failed");
	}

	const json = (await response.json()) as { url?: string };
	if (!json.url) throw new Error("create_payment_link_failed");
	return { url: json.url };
}

export async function cancelAppointment(orgId: string, appointmentId: string) {
	const supabase = createSupabaseAdminClient();
	const { error } = await supabase
		.from("appointments")
		.update({ status: "canceled" })
		.eq("org_id", orgId)
		.eq("id", appointmentId);
	if (error) throw new Error("cancel_failed");
	return { ok: true };
}
