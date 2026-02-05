"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { loginAction, type LoginState } from "@/app/actions/auth";

const schema = z.object({
	email: z.string().email("Informe um e-mail válido"),
	password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginForm() {
	const searchParams = useSearchParams();
	const next = searchParams.get("next") ?? undefined;

	const [state, formAction, pending] = useActionState<
		LoginState | undefined,
		FormData
	>(
		loginAction,
		undefined,
	);

	const form = useForm<FormValues>({
		resolver: zodResolver(schema),
		defaultValues: { email: "", password: "" },
	});

	useEffect(() => {
		if (state?.ok === false) toast.error(state.message);
	}, [state]);

	const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;

	return (
		<Card className="rounded-2xl shadow-sm">
			<CardHeader>
				<CardTitle className="text-2xl">Entrar</CardTitle>
				<CardDescription>
					Acesse o painel da barbearia.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					action={formAction}
					onSubmit={form.handleSubmit(() => {})}
					className="space-y-4"
				>
					<input type="hidden" name="next" value={next ?? ""} />

					<div className="space-y-2">
						<Label htmlFor="email">E-mail</Label>
						<Input
							id="email"
							type="email"
							autoComplete="email"
							placeholder="voce@barbearia.com"
							{...form.register("email")}
							name="email"
							aria-invalid={
								Boolean(form.formState.errors.email) ||
									Boolean(fieldErrors?.email?.length)
							}
						/>
						{form.formState.errors.email?.message ? (
							<p className="text-sm text-destructive">
								{form.formState.errors.email.message}
							</p>
						) : fieldErrors?.email?.[0] ? (
							<p className="text-sm text-destructive">
								{fieldErrors.email[0]}
							</p>
						) : null}
					</div>

					<div className="space-y-2">
						<Label htmlFor="password">Senha</Label>
						<Input
							id="password"
							type="password"
							autoComplete="current-password"
							{...form.register("password")}
							name="password"
							aria-invalid={
								Boolean(form.formState.errors.password) ||
									Boolean(fieldErrors?.password?.length)
							}
						/>
						{form.formState.errors.password?.message ? (
							<p className="text-sm text-destructive">
								{form.formState.errors.password.message}
							</p>
						) : fieldErrors?.password?.[0] ? (
							<p className="text-sm text-destructive">
								{fieldErrors.password[0]}
							</p>
						) : null}
					</div>

					<Button type="submit" className="w-full" disabled={pending}>
						{pending ? "Entrando..." : "Entrar"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
