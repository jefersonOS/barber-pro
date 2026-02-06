"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgContextForCurrentUser } from "@/lib/supabase/org";
import { EvolutionClient, extractQrCode } from "@/lib/evolution/client";

import type { WhatsAppConnectionStatus, WhatsAppState } from "./whatsapp.types";

const okState = (partial: Partial<WhatsAppState>): WhatsAppState => ({
	ok: true,
	instanceId: partial.instanceId ?? null,
	status: partial.status ?? "unknown",
	qrcode: partial.qrcode ?? null,
	message: partial.message,
});

const errorState = (message: string): WhatsAppState => ({
	ok: false,
	message,
	instanceId: null,
	status: "unknown",
	qrcode: null,
});

function clampText(input: string, maxLen: number) {
	if (input.length <= maxLen) return input;
	return `${input.slice(0, maxLen)}…`;
}

function safeErrorMessage(e: unknown) {
	if (e instanceof Error) return clampText(e.message || "Erro", 300);
	try {
		return clampText(JSON.stringify(e), 300);
	} catch {
		return "Erro";
	}
}

function safeQr(qr: string | null) {
	if (!qr) return null;
	// Evita payload gigante no RSC/server action.
	if (qr.length > 2_000_000) return null;
	return qr;
}

function normalizeWebhookUrl(): string {
	const base = process.env.EVOLUTION_WEBHOOK_PUBLIC_URL;
	if (!base) throw new Error("Missing EVOLUTION_WEBHOOK_PUBLIC_URL");
	const trimmed = base.replace(/\/$/, "");
	if (trimmed.endsWith("/api/webhooks/evolution")) return trimmed;
	return `${trimmed}/api/webhooks/evolution`;
}

async function requireTenantAdminOrg() {
	const org = await getOrgContextForCurrentUser();
	if (!org) throw new Error("Sem sessão");
	if (org.role !== "tenant_admin") throw new Error("Sem permissão");
	return org;
}

export async function getWhatsAppStateAction(
	_prevState: WhatsAppState | undefined,
	_formData: FormData,
): Promise<WhatsAppState> {
	void _prevState;
	void _formData;
	try {
		const org = await requireTenantAdminOrg();
		const supabase = await createSupabaseServerClient();

		const { data: orgRow, error: orgError } = await supabase
			.from("organizations")
			.select("whatsapp_instance_id")
			.eq("id", org.orgId)
			.maybeSingle();

		if (orgError) return errorState("Deu ruim ao carregar a organização.");

		const instanceId = orgRow?.whatsapp_instance_id ?? null;
		if (!instanceId) {
			return okState({ status: "close", instanceId: null, qrcode: null });
		}

		const evolution = new EvolutionClient();
		const status = await evolution.getConnectionState(instanceId);

		let qrcode: string | null = null;
		if (status !== "open") {
			try {
				const res = await evolution.connectInstance({
					instanceName: instanceId,
					qrcode: true,
				});
				qrcode = safeQr(extractQrCode(res));
			} catch {
				// ignore: status polling should be resilient
			}
		}

		return okState({ instanceId, status, qrcode });
	} catch (e) {
		console.error("getWhatsAppStateAction failed", e);
		return errorState(safeErrorMessage(e));
	}
}

export async function connectWhatsAppAction(
	_prevState: WhatsAppState | undefined,
	_formData: FormData,
): Promise<WhatsAppState> {
	void _prevState;
	void _formData;
	try {
		const org = await requireTenantAdminOrg();
		const supabase = await createSupabaseServerClient();

		const instanceName = `user_${org.orgId}`;
		const evolution = new EvolutionClient();

		let qrcode: string | null = null;

		try {
			const created = await evolution.createInstance({
				instanceName,
				qrcode: true,
				integration: "WHATSAPP-BAILEYS",
			});
			qrcode = safeQr(extractQrCode(created));
		} catch {
			const connected = await evolution.connectInstance({
				instanceName,
				qrcode: true,
			});
			qrcode = safeQr(extractQrCode(connected));
		}

		await evolution.setWebhook({
			instanceName,
			url: normalizeWebhookUrl(),
			events: [
				"MESSAGES_UPSERT",
				"MESSAGES_UPDATE",
				"CONNECTION_UPDATE",
				"QRCODE_UPDATED",
			],
			doubleShot: true,
		});

		const { error: updateError } = await supabase
			.from("organizations")
			.update({ whatsapp_instance_id: instanceName })
			.eq("id", org.orgId);

		if (updateError) {
			return errorState("Deu ruim ao salvar a instância no Supabase.");
		}

		const status = await evolution.getConnectionState(instanceName);
		return okState({
			instanceId: instanceName,
			status,
			qrcode,
			message: qrcode ? "Conexão iniciada." : "Conexão iniciada (QR indisponível, clique Atualizar).",
		});
	} catch (e) {
		console.error("connectWhatsAppAction failed", e);
		return errorState(safeErrorMessage(e));
	}
}

export async function disconnectWhatsAppAction(
	_prevState: WhatsAppState | undefined,
	_formData: FormData,
): Promise<WhatsAppState> {
	void _prevState;
	void _formData;
	try {
		const org = await requireTenantAdminOrg();
		const supabase = await createSupabaseServerClient();

		const { data: orgRow, error: orgError } = await supabase
			.from("organizations")
			.select("whatsapp_instance_id")
			.eq("id", org.orgId)
			.maybeSingle();

		if (orgError) return errorState("Deu ruim ao carregar a organização.");

		const instanceId = orgRow?.whatsapp_instance_id ?? null;
		if (instanceId) {
			const evolution = new EvolutionClient();
			try {
				await evolution.logoutInstance({ instanceName: instanceId });
			} catch {
				// ignore
			}
			try {
				await evolution.deleteInstance({ instanceName: instanceId });
			} catch {
				// ignore
			}
		}

		const { error: updateError } = await supabase
			.from("organizations")
			.update({ whatsapp_instance_id: null })
			.eq("id", org.orgId);

		if (updateError) return errorState("Deu ruim ao desconectar.");

		return okState({ instanceId: null, status: "close", qrcode: null, message: "Desconectado." });
	} catch (e) {
		console.error("disconnectWhatsAppAction failed", e);
		return errorState(safeErrorMessage(e));
	}
}
