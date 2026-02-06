export type LoginState =
	| { ok: true }
	| { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export type SignupState =
	| { ok: true }
	| { ok: false; message: string; fieldErrors?: Record<string, string[]> };
