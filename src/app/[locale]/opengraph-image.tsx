import { ImageResponse } from "next/og";
import { hasLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = hasLocale(rawLocale) ? rawLocale : "es";
  const dict = await getDictionary(locale);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#07060a",
          backgroundImage:
            "radial-gradient(circle at 15% 15%, rgba(145,82,255,0.35), transparent 55%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #C9A8FF 0%, #7C34F2 100%)",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5"
                stroke="#07060A"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span style={{ fontSize: 30, color: "#f6f4f9", fontWeight: 600 }}>XAYVEN</span>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 56,
            fontSize: 58,
            fontWeight: 600,
            color: "#f6f4f9",
            maxWidth: 920,
            lineHeight: 1.15,
            letterSpacing: -1,
          }}
        >
          {dict.meta.defaultTitle}
        </div>
      </div>
    ),
    { ...size }
  );
}
