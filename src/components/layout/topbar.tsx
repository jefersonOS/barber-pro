"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

import { Sidebar } from "@/components/layout/sidebar";

export function Topbar({
	orgName,
	onLogout,
}: {
	orgName: string;
	onLogout: (formData: FormData) => void | Promise<void>;
}) {
	const pathname = usePathname();

	const breadcrumb = useMemo(() => {
		const clean = (pathname ?? "/").split("?")[0];
		const parts = clean.split("/").filter(Boolean);
		if (parts.length <= 1) return "Visão geral";
		return parts.slice(1).join(" / ");
	}, [pathname]);

	return (
		<header className="sticky top-0 z-30 border-b bg-background">
			<div className="flex h-14 items-center gap-3 px-4">
				<div className="md:hidden">
					<Sheet>
						<SheetTrigger asChild>
							<Button variant="ghost" size="icon" aria-label="Abrir menu">
								<span className="text-lg">☰</span>
							</Button>
						</SheetTrigger>
						<SheetContent side="left" className="p-0">
							<Sidebar className="w-full" />
						</SheetContent>
					</Sheet>
				</div>

				<div className="flex min-w-0 flex-1 flex-col">
					<div className="truncate text-sm font-medium capitalize">{breadcrumb}</div>
					<div className="truncate text-xs text-muted-foreground">{orgName}</div>
				</div>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" aria-label="Menu do usuário">
							<div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
								EU
							</div>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuLabel>Conta</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<form action={onLogout}>
							<DropdownMenuItem asChild>
								<button type="submit" className="w-full text-left">
									Sair
								</button>
							</DropdownMenuItem>
						</form>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</header>
	);
}
