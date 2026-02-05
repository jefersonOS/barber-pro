import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgContextForCurrentUser } from "@/lib/supabase/org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { appointmentStatusLabel, appointmentStatusSchema } from "@/lib/domain/appointments";

type MyScheduleAppointment = {
	id: string;
	starts_at: string;
	status: string;
	customer_name: string | null;
	customer_phone: string;
	services: { name: string } | null;
};

export default async function MySchedulePage() {
	const org = await getOrgContextForCurrentUser();
	if (!org) return null;

	const supabase = await createSupabaseServerClient();
	const now = new Date();

	const { data: raw, error } = await supabase
		.from("appointments")
		.select("id, starts_at, status, customer_name, customer_phone, services(name)")
		.eq("org_id", org.orgId)
		.gte("starts_at", now.toISOString())
		.order("starts_at", { ascending: true })
		.limit(20);

	const data = (raw ?? []) as unknown as MyScheduleAppointment[];

	if (error) {
		return (
			<Card className="rounded-2xl shadow-sm">
				<CardHeader>
					<CardTitle>Deu ruim ao carregar sua agenda</CardTitle>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground">
					Tenta de novo em alguns segundos.
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="rounded-2xl shadow-sm">
			<CardHeader>
				<CardTitle>Minha agenda</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Quando</TableHead>
								<TableHead>Cliente</TableHead>
								<TableHead>Serviço</TableHead>
								<TableHead>Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{(data ?? []).length === 0 ? (
								<TableRow>
									<TableCell colSpan={4} className="text-sm text-muted-foreground">
										Sem agendamentos para mostrar.
									</TableCell>
								</TableRow>
							) : (
								data!.map((a) => {
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
	);
}
