import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OrgRole = "owner" | "tenant_admin" | "professional";

export type OrgContext = {
	orgId: string;
	orgName: string;
	role: OrgRole;
};

export async function getOrgContextForCurrentUser(): Promise<OrgContext | null> {
	const supabase = await createSupabaseServerClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) return null;

	const { data, error } = await supabase
		.from("org_users")
		.select("org_id, role, organizations(name)")
		.eq("user_id", user.id)
		.order("created_at", { ascending: true })
		.limit(1)
		.maybeSingle();

	if (error) {
		// Importante: não engolir erros de RLS/policies, senão vira "Sem organização".
		console.error("getOrgContextForCurrentUser error", {
			message: error.message,
			details: (error as unknown as { details?: string }).details,
			hint: (error as unknown as { hint?: string }).hint,
			code: (error as unknown as { code?: string }).code,
		});
		throw error;
	}

	if (!data) return null;

	const orgName = (data as unknown as { organizations?: { name?: string } })
		.organizations?.name;

	return {
		orgId: data.org_id,
		orgName: orgName ?? "Sua organização",
		role: data.role as OrgRole,
	};
}
