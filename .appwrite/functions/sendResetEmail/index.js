// .appwrite/functions/sendResetEmail/index.js

const { Client, Databases, Query } = require("node-appwrite");
const { Resend } = require("resend");
const crypto = require("crypto");

/**
 * Appwrite Node function entrypoint
 * @param {object} req
 * @param {object} res
 */
module.exports = async function (req, res) {
  try {
    // -----------------------------
    // 1) Parse input body
    // -----------------------------
    const body = parseBody(req);
    const username = (body.username || "").trim();
    const arbaNumber = (body.arbaNumber || "").trim();

    if (!username || !arbaNumber) {
      return res.json(
        {
          ok: false,
          error: "username and arbaNumber are required",
        },
        400
      );
    }

    // -----------------------------
    // 2) Setup Appwrite client
    // -----------------------------
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const db = new Databases(client);

    const databaseId = "690696ac002796e1d81b";
    const userCollectionId = "691538490013ed9a0643";

    // -----------------------------
    // 3) Find user by username + ARBA
    // -----------------------------
    const list = await db.listDocuments(databaseId, userCollectionId, [
      Query.equal("username", username),
      Query.equal("arbaNumber", arbaNumber),
    ]);

    if (!list.documents.length) {
      // Don't reveal too much: just say not found
      return res.json(
        {
          ok: false,
          error: "No account found for that username and ARBA number.",
        },
        404
      );
    }

    const userDoc = list.documents[0];
    const userEmail = userDoc.email || userDoc.data?.email;

    if (!userEmail) {
      return res.json(
        {
          ok: false,
          error: "User record has no email.",
        },
        500
      );
    }

    // -----------------------------
    // 4) Generate token + expiry
    // -----------------------------
    const raw = `${username}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const token = crypto.createHash("sha256").update(raw).digest("hex");

    // string timestamp (Appwrite attribute type == string)
    const expiryIso = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // +30 min

    await db.updateDocument(databaseId, userCollectionId, userDoc.$id, {
      passwordResetToken: token,
      passwordResetExpires: expiryIso,
    });

    // -----------------------------
    // 5) Build reset URL
    // -----------------------------
    const baseUrl =
      process.env.RESET_FRONTEND_URL ||
      "https://hunterinteractive.dev/reset-password";
    const resetUrl = `${baseUrl}?token=${token}`;

    // -----------------------------
    // 6) Send email via Resend
    // -----------------------------
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail =
      process.env.RESET_FROM_EMAIL || "noreply@hunterinteractive.dev";
    const fromName = process.env.RESET_FROM_NAME || "Exhibitor Connection";

    // Minimal HTML – you can replace this with your existing full HTML
    const html = buildResetEmailHtml(resetUrl, username);

    await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: [userEmail],
      subject: "Reset your Exhibitor Connection password",
      html,
    });

    return res.json(
      {
        ok: true,
        message: "Reset email generated and sent (if user exists).",
      },
      200
    );
  } catch (err) {
    console.error("❌ sendResetEmail error:", err);
    return res.json(
      {
        ok: false,
        error: err?.message || "Unexpected error",
      },
      500
    );
  }
};

/**
 * Parse JSON body from Appwrite function request
 */
function parseBody(req) {
  try {
    if (!req.body) return {};
    if (typeof req.body === "object") return req.body;
    return JSON.parse(req.body);
  } catch (e) {
    return {};
  }
}

/**
 * Very simple HTML template – swap this with your real template if you want.
 */
function buildResetEmailHtml(resetUrl, username) {
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Reset your password</title>
  </head>
  <body style="font-family: Arial, sans-serif; background:#f5f5f5; padding:20px;">
    <table align="center" width="600" style="background:#ffffff; padding:20px; border-radius:8px;">
      <tr>
        <td>
          <h2>Exhibitor Connection – Password Reset</h2>
          <p>Hi ${username},</p>
          <p>
            We received a request to reset the password for your Exhibitor Connection account.
          </p>
          <p>
            Click the button below to choose a new password. This link will expire in
            <strong>30 minutes</strong>.
          </p>
          <p style="text-align:center; margin: 24px 0;">
            <a href="${resetUrl}"
               style="display:inline-block; padding:12px 24px; background:#007bff; color:#ffffff; text-decoration:none; border-radius:4px;">
              Reset Password
            </a>
          </p>
          <p>
            If you didn't request a password reset, you can safely ignore this email.
          </p>
          <p style="margin-top:32px; font-size:12px; color:#999;">
            Sent by Exhibitor Connection – Hunter Interactive
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}
