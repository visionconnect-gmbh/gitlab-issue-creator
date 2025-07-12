// emailParser.js

const ALLOWED_ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];

/**
 * Finds the plain text part of a raw message.
 * @param {Array} parts - The parts array of the raw message.
 * @returns {Object|null} The text part object or null if not found.
 */
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

/**
 * Finds all attachment parts in the raw message parts.
 * @param {Array} parts - The parts array of the raw message.
 * @returns {Array} An array of attachment parts.
 */
export function findAttachmentParts(parts) {
  const attachments = [];
  for (const part of parts) {
    if (
      part.contentType &&
      ALLOWED_ATTACHMENT_TYPES.includes(part.contentType) &&
      part.name
    ) {
      attachments.push({
        name: part.name || "Attachment",
        contentType: part.contentType,
        size: part.size,
        partName: part.partName,
      });
    }
    if (part.parts) {
      attachments.push(...findAttachmentParts(part.parts));
    }
  }
  return attachments;
}

export function emailParser(emailBody) {
  if (!emailBody || typeof emailBody !== "string") return [];

  const { latestMessage, quotedLines } = splitQuotedAndLatest(emailBody);
  const quotedMessages = extractQuotedMessages(quotedLines);
  const rawMessages = [latestMessage, ...quotedMessages].filter(Boolean);

  const dateAndAuthorLines = rawMessages.map(extractDateAndAuthorLine);
  const remappedMessages = remapDateAndAuthorLines(
    rawMessages,
    dateAndAuthorLines
  );

  return remappedMessages.map((msg) => {
    const { from, date, time } = parseDateAndAuthorLine(msg.split("\n")[0]);
    const cleanedMsg = removeEmptyLines(msg);
    return {
      from,
      date,
      time,
      message: removeSignature(removeDateAndAuthorLines(cleanedMsg)),
    };
  });
}

function splitQuotedAndLatest(emailBody) {
  const lines = emailBody.split("\n");
  const latestLines = [];
  const quotedLines = [];

  for (const line of lines) {
    if (line.startsWith(">")) {
      quotedLines.push(line);
    } else {
      latestLines.push(line);
    }
  }

  const latestMessage = latestLines.join("\n").trim();
  return { latestMessage, quotedLines };
}

function extractQuotedMessages(quotedLines) {
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

  if (buffer.length > 0) {
    messages.unshift(buffer.join("\n").trim());
  }

  return messages;
}

function getQuoteLevel(line) {
  let level = 0;
  while (line.startsWith(">".repeat(level + 1))) {
    level++;
  }
  return level;
}

function extractDateAndAuthorLine(message) {
  const germanRegex =
    /Am \d{2}\.\d{2}\.\d{4} um \d{2}:\d{2} schrieb [\w\säöüÄÖÜß]+:/;
  const englishRegex =
    /On \d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2} (?:AM|PM), [\w\s]+ wrote:/;

  return (
    message
      .split("\n")
      .find((line) => germanRegex.test(line) || englishRegex.test(line)) || null
  );
}

function removeDateAndAuthorLines(message) {
  const lines = message.split("\n");
  const filteredLines = lines.filter((line) => !extractDateAndAuthorLine(line));
  return filteredLines.join("\n").trim();
}

function remapDateAndAuthorLines(messages, dateLines) {
  return messages.map((msg, index) => {
    const prepend = dateLines[index - 1];
    return prepend ? `${prepend}\n\n${msg}` : msg;
  });
}

function removeSignature(message) {
  const index = message.indexOf("-- ");
  return index !== -1 ? message.slice(0, index).trim() : message.trim();
}

function removeEmptyLines(message) {
  return message
    .split("\n")
    .filter((line) => line.trim() !== "")
    .join("\n")
    .trim();
}

function parseDateAndAuthorLine(line) {
  if (!line) return { from: "", date: "", time: "" };

  const germanRegex =
    /Am (\d{2}\.\d{2}\.\d{4}) um (\d{2}:\d{2}) schrieb ([\w\säöüÄÖÜß]+):/;
  const englishRegex =
    /On (\d{1,2}\/\d{1,2}\/\d{4}) (\d{1,2}:\d{2}) (AM|PM), ([\w\s]+) wrote:/;

  let match;
  if ((match = line.match(germanRegex))) {
    return {
      from: match[3].trim(),
      date: match[1],
      time: match[2],
    };
  } else if ((match = line.match(englishRegex))) {
    return {
      from: match[4].trim(),
      date: match[1],
      time: `${match[2]} ${match[3]}`,
    };
  }

  return { from: "", date: "", time: "" };
}
