export function parseDateAndAuthorLine(line) {
  if (!line) return { from: "", date: "", time: "" };

  const patterns = [
    {
      regex: /Am (\d{2}\.\d{2}\.\d{4}) um (\d{2}:\d{2}) schrieb (.+?):/,
      groups: { date: 1, time: 2, from: 3 },
    },
    {
      regex:
        /On (\d{1,2}\/\d{1,2}\/\d{4}) (\d{1,2}:\d{2})\s?(AM|PM), (.+?) wrote:/i,
      groups: { date: 1, time: 2, meridiem: 3, from: 4 },
    },
    {
      regex: /Le (\d{2}\/\d{2}\/\d{4}) à (\d{2}:\d{2}), (.+?) a écrit ?:/,
      groups: { date: 1, time: 2, from: 3 },
    },
    {
      regex: /El (\d{2}\/\d{2}\/\d{4}) a las (\d{2}:\d{2}), (.+?) escribió:/,
      groups: { date: 1, time: 2, from: 3 },
    },
    {
      regex:
        /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?:\s?(?:AM|PM))?),\s+(.+?)\s+wrote:/i,
      groups: { date: 1, time: 2, from: 3 },
    },
  ];

  for (const p of patterns) {
    const match = line.match(p.regex);
    if (match) {
      const { date, time, meridiem, from } = p.groups;
      return {
        date: match[date],
        time: meridiem ? `${match[time]} ${match[meridiem]}` : match[time],
        from: match[from].trim(),
      };
    }
  }

  return { from: "", date: "", time: "" };
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
