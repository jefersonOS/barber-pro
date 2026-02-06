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
	let org: Awaited<ReturnType<typeof getOrgContextForCurrentUser>> = null;
	try {
		const supabase = await createSupabaseServerClient();
		const {
			data: { user },
		} = await supabase.auth.getUser();

		if (!user) redirect("/login");

		org = await getOrgContextForCurrentUser();
	} catch (error) {
		const message = error instanceof Error ? error.message : "Erro desconhecido";
		return (
			<div className="min-h-dvh bg-background">
				<div className="grid min-h-dvh grid-cols-1 md:grid-cols-[260px_1fr]">
					<div className="hidden border-r bg-background md:block">
						<Sidebar />
					</div>
					<div className="flex min-w-0 flex-col">
						<Topbar orgName="Configuração" onLogout={logoutAction} />
						<main className="min-w-0 flex-1 p-4 md:p-6">
							<Card className="rounded-2xl shadow-sm">
								<CardHeader>
									<CardTitle>Configuração incompleta</CardTitle>
								</CardHeader>
								<CardContent className="space-y-2">
									<p className="text-sm text-muted-foreground">
										O painel não conseguiu inicializar.
									</p>
									<p className="text-sm text-muted-foreground">
										Detalhe: <span className="font-medium">{message}</span>
									</p>
									<p className="text-sm text-muted-foreground">
										Verifique as env vars do Supabase (principalmente
										{" "}
										<span className="font-medium">NEXT_PUBLIC_SUPABASE_URL</span>
										e{" "}
										<span className="font-medium">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>).
									</p>
								</CardContent>
							</Card>
						</main>
					</div>
				</div>
			</div>
		);
	}

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
