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

const uuidOrEmpty = z
	.string()
	.trim()
	.optional()
	.transform((v) => (v ? v : undefined))
	.pipe(z.string().uuid().optional());

const createSchema = z.object({
	name: z.string().min(2),
	phone: z.string().optional(),
	user_id: uuidOrEmpty,
});

const updateSchema = createSchema.extend({
	id: z.string().uuid(),
});

const deleteSchema = z.object({
	id: z.string().uuid(),
});

export default async function ProfessionalsPage() {
	const org = await getOrgContextForCurrentUser();
	if (!org) {
		return (
			<Card className="rounded-2xl shadow-sm">
				<CardHeader>
					<CardTitle>Profissionais</CardTitle>
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
	const { data: professionals } = await supabase
		.from("professionals")
		.select("id, name, phone, user_id")
		.eq("org_id", org.orgId)
		.order("name", { ascending: true });

	async function createProfessionalAction(formData: FormData) {
		"use server";
		const orgCtx = await getOrgContextForCurrentUser();
		if (!orgCtx || orgCtx.role !== "tenant_admin") return;

		const parsed = createSchema.safeParse({
			name: formData.get("name"),
			phone: (formData.get("phone") as string | null) || undefined,
			user_id: (formData.get("user_id") as string | null) || undefined,
		});
		if (!parsed.success) return;

		const sb = await createSupabaseServerClient();
		await sb.from("professionals").insert({
			org_id: orgCtx.orgId,
			name: parsed.data.name,
			phone: parsed.data.phone ?? null,
			user_id: parsed.data.user_id ?? null,
		});

		revalidatePath("/dashboard/professionals");
	}

	async function updateProfessionalAction(formData: FormData) {
		"use server";
		const orgCtx = await getOrgContextForCurrentUser();
		if (!orgCtx || orgCtx.role !== "tenant_admin") return;

		const parsed = updateSchema.safeParse({
			id: formData.get("id"),
			name: formData.get("name"),
			phone: (formData.get("phone") as string | null) || undefined,
			user_id: (formData.get("user_id") as string | null) || undefined,
		});
		if (!parsed.success) return;

		const sb = await createSupabaseServerClient();
		await sb
			.from("professionals")
			.update({
				name: parsed.data.name,
				phone: parsed.data.phone ?? null,
				user_id: parsed.data.user_id ?? null,
			})
			.eq("org_id", orgCtx.orgId)
			.eq("id", parsed.data.id);

		revalidatePath("/dashboard/professionals");
	}

	async function deleteProfessionalAction(formData: FormData) {
		"use server";
		const orgCtx = await getOrgContextForCurrentUser();
		if (!orgCtx || orgCtx.role !== "tenant_admin") return;

		const parsed = deleteSchema.safeParse({ id: formData.get("id") });
		if (!parsed.success) return;

		const sb = await createSupabaseServerClient();
		await sb
			.from("professionals")
			.delete()
			.eq("org_id", orgCtx.orgId)
			.eq("id", parsed.data.id);

		revalidatePath("/dashboard/professionals");
	}

	const canWrite = org.role === "tenant_admin";

	return (
		<Card className="rounded-2xl shadow-sm">
			<CardHeader>
				<CardTitle>Profissionais</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				{canWrite ? (
					<form action={createProfessionalAction} className="grid gap-3 md:grid-cols-4">
						<Input name="name" placeholder="Nome" required minLength={2} />
						<Input name="phone" placeholder="Telefone (opcional)" />
						<Input name="user_id" placeholder="User ID (uuid, opcional)" />
						<Button type="submit">Adicionar</Button>
					</form>
				) : (
					<div className="text-sm text-muted-foreground">
						Somente admin do tenant pode criar/editar profissionais.
					</div>
				)}

				{(professionals?.length ?? 0) === 0 ? (
					<div className="text-sm text-muted-foreground">
						Nenhum profissional cadastrado.
					</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Nome</TableHead>
								<TableHead>Telefone</TableHead>
								<TableHead>User ID</TableHead>
								<TableHead className="text-right">Ações</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{(professionals ?? []).map((p) => (
								<TableRow key={p.id}>
									<TableCell>
										{canWrite ? (
											<form action={updateProfessionalAction} className="flex items-center gap-2">
												<input type="hidden" name="id" value={p.id} />
												<Input name="name" defaultValue={p.name} />
												<div className="hidden">
													<Input name="phone" defaultValue={p.phone ?? ""} />
													<Input name="user_id" defaultValue={p.user_id ?? ""} />
												</div>
												<Button type="submit" variant="secondary" size="sm">
													Salvar
												</Button>
											</form>
										) : (
											p.name
										)}
									</TableCell>
									<TableCell>
										{canWrite ? (
											<form action={updateProfessionalAction} className="flex items-center gap-2">
												<input type="hidden" name="id" value={p.id} />
												<div className="hidden">
													<Input name="name" defaultValue={p.name} />
													<Input name="user_id" defaultValue={p.user_id ?? ""} />
												</div>
												<Input name="phone" defaultValue={p.phone ?? ""} />
												<Button type="submit" variant="secondary" size="sm">
													Salvar
												</Button>
											</form>
										) : (
											p.phone ?? "-"
										)}
									</TableCell>
									<TableCell>
										{canWrite ? (
											<form action={updateProfessionalAction} className="flex items-center gap-2">
												<input type="hidden" name="id" value={p.id} />
												<div className="hidden">
													<Input name="name" defaultValue={p.name} />
													<Input name="phone" defaultValue={p.phone ?? ""} />
												</div>
												<Input name="user_id" defaultValue={p.user_id ?? ""} />
												<Button type="submit" variant="secondary" size="sm">
													Salvar
												</Button>
											</form>
										) : (
											p.user_id ?? "-"
										)}
									</TableCell>
									<TableCell className="text-right">
										{canWrite ? (
											<form action={deleteProfessionalAction}>
												<input type="hidden" name="id" value={p.id} />
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
