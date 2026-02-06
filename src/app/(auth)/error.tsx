"use client";

import { useEffect } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuthError({
	error,
}: {
	error: Error & { digest?: string };
}) {
	useEffect(() => {
		// noop: keeps this as a client boundary
	}, []);

	return (
		<div className="min-h-dvh bg-background">
			<div className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4">
				<Card className="w-full rounded-2xl shadow-sm">
					<CardHeader>
						<CardTitle>Deu ruim</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						<p className="text-sm text-muted-foreground">
							Ocorreu um erro ao carregar esta página.
						</p>
						<p className="text-sm text-muted-foreground">
							Detalhe: <span className="font-medium">{error.message}</span>
						</p>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
