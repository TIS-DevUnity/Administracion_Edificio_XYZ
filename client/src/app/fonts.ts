import localFont from "next/font/local";

export const fontTitle = localFont({
  src: [
    { path: "./fonts/TT Interphases Pro Trial Black.ttf", weight: "700", style: "normal" },
    { path: "./fonts/TT Interphases Pro Trial Black Italic.ttf", weight: "700", style: "italic" },
  ],
  variable: "--font-title-raw",
  display: "swap",
});

export const fontSubtitle = localFont({
  src: [
    { path: "./fonts/TT Interphases Pro Mono Trial Bold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/TT Interphases Pro Mono Trial Italic.ttf", weight: "600", style: "italic" },
  ],
  variable: "--font-subtitle-raw",
  display: "swap",
});

export const fontBody = localFont({
  src: [
    { path: "./fonts/TT Interphases Pro Trial Light.ttf", weight: "400", style: "normal" },
    { path: "./fonts/TT Interphases Pro Trial Light Italic.ttf", weight: "400", style: "italic" },
  ],
  variable: "--font-body-raw",
  display: "swap",
});

export const fontCaption = localFont({
  src: [
    { path: "./fonts/TT Interphases Pro Trial Thin.ttf", weight: "400", style: "normal" },
    { path: "./fonts/TT Interphases Pro Trial Thin Italic.ttf", weight: "400", style: "italic" },
  ],
  variable: "--font-caption-raw",
  display: "swap",
});
