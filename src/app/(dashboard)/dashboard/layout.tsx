import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { logoutAction } from "@/app/actions/auth";
import { getOrgContextForCurrentUser } from "@/lib/supabase/org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const supabase = await createSupabaseServerClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) redirect("/login");

	const org = await getOrgContextForCurrentUser();

	return (
		<div className="min-h-dvh bg-background">
			<div className="grid min-h-dvh grid-cols-1 md:grid-cols-[260px_1fr]">
				<div className="hidden border-r bg-background md:block">
					<Sidebar />
				</div>
				<div className="flex min-w-0 flex-col">
					<Topbar orgName={org?.orgName ?? "Sem organização"} onLogout={logoutAction} />
					<main className="min-w-0 flex-1 p-4 md:p-6">
						{org ? (
							children
						) : (
							<Card className="rounded-2xl shadow-sm">
								<CardHeader>
									<CardTitle>Você ainda não tem uma organização</CardTitle>
								</CardHeader>
								<CardContent className="space-y-2">
									<p className="text-sm text-muted-foreground">
										Crie um registro em <span className="font-medium">organizations</span> e
										vincule seu usuário em <span className="font-medium">org_users</span>.
									</p>
									<p className="text-sm text-muted-foreground">
										Use o arquivo <span className="font-medium">supabase/seed.sql</span> como guia.
									</p>
								</CardContent>
							</Card>
						)}
					</main>
				</div>
			</div>
		</div>
	);
}
