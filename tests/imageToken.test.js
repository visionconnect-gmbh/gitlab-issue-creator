import { imageTokenRange } from "../src/popup/logic/editor/imageToken.js";

const text = "a ![one](x:1) b ![two](x:2) c";
const one = { start: 2, end: 13 };
const two = { start: 16, end: 27 };

describe("imageTokenRange", () => {
  it("finds a token from a caret in the name or the url", () => {
    expect(imageTokenRange(text, 5, 5)).toEqual(one);
    expect(imageTokenRange(text, 11, 11)).toEqual(one);
  });

  it("finds a token from a partial selection", () => {
    expect(imageTokenRange(text, 4, 7)).toEqual(one);
  });

  it("matches a selection overlapping a token edge", () => {
    expect(imageTokenRange(text, 0, 4)).toEqual(one);
  });

  it("returns null outside any token", () => {
    expect(imageTokenRange(text, 0, 1)).toBeNull();
    expect(imageTokenRange(text, 14, 15)).toBeNull();
  });

  it("picks the token the selection is in when there are several", () => {
    expect(imageTokenRange(text, 20, 20)).toEqual(two);
  });
});
