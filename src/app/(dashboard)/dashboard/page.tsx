import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgContextForCurrentUser } from "@/lib/supabase/org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { appointmentStatusLabel, appointmentStatusSchema } from "@/lib/domain/appointments";

type UpcomingAppointment = {
	id: string;
	starts_at: string;
	status: string;
	customer_name: string | null;
	customer_phone: string;
	professionals: { name: string } | null;
	services: { name: string } | null;
};

export default async function DashboardPage() {
	const org = await getOrgContextForCurrentUser();
	if (!org) {
		return null;
	}

	const supabase = await createSupabaseServerClient();

	const now = new Date();
	const startOfDay = new Date(now);
	startOfDay.setHours(0, 0, 0, 0);
	const endOfDay = new Date(now);
	endOfDay.setHours(23, 59, 59, 999);

	try {
		const { data: todaysAppointments, error: todaysError } = await supabase
			.from("appointments")
			.select("id, status")
			.eq("org_id", org.orgId)
			.gte("starts_at", startOfDay.toISOString())
			.lte("starts_at", endOfDay.toISOString());

		if (todaysError) throw todaysError;

		const { data: upcomingRaw, error: upcomingError } = await supabase
			.from("appointments")
			.select(
				"id, starts_at, status, customer_name, customer_phone, professionals(name), services(name)",
			)
			.eq("org_id", org.orgId)
			.gte("starts_at", now.toISOString())
			.order("starts_at", { ascending: true })
			.limit(8);

		if (upcomingError) throw upcomingError;

		const upcoming = (upcomingRaw ?? []) as unknown as UpcomingAppointment[];
		const confirmedToday = (todaysAppointments ?? []).filter((a) => a.status === "confirmed").length;
		const noShowsWeek = 0;
		const revenueToday = "—";

		return (
			<div className="space-y-6">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-4">
					<Card className="rounded-2xl shadow-sm">
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">
								Agendamentos hoje
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-semibold">{confirmedToday}</div>
							<div className="text-xs text-muted-foreground">Confirmados</div>
						</CardContent>
					</Card>

					<Card className="rounded-2xl shadow-sm">
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">
								Receita hoje
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-semibold">{revenueToday}</div>
							<div className="text-xs text-muted-foreground">Sinal recebido</div>
						</CardContent>
					</Card>

					<Card className="rounded-2xl shadow-sm">
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">
								Próximos
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-semibold">{(upcoming ?? []).length}</div>
							<div className="text-xs text-muted-foreground">Agendamentos</div>
						</CardContent>
					</Card>

					<Card className="rounded-2xl shadow-sm">
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium text-muted-foreground">
								No-shows semana
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-semibold">{noShowsWeek}</div>
							<div className="text-xs text-muted-foreground">Últimos 7 dias</div>
						</CardContent>
					</Card>
				</div>

				<Card className="rounded-2xl shadow-sm">
					<CardHeader>
						<CardTitle className="text-base">Próximos agendamentos</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Quando</TableHead>
										<TableHead>Cliente</TableHead>
										<TableHead>Serviço</TableHead>
										<TableHead>Profissional</TableHead>
										<TableHead>Status</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{(upcoming ?? []).length === 0 ? (
										<TableRow>
											<TableCell colSpan={5} className="text-sm text-muted-foreground">
												Nenhum agendamento para mostrar.
											</TableCell>
										</TableRow>
									) : (
										upcoming!.map((a) => {
											const status = appointmentStatusSchema.parse(a.status);
											return (
												<TableRow key={a.id}>
													<TableCell className="whitespace-nowrap text-sm">
														{new Date(a.starts_at).toLocaleString("pt-BR", {
															dateStyle: "short",
															timeStyle: "short",
														})}
													</TableCell>
													<TableCell className="text-sm">
														{a.customer_name ?? a.customer_phone}
													</TableCell>
													<TableCell className="text-sm">{a.services?.name ?? "—"}</TableCell>
													<TableCell className="text-sm">
														{a.professionals?.name ?? "—"}
													</TableCell>
													<TableCell>
														<Badge variant="secondary">{appointmentStatusLabel(status)}</Badge>
													</TableCell>
												</TableRow>
											);
										})
									)
									}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	} catch {
		return (
			<Card className="rounded-2xl shadow-sm">
				<CardHeader>
					<CardTitle>Deu ruim ao carregar o dashboard</CardTitle>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground">
					Tenta de novo em alguns segundos.
				</CardContent>
			</Card>
		);
	}
}
