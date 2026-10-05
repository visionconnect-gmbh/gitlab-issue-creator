/**
 * @fileoverview Centralized locale data for the email-content parser.
 *
 * Every language-sensitive literal list used by the handler modules
 * (`forwardedHandler.js`, `dateAuthorHandler.js`, `textHandler.js`) lives
 * here instead of being duplicated across those files. Adding a language
 * means adding one entry to `EMAIL_LOCALES`: the consuming handlers import
 * the derived exports below and never change.
 *
 * This does NOT make the parser locale-aware: it still tries every known
 * language's patterns unconditionally, regardless of Thunderbird's UI
 * locale: the table just widens the pattern set that gets tried.
 */

export const EMAIL_LOCALES = {
  en: {
    forwardPhrases: ["Begin forwarded message", "Forwarded message", "Original Message"],
    headerLabels: { from: "from", sent: "date", date: "date", to: "to", cc: "cc", subject: "subject" },
    attributionVerbs: ["wrote"],
    connectors: ["at"],
    valedictions: ["Best regards", "Kind regards", "Regards", "Sincerely"],
    months: {},
  },
  de: {
    forwardPhrases: [
      "Anfang der weitergeleiteten Nachricht",
      "Weitergeleitete Nachricht",
      "Ursprüngliche Nachricht",
    ],
    headerLabels: {
      von: "from",
      gesendet: "date",
      datum: "date",
      an: "to",
      cc: "cc",
      "kopie (cc)": "cc",
      kopie: "cc",
      betreff: "subject",
    },
    attributionVerbs: ["schrieb"],
    connectors: ["um"],
    valedictions: [
      "Mit freundlichen Grüßen",
      "Beste Grüße",
      "Viele Grüße",
      "Freundliche Grüße",
      "Liebe Grüße",
    ],
    months: {
      januar: 1, februar: 2, märz: 3, april: 4, mai: 5, juni: 6,
      juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
    },
  },
  fr: {
    forwardPhrases: [
      "Début du message transféré",
      "Message transféré",
      "Message d'origine",
    ],
    headerLabels: { de: "from", envoyé: "date", "à": "to", cc: "cc", objet: "subject" },
    attributionVerbs: ["a écrit"],
    connectors: ["à"],
    valedictions: [
      "Cordialement",
      "Bien cordialement",
      "Sincères salutations",
      "Bien à vous",
      "Salutations",
    ],
    months: {
      janvier: 1, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
      juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12,
    },
  },
  es: {
    forwardPhrases: [
      "Inicio del mensaje reenviado",
      "Mensaje reenviado",
      "Mensaje original",
    ],
    headerLabels: { de: "from", enviado: "date", fecha: "date", para: "to", cc: "cc", asunto: "subject" },
    attributionVerbs: ["escribió"],
    connectors: ["a las"],
    valedictions: ["Saludos cordiales", "Saludos", "Atentamente", "Un saludo"],
    months: {
      enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
      julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
    },
  },
  pt: {
    forwardPhrases: [
      "Início da mensagem reencaminhada",
      "Mensagem reencaminhada",
      "Mensagem encaminhada",
      "Mensagem original",
    ],
    headerLabels: {
      de: "from",
      enviada: "date",
      enviado: "date",
      data: "date",
      para: "to",
      cc: "cc",
      assunto: "subject",
    },
    attributionVerbs: ["escreveu"],
    connectors: ["às"],
    valedictions: ["Atenciosamente", "Cumprimentos", "Saudações", "Um abraço"],
    months: {
      janeiro: 1, fevereiro: 2, março: 3, abril: 4, maio: 5, junho: 6,
      julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
    },
  },
  it: {
    forwardPhrases: [
      "Inizio messaggio inoltrato",
      "Messaggio inoltrato",
      "Messaggio originale",
    ],
    headerLabels: { da: "from", inviato: "date", inviata: "date", data: "date", a: "to", cc: "cc", oggetto: "subject" },
    attributionVerbs: ["ha scritto"],
    connectors: ["alle"],
    valedictions: ["Cordiali saluti", "Distinti saluti", "Un caro saluto", "Saluti"],
    months: {
      gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
      luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
    },
  },
  nl: {
    forwardPhrases: [
      "Begin doorgestuurd bericht",
      "Doorgestuurd bericht",
      "Oorspronkelijk bericht",
    ],
    headerLabels: { van: "from", verzonden: "date", datum: "date", aan: "to", cc: "cc", onderwerp: "subject" },
    attributionVerbs: ["schreef"],
    connectors: ["om"],
    valedictions: ["Met vriendelijke groet", "Vriendelijke groeten", "Hartelijke groet", "Groeten"],
    months: {
      januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6,
      juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
    },
  },
  pl: {
    forwardPhrases: [
      "Początek przekazanej wiadomości",
      "Przekazana wiadomość",
      "Wiadomość oryginalna",
    ],
    headerLabels: { od: "from", wysłano: "date", data: "date", do: "to", dw: "cc", temat: "subject" },
    attributionVerbs: ["napisał(a)", "napisała", "napisał"],
    connectors: ["o"],
    valedictions: ["Z poważaniem", "Serdeczne pozdrowienia", "Pozdrawiam", "Pozdrowienia"],
    months: {
      stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6,
      lipca: 7, sierpnia: 8, września: 9, października: 10, listopada: 11, grudnia: 12,
    },
  },
  ru: {
    forwardPhrases: [
      "Начало пересылаемого сообщения",
      "Пересылаемое сообщение",
      "Исходное сообщение",
    ],
    headerLabels: { от: "from", отправлено: "date", дата: "date", кому: "to", копия: "cc", тема: "subject" },
    attributionVerbs: ["писал(а)", "написал(а)", "писала", "писал"],
    connectors: ["в"],
    valedictions: ["С уважением", "С наилучшими пожеланиями", "Всего доброго", "С почтением"],
    months: {
      января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
      июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
    },
  },
};

