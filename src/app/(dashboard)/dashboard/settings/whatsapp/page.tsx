import { getOrgContextForCurrentUser } from "@/lib/supabase/org";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EvolutionClient } from "@/lib/evolution/client";
import { WhatsAppConnection } from "@/components/dashboard/settings/whatsapp-connection";

export const dynamic = "force-dynamic";

export default async function WhatsAppSettingsPage() {
	const org = await getOrgContextForCurrentUser();
	if (!org) return null;

	const supabase = await createSupabaseServerClient();
	const { data } = await supabase
		.from("organizations")
		.select("whatsapp_instance_id")
		.eq("id", org.orgId)
		.maybeSingle();

	const instanceId = data?.whatsapp_instance_id ?? null;

	let status: "open" | "close" | "connecting" | "unknown" = "close";
	try {
		if (instanceId) {
			const evolution = new EvolutionClient();
			status = await evolution.getConnectionState(instanceId);
		}
	} catch {
		status = "unknown";
	}

	return (
		<WhatsAppConnection
			initial={{
				ok: true,
				instanceId,
				status,
				qrcode: null,
			}}
		/>
	);
}
