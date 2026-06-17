import crypto from "crypto";

export function encodeRawEmail(opts: {
  to: string;
  subject: string;
  body: string;
  from?: string;
  attachments?: {
    filename: string;
    mimeType: string;
    data: string;
  }[];
}): string {
  const attachments = opts.attachments ?? [];

  if (attachments.length > 0) {
    const boundary = `corsair_${crypto.randomUUID().replace(/-/g, "")}`;
    const lines = [
      ...(opts.from ? [`From: ${opts.from}`] : []),
      `To: ${opts.to}`,
      `Subject: ${opts.subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      opts.body,
    ];

    for (const attachment of attachments) {
      const safeFilename = attachment.filename.replace(/"/g, "");
      const base64 = attachment.data.replace(/^data:[^;]+;base64,/, "");

      lines.push(
        `--${boundary}`,
        `Content-Type: ${attachment.mimeType || "application/octet-stream"}; name="${safeFilename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${safeFilename}"`,
        "",
        base64.replace(/(.{76})/g, "$1\r\n").trim(),
      );
    }

    lines.push(`--${boundary}--`);

    const message = lines.join("\r\n");
    const base64 = Buffer.from(message, "utf-8").toString("base64");
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  const lines = [
    ...(opts.from ? [`From: ${opts.from}`] : []),
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    opts.body,
  ];
  const message = lines.join("\r\n");
  const base64 = Buffer.from(message, "utf-8").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
};

export function extractBodyFromPayload(payload?: GmailPart): string {
  if (!payload) return "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  for (const part of payload.parts ?? []) {
    const text = extractBodyFromPayload(part);
    if (text) return text;
  }

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  return "";
}

export function getHeader(
  headers: { name?: string; value?: string }[] | undefined,
  name: string,
): string {
  return (
    headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
    ""
  );
}
