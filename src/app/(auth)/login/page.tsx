import { Suspense } from "react";
import LoginForm from "./ui";

export default function LoginPage() {
	return (
		<div className="min-h-dvh bg-background">
			<div className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4">
				<div className="w-full">
					<Suspense>
						<LoginForm />
					</Suspense>
				</div>
			</div>
		</div>
	);
}
