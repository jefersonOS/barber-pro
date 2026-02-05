import OpenAI from "openai";

export async function transcribeWithWhisper(input: {
	buffer: Uint8Array;
	mimeType: string;
	fileName?: string;
}): Promise<string> {
	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

	const openai = new OpenAI({ apiKey });

	const fileName = input.fileName ?? "audio";
	const file = await OpenAI.toFile(input.buffer, fileName, {
		type: input.mimeType,
	});

	const result = await openai.audio.transcriptions.create({
		file,
		model: "whisper-1",
	});

	return result.text ?? "";
}

export async function fetchAudioAsBuffer(url: string): Promise<{
	buffer: Uint8Array;
	mimeType: string;
}> {
	const response = await fetch(url, { cache: "no-store" });
	if (!response.ok) {
		throw new Error(`Failed to fetch audio: ${response.status}`);
	}
	const arrayBuffer = await response.arrayBuffer();
	const mimeType = response.headers.get("content-type") ?? "audio/ogg";
	return { buffer: new Uint8Array(arrayBuffer), mimeType };
}
