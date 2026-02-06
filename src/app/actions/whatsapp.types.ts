export type WhatsAppConnectionStatus = "open" | "close" | "connecting" | "unknown";

export type WhatsAppState = {
	ok: boolean;
	message?: string;
	instanceId: string | null;
	status: WhatsAppConnectionStatus;
	qrcode: string | null;
};
