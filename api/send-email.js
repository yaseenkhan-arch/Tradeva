 import { Resend } from "resend";
import { adminAuth } from "../lib/firebase-admin.js";
import buildEmail from "../emails/index.js";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const { email, type, ...data } = req.body;

    const { subject, html } = buildEmail(type, data);

    const response = await resend.emails.send({
      from: "Tradeva <noreply@tradeva.app>",
      to: email,
      subject,
      html,
    });

    return res.status(200).json({
      success: true,
      id: response.data?.id,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
