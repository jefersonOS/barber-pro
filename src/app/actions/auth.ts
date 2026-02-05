"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const loginSchema = z.object({
	email: z.string().email("Informe um e-mail válido"),
	password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
	next: z.string().optional(),
});

export type LoginState =
	| { ok: true }
	| { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export async function loginAction(
	_prevState: LoginState | undefined,
	formData: FormData,
): Promise<LoginState> {
	const parsed = loginSchema.safeParse({
		email: formData.get("email"),
		password: formData.get("password"),
		next: formData.get("next"),
	});

	if (!parsed.success) {
		return {
			ok: false,
			message: "Revisa os campos e tenta de novo.",
			fieldErrors: parsed.error.flatten().fieldErrors,
		};
	}

	const supabase = await createSupabaseServerClient();
	const { error } = await supabase.auth.signInWithPassword({
		email: parsed.data.email,
		password: parsed.data.password,
	});

	if (error) {
		return { ok: false, message: "E-mail ou senha inválidos." };
	}

	redirect(parsed.data.next || "/dashboard");
}

export async function logoutAction() {
	const supabase = await createSupabaseServerClient();
	await supabase.auth.signOut();
	redirect("/login");
}
