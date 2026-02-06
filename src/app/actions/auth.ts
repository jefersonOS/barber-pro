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

export type SignupState =
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

const signupSchema = z.object({
	name: z.string().min(2, "Informe seu nome"),
	orgName: z.string().min(2, "Informe o nome da barbearia"),
	email: z.string().email("Informe um e-mail válido"),
	password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

export async function signupAction(
	_prevState: SignupState | undefined,
	formData: FormData,
): Promise<SignupState> {
	try {
		const parsed = signupSchema.safeParse({
			name: formData.get("name"),
			orgName: formData.get("org_name"),
			email: formData.get("email"),
			password: formData.get("password"),
		});

		if (!parsed.success) {
			return {
				ok: false,
				message: "Revisa os campos e tenta de novo.",
				fieldErrors: parsed.error.flatten().fieldErrors,
			};
		}

		const supabase = await createSupabaseServerClient();

		const { error: signUpError } = await supabase.auth.signUp({
			email: parsed.data.email,
			password: parsed.data.password,
			options: {
				data: { name: parsed.data.name },
			},
		});

		if (signUpError) {
			return {
				ok: false,
				message: signUpError.message || "Não foi possível criar a conta.",
			};
		}

		// Garante sessão ativa (dependendo da config de confirmação de e-mail)
		const { error: signInError } = await supabase.auth.signInWithPassword({
			email: parsed.data.email,
			password: parsed.data.password,
		});

		if (signInError) {
			return {
				ok: false,
				message:
					"Conta criada. Agora confirme seu e-mail (se necessário) e faça login.",
			};
		}

		const { error: rpcError } = await supabase.rpc("create_org_for_current_user", {
			org_name: parsed.data.orgName,
			owner_name: parsed.data.name,
		});

		if (rpcError) {
			return {
				ok: false,
				message: `Conta criada, mas falhou ao criar a barbearia. (${rpcError.message})`,
			};
		}

		redirect("/dashboard");
	} catch (error) {
		const message = error instanceof Error ? error.message : "Erro desconhecido";
		return {
			ok: false,
			message: `Falha ao criar conta. (${message})`,
		};
	}
}
