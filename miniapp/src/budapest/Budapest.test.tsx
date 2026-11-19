import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import Budapest from "./Budapest";

function page(url?: string) {
  return renderToStaticMarkup(<Budapest earlyAccessUrl={url} />);
}

it("links to the configured external HTTPS form and presents an indicative price", () => {
  const html = page(" https://forms.example.org/early-access?source=budapest ");
  expect(html).toContain('href="https://forms.example.org/early-access?source=budapest"');
  expect(html).toContain("Join early access");
  expect(html).toContain("€14.90");
  expect(html).toContain("per group");
  expect(html).toContain("not available to buy or play independently yet");
});

it.each([
  undefined,
  "  ",
  "/early-access",
  "http://forms.example.org",
  "https:forms.example.org",
  "javascript:alert(1)",
  "https://name:secret@forms.example.org",
  "https://localhost:1234",
  "https://127.0.0.1",
  "https://[::1]",
])(
  "shows an unavailable state without a signup link for %s",
  (url) => {
    const html = page(url);
    expect(html).toContain("Early access sign-ups are not open yet.");
    expect(html).not.toContain("Join early access");
    expect(html).not.toContain("<form");
  },
);
