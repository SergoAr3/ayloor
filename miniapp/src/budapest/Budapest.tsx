import { useState } from "react";
import photo from "./fishermans-bastion.webp";

const choices = ["Dome", "Cone", "Pyramid"] as const;

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
        <a href="#demo">Try the demo <span aria-hidden="true">↓</span></a>
      </header>

      <main className="landing-grid">
        <section className="offer" aria-labelledby="offer-title">
          <p className="label">A city guide you play</p>
          <h1 id="offer-title">See the Budapest <em>everyone walks past.</em></h1>
          <p className="description">A self-guided puzzle walk through Budapest. Spot a detail in the city, solve a short clue and unlock the story behind it. Go solo or bring friends and explore at your own pace.</p>
          <div className="offer-details">
            <p className="price"><strong>€14.90</strong><span>Proposed price per group</span></p>
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
            <img src={photo} width="1200" height="1800" alt="Two stone towers at Fisherman’s Bastion in Budapest" />
            <figcaption>Fisherman’s Bastion <span aria-hidden="true">·</span> <a href="https://unsplash.com/photos/a-large-castle-like-building-with-a-clock-tower-BLJgMI4JDgE">Photo by Adrian Botica</a></figcaption>
          </figure>
          <div className="puzzle">
            <p className="label">Notice → Solve → Reveal</p>
            <h2 id="demo-title">What shape tops the tallest tower?</h2>
            <div className="choices" role="group" aria-labelledby="demo-title">
              {choices.map(option => (
                <button key={option} type="button" aria-pressed={choice === option} onClick={() => setChoice(option)}>
                  {option}
                </button>
              ))}
            </div>
            <div className="feedback" role="status">
              {choice === "Cone" ? (
                // https://visithungary.com/articles/fishermans-bastion
                <p><strong>Reveal.</strong> The round base tapers to a point. This is one of seven stone towers at Fisherman’s Bastion, each representing a Magyar leader from the time they settled in what is now Hungary.</p>
              ) : choice ? (
                <p>Try again. Follow the outline from the roof’s base to its tip.</p>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
