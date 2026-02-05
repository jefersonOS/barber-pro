import { revalidatePath } from "next/cache";
import { z } from "zod";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgContextForCurrentUser } from "@/lib/supabase/org";

const cancelSchema = z.object({
	id: z.string().uuid(),
});

function formatDateTimePtBR(iso: string) {
	const dt = new Date(iso);
	if (Number.isNaN(dt.getTime())) return iso;
	return dt.toLocaleString("pt-BR", {
		timeZone: "America/Sao_Paulo",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function statusVariant(status: string): "default" | "secondary" | "destructive" {
	if (status === "confirmed") return "default";
	if (status === "canceled" || status === "expired") return "destructive";
	return "secondary";
}

export default async function AppointmentsPage() {
	const org = await getOrgContextForCurrentUser();
	if (!org) {
		return (
			<Card className="rounded-2xl shadow-sm">
				<CardHeader>
					<CardTitle>Agendamentos</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-sm text-muted-foreground">
						Você precisa estar vinculado a uma organização.
					</div>
				</CardContent>
			</Card>
		);
	}

	const supabase = await createSupabaseServerClient();
	const { data: appts } = await supabase
		.from("appointments")
		.select(
			"id, starts_at, ends_at, status, customer_name, customer_phone, hold_expires_at, services(name), professionals(name), units(name)",
		)
		.eq("org_id", org.orgId)
		.order("starts_at", { ascending: false })
		.limit(50);

	async function cancelAppointmentAction(formData: FormData) {
		"use server";
		const orgCtx = await getOrgContextForCurrentUser();
		if (!orgCtx || orgCtx.role !== "tenant_admin") return;

		const parsed = cancelSchema.safeParse({ id: formData.get("id") });
		if (!parsed.success) return;

		const sb = await createSupabaseServerClient();
		await sb
			.from("appointments")
			.update({ status: "canceled" })
			.eq("org_id", orgCtx.orgId)
			.eq("id", parsed.data.id)
			.in("status", ["hold", "pending_payment", "confirmed"]);

		revalidatePath("/dashboard/appointments");
	}

	const canWrite = org.role === "tenant_admin";

	return (
		<Card className="rounded-2xl shadow-sm">
			<CardHeader>
				<CardTitle>Agendamentos</CardTitle>
			</CardHeader>
			<CardContent>
				{(appts?.length ?? 0) === 0 ? (
					<div className="text-sm text-muted-foreground">Nenhum agendamento encontrado.</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Quando</TableHead>
								<TableHead>Cliente</TableHead>
								<TableHead>Serviço</TableHead>
								<TableHead>Profissional</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="text-right">Ações</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{(appts ?? []).map((a) => {
								const serviceName =
									(a as unknown as { services?: { name?: string } }).services?.name ??
									"-";
								const professionalName =
									(a as unknown as { professionals?: { name?: string } }).professionals
										?.name ?? "-";
								const unitName =
									(a as unknown as { units?: { name?: string } }).units?.name ?? "";

								return (
									<TableRow key={a.id}>
										<TableCell>
											<div className="font-medium">{formatDateTimePtBR(a.starts_at)}</div>
											<div className="text-xs text-muted-foreground">
												até {formatDateTimePtBR(a.ends_at)}
												{unitName ? ` · ${unitName}` : ""}
											</div>
										</TableCell>
										<TableCell>
											<div className="font-medium">{a.customer_name ?? "-"}</div>
											<div className="text-xs text-muted-foreground">{a.customer_phone}</div>
										</TableCell>
										<TableCell>{serviceName}</TableCell>
										<TableCell>{professionalName}</TableCell>
										<TableCell>
											<div className="flex flex-col gap-1">
												<Badge variant={statusVariant(a.status)}>{a.status}</Badge>
												{(a.status === "hold" || a.status === "pending_payment") &&
													a.hold_expires_at ? (
													<div className="text-xs text-muted-foreground">
														expira {formatDateTimePtBR(a.hold_expires_at)}
													</div>
												) : null}
											</div>
										</TableCell>
										<TableCell className="text-right">
											{canWrite ? (
												<form action={cancelAppointmentAction}>
													<input type="hidden" name="id" value={a.id} />
													<Button type="submit" size="sm" variant="destructive">
														Cancelar
													</Button>
												</form>
											) : null}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
