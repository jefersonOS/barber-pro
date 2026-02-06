import { z } from "zod";

const connectionStateSchema = z.object({
	state: z.string().optional(),
	status: z.string().optional(),
	instance: z.string().optional(),
});

export type EvolutionConnectionState = "open" | "close" | "connecting" | "unknown";

function normalizeConnectionState(input: unknown): EvolutionConnectionState {
	const parsed = connectionStateSchema.safeParse(input);
	const raw = parsed.success
		? (parsed.data.state ?? parsed.data.status ?? "").toLowerCase()
		: "";
	if (raw === "open") return "open";
	if (raw === "close" || raw === "closed") return "close";
	if (raw === "connecting" || raw === "qr") return "connecting";
	return "unknown";
}

function getEvolutionEnv() {
	const baseUrl = process.env.EVOLUTION_API_URL;
	const apiKey = process.env.EVOLUTION_API_KEY;

	if (!baseUrl || !apiKey) {
		throw new Error("Missing EVOLUTION_API_URL / EVOLUTION_API_KEY");
	}

	const trimmed = baseUrl.replace(/\/$/, "");
	// Muita gente cola a URL do painel do Evolution (termina em /manager).
	// A API geralmente fica na raiz; se mantiver /manager, dá 404 em /manager/instance/*.
	const normalized = trimmed.replace(/\/manager$/, "");
	return { baseUrl: normalized, apiKey };
}

export class EvolutionClient {
	private baseUrl: string;
	private apiKey: string;

	constructor() {
		const env = getEvolutionEnv();
		this.baseUrl = env.baseUrl;
		this.apiKey = env.apiKey;
	}

	private async request<T>(
		path: string,
		options: {
			method: "GET" | "POST" | "DELETE";
			body?: unknown;
			allowNonJson?: boolean;
		},
	): Promise<T> {
		const url = `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

		const response = await fetch(url, {
			method: options.method,
			headers: {
				"content-type": "application/json",
				apikey: this.apiKey,
				authorization: `Bearer ${this.apiKey}`,
			},
			body: options.body ? JSON.stringify(options.body) : undefined,
			cache: "no-store",
		});

		if (!response.ok) {
			let text = await response.text().catch(() => "");
			if (text.length > 2000) {
				text = `${text.slice(0, 2000)}…`;
			}
			throw new Error(
				`Evolution API error ${response.status} ${response.statusText}: ${text}`,
			);
		}

		if (options.allowNonJson) {
			return (await response.text()) as unknown as T;
		}

		return (await response.json()) as T;
	}

	async createInstance(input: {
		instanceName: string;
		qrcode: boolean;
		integration: "WHATSAPP-BAILEYS";
	}): Promise<unknown> {
		return this.request<unknown>("/instance/create", {
			method: "POST",
			body: input,
		});
	}

	async connectInstance(input: {
		instanceName: string;
		qrcode: boolean;
	}): Promise<unknown> {
		return this.request<unknown>("/instance/connect", {
			method: "POST",
			body: input,
		});
	}

	async setWebhook(input: {
		instanceName: string;
		url: string;
		events: string[];
		doubleShot?: boolean;
	}): Promise<unknown> {
		return this.request<unknown>("/webhook/set", {
			method: "POST",
			body: input,
		});
	}

	async getConnectionState(instanceName: string): Promise<EvolutionConnectionState> {
		const raw = await this.request<unknown>(
			`/instance/connectionState/${encodeURIComponent(instanceName)}`,
			{ method: "GET" },
		);
		return normalizeConnectionState(raw);
	}

	async logoutInstance(input: { instanceName: string }): Promise<unknown> {
		return this.request<unknown>("/instance/logout", {
			method: "POST",
			body: input,
		});
	}

	async deleteInstance(input: { instanceName: string }): Promise<unknown> {
		// Many Evolution v2 deployments expose POST /instance/delete.
		return this.request<unknown>("/instance/delete", {
			method: "POST",
			body: input,
		});
	}

	async sendText(input: {
		instanceName: string;
		to: string;
		text: string;
	}): Promise<unknown> {
		return this.request<unknown>("/message/sendText", {
			method: "POST",
			body: input,
		});
	}
}

export function extractQrCode(payload: unknown): string | null {
	if (!payload || typeof payload !== "object") return null;
	const obj = payload as Record<string, unknown>;
	const data =
		obj["data"] && typeof obj["data"] === "object"
			? (obj["data"] as Record<string, unknown>)
			: null;

	const pickString = (value: unknown): string | null => {
		if (!value) return null;
		if (typeof value === "string") return value;
		if (typeof value !== "object") return null;
		const rec = value as Record<string, unknown>;
		const nested =
			(rec["base64"] as unknown) ??
			(rec["qrcode"] as unknown) ??
			(rec["qr"] as unknown) ??
			(rec["qrCode"] as unknown);
		return typeof nested === "string" ? nested : null;
	};

	const candidates: unknown[] = [
		obj["qrcode"],
		obj["qrCode"],
		obj["qrcodeBase64"],
		obj["qr"],
		data?.["qrcode"],
		data?.["qr"],
		data?.["qrCode"],
		data?.["qrcodeBase64"],
	];

	for (const c of candidates) {
		const s = pickString(c);
		if (s) return s;
	}

	return null;
}
