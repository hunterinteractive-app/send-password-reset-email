// index.js
import { Client, Databases, Query } from "node-appwrite";
import { Resend } from "resend";

export default async ({ req, res, log, error }) => {
  try {
    const body = await req.json();
    const { username, arbaNumber } = body;

    if (!username || !arbaNumber) {
      return res.json({ error: "Missing fields" }, 400);
    }

    // Appwrite client
    const client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);  // function key

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
      return res.json({ ok: false, message: "No user found" }, 404);
    }

    const user = users.documents[0];

    // Generate secure token
    const raw = username + Date.now() + Math.random();
    const crypto = await import("crypto");
    const token = crypto.createHash("sha256").update(raw).digest("hex");
    const expires = Date.now() + 30 * 60 * 1000; // 30 minutes

    // Update DB
    await db.updateDocument(
      process.env.DB_ID,
      process.env.COLLECTION_ID,
      user.$id,
      {
        passwordResetToken: token,
        passwordResetExpires: String(expires)
      }
    );

    // Build reset link
    const resetUrl = `${process.env.RESET_BASE_URL}?token=${token}`;

    // Send email via Resend
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: process.env.RESET_FROM_EMAIL,
      to: user.email,
      subject: "Your Password Reset Link",
      html: `
        <h2>Password Reset Request</h2>
        <p>Hello ${user.name ?? ""},</p>
        <p>Click the link below to reset your password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link will expire in 30 minutes.</p>
      `
    });

    return res.json({ ok: true, resetUrl });
  } catch (err) {
    error(err.toString());
    return res.json({ error: err.toString() }, 500);
  }
};
