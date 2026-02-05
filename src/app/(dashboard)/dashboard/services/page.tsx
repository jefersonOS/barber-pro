import { revalidatePath } from "next/cache";
import { z } from "zod";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgContextForCurrentUser } from "@/lib/supabase/org";

const createSchema = z.object({
	name: z.string().min(2),
	price_cents: z.coerce.number().int().min(0),
	duration_min: z.coerce.number().int().min(5).max(8 * 60),
	deposit_percent: z.coerce.number().int().min(0).max(100),
});

const updateSchema = createSchema.extend({
	id: z.string().uuid(),
});

const deleteSchema = z.object({
	id: z.string().uuid(),
});

export default async function ServicesPage() {
	const org = await getOrgContextForCurrentUser();
	if (!org) {
		return (
			<Card className="rounded-2xl shadow-sm">
				<CardHeader>
					<CardTitle>Serviços</CardTitle>
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
	const { data: services } = await supabase
		.from("services")
		.select("id, name, price_cents, duration_min, deposit_percent")
		.eq("org_id", org.orgId)
		.order("name", { ascending: true });

	async function createServiceAction(formData: FormData) {
		"use server";
		const orgCtx = await getOrgContextForCurrentUser();
		if (!orgCtx || orgCtx.role !== "tenant_admin") return;

		const parsed = createSchema.safeParse({
			name: formData.get("name"),
			price_cents: formData.get("price_cents"),
			duration_min: formData.get("duration_min"),
			deposit_percent: formData.get("deposit_percent"),
		});
		if (!parsed.success) return;

		const sb = await createSupabaseServerClient();
		await sb.from("services").insert({
			org_id: orgCtx.orgId,
			...parsed.data,
		});

		revalidatePath("/dashboard/services");
	}

	async function updateServiceAction(formData: FormData) {
		"use server";
		const orgCtx = await getOrgContextForCurrentUser();
		if (!orgCtx || orgCtx.role !== "tenant_admin") return;

		const parsed = updateSchema.safeParse({
			id: formData.get("id"),
			name: formData.get("name"),
			price_cents: formData.get("price_cents"),
			duration_min: formData.get("duration_min"),
			deposit_percent: formData.get("deposit_percent"),
		});
		if (!parsed.success) return;

		const sb = await createSupabaseServerClient();
		await sb
			.from("services")
			.update({
				name: parsed.data.name,
				price_cents: parsed.data.price_cents,
				duration_min: parsed.data.duration_min,
				deposit_percent: parsed.data.deposit_percent,
			})
			.eq("org_id", orgCtx.orgId)
			.eq("id", parsed.data.id);

		revalidatePath("/dashboard/services");
	}

	async function deleteServiceAction(formData: FormData) {
		"use server";
		const orgCtx = await getOrgContextForCurrentUser();
		if (!orgCtx || orgCtx.role !== "tenant_admin") return;

		const parsed = deleteSchema.safeParse({ id: formData.get("id") });
		if (!parsed.success) return;

		const sb = await createSupabaseServerClient();
		await sb
			.from("services")
			.delete()
			.eq("org_id", orgCtx.orgId)
			.eq("id", parsed.data.id);

		revalidatePath("/dashboard/services");
	}

	const canWrite = org.role === "tenant_admin";

	return (
		<Card className="rounded-2xl shadow-sm">
			<CardHeader>
				<CardTitle>Serviços</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				{canWrite ? (
					<form action={createServiceAction} className="grid gap-3 md:grid-cols-5">
						<Input name="name" placeholder="Nome" required minLength={2} />
						<Input
							name="price_cents"
							type="number"
							placeholder="Preço (centavos)"
							required
							min={0}
						/>
						<Input
							name="duration_min"
							type="number"
							placeholder="Duração (min)"
							required
							min={5}
						/>
						<Input
							name="deposit_percent"
							type="number"
							placeholder="Sinal (%)"
							required
							min={0}
							max={100}
						/>
						<Button type="submit">Adicionar</Button>
					</form>
				) : (
					<div className="text-sm text-muted-foreground">
						Somente admin do tenant pode criar/editar serviços.
					</div>
				)}

				{(services?.length ?? 0) === 0 ? (
					<div className="text-sm text-muted-foreground">Nenhum serviço cadastrado.</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Nome</TableHead>
								<TableHead>Preço (centavos)</TableHead>
								<TableHead>Duração (min)</TableHead>
								<TableHead>Sinal (%)</TableHead>
								<TableHead className="text-right">Ações</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{(services ?? []).map((s) => (
								<TableRow key={s.id}>
									<TableCell>
										{canWrite ? (
											<form action={updateServiceAction} className="flex items-center gap-2">
												<input type="hidden" name="id" value={s.id} />
												<Input name="name" defaultValue={s.name} />
												<div className="hidden">
													<Input name="price_cents" defaultValue={s.price_cents} />
													<Input name="duration_min" defaultValue={s.duration_min} />
													<Input name="deposit_percent" defaultValue={s.deposit_percent} />
												</div>
												<Button type="submit" variant="secondary" size="sm">
													Salvar
												</Button>
											</form>
										) : (
											s.name
										)}
									</TableCell>
									<TableCell>
										{canWrite ? (
											<form action={updateServiceAction} className="flex items-center gap-2">
												<input type="hidden" name="id" value={s.id} />
												<div className="hidden">
													<Input name="name" defaultValue={s.name} />
												</div>
												<Input
													name="price_cents"
													type="number"
													defaultValue={s.price_cents}
													min={0}
												/>
												<div className="hidden">
													<Input name="duration_min" defaultValue={s.duration_min} />
													<Input name="deposit_percent" defaultValue={s.deposit_percent} />
												</div>
												<Button type="submit" variant="secondary" size="sm">
													Salvar
												</Button>
											</form>
										) : (
											s.price_cents
										)}
									</TableCell>
									<TableCell>
										{canWrite ? (
											<form action={updateServiceAction} className="flex items-center gap-2">
												<input type="hidden" name="id" value={s.id} />
												<div className="hidden">
													<Input name="name" defaultValue={s.name} />
													<Input name="price_cents" defaultValue={s.price_cents} />
												</div>
												<Input
													name="duration_min"
													type="number"
													defaultValue={s.duration_min}
													min={5}
												/>
												<div className="hidden">
													<Input name="deposit_percent" defaultValue={s.deposit_percent} />
												</div>
												<Button type="submit" variant="secondary" size="sm">
													Salvar
												</Button>
											</form>
										) : (
											s.duration_min
										)}
									</TableCell>
									<TableCell>
										{canWrite ? (
											<form action={updateServiceAction} className="flex items-center gap-2">
												<input type="hidden" name="id" value={s.id} />
												<div className="hidden">
													<Input name="name" defaultValue={s.name} />
													<Input name="price_cents" defaultValue={s.price_cents} />
													<Input name="duration_min" defaultValue={s.duration_min} />
												</div>
												<Input
													name="deposit_percent"
													type="number"
													defaultValue={s.deposit_percent}
													min={0}
													max={100}
												/>
												<Button type="submit" variant="secondary" size="sm">
													Salvar
												</Button>
											</form>
										) : (
											s.deposit_percent
										)}
									</TableCell>
									<TableCell className="text-right">
										{canWrite ? (
											<form action={deleteServiceAction}>
												<input type="hidden" name="id" value={s.id} />
												<Button type="submit" variant="destructive" size="sm">
													Excluir
												</Button>
											</form>
										) : null}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
