import { getSignatureIndex } from "./textHandler.js";

export function extractForwardedMessage(message) {
  const forwardHeaderRegex = /^-{3,}.*?-{3,}$/m;
  const match = message.match(forwardHeaderRegex);
  if (!match) return null;

  const startIndex = message.indexOf(match[0]) + match[0].length;
  let forwardedText = message.slice(startIndex);

  const endIndex = getSignatureIndex(forwardedText);
  const cleanText =
    endIndex === -1 ? forwardedText : forwardedText.slice(0, endIndex);
  return cleanText || null;
}

export function extractForwardedAuthorAndDate(forwardedText) {
  const lines = forwardedText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let author = null;
  let date = null;

  for (const line of lines) {
    const emailMatch = line.match(/<?([\w.-]+@[\w.-]+\.\w+)>?/);
    if (!author && emailMatch) author = line;

    const dateMatch = line.match(
      /\b(?:\d{1,2}\.\s*\w+|\w+,\s*\d{1,2}|\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b.*\d{2}:\d{2}/
    );
    if (!date && dateMatch) date = line;

    if (author && date) break;
  }

  return { author, date };
}

export function removeForwardedHeader(message) {
  const lines = message.split("\n");
  let headerEndIndex = -1;
  let headerCandidate = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "" && i > 0) {
      headerEndIndex = i;
      break;
    }
    if (line !== "" && !line.includes(":")) {
      headerCandidate = false;
      break;
    }
  }

  if (headerEndIndex === -1 || !headerCandidate) return message;
  return lines.slice(headerEndIndex + 1).join("\n");
}
