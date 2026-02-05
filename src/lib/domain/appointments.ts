import { z } from "zod";

export const appointmentStatusSchema = z.enum([
	"draft",
	"hold",
	"pending_payment",
	"confirmed",
	"canceled",
	"expired",
	"completed",
	"no_show",
]);

export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export function appointmentStatusLabel(status: AppointmentStatus): string {
	switch (status) {
		case "draft":
			return "Rascunho";
		case "hold":
			return "Reservado";
		case "pending_payment":
			return "Aguardando pagamento";
		case "confirmed":
			return "Confirmado";
		case "canceled":
			return "Cancelado";
		case "expired":
			return "Expirado";
		case "completed":
			return "Concluído";
		case "no_show":
			return "No-show";
	}
}

export function isBlockingSlotStatus(status: AppointmentStatus) {
	return status === "hold" || status === "confirmed";
}
