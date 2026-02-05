"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

const navItems = [
	{ href: "/dashboard", label: "Visão geral" },
	{ href: "/dashboard/appointments", label: "Agendamentos" },
	{ href: "/dashboard/my-schedule", label: "Minha agenda" },
	{ href: "/dashboard/services", label: "Serviços" },
	{ href: "/dashboard/professionals", label: "Profissionais" },
	{ href: "/dashboard/units", label: "Unidades" },
	{ href: "/dashboard/settings/whatsapp", label: "WhatsApp" },
];

export function Sidebar({ className }: { className?: string }) {
	const pathname = usePathname();

	return (
		<aside className={cn("flex h-full flex-col", className)}>
			<div className="px-4 py-4">
				<div className="text-sm font-semibold">Barber Pro</div>
				<div className="text-xs text-muted-foreground">Painel</div>
			</div>
			<Separator />
			<nav className="flex-1 px-2 py-3">
				<ul className="space-y-1">
					{navItems.map((item) => {
						const active =
							pathname === item.href ||
							(pathname?.startsWith(item.href) && item.href !== "/dashboard");
						return (
							<li key={item.href}>
								<Link
									href={item.href}
									className={cn(
										"block rounded-xl px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
										active
											? "bg-muted font-medium"
											: "hover:bg-muted/60",
									)}
								>
									{item.label}
								</Link>
							</li>
						);
					})}
				</ul>
			</nav>
			<div className="px-4 pb-4 text-xs text-muted-foreground">
				© {new Date().getFullYear()} Barber Pro
			</div>
		</aside>
	);
}
