import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EvolutionClient } from "@/lib/evolution/client";
import { phoneFromRemoteJid } from "@/lib/utils/phone";
import { fetchAudioAsBuffer, transcribeWithWhisper } from "@/lib/ai/whisper";
import { runAssistantTurn } from "@/lib/ai/runAssistantTurn";

export const dynamic = "force-dynamic";

const webhookSchema = z
	.object({
		event: z.string().optional(),
		type: z.string().optional(),
		instance: z.string().optional(),
		instanceName: z.string().optional(),
		data: z.unknown().optional(),
	})
	.passthrough();

function eventName(body: z.infer<typeof webhookSchema>): string {
	const raw = (body.event ?? body.type ?? "").toString();
	return raw;
}

function getInstanceName(body: z.infer<typeof webhookSchema>): string | null {
	const direct = (body.instanceName ?? body.instance ?? null) as string | null;
	if (direct) return direct;

	if (body.data && typeof body.data === "object") {
		const d = body.data as Record<string, unknown>;
		const maybe = d["instance"] ?? d["instanceName"];
		if (typeof maybe === "string") return maybe;
	}
	return null;
}

type ExtractedMessage = {
	providerMessageId: string;
	remoteJid: string;
	fromMe: boolean;
	text: string | null;
	audioUrl: string | null;
	audioBase64: string | null;
	audioMimeType: string | null;
};

function extractFirstMessage(data: unknown): ExtractedMessage | null {
	if (!data || typeof data !== "object") return null;

	// Evolution v2 commonly: data.messages[0]
	const d = data as Record<string, unknown>;
	const messages = Array.isArray(d["messages"]) ? (d["messages"] as unknown[]) : null;
	const msg = messages?.[0] ?? d["message"];
	if (!msg || typeof msg !== "object") return null;
	const msgObj = msg as Record<string, unknown>;
	const keyObj =
		msgObj["key"] && typeof msgObj["key"] === "object"
			? (msgObj["key"] as Record<string, unknown>)
			: {};

	const providerMessageId =
		(typeof keyObj["id"] === "string" && (keyObj["id"] as string)) ||
		(typeof msgObj["id"] === "string" && (msgObj["id"] as string)) ||
		(typeof msgObj["messageId"] === "string" && (msgObj["messageId"] as string)) ||
		null;

	const remoteJid =
		(typeof keyObj["remoteJid"] === "string" && (keyObj["remoteJid"] as string)) ||
		(typeof msgObj["remoteJid"] === "string" && (msgObj["remoteJid"] as string)) ||
		(typeof msgObj["from"] === "string" && (msgObj["from"] as string)) ||
		null;

	const fromMe = Boolean(keyObj["fromMe"] ?? msgObj["fromMe"]);

	if (!providerMessageId || !remoteJid) return null;

	// Text extraction
	const message =
		msgObj["message"] && typeof msgObj["message"] === "object"
			? (msgObj["message"] as Record<string, unknown>)
			: msgObj;

	const conversation = message["conversation"];
	const extendedText =
		message["extendedTextMessage"] &&
		typeof message["extendedTextMessage"] === "object"
			? (message["extendedTextMessage"] as Record<string, unknown>)["text"]
			: undefined;

	const imageMsg =
		message["imageMessage"] && typeof message["imageMessage"] === "object"
			? (message["imageMessage"] as Record<string, unknown>)
			: null;
	const videoMsg =
		message["videoMessage"] && typeof message["videoMessage"] === "object"
			? (message["videoMessage"] as Record<string, unknown>)
			: null;
	const docMsg =
		message["documentMessage"] && typeof message["documentMessage"] === "object"
			? (message["documentMessage"] as Record<string, unknown>)
			: null;

	const caption =
		(imageMsg && typeof imageMsg["caption"] === "string" && (imageMsg["caption"] as string)) ||
		(videoMsg && typeof videoMsg["caption"] === "string" && (videoMsg["caption"] as string)) ||
		(docMsg && typeof docMsg["caption"] === "string" && (docMsg["caption"] as string)) ||
		undefined;

	const text =
		typeof conversation === "string"
			? conversation
			: typeof extendedText === "string"
				? extendedText
				: typeof caption === "string"
					? caption
					: null;

	// Audio extraction (url or base64 varies by deployment)
	const audioMsg =
		message["audioMessage"] && typeof message["audioMessage"] === "object"
			? (message["audioMessage"] as Record<string, unknown>)
			: null;

	const audioUrl =
		(audioMsg && typeof audioMsg["url"] === "string" && (audioMsg["url"] as string)) ||
		(audioMsg && typeof audioMsg["downloadUrl"] === "string" && (audioMsg["downloadUrl"] as string)) ||
		(typeof msgObj["audioUrl"] === "string" && (msgObj["audioUrl"] as string)) ||
		null;
	const audioBase64 =
		(audioMsg && typeof audioMsg["base64"] === "string" && (audioMsg["base64"] as string)) ||
		(typeof msgObj["audioBase64"] === "string" && (msgObj["audioBase64"] as string)) ||
		null;
	const audioMimeType =
		(audioMsg && typeof audioMsg["mimetype"] === "string" && (audioMsg["mimetype"] as string)) ||
		(typeof msgObj["audioMimeType"] === "string" && (msgObj["audioMimeType"] as string)) ||
		null;

	return {
		providerMessageId,
		remoteJid,
		fromMe,
		text,
		audioUrl,
		audioBase64,
		audioMimeType,
	};
}

