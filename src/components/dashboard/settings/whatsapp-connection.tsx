"use client";

import Image from "next/image";
import { useActionState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import {
	connectWhatsAppAction,
	disconnectWhatsAppAction,
	getWhatsAppStateAction,
	type WhatsAppState,
} from "@/app/actions/whatsapp";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

function badgeVariantForStatus(status: WhatsAppState["status"]) {
	switch (status) {
		case "open":
			return "default" as const;
		case "connecting":
			return "secondary" as const;
		case "close":
			return "destructive" as const;
		default:
			return "outline" as const;
	}
}

function statusLabel(status: WhatsAppState["status"]) {
	switch (status) {
		case "open":
			return "Conectado";
		case "connecting":
			return "Conectando";
		case "close":
			return "Desconectado";
		default:
			return "Indefinido";
	}
}

function asQrImageSrc(qr: string | null) {
	if (!qr) return null;
	if (qr.startsWith("data:image")) return qr;
	// assume base64 png
	return `data:image/png;base64,${qr}`;
}

export function WhatsAppConnection({
	initial,
}: {
	initial: WhatsAppState;
}) {
	const [statusState, refreshAction, refreshPending] = useActionState<
		WhatsAppState | undefined,
		FormData
	>(getWhatsAppStateAction, initial);

	const [connectState, connectAction, connectPending] = useActionState<
		WhatsAppState | undefined,
		FormData
	>(connectWhatsAppAction, initial);

	const [disconnectState, disconnectAction, disconnectPending] = useActionState<
		WhatsAppState | undefined,
		FormData
	>(disconnectWhatsAppAction, initial);

	const current = useMemo(() => {
		return disconnectState ?? connectState ?? statusState ?? initial;
	}, [disconnectState, connectState, statusState, initial]);

	const lastToastRef = useRef<string | null>(null);
	useEffect(() => {
		const msg = current.message;
		if (!msg || msg === lastToastRef.current) return;
		lastToastRef.current = msg;
		if (current.ok) toast.success(msg);
		else toast.error(msg);
	}, [current.message, current.ok]);

	const shouldPoll = current.instanceId && current.status !== "open";
	const pollTimer = useRef<number | null>(null);

	useEffect(() => {
		if (!shouldPoll) return;
		const tick = () => {
			refreshAction(new FormData());
		};
		pollTimer.current = window.setInterval(tick, 5000);
		tick();
		return () => {
			if (pollTimer.current) window.clearInterval(pollTimer.current);
		};
	}, [shouldPoll, refreshAction]);

	const qrSrc = asQrImageSrc(current.qrcode);

	return (
		<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
			<Card className="rounded-2xl shadow-sm">
				<CardHeader>
					<CardTitle>Conexão do WhatsApp</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center justify-between">
						<div className="text-sm text-muted-foreground">Status</div>
						<Badge variant={badgeVariantForStatus(current.status)}>
							{statusLabel(current.status)}
						</Badge>
					</div>

					<Separator />

					<div className="flex flex-wrap items-center gap-2">
						<form action={connectAction}>
							<Button type="submit" disabled={connectPending || disconnectPending}>
								{connectPending ? "Conectando..." : "Connect"}
							</Button>
						</form>

						<Dialog>
							<DialogTrigger asChild>
								<Button
									variant="destructive"
									disabled={disconnectPending || connectPending}
								>
									{disconnectPending ? "Desconectando..." : "Disconnect"}
								</Button>
							</DialogTrigger>
							<DialogContent className="sm:max-w-[480px]">
								<DialogHeader>
									<DialogTitle>Desconectar WhatsApp?</DialogTitle>
									<DialogDescription>
										Isso derruba a sessão e remove a instância deste tenant.
									</DialogDescription>
								</DialogHeader>
								<DialogFooter>
									<form action={disconnectAction}>
										<Button type="submit" variant="destructive">
											Confirmar
										</Button>
									</form>
								</DialogFooter>
							</DialogContent>
						</Dialog>

						<Button
							variant="outline"
							onClick={() => refreshAction(new FormData())}
							disabled={refreshPending}
						>
							{refreshPending ? "Atualizando..." : "Atualizar"}
						</Button>
					</div>

					{!current.ok ? (
						<div className="text-sm text-destructive">
							{current.message ?? "Deu ruim."}
						</div>
					) : null}

					<div className="text-sm text-muted-foreground">
						{current.status === "open"
							? "Tudo certo."
							: "Se aparecer QR Code, escaneie no WhatsApp."}
					</div>
				</CardContent>
			</Card>

			<Card className="rounded-2xl shadow-sm">
				<CardHeader>
					<CardTitle>QR Code</CardTitle>
				</CardHeader>
				<CardContent>
					{qrSrc ? (
						<div className="flex items-center justify-center rounded-2xl border bg-background p-4">
							<Image
								src={qrSrc}
								alt="QR Code do WhatsApp"
								width={256}
								height={256}
								unoptimized
								className="h-64 w-64"
							/>
						</div>
					) : (
						<div className="text-sm text-muted-foreground">
							Nenhum QR Code.
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
