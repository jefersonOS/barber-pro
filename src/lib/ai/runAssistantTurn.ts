import OpenAI from "openai";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
	cancelAppointment,
	createHoldAppointment,
	createPaymentLink,
	getAvailableSlots,
	listProfessionals,
	listServices,
	listUnits,
	toolSchemas,
	type ToolName,
} from "@/lib/ai/tools";

type ChatRole = "user" | "assistant" | "system" | "tool";

function safeJsonParse(input: string): unknown {
	try {
		return JSON.parse(input);
	} catch {
		return null;
	}
}

function toToolJsonSchema(tool: ToolName) {
	// Minimal JSON Schema mapping (enough for OpenAI tool calling)
	// Keep these in sync with toolSchemas in tools.ts.
	const uuid = { type: "string", format: "uuid" } as const;

	switch (tool) {
		case "list_services":
			return {
				type: "object",
				properties: { org_id: uuid },
				required: ["org_id"],
				additionalProperties: false,
			};
		case "list_units":
			return {
				type: "object",
				properties: { org_id: uuid },
				required: ["org_id"],
				additionalProperties: false,
			};
		case "list_professionals":
			return {
				type: "object",
				properties: {
					org_id: uuid,
					service_id: uuid,
					unit_id: uuid,
				},
				required: ["org_id"],
				additionalProperties: false,
			};
		case "get_available_slots":
			return {
				type: "object",
				properties: {
					org_id: uuid,
					professional_id: uuid,
					service_id: uuid,
					date_range: {
						type: "object",
						properties: {
							from: { type: "string", format: "date-time" },
							to: { type: "string", format: "date-time" },
						},
						required: ["from", "to"],
						additionalProperties: false,
					},
				},
				required: ["org_id", "professional_id", "service_id", "date_range"],
				additionalProperties: false,
			};
		case "create_hold_appointment":
			return {
				type: "object",
				properties: {
					org_id: uuid,
					phone: { type: "string", minLength: 5 },
					service_id: uuid,
					professional_id: uuid,
					unit_id: uuid,
					starts_at: { type: "string", format: "date-time" },
					customer_name: { type: "string" },
				},
				required: [
					"org_id",
					"phone",
					"service_id",
					"professional_id",
					"starts_at",
				],
				additionalProperties: false,
			};
		case "create_payment_link":
			return {
				type: "object",
				properties: {
					org_id: uuid,
					appointment_id: uuid,
				},
				required: ["org_id", "appointment_id"],
				additionalProperties: false,
			};
		case "cancel_appointment":
			return {
				type: "object",
				properties: {
					org_id: uuid,
					appointment_id: uuid,
				},
				required: ["org_id", "appointment_id"],
				additionalProperties: false,
			};
		default:
			return { type: "object", properties: {}, additionalProperties: true };
	}
}

async function runToolCall(name: ToolName, args: unknown) {
	switch (name) {
		case "list_services":
			{
				const parsed = toolSchemas.list_services.safeParse(args);
				if (!parsed.success) throw new Error("invalid_tool_args");
				return await listServices(parsed.data.org_id);
			}
		case "list_units":
			{
				const parsed = toolSchemas.list_units.safeParse(args);
				if (!parsed.success) throw new Error("invalid_tool_args");
				return await listUnits(parsed.data.org_id);
			}
		case "list_professionals":
			{
				const parsed = toolSchemas.list_professionals.safeParse(args);
				if (!parsed.success) throw new Error("invalid_tool_args");
				return await listProfessionals(parsed.data.org_id);
			}
		case "get_available_slots":
			{
				const parsed = toolSchemas.get_available_slots.safeParse(args);
				if (!parsed.success) throw new Error("invalid_tool_args");
				return await getAvailableSlots({
					orgId: parsed.data.org_id,
					professionalId: parsed.data.professional_id,
					serviceId: parsed.data.service_id,
					from: parsed.data.date_range.from,
					to: parsed.data.date_range.to,
				});
			}
		case "create_hold_appointment":
			{
				const parsed = toolSchemas.create_hold_appointment.safeParse(args);
				if (!parsed.success) throw new Error("invalid_tool_args");
				return await createHoldAppointment({
					orgId: parsed.data.org_id,
					phone: parsed.data.phone,
					serviceId: parsed.data.service_id,
					professionalId: parsed.data.professional_id,
					unitId: parsed.data.unit_id,
					startsAt: parsed.data.starts_at,
					customerName: parsed.data.customer_name,
				});
			}
		case "create_payment_link":
			{
				const parsed = toolSchemas.create_payment_link.safeParse(args);
				if (!parsed.success) throw new Error("invalid_tool_args");
				return await createPaymentLink({
					orgId: parsed.data.org_id,
					appointmentId: parsed.data.appointment_id,
				});
			}
		case "cancel_appointment":
			{
				const parsed = toolSchemas.cancel_appointment.safeParse(args);
				if (!parsed.success) throw new Error("invalid_tool_args");
				return await cancelAppointment(parsed.data.org_id, parsed.data.appointment_id);
			}
		default:
			throw new Error("unknown_tool");
	}
}