function isGroupOrStatus(remoteJid: string) {
	return remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast";
}

async function safeJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return null;
	}
}

export async function POST(request: Request) {
	// Rule: respond 200 OK quickly; keep handler resilient.
	const bodyUnknown = await safeJson(request);
	const parsed = webhookSchema.safeParse(bodyUnknown);
	if (!parsed.success) {
		return NextResponse.json({ ok: true }, { status: 200 });
	}

	const body = parsed.data;
	const ev = eventName(body);
	const isUpsert = /messages[\s._-]*upsert/i.test(ev);
	if (!isUpsert) {
		return NextResponse.json({ ok: true }, { status: 200 });
	}

	const instanceName = getInstanceName(body);
	if (!instanceName) {
		return NextResponse.json({ ok: true }, { status: 200 });
	}

	const extracted = extractFirstMessage(body.data);
	if (!extracted) {
		return NextResponse.json({ ok: true }, { status: 200 });
	}

	if (extracted.fromMe) {
		return NextResponse.json({ ok: true }, { status: 200 });
	}

	if (isGroupOrStatus(extracted.remoteJid)) {
		return NextResponse.json({ ok: true }, { status: 200 });
	}

	const phone = phoneFromRemoteJid(extracted.remoteJid);
	if (!phone) {
		return NextResponse.json({ ok: true }, { status: 200 });
	}

	const supabase = createSupabaseAdminClient();

	const { data: orgRow } = await supabase
		.from("organizations")
		.select("id")
		.eq("whatsapp_instance_id", instanceName)
		.maybeSingle();

	if (!orgRow?.id) {
		return NextResponse.json({ ok: true }, { status: 200 });
	}

	const orgId = orgRow.id as string;

	// Upsert conversation
	const { data: convo, error: convoError } = await supabase
		.from("conversations")
		.upsert({ org_id: orgId, phone }, { onConflict: "org_id,phone" })
		.select("id")
		.single();

	if (convoError || !convo?.id) {
		return NextResponse.json({ ok: true }, { status: 200 });
	}

	const conversationId = convo.id as string;

	// Idempotency: inbound_messages.provider_message_id unique
	const { error: inboundError } = await supabase
		.from("inbound_messages")
		.upsert(
			{
				org_id: orgId,
				conversation_id: conversationId,
				provider_message_id: extracted.providerMessageId,
				phone,
				text: extracted.text ?? "[audio]",
			},
			{ onConflict: "provider_message_id", ignoreDuplicates: true },
		);

	if (inboundError) {
		// If duplicate or transient error, do not retry aggressively.
		return NextResponse.json({ ok: true }, { status: 200 });
	}

	let text = extracted.text?.trim() ?? "";

	// Audio -> text
	if (!text && (extracted.audioUrl || extracted.audioBase64)) {
		try {
			let buffer: Uint8Array;
			let mimeType = extracted.audioMimeType ?? "audio/ogg";

			if (extracted.audioUrl) {
				const fetched = await fetchAudioAsBuffer(extracted.audioUrl);
				buffer = fetched.buffer;
				mimeType = fetched.mimeType;
			} else {
				const raw = extracted.audioBase64!.includes(",")
					? extracted.audioBase64!.split(",")[1]!
					: extracted.audioBase64!;
				buffer = Uint8Array.from(Buffer.from(raw, "base64"));
			}

			text = (await transcribeWithWhisper({ buffer, mimeType, fileName: "audio" }))
				.trim();
		} catch {
			text = "";
		}
	}

	if (!text) {
		return NextResponse.json({ ok: true }, { status: 200 });
	}

	// Log user message
	await supabase.from("conversation_logs").insert({
		org_id: orgId,
		conversation_id: conversationId,
		role: "user",
		content: text,
	});

	// Echo guard (60s): if user message equals last assistant message, ignore.
	const since = new Date(Date.now() - 60_000).toISOString();
	const { data: lastAssistant } = await supabase
		.from("conversation_logs")
		.select("content, created_at")
		.eq("org_id", orgId)
		.eq("conversation_id", conversationId)
		.eq("role", "assistant")
		.gte("created_at", since)
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (lastAssistant?.content?.trim() === text) {
		return NextResponse.json({ ok: true }, { status: 200 });
	}

	let reply = "";
	try {
		reply = await runAssistantTurn({ orgId, conversationId, phone, text });
	} catch {
		reply = "Deu ruim aqui. Pode repetir sua mensagem?";
	}

	if (!reply) {
		return NextResponse.json({ ok: true }, { status: 200 });
	}

	await supabase.from("conversation_logs").insert({
		org_id: orgId,
		conversation_id: conversationId,
		role: "assistant",
		content: reply,
	});

	try {
		const evolution = new EvolutionClient();
		await evolution.sendText({ instanceName, to: phone, text: reply });
	} catch {
		// swallow
	}

	return NextResponse.json({ ok: true }, { status: 200 });
}
