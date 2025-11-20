import { Client, Databases, Query } from "node-appwrite";
import { Resend } from "resend";

export default async ({ req, res, log, error }) => {
  try {
    const body = await req.json();
    const { username, arbaNumber } = body;

    if (!username || !arbaNumber) {
      return res.json({ error: "Missing fields" }, 400);
    }

    // Appwrite Client
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const db = new Databases(client);

    // Lookup user
    const users = await db.listDocuments(
      process.env.DB_ID,
      process.env.COLLECTION_ID,
      [
        Query.equal("username", username),
        Query.equal("arbaNumber", arbaNumber)
      ]
    );

    if (users.total === 0) {
      return res.json({ ok: false }, 404);
    }

    const user = users.documents[0];

    // Create secure token
    const crypto = await import("crypto");
    const raw = username + Date.now() + Math.random();
    const token = crypto.createHash("sha256").update(raw).digest("hex");
    const expires = Date.now() + 30 * 60 * 1000;

    // Save token
    await db.updateDocument(
      process.env.DB_ID,
      process.env.COLLECTION_ID,
      user.$id,
      {
        passwordResetToken: token,
        passwordResetExpires: String(expires),
      }
    );

    const resetUrl = `${process.env.RESET_BASE_URL}?token=${token}`;

    // Send email
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: process.env.RESET_FROM_EMAIL,
      to: user.email,
      subject: "Your Password Reset Link",
      html: `<p>Click below to reset your Exhibitor Connection password:</p>
             <a href="${resetUrl}">${resetUrl}</a>`,
    });

    return res.json({ ok: true });
  } catch (err) {
    error(String(err));
    return res.json({ error: String(err) }, 500);
  }
};
