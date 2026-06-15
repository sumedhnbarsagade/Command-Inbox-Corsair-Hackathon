import "@/styles/globals.css";
import { type Metadata } from "next";
import { TRPCReactProvider } from "@/trpc/react";

export const metadata: Metadata = {
  title: "Superhuman — Email & Calendar",
  description: "The fastest email and calendar experience. Powered by Corsair.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
