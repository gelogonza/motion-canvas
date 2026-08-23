import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Motion Canvas — Camera Instrument",
  description: "A camera-led audiovisual instrument controlled by movement.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
