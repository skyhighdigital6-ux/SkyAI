// Public privacy policy page (GET /privacy).
//
// Required by Meta to publish the WhatsApp Business app. Deliberately mounted
// BEFORE /api so no auth middleware applies — reviewers and students must be
// able to open it anonymously.
//
// The contact address is env-configurable (PRIVACY_CONTACT_EMAIL) so it can be
// changed without a code edit.
const EMAIL = () => process.env.PRIVACY_CONTACT_EMAIL || 'askdistancecourseswala@gmail.com';
const UPDATED = '1 August 2026';

export function privacyHtml() {
  const email = EMAIL();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy — SKYHIGH Educational Services Private Limited</title>
<meta name="description" content="How SKYHIGH Educational Services Private Limited collects, uses, stores and deletes personal data in its WhatsApp course-counselling service.">
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin:0; padding:32px 20px 64px; font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
         color:#1a2230; background:#fff; }
  main { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 1.9rem; line-height:1.25; margin:0 0 6px; }
  h2 { font-size: 1.15rem; margin:32px 0 8px; padding-top:14px; border-top:1px solid #e6e9ef; }
  .sub { color:#5b6576; margin:0 0 4px; }
  .updated { color:#5b6576; font-size:.9rem; margin:0 0 8px; }
  ul { padding-left: 22px; } li { margin:6px 0; }
  a { color:#0b6b3a; }
  table { border-collapse: collapse; width:100%; margin-top:8px; display:block; overflow-x:auto; }
  th,td { border:1px solid #e6e9ef; padding:8px 10px; text-align:left; font-size:.95rem; vertical-align:top; }
  th { background:#f6f8fa; }
  .box { background:#f6f8fa; border:1px solid #e6e9ef; border-radius:10px; padding:14px 16px; margin-top:10px; }
  footer { margin-top:36px; padding-top:14px; border-top:1px solid #e6e9ef; color:#5b6576; font-size:.9rem; }
  @media (prefers-color-scheme: dark) {
    body { background:#0f1319; color:#e7ecf3; }
    h2 { border-color:#232a35; } th,td { border-color:#232a35; } th { background:#161c25; }
    .box { background:#161c25; border-color:#232a35; } .sub,.updated,footer { color:#9aa6b8; }
    a { color:#5fd39b; } footer { border-color:#232a35; }
  }
</style>
</head>
<body>
<main>
  <h1>Privacy Policy</h1>
  <p class="sub">SKYHIGH Educational Services Private Limited</p>
  <p class="updated">Last updated: ${UPDATED}</p>

  <p>SKYHIGH Educational Services Private Limited (&ldquo;SkyHigh&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) operates a
  WhatsApp-based course counselling and customer relationship management (CRM) service that helps students in India
  choose a course and college and complete the admission process. This policy explains what personal data we collect
  through that service, why we collect it, how long we keep it, and how you can have it deleted.</p>

  <h2>1. Who we are</h2>
  <ul>
    <li><strong>Data controller:</strong> SKYHIGH Educational Services Private Limited</li>
    <li><strong>Service:</strong> WhatsApp course counselling and admission guidance for students</li>
    <li><strong>WhatsApp business number:</strong> +91 95727 96633</li>
    <li><strong>Privacy contact:</strong> <a href="mailto:${email}">${email}</a></li>
  </ul>

  <h2>2. What data we collect</h2>
  <table>
    <thead><tr><th>Data</th><th>Purpose</th></tr></thead>
    <tbody>
      <tr><td>Name</td><td>To address you personally in counselling conversations</td></tr>
      <tr><td>WhatsApp phone number</td><td>To identify you and deliver our replies</td></tr>
      <tr><td>Course, state and college of interest</td><td>To recommend suitable colleges and admission options</td></tr>
      <tr><td>Message content you send us on WhatsApp</td><td>To understand and answer your admission enquiry</td></tr>
      <tr><td>Message delivery status and timestamps</td><td>To know whether our reply reached you and to avoid duplicate messages</td></tr>
      <tr><td>Counselling stage and enquiry notes</td><td>To let our counsellors continue where the conversation left off</td></tr>
    </tbody>
  </table>
  <p>We do <strong>not</strong> collect payment card details, government identity numbers, or precise location data
  through this WhatsApp service. Please do not send such information to us over WhatsApp.</p>

  <h2>3. How we collect it</h2>
  <ul>
    <li>Directly from you, when you message our WhatsApp business number or reply to our messages.</li>
    <li>From enquiry forms, click-to-WhatsApp links and advertisements where you asked to be contacted.</li>
    <li>From enquiry details shared with us by you or your parent/guardian when requesting admission guidance.</li>
  </ul>

  <h2>4. Why we use your data (and our legal basis)</h2>
  <ul>
    <li><strong>To respond to your admission enquiry and provide course counselling</strong> &mdash; this is the core
      service you asked for.</li>
    <li><strong>To send you relevant admission information</strong>, such as college brochures, fee structures,
      eligibility and scholarship details, on the basis of your consent.</li>
    <li><strong>To follow up</strong> on an incomplete enquiry, with a limited number of reminder messages.</li>
    <li><strong>To keep internal records</strong> of your enquiry so our counsellors can assist you consistently.</li>
  </ul>
  <p>We do not sell your personal data, and we do not use it for automated decisions that produce legal effects.</p>

  <h2>5. WhatsApp Business Platform (Meta)</h2>
  <p>We deliver and receive messages using the <strong>WhatsApp Business Platform</strong> provided by Meta Platforms,
  Inc. When you message us, your message and phone number are processed by Meta in order to transmit the conversation
  to us. Meta&rsquo;s handling of your data is governed by the
  <a href="https://www.whatsapp.com/legal/privacy-policy" rel="noopener">WhatsApp Privacy Policy</a>. Messages on
  WhatsApp are transmitted over WhatsApp&rsquo;s own encrypted infrastructure; once a message reaches us, it is stored
  as described below.</p>

  <h2>6. Service providers we share data with</h2>
  <p>We share the minimum personal data necessary with the following processors, under contract and only to run this
  service:</p>
  <table>
    <thead><tr><th>Provider</th><th>Role</th></tr></thead>
    <tbody>
      <tr><td>Meta Platforms, Inc.</td><td>WhatsApp message delivery and receipt</td></tr>
      <tr><td>Supabase</td><td>Database hosting for enquiry records and message history</td></tr>
      <tr><td>Railway and Vercel</td><td>Application and dashboard hosting</td></tr>
      <tr><td>AI language-model provider</td><td>Generating a suggested reply to your message; message text is sent for
        processing and is not used to train third-party models</td></tr>
    </tbody>
  </table>
  <p>We may also disclose data where required by applicable law or to establish or defend legal claims. We do not sell
  or rent your data to advertisers or data brokers.</p>

  <h2>7. How your data is stored and secured</h2>
  <ul>
    <li>Enquiry records and message history are stored in an access-controlled cloud database.</li>
    <li>Data is encrypted in transit (HTTPS/TLS) and encrypted at rest by our hosting providers.</li>
    <li>Access is restricted to authorised SkyHigh counselling staff through individual authenticated accounts.</li>
    <li>Data may be processed on servers located outside India, with appropriate contractual safeguards in place.</li>
  </ul>

  <h2>8. How long we keep it</h2>
  <ul>
    <li><strong>Active enquiries:</strong> kept while we are assisting you with admission guidance.</li>
    <li><strong>Inactive enquiries:</strong> retained for up to <strong>24 months</strong> after your last interaction,
      so we can help you if you return during a later admission cycle.</li>
    <li>After that period the record is deleted or irreversibly anonymised, unless a longer period is required by law.</li>
    <li>If you ask us to delete your data sooner, we act on it as described in section 9.</li>
  </ul>

  <h2>9. Your rights, and how to delete your data</h2>
  <p>You may ask us to:</p>
  <ul>
    <li><strong>Access</strong> the personal data we hold about you;</li>
    <li><strong>Correct</strong> data that is inaccurate or out of date;</li>
    <li><strong>Delete</strong> your data (&ldquo;right to erasure&rdquo;);</li>
    <li><strong>Withdraw consent</strong> and stop receiving messages from us at any time.</li>
  </ul>
  <div class="box">
    <p style="margin:0 0 6px"><strong>To request deletion of your data</strong></p>
    <p style="margin:0">Email <a href="mailto:${email}?subject=Data%20deletion%20request">${email}</a> with the subject
    <em>&ldquo;Data deletion request&rdquo;</em> and the WhatsApp number you contacted us from, so we can locate your
    record. You may also send the message <strong>DELETE</strong> to our WhatsApp number
    <strong>+91 95727 96633</strong>.</p>
    <p style="margin:8px 0 0">We verify that the request comes from the owner of that number and complete the deletion
    within <strong>30 days</strong>, then confirm to you in writing. Deletion removes your name, phone number, enquiry
    details and message history from our systems.</p>
  </div>

  <h2>10. Stopping messages</h2>
  <p>You can stop receiving messages from us at any time by replying <strong>STOP</strong> or <strong>NOT
  INTERESTED</strong> to any of our WhatsApp messages. We will close the enquiry and stop sending follow-ups. Blocking
  our number in WhatsApp also prevents further messages.</p>

  <h2>11. Students under 18</h2>
  <p>Our service is aimed at students seeking higher-education admission. If you are under 18, please use this service
  only with the involvement of a parent or guardian. If we learn that we hold data about a child without appropriate
  consent, we will delete it. A parent or guardian may request deletion using the contact details above.</p>

  <h2>12. Changes to this policy</h2>
  <p>We may update this policy as our service changes. The revised version will always be published at this URL with a
  new &ldquo;last updated&rdquo; date. Material changes affecting how we use your data will be communicated to you where
  required by law.</p>

  <h2>13. Contact us</h2>
  <ul>
    <li><strong>Privacy queries and deletion requests:</strong> <a href="mailto:${email}">${email}</a></li>
    <li><strong>WhatsApp:</strong> +91 95727 96633</li>
    <li><strong>Counselling helpline:</strong> +91 62005 13372</li>
    <li><strong>Company:</strong> SKYHIGH Educational Services Private Limited, India</li>
  </ul>

  <footer>
    &copy; ${new Date().getFullYear()} SKYHIGH Educational Services Private Limited. Last updated ${UPDATED}.
  </footer>
</main>
</body>
</html>`;
}
