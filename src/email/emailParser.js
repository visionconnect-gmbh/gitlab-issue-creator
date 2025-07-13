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

  return remappedMessages.map((rawMessage) => {
    const headerLine = rawMessage.split("\n")[0];
    const { from, date, time } = parseDateAndAuthorLine(headerLine);

    const cleanedMessage = removeEmptyLines(rawMessage);
    const contentWithoutHeader = removeDateAndAuthorLines(cleanedMessage);
    const finalMessage = removeSignature(contentWithoutHeader);

    return {
      from,
      date,
      time,
      message: finalMessage,
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

  const patterns = [
    {
      // German: "Am 12.07.2025 um 14:35 schrieb Max Mustermann:"
      regex: /Am (\d{2}\.\d{2}\.\d{4}) um (\d{2}:\d{2}) schrieb (.+?):/,
      groups: { date: 1, time: 2, from: 3 },
    },
    {
      // English: "On 7/12/2025 2:35 PM, John Doe wrote:"
      regex:
        /On (\d{1,2}\/\d{1,2}\/\d{4}) (\d{1,2}:\d{2})\s?(AM|PM), (.+?) wrote:/i,
      groups: { date: 1, time: 2, meridiem: 3, from: 4 },
    },
    {
      // French: "Le 12/07/2025 à 14:35, Jean Dupont a écrit :"
      regex: /Le (\d{2}\/\d{2}\/\d{4}) à (\d{2}:\d{2}), (.+?) a écrit ?:/,
      groups: { date: 1, time: 2, from: 3 },
    },
    {
      // Spanish: "El 12/07/2025 a las 14:35, Juan Pérez escribió:"
      regex: /El (\d{2}\/\d{2}\/\d{4}) a las (\d{2}:\d{2}), (.+?) escribió:/,
      groups: { date: 1, time: 2, from: 3 },
    },
    {
      // Generic fallback: anything like "DATE TIME, NAME wrote:"
      regex:
        /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?:\s?(?:AM|PM))?),\s+(.+?)\s+wrote:/i,
      groups: { date: 1, time: 2, from: 3 },
    },
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern.regex);
    if (match) {
      const { date, time, meridiem, from } = pattern.groups;
      return {
        date: match[date],
        time: meridiem ? `${match[time]} ${match[meridiem]}` : match[time],
        from: match[from].trim(),
      };
    }
  }

  return { from: "", date: "", time: "" };
}