// Surname particles ("von Neumann", "van Gogh", "de Vries", "di Lorenzo")
// that appear in the middle of an otherwise-capitalized name, lowercase by
// convention. `NAME_RE` (dateAuthorHandler.js) allows one of these between
// two capitalized name tokens so a particle-bearing name doesn't get
// truncated to just its last word.
export const NAME_PARTICLES = ["von", "van", "de", "di", "da", "del", "der", "den", "la", "le", "du", "dos", "das"];

// ---------------------------------------------------------------------------
// Derived regexes / lookups, built once from the data above.
// ---------------------------------------------------------------------------

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collect(key) {
  return Object.values(EMAIL_LOCALES).flatMap((locale) => locale[key]);
}

// Longest-first so a multi-word phrase isn't shadowed by a shorter one that
// happens to be a prefix of it.
function alternationOf(phrases) {
  return [...new Set(phrases)]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join("|");
}

/** A plain-text forward-trigger phrase line, any known language. */
export const FORWARD_PHRASE_RE = new RegExp(
  `^(?:${alternationOf(collect("forwardPhrases"))})\\s*:?\\s*$`,
  "im",
);

/** Merged header-field label -> semantic field map, every known language. */
export const HEADER_FIELD_BY_LABEL = Object.assign(
  {},
  ...Object.values(EMAIL_LOCALES).map((locale) => locale.headerLabels),
);

/** Alternation of every recognised header label, for embedding in a line regex. */
export const LABEL_ALTERNATION = Object.keys(HEADER_FIELD_BY_LABEL)
  .sort((a, b) => b.length - a.length)
  .map((label) => escapeRegex(label))
  .join("|");

const ATTRIBUTION_VERB_ALTERNATION = alternationOf(collect("attributionVerbs"));

// `\b` only recognises ASCII word characters, so a verb ending in an
// accented letter ("escribió") would fail its own trailing boundary check
// (the accented letter and the space after it are both "non-word" to `\b`,
// so no transition exists there to anchor on). Unicode-aware lookaround
// (with the `u` flag) replaces it correctly for every script.
/** Matches a known attribution verb ("schrieb"/"wrote"/"a écrit"/...) anywhere. */
export const ATTRIBUTION_VERB_RE = new RegExp(
  `(?<!\\p{L})(?:${ATTRIBUTION_VERB_ALTERNATION})(?!\\p{L})`,
  "iu",
);

/** Matches a known attribution verb anchored at the end of a string. */
export const TRAILING_ATTRIBUTION_VERB_RE = new RegExp(
  `(?<!\\p{L})(?:${ATTRIBUTION_VERB_ALTERNATION})\\s*$`,
  "iu",
);

/** Alternation of recognised surname particles, for embedding in `NAME_RE`. */
export const PARTICLE_ALTERNATION = NAME_PARTICLES.map(escapeRegex).join("|");

const CONNECTOR_ALTERNATION = alternationOf(collect("connectors"));

/** Optional "<connector> " fragment for embedding between a date and a time. */
export const CONNECTOR_OPTIONAL_FRAGMENT = `(?:(?:${CONNECTOR_ALTERNATION})\\s)?`;

// No `\b` here: `\b` only recognises ASCII word characters, so it fails to
// find a boundary around an accented connector like "à" (both the letter
// itself and its neighbouring space count as "non-word" to `\b`, meaning
// no transition exists for it to anchor on). The mandatory surrounding
// `\s+` already rules out matching a connector embedded inside a larger
// word, so it's a sufficient boundary on its own.
/** Strips a known date/time connector ("um"/"at"/"à"/"a las") out of a header value. */
export const CONNECTOR_STRIP_RE = new RegExp(`\\s+(?:${CONNECTOR_ALTERNATION})\\s+`, "i");

/** Closing/valediction phrase, no explicit separator before it, any known language. */
export const VALEDICTION_RE = new RegExp(
  `^(?:${alternationOf(collect("valedictions"))})[,.]?\\s*$`,
  "gim",
);

/** Merged textual month name -> 1-based month number, every known language. */
export const MONTH_NUMBER_BY_NAME = Object.assign(
  {},
  ...Object.values(EMAIL_LOCALES).map((locale) => locale.months),
);
