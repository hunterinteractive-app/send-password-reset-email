export default async ({ req, res, log, error }) => {
  try {
    const body = await req.json();
    const { username, arbaNumber } = body;

    if (!username || !arbaNumber) {
      return res.json({ error: "Missing fields" }, 400);
    }

    // REST endpoint to list documents
    const listUrl =
      `${process.env.APPWRITE_ENDPOINT}` +
      `/databases/${process.env.DB_ID}` +
      `/collections/${process.env.COLLECTION_ID}/documents` +
      `?queries[]=${encodeURIComponent(`equal("username","${username}")`)}` +
      `&queries[]=${encodeURIComponent(`equal("arbaNumber","${arbaNumber}")`)}`;

    // Request user list
    const userRes = await fetch(listUrl, {
      headers: {
        "X-Appwrite-Project": process.env.APPWRITE_PROJECT_ID,
        "X-Appwrite-Key": process.env.APPWRITE_API_KEY,
      },
    });

    const json = await userRes.json();

    if (!json.documents || json.total === 0) {
      return res.json({ ok: false, error: "User not found" }, 404);
    }

    const user = json.documents[0];

    // Generate token
    const token = crypto.randomUUID();
    const expires = Date.now() + 30 * 60 * 1000;

    // Update via REST API
    const updateUrl =
      `${process.env.APPWRITE_ENDPOINT}` +
      `/databases/${process.env.DB_ID}` +
      `/collections/${process.env.COLLECTION_ID}` +
      `/documents/${user.$id}`;

    await fetch(updateUrl, {
      method: "patch",
      headers: {
        "Content-Type": "application/json",
        "X-Appwrite-Project": process.env.APPWRITE_PROJECT_ID,
        "X-Appwrite-Key": process.env.APPWRITE_API_KEY,
      },
      body: JSON.stringify({
        passwordResetToken: token,
        passwordResetExpires: String(expires),
      }),
    });

    // Send email with Resend REST API
    const sendEmail = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESET_FROM_EMAIL,
        to: user.email,
        subject: "Your Exhibitor Connection Password Reset",
        html: `
          <p>You requested a password reset.</p>
          <p>
            Click the link below to reset your password:
            <br>
            <a href="${process.env.RESET_BASE_URL}?token=${token}">
              Reset My Password
            </a>
          </p>
          <p>This link expires in 30 minutes.</p>
        `,
      }),
    });

    return res.json({ ok: true });
  } catch (err) {
    error(String(err));
    return res.json({ error: String(err) }, 500);
  }
};