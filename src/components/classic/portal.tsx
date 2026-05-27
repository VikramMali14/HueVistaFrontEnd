import Link from "next/link";

const CODES = [
  { code: "SHARDA-7K2N", customer: "Pooja Deshmukh", validity: "7 days", left: "5 d 14 h", status: "active" as const },
  { code: "SHARDA-9PXM", customer: "Mohan Patil", validity: "14 days", left: "11 d 02 h", status: "active" as const },
  { code: "SHARDA-3QRA", customer: "Anita Rao", validity: "3 days", left: "expired", status: "expired" as const },
];

export function ClassicPortal() {
  return (
    <>
      <div className="ctopbar">
        <h1>Customer codes</h1>
        <span style={{ color: "var(--fg-mute)", fontSize: 13 }}>shardapaints.huevista.com</span>
        <div className="grow" />
        <Link href="#" className="btn btn-sm">+ Issue new code</Link>
      </div>

      <div style={{ padding: "20px 24px" }}>
        <p style={{ color: "var(--fg-soft)", fontSize: 14, maxWidth: 720, marginTop: 0 }}>
          Customers visualise colours on your branded subdomain without seeing shade codes.
          When they're ready, they "Send to retailer" and you receive the full project.
        </p>

        <section className="ccard" style={{ padding: 0, marginTop: 16 }}>
          <table className="ctable" style={{ border: "none", borderRadius: 0 }}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Customer</th>
                <th>Validity</th>
                <th>Time left</th>
                <th>Status</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {CODES.map((c) => (
                <tr key={c.code}>
                  <td style={{ fontFamily: "ui-monospace, monospace", color: "var(--accent)", fontWeight: 600 }}>{c.code}</td>
                  <td style={{ color: "var(--fg)", fontWeight: 500 }}>{c.customer}</td>
                  <td>{c.validity}</td>
                  <td className="num">{c.left}</td>
                  <td><span className={`cbadge ${c.status}`}>{c.status}</span></td>
                  <td><Link href="#" style={{ color: "var(--accent)", font: "500 13px/1 var(--sans)" }}>Manage</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
