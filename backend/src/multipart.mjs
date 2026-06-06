export function parseMultipartFormData(buffer, contentType) {
  const boundaryMatch = contentType?.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    throw new Error("Missing multipart boundary");
  }

  const boundary = `--${boundaryMatch[1] ?? boundaryMatch[2]}`;
  const parts = splitByBoundary(buffer, Buffer.from(boundary));
  const fields = {};
  const files = {};

  for (const part of parts) {
    const trimmed = trimPart(part);
    if (trimmed.length === 0 || trimmed.equals(Buffer.from("--"))) continue;

    const headerEnd = trimmed.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;

    const rawHeaders = trimmed.subarray(0, headerEnd).toString("utf8");
    const body = trimmed.subarray(headerEnd + 4);
    const disposition = rawHeaders.match(/content-disposition:\s*form-data;\s*([^\r\n]+)/i)?.[1] ?? "";
    const name = disposition.match(/name="([^"]+)"/i)?.[1];
    const fileName = decodeDispositionFileName(disposition);
    const mimeType = rawHeaders.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() ?? "application/octet-stream";

    if (!name) continue;

    if (fileName !== undefined && fileName !== "") {
      files[name] = {
        fieldName: name,
        fileName,
        mimeType,
        buffer: body,
        size: body.length
      };
    } else {
      fields[name] = body.toString("utf8");
    }
  }

  return { fields, files };
}

function decodeDispositionFileName(disposition) {
  const encoded = disposition.match(/filename\*=([^;]+)/i)?.[1]?.trim();
  if (encoded) {
    const match = encoded.match(/^(?:UTF-8'')?(.+)$/i);
    const value = stripQuotes(match?.[1] ?? encoded);
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  const raw = disposition.match(/filename="([^"]*)"/i)?.[1];
  if (raw === undefined) return undefined;
  const value = stripQuotes(raw);
  if (/%[0-9a-f]{2}/i.test(value)) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return value;
}

function stripQuotes(value) {
  return String(value ?? "").replace(/^"|"$/g, "");
}

function splitByBoundary(buffer, boundaryBuffer) {
  const parts = [];
  let cursor = 0;

  while (cursor < buffer.length) {
    const start = buffer.indexOf(boundaryBuffer, cursor);
    if (start === -1) break;
    const end = buffer.indexOf(boundaryBuffer, start + boundaryBuffer.length);
    if (end === -1) break;
    parts.push(buffer.subarray(start + boundaryBuffer.length, end));
    cursor = end;
  }

  return parts;
}

function trimPart(part) {
  let start = 0;
  let end = part.length;
  while (part[start] === 13 || part[start] === 10) start += 1;
  while (end > start && (part[end - 1] === 13 || part[end - 1] === 10)) end -= 1;
  return part.subarray(start, end);
}