export async function runAssistantTurn(input: {
	orgId: string;
	conversationId: string;
	phone: string;
	text: string;
}): Promise<string> {
	// Function calling + tools (Etapa 6)
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		return "Beleza. Qual serviço você quer e pra que dia/horário?";
	}

	const supabase = createSupabaseAdminClient();
	const { data: logs } = await supabase
		.from("conversation_logs")
		.select("role, content")
		.eq("org_id", input.orgId)
		.eq("conversation_id", input.conversationId)
		.order("created_at", { ascending: false })
		.limit(20);

	const messages = (logs ?? [])
		.reverse()
		.map((l) => ({
			role: l.role as "user" | "assistant" | "system",
			content: l.content,
		}));

	const openai = new OpenAI({ apiKey });

	const tools: Array<OpenAI.Chat.Completions.ChatCompletionTool> = (
		Object.keys(toolSchemas) as ToolName[]
	).map((name) => ({
		type: "function",
		function: {
			name,
			description:
				name === "create_hold_appointment"
					? "Cria um hold de agendamento (anti-overbooking)."
					: name === "create_payment_link"
						? "Gera link do Stripe Checkout para pagar o sinal."
						: name === "get_available_slots"
							? "Sugere horários disponíveis para um profissional e serviço."
							: "Ferramenta de apoio ao agendamento.",
			parameters: toToolJsonSchema(name),
		},
	}));

	const systemPrompt =
		"Você é um atendente de barbearia no WhatsApp (PT-BR). Seja direto e objetivo.\n\n" +
		"REGRAS IMPORTANTES:\n" +
		"- Nunca confirme agendamento sem pagamento do sinal.\n" +
		"- Use as ferramentas quando precisar de dados (serviços, profissionais, horários, hold e link).\n" +
		"- Não mostre JSON/IDs internos para o cliente (a menos que seja um link).\n" +
		"- Se faltar informação, faça 1 pergunta por vez, bem curta.\n\n" +
		"PLAYBOOK (siga nesta ordem):\n" +
		"1) Se o cliente não disse qual serviço: chame list_services e ofereça 3 opções.\n" +
		"2) Se não tiver profissional: chame list_professionals e ofereça 3 nomes.\n" +
		"3) Se não tiver dia/horário: peça uma preferência (ex: manhã/tarde/noite ou um horário).\n" +
		"4) Quando tiver serviço + profissional + uma janela de data: chame get_available_slots e sugira até 3 horários.\n" +
		"5) Quando o cliente escolher um horário: chame create_hold_appointment.\n" +
		"6) Em seguida chame create_payment_link e responda: envie o link e diga que o hold expira em ~10 minutos.\n" +
		"7) Depois do pagamento, diga que a confirmação chega automaticamente por mensagem.\n\n" +
		"Contexto fixo (use sempre nas tools): " +
		`org_id=${input.orgId}, phone=${input.phone}.`;

	let chatMessages: Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> = [
		{ role: "system", content: systemPrompt },
		...messages,
		{ role: "user", content: input.text },
	];

	for (let i = 0; i < 6; i++) {
		const completion = await openai.chat.completions.create({
			model: "gpt-4o-mini",
			messages: chatMessages,
			tools,
			tool_choice: "auto",
			temperature: 0.2,
		});

		const msg = completion.choices[0]?.message;
		if (!msg) {
			return "Entendi. Qual serviço e qual horário você prefere?";
		}

		const toolCalls = msg.tool_calls ?? [];
		const content = (msg.content ?? "").trim();

		// No tool calls => final answer
		if (toolCalls.length === 0) {
			return content || "Entendi. Qual serviço e qual horário você prefere?";
		}

		// Append assistant message with tool calls
		chatMessages = [...chatMessages, msg as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam];

		for (const call of toolCalls) {
			if (call.type !== "function") continue;
			const name = call.function.name as ToolName;
			const args = safeJsonParse(call.function.arguments);

			let result: unknown;
			try {
				result = await runToolCall(name, args);
			} catch {
				result = {
					error: "tool_failed",
					tool: name,
				};
			}

			chatMessages = [
				...chatMessages,
				{
					role: "tool" as ChatRole,
					tool_call_id: call.id,
					content: JSON.stringify(result),
				},
			];
		}
	}

	return "Consegue me dizer qual serviço você quer e pra que dia/horário?";
}
