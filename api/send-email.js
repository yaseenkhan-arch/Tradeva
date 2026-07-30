 
import { Resend } from "resend";
import { welcomeEmail } from "../emails/welcome.js";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const { type, email, name } = req.body;

    let subject = "";
    let html = "";

    switch (type) {
      case "welcome":
        subject = "Welcome to Tradeva!";
        html = welcomeEmail({
          name,
        });
        break;

      default:
        return res.status(400).json({
          error: "Unknown email type",
        });
    }

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
