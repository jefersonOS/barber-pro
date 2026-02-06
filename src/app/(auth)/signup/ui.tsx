"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { signupAction, type SignupState } from "@/app/actions/auth";

const schema = z.object({
	name: z.string().min(2, "Informe seu nome"),
	org_name: z.string().min(2, "Informe o nome da barbearia"),
	email: z.string().email("Informe um e-mail válido"),
	password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

type FormValues = z.infer<typeof schema>;

export default function SignupForm() {
	const [state, formAction, pending] = useActionState<SignupState | undefined, FormData>(
		signupAction,
		undefined,
	);

	const form = useForm<FormValues>({
		resolver: zodResolver(schema),
		defaultValues: { name: "", org_name: "", email: "", password: "" },
	});

	useEffect(() => {
		if (state?.ok === false) toast.error(state.message);
	}, [state]);

	const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;

	const onSubmit = form.handleSubmit((_values, event) => {
		const target = event?.target as HTMLFormElement | null;
		if (!target) return;
		formAction(new FormData(target));
	});

	return (
		<Card className="rounded-2xl shadow-sm">
			<CardHeader>
				<CardTitle className="text-2xl">Criar conta</CardTitle>
				<CardDescription>Comece a automatizar sua barbearia</CardDescription>
			</CardHeader>
			<CardContent>
				<form action={formAction} onSubmit={onSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="name">Seu nome</Label>
						<Input
							id="name"
							autoComplete="name"
							placeholder="João Silva"
							{...form.register("name")}
							name="name"
							aria-invalid={
								Boolean(form.formState.errors.name) || Boolean(fieldErrors?.name?.length)
							}
						/>
						{form.formState.errors.name?.message ? (
							<p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
						) : fieldErrors?.name?.[0] ? (
							<p className="text-sm text-destructive">{fieldErrors.name[0]}</p>
						) : null}
					</div>

					<div className="space-y-2">
						<Label htmlFor="org_name">Nome da barbearia</Label>
						<Input
							id="org_name"
							autoComplete="organization"
							placeholder="Barbearia Premium"
							{...form.register("org_name")}
							name="org_name"
							aria-invalid={
								Boolean(form.formState.errors.org_name) ||
								Boolean(fieldErrors?.orgName?.length)
							}
						/>
						{form.formState.errors.org_name?.message ? (
							<p className="text-sm text-destructive">
								{form.formState.errors.org_name.message}
							</p>
						) : fieldErrors?.orgName?.[0] ? (
							<p className="text-sm text-destructive">{fieldErrors.orgName[0]}</p>
						) : null}
					</div>

					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							autoComplete="email"
							placeholder="voce@barbearia.com"
							{...form.register("email")}
							name="email"
							aria-invalid={
								Boolean(form.formState.errors.email) || Boolean(fieldErrors?.email?.length)
							}
						/>
						{form.formState.errors.email?.message ? (
							<p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
						) : fieldErrors?.email?.[0] ? (
							<p className="text-sm text-destructive">{fieldErrors.email[0]}</p>
						) : null}
					</div>

					<div className="space-y-2">
						<Label htmlFor="password">Senha</Label>
						<Input
							id="password"
							type="password"
							autoComplete="new-password"
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
							<p className="text-sm text-destructive">{fieldErrors.password[0]}</p>
						) : null}
					</div>

					<Button type="submit" className="w-full" disabled={pending}>
						{pending ? "Criando..." : "Criar conta"}
					</Button>

					<div className="text-center text-sm text-muted-foreground">
						Já tem conta?{" "}
						<Link href="/login" className="underline underline-offset-4">
							Fazer login
						</Link>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
