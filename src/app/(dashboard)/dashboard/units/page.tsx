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
	address: z.string().optional(),
});

const updateSchema = createSchema.extend({
	id: z.string().uuid(),
});

const deleteSchema = z.object({
	id: z.string().uuid(),
});

export default async function UnitsPage() {
	const org = await getOrgContextForCurrentUser();
	if (!org) {
		return (
			<Card className="rounded-2xl shadow-sm">
				<CardHeader>
					<CardTitle>Unidades</CardTitle>
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
	const { data: units } = await supabase
		.from("units")
		.select("id, name, address")
		.eq("org_id", org.orgId)
		.order("name", { ascending: true });

	async function createUnitAction(formData: FormData) {
		"use server";
		const orgCtx = await getOrgContextForCurrentUser();
		if (!orgCtx || orgCtx.role !== "tenant_admin") return;

		const parsed = createSchema.safeParse({
			name: formData.get("name"),
			address: formData.get("address") || undefined,
		});
		if (!parsed.success) return;

		const sb = await createSupabaseServerClient();
		await sb.from("units").insert({
			org_id: orgCtx.orgId,
			name: parsed.data.name,
			address: parsed.data.address ?? null,
		});

		revalidatePath("/dashboard/units");
	}

	async function updateUnitAction(formData: FormData) {
		"use server";
		const orgCtx = await getOrgContextForCurrentUser();
		if (!orgCtx || orgCtx.role !== "tenant_admin") return;

		const parsed = updateSchema.safeParse({
			id: formData.get("id"),
			name: formData.get("name"),
			address: formData.get("address") || undefined,
		});
		if (!parsed.success) return;

		const sb = await createSupabaseServerClient();
		await sb
			.from("units")
			.update({
				name: parsed.data.name,
				address: parsed.data.address ?? null,
			})
			.eq("org_id", orgCtx.orgId)
			.eq("id", parsed.data.id);

		revalidatePath("/dashboard/units");
	}

	async function deleteUnitAction(formData: FormData) {
		"use server";
		const orgCtx = await getOrgContextForCurrentUser();
		if (!orgCtx || orgCtx.role !== "tenant_admin") return;

		const parsed = deleteSchema.safeParse({ id: formData.get("id") });
		if (!parsed.success) return;

		const sb = await createSupabaseServerClient();
		await sb
			.from("units")
			.delete()
			.eq("org_id", orgCtx.orgId)
			.eq("id", parsed.data.id);

		revalidatePath("/dashboard/units");
	}

	const canWrite = org.role === "tenant_admin";

	return (
		<Card className="rounded-2xl shadow-sm">
			<CardHeader>
				<CardTitle>Unidades</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				{canWrite ? (
					<form action={createUnitAction} className="grid gap-3 md:grid-cols-3">
						<Input name="name" placeholder="Nome" required minLength={2} />
						<Input name="address" placeholder="Endereço (opcional)" />
						<Button type="submit">Adicionar</Button>
					</form>
				) : (
					<div className="text-sm text-muted-foreground">
						Somente admin do tenant pode criar/editar unidades.
					</div>
				)}

				{(units?.length ?? 0) === 0 ? (
					<div className="text-sm text-muted-foreground">Nenhuma unidade cadastrada.</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Nome</TableHead>
								<TableHead>Endereço</TableHead>
								<TableHead className="text-right">Ações</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{(units ?? []).map((u) => (
								<TableRow key={u.id}>
									<TableCell>
										{canWrite ? (
											<form action={updateUnitAction} className="flex items-center gap-2">
												<input type="hidden" name="id" value={u.id} />
												<Input name="name" defaultValue={u.name} />
												<div className="hidden">
													<Input name="address" defaultValue={u.address ?? ""} />
												</div>
												<Button type="submit" variant="secondary" size="sm">
													Salvar
												</Button>
											</form>
										) : (
											u.name
										)}
									</TableCell>
									<TableCell>
										{canWrite ? (
											<form action={updateUnitAction} className="flex items-center gap-2">
												<input type="hidden" name="id" value={u.id} />
												<div className="hidden">
													<Input name="name" defaultValue={u.name} />
												</div>
												<Input name="address" defaultValue={u.address ?? ""} />
												<Button type="submit" variant="secondary" size="sm">
													Salvar
												</Button>
											</form>
										) : (
											u.address ?? "-"
										)}
									</TableCell>
									<TableCell className="text-right">
										{canWrite ? (
											<form action={deleteUnitAction}>
												<input type="hidden" name="id" value={u.id} />
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
