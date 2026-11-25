import { normalizeUrl } from "../src/options/logic/handler/urlHandler.js";

describe("normalizeUrl", () => {
  it("defaults to https when no protocol is given", () => {
    expect(normalizeUrl("gitlab.example.com")).toBe("https://gitlab.example.com");
  });

  it("upgrades http to https", () => {
    expect(normalizeUrl("http://gitlab.example.com")).toBe("https://gitlab.example.com");
    expect(normalizeUrl("http://gitlab.example.com:8080/gl/")).toBe(
      "https://gitlab.example.com:8080/gl",
    );
  });

  it("keeps https and strips a trailing slash", () => {
    expect(normalizeUrl("https://gitlab.example.com/")).toBe("https://gitlab.example.com");
  });

  it("handles hosts that merely start with 'http'", () => {
    expect(normalizeUrl("httpbin.example.com")).toBe("https://httpbin.example.com");
  });

  it("rejects other schemes and garbage", () => {
    expect(normalizeUrl("ftp://gitlab.example.com")).toBe(false);
    expect(normalizeUrl("not a url")).toBe(false);
  });
});
