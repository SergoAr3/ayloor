import { useState } from "react";
import photo from "./fishermans-bastion.webp";

const choices = ["A guard post", "A viewing terrace", "A bell tower"] as const;

function formUrl(value?: string): string | undefined {
  const candidate = value?.trim();
  if (!candidate || !/^https:\/\//i.test(candidate)) return;

  try {
    const url = new URL(candidate);
    const host = url.hostname.replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password) return;
    if (host === "localhost" || host.endsWith(".localhost") || /^127(?:\.\d+){3}$/.test(host) || host === "[::1]") return;
    return url.href;
  } catch {
    return;
  }
}

export default function Budapest({ earlyAccessUrl }: { earlyAccessUrl?: string }) {
  const signup = formUrl(earlyAccessUrl);
  const [choice, setChoice] = useState<(typeof choices)[number] | null>(null);

  return (
    <div className="budapest">
      <header className="masthead">
        <div className="identity"><strong>AYLOOR<span>.</span></strong> <span>Budapest</span></div>
        {signup ? (
          <a className="masthead-signup" href={signup} referrerPolicy="no-referrer">Join early access <span aria-hidden="true">↗</span></a>
        ) : (
          <a href="#demo">Try the demo <span aria-hidden="true">↓</span></a>
        )}
      </header>

      <main className="landing-grid">
        <section className="offer" aria-labelledby="offer-title">
          <p className="label">A city guide you play</p>
          <h1 id="offer-title">See the Budapest <em>everyone walks past.</em></h1>
          <p className="description">Play your way through Budapest. Find the detail, solve the clue and discover the story hiding in plain sight.</p>
          <div className="offer-details">
            <p className="price"><strong>€14.90</strong><span>Proposed price per group</span></p>
            <p className="group-offer">Your group would get one self-guided puzzle walk to play together at your own pace.</p>
            <p className="availability"><strong>In development.</strong> The route is not available to buy or play independently yet.</p>
            {signup ? (
              <a className="signup" href={signup} referrerPolicy="no-referrer">
                Join early access <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <p className="signup-status">Early access sign-ups are not open yet.</p>
            )}
          </div>
        </section>

        <section className="sample" id="demo" aria-labelledby="demo-title">
          <figure>
            <img src={photo} width="1200" height="1800" alt="A staircase leads to wide, open arches beneath a pointed stone tower." />
            <figcaption>Standalone demo at Fisherman’s Bastion <span aria-hidden="true">·</span> <a href="https://unsplash.com/photos/a-large-castle-like-building-with-a-clock-tower-BLJgMI4JDgE">Photo by Adrian Botica</a></figcaption>
          </figure>
          <div className="puzzle">
            <p className="label">Notice → Solve → Reveal</p>
            <h2 id="demo-title">What were these towers built for?</h2>
            <p className="clue">Follow the stairs up to the wide stone arches. Imagine standing in one. What would this design let you do?</p>
            <div className="choices" role="group" aria-labelledby="demo-title">
              {choices.map(option => (
                <button key={option} type="button" aria-pressed={choice === option} onClick={() => setChoice(option)}>
                  {option}
                </button>
              ))}
            </div>
            <div className="feedback" role="status">
              {choice === "A viewing terrace" ? (
                <p><strong>Reveal.</strong> From those arches you can look out across Budapest. Thick defensive walls once stood here. When architect Frigyes Schulek built these towers, completed in 1902, he designed a terrace where visitors could enjoy the view. <a href="https://explo.bme.hu/uploads/3%20Buda%20Castle%20Quarter.pdf">Buda Castle Quarter (PDF)</a></p>
              ) : choice ? (
                <p>Look again. The staircase brings people up to a whole row of openings, each wide enough to frame the city.</p>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
