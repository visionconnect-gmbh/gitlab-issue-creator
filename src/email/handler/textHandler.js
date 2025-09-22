export function findTextPart(parts) {
  if (!parts || !Array.isArray(parts)) return null;
  for (const part of parts) {
    if (part.contentType === "text/plain" && part.body) return part;
    if (part.parts) {
      const nested = findTextPart(part.parts);
      if (nested) return nested;
    }
  }
  return null;
}

export function removeEmptyLines(message) {
  return message
    .split("\n")
    .filter((line) => line.trim() !== "")
    .join("\n")
    .trim();
}

export function getSignatureIndex(message) {
  const normalized = message.replace(/\r\n/g, "\n");
  const tbPlainSeparator = /^-- $/m;
  const tbHtmlSeparator =
    /(?:<br\s*\/?>|<\/div>|<\/pre>)?\s*--\s*(?:<br\s*\/?>|<\/div>|<\/pre>)/i;
  const genericSeparator = /^(?:--\s*$|__\s*$|([^\w\s])\1{2,}\s*)$/m;

  let match;
  if ((match = normalized.match(tbPlainSeparator)))
    return normalized.indexOf(match[0]);
  if ((match = normalized.match(tbHtmlSeparator)))
    return normalized.indexOf(match[0]);
  if ((match = normalized.match(genericSeparator)))
    return normalized.indexOf(match[0]);
  return -1;
}

export function removeSignature(message) {
  const index = getSignatureIndex(message);
  return index !== -1 ? message.slice(0, index) : message;
}

export function splitQuotedAndLatest(emailBody) {
  const lines = emailBody.split("\n");
  const latestLines = [];
  const quotedLines = [];

  for (const line of lines) {
    if (line.startsWith(">")) quotedLines.push(line);
    else latestLines.push(line);
  }

  return { latestMessage: latestLines.join("\n").trim(), quotedLines };
}

export function extractQuotedMessages(quotedLines) {
  const messages = [];
  let buffer = [];
  let currentMinLevel = -1;

  for (let i = quotedLines.length - 1; i >= 0; i--) {
    const line = quotedLines[i];
    const quoteLevel = getQuoteLevel(line);
    const content = line.slice(quoteLevel).trim();

    if (buffer.length === 0) {
      buffer.unshift(content);
      currentMinLevel = quoteLevel;
    } else if (quoteLevel < currentMinLevel) {
      messages.unshift(buffer.join("\n").trim());
      buffer = [content];
      currentMinLevel = quoteLevel;
    } else {
      buffer.unshift(content);
      currentMinLevel = Math.min(currentMinLevel, quoteLevel);
    }
  }

  if (buffer.length > 0) messages.unshift(buffer.join("\n").trim());
  return messages;
}

export function getQuoteLevel(line) {
  let level = 0;
  while (line.startsWith(">".repeat(level + 1))) level++;
  return level;
}
