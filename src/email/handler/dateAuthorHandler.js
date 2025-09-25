export function parseDateAndAuthorLine(line) {
  if (!line) return { from: "", date: "", time: "" };

  const cleaned = line.replace(/\s+/g, " ").trim();

  // Date: 1–2 digits sep 1–2 digits sep 2–4 digits
  const datePattern = /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/;
  // Time: 1–2 digits:2 digits + optional AM/PM
  const timePattern = /\d{1,2}:\d{2}(?:\s?(?:AM|PM))?/i;

  const dateMatch = cleaned.match(datePattern);
  const timeMatch = cleaned.match(timePattern);

  if (!dateMatch || !timeMatch) {
    return { from: "", date: "", time: "" };
  }

  const date = dateMatch[0];
  const time = timeMatch[0];

  // Take substring starting *after* the time
  const afterTime = cleaned.slice(cleaned.indexOf(time) + time.length).trim();

  // Author = until first colon
  let from = (afterTime.split(":")[0] || "").trim();

  from = extractName(from);
  return { date, time, from };
}

function extractName(line) {
  // Match sequences of capitalized words
  const matches = line.match(/\b([A-ZÄÖÜ][a-zäöüß]+(?:\s[A-ZÄÖÜ][a-zäöüß]+)*)\b/g);
  if (!matches) return line.trim();
  
  // Return all capitalized sequences joined by space (in case there are multiple)
  return matches.join(' ').trim();
}

export function extractDateAndAuthorLine(message) {
  const genericRegex =
    /(?:\d{1,2}[./-]){2}\d{2,4}[\s,]+(?:um\s)?\d{1,2}:\d{2}(?:\s?(?:AM|PM))?[,:\s-]+.+?:/i;
  return message.split("\n").find((line) => genericRegex.test(line)) || null;
}

export function removeDateAndAuthorLines(message) {
  const lines = message.split("\n");
  return lines.filter((line) => !extractDateAndAuthorLine(line)).join("\n");
}

export function remapDateAndAuthorLines(messages, dateLines) {
  return messages.map((msg, i) =>
    dateLines[i - 1] ? `${dateLines[i - 1]}\n\n${msg}` : msg
  );
}
