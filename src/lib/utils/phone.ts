export function normalizeWhatsAppPhone(input: string): string {
	const digits = (input ?? "").replace(/\D/g, "");
	if (!digits) return "";

	// If already includes country code, keep it.
	// For BR: 10-11 digits without country -> prefix 55.
	if (digits.length === 10 || digits.length === 11) return `55${digits}`;
	return digits;
}

export function phoneFromRemoteJid(remoteJid: string): string {
	const bare = (remoteJid ?? "").split("@")[0] ?? "";
	return normalizeWhatsAppPhone(bare);
}
