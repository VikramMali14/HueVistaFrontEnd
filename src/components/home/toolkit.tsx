import { Eyebrow, Mono } from "@/components/ui/eyebrow";

/**
 * The old "index of quiet capabilities" rows, rebuilt as a bento of small
 * playable cards. Every card carries its own micro-visual; the entrance
 * and idle animations live in globals.css and key off `.reveal.in`.
 */
export function Toolkit() {
  return (
    <section id="toolkit">
      <div className="reveal hv-tk-head">
        <Eyebrow>The toolkit</Eyebrow>
        <h2 className="display hv-tk-title">Small things,<br /><i>done properly.</i></h2>
      </div>

      <div className="reveal d1 hv-tk-grid">
        {/* WhatsApp-first share — chat bubbles slide in */}
        <article className="hv-tk-card hv-tk-span3">
          <div className="hv-tk-chat" aria-hidden>
            <div className="hv-tk-bubble is-sent">
              <span className="hv-tk-thumb" />
              <span>Your wall in Terracotta · AP-1428</span>
            </div>
            <div className="hv-tk-bubble is-reply">Looks perfect — book it 🎉</div>
          </div>
          <h3 className="hv-tk-card-title">WhatsApp-first share</h3>
          <p className="hv-tk-card-desc">One tap sends the finished preview as an image or a link — straight to the customer.</p>
        </article>

        {/* AI three-colour combination — swatches fan out on hover */}
        <article className="hv-tk-card hv-tk-span3">
          <div className="hv-tk-fan" aria-hidden>
            <span style={{ background: "#b96b48" }} />
            <span style={{ background: "#e9e2d2" }} />
            <span style={{ background: "#3e4a52" }} />
          </div>
          <h3 className="hv-tk-card-title">AI colour trios</h3>
          <p className="hv-tk-card-desc">Ask for a combination; every hex snaps to a real catalogue shade, codes intact.</p>
        </article>

        {/* White-label — the subdomain types itself */}
        <article className="hv-tk-card hv-tk-span2">
          <div className="hv-tk-url" aria-hidden>
            <span className="hv-tk-typed">your-shop.huevista.com</span>
          </div>
          <h3 className="hv-tk-card-title">Your name on the door</h3>
          <p className="hv-tk-card-desc">A white-label subdomain for your counter.</p>
        </article>

        {/* Find similar — close swatches spread apart */}
        <article className="hv-tk-card hv-tk-span2">
          <div className="hv-tk-similar" aria-hidden>
            <span style={{ background: "#7b8a72" }} />
            <span style={{ background: "#75866d" }} />
            <span style={{ background: "#81927a" }} />
            <span style={{ background: "#6e7d6c" }} />
            <span style={{ background: "#8a9a85" }} />
          </div>
          <h3 className="hv-tk-card-title">Find what&apos;s close</h3>
          <p className="hv-tk-card-desc">Nearest shades across brands, by colour science.</p>
        </article>

        {/* Paint estimate — the litres gauge fills on reveal */}
        <article className="hv-tk-card hv-tk-span2">
          <div className="hv-tk-gauge" aria-hidden>
            <span className="hv-tk-gauge-fill" />
            <span className="hv-tk-gauge-num">12.4 L</span>
          </div>
          <h3 className="hv-tk-card-title">Litres, not guesses</h3>
          <p className="hv-tk-card-desc">Wall area to litres per finish — on the invoice.</p>
        </article>

        {/* Auto-save — full-width quiet strip */}
        <article className="hv-tk-card hv-tk-strip hv-tk-span6">
          <span className="hv-tk-pulse" aria-hidden />
          <h3 className="hv-tk-card-title">Auto-save, every two seconds</h3>
          <p className="hv-tk-card-desc">There is no save button.</p>
          <Mono className="hv-tk-saved">saved just now</Mono>
        </article>
      </div>
    </section>
  );
}
